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

/** Collection mẫu toàn diện: ZenPanel AI Gateway (OpenAI, Anthropic, Ollama) & ZenPanel Quản Trị Hệ Thống */
function defaultWorkspace(): Workspace {
  const json = (raw: unknown) => ({ mode: 'json' as const, raw: JSON.stringify(raw, null, 2), form: [] });
  return {
    collections: [
      {
        id: 'zen-gateway-openai',
        name: 'ZenPanel AI Gateway (OpenAI Format)',
        requests: [
          blankRequest('01. [Public] Kiểm tra sức khỏe (Health)', 'GET', '{{baseUrl}}/health', { auth: { type: 'none' } }),
          blankRequest('02. [Public] Xem hướng dẫn & Endpoints', 'GET', '{{baseUrl}}/guide', { auth: { type: 'none' } }),
          blankRequest('03. [Models] Danh sách Models & Tiers', 'GET', '{{baseUrl}}/models'),
          blankRequest('04. [Models] Chi tiết 1 Model', 'GET', '{{baseUrl}}/models/{{model}}'),
          blankRequest('05. [Providers] Nhà cung cấp & Keys', 'GET', '{{baseUrl}}/providers'),
          blankRequest('06. [Key] Thông tin API Key hiện tại', 'GET', '{{baseUrl}}/key'),
          blankRequest('07. [Config] Xem cấu hình Gateway', 'GET', '{{baseUrl}}/config'),
          blankRequest('08. [Config] Set Model Default & Fallback', 'POST', '{{baseUrl}}/config', {
            body: json({ model: 'auto', tier1Model: 'auto', tier2Model: 'auto', fallbacks: [] }),
          }),
          blankRequest('09. [Usage] Thống kê tiêu thụ Token 24h', 'GET', '{{baseUrl}}/usage', { params: [{ key: 'hours', value: '24', enabled: true }] }),
          blankRequest('10. [Chat] Chat Completions (Auto 3-Tier)', 'POST', '{{baseUrl}}/chat/completions', {
            body: json({
              model: 'auto',
              messages: [{ role: 'user', content: 'Xin chào! Bạn là mô hình AI nào?' }],
              temperature: 0.7,
            }),
          }),
          blankRequest('11. [Chat] Chat Streaming (SSE)', 'POST', '{{baseUrl}}/chat/completions', {
            body: json({
              model: 'auto',
              stream: true,
              messages: [{ role: 'user', content: 'Đếm từ 1 đến 5 và phản hồi ngắn gọn.' }],
            }),
          }),
          blankRequest('12. [Completions] Prompt Completions', 'POST', '{{baseUrl}}/completions', {
            body: json({ model: 'auto', prompt: 'Thủ đô của Việt Nam là' }),
          }),
          blankRequest('13. [Embeddings] Vector Embeddings', 'POST', '{{baseUrl}}/embeddings', {
            body: json({ model: 'openai/text-embedding-3-small', input: 'Xin chào ZenPanel AI Gateway' }),
          }),
        ],
      },
      {
        id: 'zen-gateway-anthropic-ollama',
        name: 'ZenPanel AI Gateway (Anthropic & Ollama)',
        requests: [
          blankRequest('01. [Anthropic] Messages (Claude Code / Cline)', 'POST', '{{baseUrl}}/messages', {
            auth: { type: 'none' },
            headers: [
              { key: 'x-api-key', value: '{{apiKey}}', enabled: true },
              { key: 'anthropic-version', value: '2023-06-01', enabled: true },
              { key: 'Content-Type', value: 'application/json', enabled: true },
            ],
            body: json({
              model: '{{model}}',
              max_tokens: 1024,
              messages: [{ role: 'user', content: 'Xin chào Claude! Bạn hỗ trợ những gì?' }],
            }),
          }),
          blankRequest('02. [Anthropic] Messages Streaming (SSE)', 'POST', '{{baseUrl}}/messages', {
            auth: { type: 'none' },
            headers: [
              { key: 'x-api-key', value: '{{apiKey}}', enabled: true },
              { key: 'anthropic-version', value: '2023-06-01', enabled: true },
              { key: 'Content-Type', value: 'application/json', enabled: true },
            ],
            body: json({
              model: '{{model}}',
              max_tokens: 1024,
              stream: true,
              messages: [{ role: 'user', content: 'Viết 1 đoạn code Python ngắn tính giai thừa.' }],
            }),
          }),
          blankRequest('03. [Ollama] Danh sách Models (Tags)', 'GET', '{{panelUrl}}/ollama/api/tags', { auth: { type: 'bearer', token: '{{apiKey}}' } }),
          blankRequest('04. [Ollama] Kiểm tra Version', 'GET', '{{panelUrl}}/ollama/api/version', { auth: { type: 'none' } }),
          blankRequest('05. [Ollama] Chat Completions', 'POST', '{{panelUrl}}/ollama/api/chat', {
            auth: { type: 'bearer', token: '{{apiKey}}' },
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: json({
              model: '{{model}}',
              messages: [{ role: 'user', content: 'Chào Ollama từ ZenPanel AI Gateway!' }],
              stream: false,
            }),
          }),
          blankRequest('06. [Ollama] Chat Streaming (NDJSON)', 'POST', '{{panelUrl}}/ollama/api/chat', {
            auth: { type: 'bearer', token: '{{apiKey}}' },
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: json({
              model: '{{model}}',
              messages: [{ role: 'user', content: 'Đếm từ 1 đến 5.' }],
              stream: true,
            }),
          }),
          blankRequest('07. [Ollama] Generate (Prompt)', 'POST', '{{panelUrl}}/ollama/api/generate', {
            auth: { type: 'bearer', token: '{{apiKey}}' },
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: json({
              model: '{{model}}',
              prompt: 'Tại sao bầu trời màu xanh?',
              stream: false,
            }),
          }),
          blankRequest('08. [Ollama] Models Đang Chạy (ps)', 'GET', '{{panelUrl}}/ollama/api/ps', { auth: { type: 'bearer', token: '{{apiKey}}' } }),
        ],
      },
      {
        id: 'zenpanel-system',
        name: 'ZenPanel Quản Trị VPS (System APIs)',
        requests: [
          blankRequest('01. [System] Thông tin phần cứng & Uptime', 'GET', '{{panelUrl}}/api/system/info', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('02. [Metrics] Chỉ số Realtime (CPU/RAM/Disk)', 'GET', '{{panelUrl}}/api/metrics', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('03. [Docker] Danh sách Containers', 'GET', '{{panelUrl}}/api/docker/containers', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('04. [Docker] Thống kê CPU/RAM Containers', 'GET', '{{panelUrl}}/api/docker/stats', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('05. [Sites] Danh sách Websites & Vhosts', 'GET', '{{panelUrl}}/api/sites', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('06. [Speedtest] Đo tốc độ mạng VPS', 'GET', '{{panelUrl}}/api/speedtest', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('07. [Clean] Quét rác hệ thống & Logs', 'GET', '{{panelUrl}}/api/system/clean/scan', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('08. [Clean] Tối ưu giải phóng RAM tức thì', 'POST', '{{panelUrl}}/api/system/memory/optimize', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('09. [Backups] Danh sách bản sao lưu VPS', 'GET', '{{panelUrl}}/api/backups', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('10. [Apps] Danh sách ứng dụng App Store', 'GET', '{{panelUrl}}/api/apps', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('11. [Processes] Tiến trình đang chạy', 'GET', '{{panelUrl}}/api/processes', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('12. [Ports] Cổng mạng đang mở (Listening)', 'GET', '{{panelUrl}}/api/ports', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('13. [Tools] Kiểm tra công cụ hệ thống đã cài', 'GET', '{{panelUrl}}/api/system/tools', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
          blankRequest('14. [Logs] Danh sách nguồn nhật ký (Logs)', 'GET', '{{panelUrl}}/api/logs/sources', {
            auth: { type: 'bearer', token: '{{panelToken}}' },
          }),
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
    const saved = readJson<Workspace | null>(FILE, null);
    if (!saved) return defaultWorkspace();

    // Tự động nâng cấp bộ API nếu thiếu các collection mới của ZenPanel
    const defaults = defaultWorkspace().collections;
    const existingIds = new Set((saved.collections || []).map((c) => c.id));
    let modified = false;

    // Chuyển đổi legacy 'zen-gateway' thành 'zen-gateway-openai'
    const legacyIdx = saved.collections.findIndex((c) => c.id === 'zen-gateway');
    if (legacyIdx >= 0) {
      saved.collections.splice(legacyIdx, 1);
      modified = true;
    }

    // Sửa các đường dẫn mẫu sai của phiên bản cũ trong collection đã lưu (chỉ đổi khi khớp đúng URL cũ)
    const FIXED_URLS: Record<string, string> = {
      '{{baseUrl}}/v1/messages': '{{baseUrl}}/messages',
      '{{baseUrl}}/api/tags': '{{panelUrl}}/ollama/api/tags',
      '{{baseUrl}}/api/version': '{{panelUrl}}/ollama/api/version',
      '{{baseUrl}}/api/chat': '{{panelUrl}}/ollama/api/chat',
      '{{baseUrl}}/api/generate': '{{panelUrl}}/ollama/api/generate',
      '{{baseUrl}}/api/ps': '{{panelUrl}}/ollama/api/ps',
      '{{panelUrl}}/api/system/clean/ram': '{{panelUrl}}/api/system/memory/optimize',
    };
    for (const col of saved.collections) {
      for (const r of col.requests ?? []) {
        const fixed = FIXED_URLS[r.url];
        if (!fixed) continue;
        r.url = fixed;
        if (fixed.includes('/ollama/api/') && !fixed.endsWith('/version') && r.auth?.type === 'none') r.auth = { type: 'bearer', token: '{{apiKey}}' };
        modified = true;
      }
    }

    for (const d of defaults) {
      if (!existingIds.has(d.id) && !saved.collections.some((c) => c.name === d.name)) {
        saved.collections.push(d);
        modified = true;
      }
    }

    if (modified) {
      writeJson(FILE, saved);
    }
    return saved;
  }

  importTemplates(): Workspace {
    const ws = this.workspace();
    const defaults = defaultWorkspace().collections;
    const map = new Map(ws.collections.map((c) => [c.id, c]));
    map.delete('zen-gateway');

    for (const d of defaults) {
      map.set(d.id, d);
    }
    ws.collections = Array.from(map.values());
    writeJson(FILE, ws);
    return ws;
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
