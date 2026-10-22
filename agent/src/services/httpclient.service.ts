// ZenPanel - API Tester (kiểu Postman): gửi request HTTP từ chính VPS tới bất kỳ URL nào, lưu collections / môi trường / lịch sử
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';

const FILE = 'http-workspace.json';
const MAX_BODY = 10 * 1024 * 1024;
const MAX_HISTORY = 60;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestDef {
  id: string;
  name: string;
  method: string;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: { type: 'none' | 'bearer' | 'basic' | 'apikey'; token?: string; username?: string; password?: string; key?: string; value?: string; in?: 'header' | 'query' };
  body: { mode: 'none' | 'json' | 'text' | 'raw' | 'urlencoded' | 'form'; rawType?: 'json' | 'text' | 'javascript' | 'html' | 'xml'; raw: string; form: KeyValue[] };
}

export interface Workspace {
  collections: { id: string; name: string; requests: RequestDef[] }[];
  environments: { id: string; name: string; vars: KeyValue[] }[];
  activeEnv: string | null;
  history: (RequestDef & { at: string; status: number; ms: number })[];
}

export interface SendInput {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body?: { mode: RequestDef['body']['mode']; raw?: string; form?: { key: string; value: string }[] };
  timeoutMs?: number;
  followRedirects?: boolean;
  /** Bản ghi request (đã thay biến) để lưu lịch sử */
  record?: RequestDef;
}

export interface SendResult {
  status: number;
  statusText: string;
  ms: number;
  size: number;
  headers: [string, string][];
  body: string;
  encoding: 'text' | 'base64';
  truncated: boolean;
  url: string;
}

const blankRequest = (name: string, method: string, url: string, extra: Partial<RequestDef> = {}): RequestDef => ({
  id: randomUUID().slice(0, 8),
  name,
  method,
  url,
  params: [],
  headers: [],
  auth: { type: 'bearer', token: '{{apiKey}}' },
  body: { mode: 'none', raw: '', form: [] },
  ...extra,
});

/** Collection mẫu cho ZenPanel AI Gateway ({{baseUrl}}, {{apiKey}} lấy từ môi trường "ZenPanel AI Gateway") */
function defaultWorkspace(): Workspace {
  const json = (raw: unknown) => ({ mode: 'json' as const, raw: JSON.stringify(raw, null, 2), form: [] });
  return {
    collections: [
      {
        id: 'zen-gateway',
        name: 'ZenPanel AI Gateway',
        requests: [
          blankRequest('Health', 'GET', '{{baseUrl}}/health', { auth: { type: 'none' } }),
          blankRequest('Danh sách model', 'GET', '{{baseUrl}}/models'),
          blankRequest('Chi tiết 1 model', 'GET', '{{baseUrl}}/models/{{model}}'),
          blankRequest('Nhà cung cấp đã kết nối', 'GET', '{{baseUrl}}/providers'),
          blankRequest('Thông tin API key', 'GET', '{{baseUrl}}/key'),
          blankRequest('Thống kê sử dụng', 'GET', '{{baseUrl}}/usage', { params: [{ key: 'hours', value: '24', enabled: true }] }),
          blankRequest('Chat completions', 'POST', '{{baseUrl}}/chat/completions', {
            body: json({ model: '{{model}}', messages: [{ role: 'user', content: 'Bạn là ai?' }], temperature: 0.7 }),
          }),
          blankRequest('Chat (stream)', 'POST', '{{baseUrl}}/chat/completions', {
            body: json({ model: '{{model}}', stream: true, messages: [{ role: 'user', content: 'Viết 1 câu chào ngắn' }] }),
          }),
          blankRequest('Completions (prompt)', 'POST', '{{baseUrl}}/completions', { body: json({ model: '{{model}}', prompt: 'Thủ đô của Việt Nam là' }) }),
          blankRequest('Embeddings', 'POST', '{{baseUrl}}/embeddings', { body: json({ model: 'openai/text-embedding-3-small', input: 'Xin chào ZenPanel' }) }),
        ],
      },
      {
        id: 'examples',
        name: 'Ví dụ API công khai',
        requests: [
          blankRequest('IP của VPS', 'GET', 'https://api.ipify.org?format=json', { auth: { type: 'none' } }),
          blankRequest('JSON placeholder', 'GET', 'https://jsonplaceholder.typicode.com/todos/1', { auth: { type: 'none' } }),
          blankRequest('POST echo', 'POST', 'https://httpbin.org/post', { auth: { type: 'none' }, body: json({ hello: 'ZenPanel' }) }),
        ],
      },
    ],
    environments: [{ id: 'local', name: 'Biến của tôi', vars: [{ key: 'model', value: 'auto', enabled: true }] }],
    activeEnv: 'local',
    history: [],
  };
}

const isText = (type: string) => /json|text|xml|html|javascript|x-www-form-urlencoded|event-stream|yaml|csv/i.test(type) || !type;

export class HttpClientService {
  workspace(): Workspace {
    return readJson<Workspace | null>(FILE, null) ?? defaultWorkspace();
  }

  save(input: Partial<Workspace>): Workspace {
    const current = this.workspace();
    const next: Workspace = {
      collections: Array.isArray(input.collections) ? input.collections : current.collections,
      environments: Array.isArray(input.environments) ? input.environments : current.environments,
      activeEnv: input.activeEnv !== undefined ? input.activeEnv : current.activeEnv,
      history: Array.isArray(input.history) ? input.history.slice(0, MAX_HISTORY) : current.history,
    };
    if (JSON.stringify(next).length > 5_000_000) throw badRequest('Workspace quá lớn');
    writeJson(FILE, next);
    return next;
  }

  reset(): Workspace {
    const fresh = defaultWorkspace();
    writeJson(FILE, fresh);
    return fresh;
  }

  async send(input: SendInput): Promise<SendResult> {
    const method = String(input.method ?? 'GET').toUpperCase();
    if (!METHODS.includes(method)) throw badRequest('Method không hợp lệ');
    let url: URL;
    try {
      url = new URL(String(input.url ?? '').trim());
    } catch {
      throw badRequest('URL không hợp lệ (cần có http:// hoặc https://)');
    }
    if (!/^https?:$/.test(url.protocol)) throw badRequest('Chỉ hỗ trợ http:// và https://');

    const headers = new Headers();
    for (const h of input.headers ?? []) if (h.key?.trim()) headers.set(h.key.trim(), h.value ?? '');
    let body: BodyInit | undefined;
    const mode = input.body?.mode ?? 'none';
    if (method !== 'GET' && method !== 'HEAD' && mode !== 'none') {
      if (mode === 'json') {
        body = input.body?.raw ?? '';
        if (!headers.has('content-type')) headers.set('Content-Type', 'application/json');
      } else if (mode === 'text') {
        body = input.body?.raw ?? '';
        if (!headers.has('content-type')) headers.set('Content-Type', 'text/plain');
      } else if (mode === 'raw') {
        body = input.body?.raw ?? '';
        if (!headers.has('content-type')) {
          const rawType = (input.body as any)?.rawType || 'json';
          if (rawType === 'json') headers.set('Content-Type', 'application/json');
          else if (rawType === 'xml') headers.set('Content-Type', 'application/xml');
          else if (rawType === 'html') headers.set('Content-Type', 'text/html');
          else if (rawType === 'javascript') headers.set('Content-Type', 'application/javascript');
          else headers.set('Content-Type', 'text/plain');
        }
      } else if (mode === 'urlencoded') {
        body = new URLSearchParams((input.body?.form ?? []).filter((f) => f.key).map((f) => [f.key, f.value]));
      } else if (mode === 'form') {
        const form = new FormData();
        for (const f of input.body?.form ?? []) if (f.key) form.append(f.key, f.value);
        body = form;
      }
    }

    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body,
        redirect: input.followRedirects === false ? 'manual' : 'follow',
        signal: AbortSignal.timeout(Math.min(300_000, Math.max(1000, Number(input.timeoutMs) || 60_000))),
      });
    } catch (err) {
      const reason = (err as Error & { cause?: { code?: string; message?: string } }).cause;
      throw badRequest(`Không gửi được request: ${reason?.code ?? ''} ${reason?.message ?? (err as Error).message}`.trim());
    }

    // Đọc tối đa 10MB để không treo panel với file lớn
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const ms = performance.now() - started;
    const buffer = Buffer.concat(chunks);
    const type = res.headers.get('content-type') ?? '';
    const result: SendResult = {
      status: res.status,
      statusText: res.statusText,
      ms,
      size,
      headers: [...res.headers.entries()],
      body: isText(type) ? buffer.toString('utf8') : buffer.toString('base64'),
      encoding: isText(type) ? 'text' : 'base64',
      truncated,
      url: res.url || url.toString(),
    };

    if (input.record) {
      const ws = this.workspace();
      ws.history = [{ ...input.record, at: new Date().toISOString(), status: res.status, ms: Math.round(ms) }, ...ws.history].slice(0, MAX_HISTORY);
      writeJson(FILE, ws);
    }
    return result;
  }
}
