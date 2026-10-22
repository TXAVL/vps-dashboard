// ZenPanel - API Tester kiểu Postman: request gửi từ chính VPS nên gọi được mọi URL (không vướng CORS)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Download,
  Eraser,
  Eye,
  FilePlus,
  Folder,
  FolderPlus,
  Globe2,
  History,
  Maximize2,
  Minimize2,
  PanelLeft,
  Pencil,
  Plus,
  Save,
  Send,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Button, CopyButton, EmptyState, IconButton, Modal, Select, Spinner, cn } from '../components/ui';
import { get, post, put } from '../lib/api';
import { formatBytes, formatRelative } from '../lib/format';
import { usePanel } from '../lib/panel';

interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

interface RequestDef {
  id: string;
  name: string;
  method: string;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: { type: 'none' | 'bearer' | 'basic' | 'apikey'; token?: string; username?: string; password?: string; key?: string; value?: string; in?: 'header' | 'query' };
  body: { mode: 'none' | 'raw' | 'json' | 'text' | 'urlencoded' | 'form' | 'binary'; rawType?: 'json' | 'text' | 'javascript' | 'html' | 'xml'; raw: string; form: KeyValue[] };
}

interface Workspace {
  collections: { id: string; name: string; requests: RequestDef[] }[];
  environments: { id: string; name: string; vars: KeyValue[] }[];
  activeEnv: string | null;
  history: (RequestDef & { at: string; status: number; ms: number })[];
}

interface SendResult {
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

interface OpenTab {
  key: string;
  request: RequestDef;
  /** Vị trí trong collection (để Lưu ghi đè) */
  source: { collectionId: string; requestId: string } | null;
  dirty: boolean;
  response: SendResult | null;
  error: string | null;
  sending: boolean;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const METHOD_COLOR: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-blue-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-red-400',
  HEAD: 'text-cyan-400',
  OPTIONS: 'text-pink-400',
};

const uid = () => Math.random().toString(36).slice(2, 10);
const blank = (): RequestDef => ({
  id: uid(),
  name: 'Request mới',
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { mode: 'none', rawType: 'json', raw: '', form: [] },
});

/** Bóc tách lệnh cURL thành đối tượng RequestDef */
function parseCurl(curlText: string): Partial<RequestDef> | null {
  const text = curlText.trim();
  if (!text.toLowerCase().startsWith('curl')) return null;

  let method = 'GET';
  let url = '';
  const headers: KeyValue[] = [];
  let rawBody = '';

  const tokens: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '-X' || token === '--request') {
      method = (tokens[++i] || 'GET').toUpperCase();
    } else if (token === '-H' || token === '--header') {
      const hStr = tokens[++i] || '';
      const colon = hStr.indexOf(':');
      if (colon > 0) {
        headers.push({ key: hStr.slice(0, colon).trim(), value: hStr.slice(colon + 1).trim(), enabled: true });
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      rawBody = tokens[++i] || '';
      if (method === 'GET') method = 'POST';
    } else if (!token.startsWith('-') && !url && (token.startsWith('http://') || token.startsWith('https://') || token.startsWith('{{'))) {
      url = token;
    }
  }

  const params: KeyValue[] = [];
  const qIdx = url.indexOf('?');
  if (qIdx > 0) {
    const qStr = url.slice(qIdx + 1);
    for (const pair of qStr.split('&')) {
      const [k, v] = pair.split('=');
      if (k) params.push({ key: decodeURIComponent(k), value: decodeURIComponent(v ?? ''), enabled: true });
    }
  }

  let bodyMode: RequestDef['body']['mode'] = 'none';
  let rawType: 'json' | 'text' | 'javascript' | 'html' | 'xml' = 'json';
  if (rawBody) {
    bodyMode = 'raw';
    const isJson = rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[');
    rawType = isJson ? 'json' : 'text';
  }

  return {
    method,
    url,
    params,
    headers,
    body: {
      mode: bodyMode,
      rawType,
      raw: rawBody,
      form: [],
    },
  };
}

/** Tách query trong URL thành bảng Params */
function parseParams(url: string, previous: KeyValue[]): KeyValue[] {
  const q = url.indexOf('?');
  const disabled = previous.filter((p) => !p.enabled);
  if (q < 0) return disabled;
  const parsed = url
    .slice(q + 1)
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [k, ...v] = pair.split('=');
      const decode = (s: string) => {
        try {
          return decodeURIComponent(s.replace(/\+/g, ' '));
        } catch {
          return s;
        }
      };
      return { key: decode(k), value: decode(v.join('=')), enabled: true };
    });
  return [...parsed, ...disabled];
}

/** Ghép bảng Params (đang bật) vào URL; giữ nguyên {{biến}} không encode */
function buildUrl(url: string, params: KeyValue[]): string {
  const base = url.split('?')[0];
  const enc = (s: string) => (/\{\{.*\}\}/.test(s) ? s : encodeURIComponent(s));
  const query = params
    .filter((p) => p.enabled && p.key)
    .map((p) => `${enc(p.key)}=${enc(p.value)}`)
    .join('&');
  return query ? `${base}?${query}` : base;
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name: string) => vars[name] ?? m);
}

function KeyValueEditor({ rows, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }: { rows: KeyValue[]; onChange: (rows: KeyValue[]) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  const list = [...rows, { key: '', value: '', enabled: true }];
  const update = (index: number, patch: Partial<KeyValue>) => {
    const next = list.map((r, i) => (i === index ? { ...r, ...patch } : r)).filter((r, i) => r.key || r.value || i < list.length - 1);
    onChange(next.filter((r) => r.key || r.value));
  };
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/50">
      <div className="grid grid-cols-[32px_1fr_1fr_32px] border-b border-slate-700/50 bg-ink-950/60 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span />
        <span className="px-2 py-1.5">{keyPlaceholder}</span>
        <span className="border-l border-slate-700/50 px-2 py-1.5">{valuePlaceholder}</span>
        <span />
      </div>
      {list.map((row, i) => (
        <div key={i} className="grid grid-cols-[32px_1fr_1fr_32px] items-center border-b border-slate-800 last:border-b-0">
          <span className="flex justify-center">
            {i < list.length - 1 && <input type="checkbox" className="accent-zen-blue" checked={row.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />}
          </span>
          <input className="mono min-w-0 bg-transparent px-2 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600" placeholder={keyPlaceholder} value={row.key} onChange={(e) => update(i, { key: e.target.value })} />
          <input className="mono min-w-0 border-l border-slate-800 bg-transparent px-2 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600" placeholder={valuePlaceholder} value={row.value} onChange={(e) => update(i, { value: e.target.value })} />
          <span className="flex justify-center">
            {i < list.length - 1 && (
              <button className="text-slate-600 hover:text-zen-red" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Xoá dòng">
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function statusTone(status: number) {
  return status >= 200 && status < 300 ? 'text-emerald-400' : status >= 300 && status < 400 ? 'text-blue-400' : status >= 400 && status < 500 ? 'text-amber-400' : 'text-red-400';
}

function curlOf(req: RequestDef, vars: Record<string, string>, headers: [string, string][]): string {
  const url = substitute(buildUrl(req.url, req.params), vars);
  const parts = [`curl -X ${req.method} '${url}'`];
  for (const [k, v] of headers) parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
  if (req.body.mode === 'json' || req.body.mode === 'text' || req.body.mode === 'raw') {
    if (req.body.raw) parts.push(`  -d '${substitute(req.body.raw, vars).replace(/'/g, "'\\''")}'`);
  }
  if (req.body.mode === 'urlencoded') for (const f of req.body.form.filter((f) => f.enabled)) parts.push(`  --data-urlencode '${f.key}=${substitute(f.value, vars)}'`);
  if (req.body.mode === 'form') for (const f of req.body.form.filter((f) => f.enabled)) parts.push(`  -F '${f.key}=${substitute(f.value, vars)}'`);
  return parts.join(' \\\n');
}

/** Sinh code đa ngôn ngữ chuẩn Postman */
function generateCodeSnippet(req: RequestDef, lang: string, vars: Record<string, string>, headers: [string, string][]): string {
  const url = substitute(buildUrl(req.url, req.params), vars);
  const method = req.method;
  const bodyRaw = req.body.mode === 'raw' || req.body.mode === 'json' || req.body.mode === 'text'
    ? substitute(req.body.raw, vars)
    : '';

  switch (lang) {
    case 'js-fetch': {
      const headerObj = Object.fromEntries(headers);
      const opts: any = { method };
      if (headers.length > 0) opts.headers = headerObj;
      if (bodyRaw && method !== 'GET' && method !== 'HEAD') opts.body = bodyRaw;
      return `// JavaScript (Fetch API)\nconst response = await fetch('${url}', ${JSON.stringify(opts, null, 2)});\nconst data = await response.json();\nconsole.log(data);`;
    }

    case 'js-axios': {
      const headerObj = Object.fromEntries(headers);
      return `// JavaScript (Axios)\nimport axios from 'axios';\n\nconst config = {\n  method: '${method.toLowerCase()}',\n  url: '${url}',\n  headers: ${JSON.stringify(headerObj, null, 2)},\n  ${bodyRaw && method !== 'GET' ? `data: ${bodyRaw.startsWith('{') || bodyRaw.startsWith('[') ? bodyRaw : JSON.stringify(bodyRaw)}` : ''}\n};\n\nconst response = await axios(config);\nconsole.log(response.data);`;
    }

    case 'node-native': {
      const headerObj = Object.fromEntries(headers);
      return `// Node.js (v18+ Native Fetch)\nconst response = await fetch('${url}', {\n  method: '${method}',\n  headers: ${JSON.stringify(headerObj, null, 2)},\n  ${bodyRaw && method !== 'GET' ? `body: JSON.stringify(${bodyRaw})` : ''}\n});\nconst result = await response.json();\nconsole.log(result);`;
    }

    case 'python': {
      const headerObj = Object.fromEntries(headers);
      let py = `import requests\n\nurl = "${url}"\nheaders = ${JSON.stringify(headerObj, null, 4)}\n`;
      if (bodyRaw && method !== 'GET') {
        if (bodyRaw.startsWith('{') || bodyRaw.startsWith('[')) {
          py += `payload = ${bodyRaw}\nresponse = requests.${method.toLowerCase()}(url, headers=headers, json=payload)\n`;
        } else {
          py += `payload = """${bodyRaw}"""\nresponse = requests.${method.toLowerCase()}(url, headers=headers, data=payload)\n`;
        }
      } else {
        py += `response = requests.${method.toLowerCase()}(url, headers=headers)\n`;
      }
      py += `print(response.status_code)\nprint(response.text)\n`;
      return py;
    }

    case 'php': {
      let php = `<?php\n$curl = curl_init();\n\ncurl_setopt_array($curl, array(\n  CURLOPT_URL => '${url}',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_CUSTOMREQUEST => '${method}',\n`;
      if (headers.length > 0) {
        php += `  CURLOPT_HTTPHEADER => array(\n`;
        headers.forEach(([k, v]) => {
          php += `    '${k}: ${v}',\n`;
        });
        php += `  ),\n`;
      }
      if (bodyRaw && method !== 'GET') {
        php += `  CURLOPT_POSTFIELDS => '${bodyRaw.replace(/'/g, "\\'")}',\n`;
      }
      php += `));\n\n$response = curl_exec($curl);\ncurl_close($curl);\necho $response;\n`;
      return php;
    }

    case 'go': {
      let go = `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n`;
      if (bodyRaw && method !== 'GET') go += `\t"strings"\n`;
      go += `)\n\nfunc main() {\n\turl := "${url}"\n`;
      if (bodyRaw && method !== 'GET') {
        go += `\tpayload := strings.NewReader(\`${bodyRaw}\`)\n\treq, err := http.NewRequest("${method}", url, payload)\n`;
      } else {
        go += `\treq, err := http.NewRequest("${method}", url, nil)\n`;
      }
      go += `\tif err != nil {\n\t\tpanic(err)\n\t}\n\n`;
      headers.forEach(([k, v]) => {
        go += `\treq.Header.Add("${k}", "${v}")\n`;
      });
      go += `\n\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer res.Body.Close()\n\n\tbody, _ := io.ReadAll(res.Body)\n\tfmt.Println(string(body))\n}\n`;
      return go;
    }

    default:
      return curlOf(req, vars, headers);
  }
}

function ImportCurlModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (req: RequestDef) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    if (!text.trim()) return;
    const parsed = parseCurl(text);
    if (!parsed || !parsed.url) {
      setError('Lệnh cURL không hợp lệ. Vui lòng kiểm tra lại định dạng (ví dụ: curl -X POST https://api.com -H "..." -d "...")');
      return;
    }
    const req: RequestDef = {
      id: uid(),
      name: `${parsed.method || 'GET'} ${parsed.url.split('?')[0].split('/').pop() || 'Request'}`,
      method: parsed.method || 'GET',
      url: parsed.url,
      params: parsed.params || [],
      headers: parsed.headers || [],
      auth: { type: 'none' },
      body: parsed.body || { mode: 'none', raw: '', form: [] },
    };
    onImport(req);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Import lệnh cURL (Kiểu Postman)" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-slate-400">
          Dán lệnh cURL từ trình duyệt, terminal hoặc tài liệu API để tự động trích xuất Method, URL, Headers và Body:
        </p>
        <textarea
          rows={7}
          className="w-full rounded-xl border border-slate-700/60 bg-ink-950/80 p-3 text-xs mono text-slate-200 placeholder-slate-600 focus:border-zen-blue outline-none"
          placeholder="curl -X POST 'https://api.example.com/v1/users' \
  -H 'Content-Type: application/json' \
  -d '{&quot;name&quot;: &quot;ZenPanel&quot;}'"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
        />
        {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button variant="primary" icon={Plus} onClick={handleImport} disabled={!text.trim()}>
            Nhập vào Request
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function QuickEnvModal({ open, onClose, zenVars, activeEnv, envs }: { open: boolean; onClose: () => void; zenVars: KeyValue[]; activeEnv: string | null; envs: Workspace['environments'] }) {
  const currentEnv = envs.find((e) => e.id === activeEnv);
  return (
    <Modal open={open} onClose={onClose} title="Xem nhanh Biến Môi Trường (Environment Quick Look)" size="md">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Biến có sẵn của hệ thống ZenPanel</h4>
          <div className="space-y-1.5 rounded-xl border border-slate-700/60 bg-ink-950/60 p-2.5">
            {zenVars.map((v) => (
              <div key={v.key} className="flex items-center justify-between gap-2 text-xs mono">
                <span className="font-semibold text-amber-300">{`{{${v.key}}}`}</span>
                <span className="text-slate-400 truncate max-w-[240px]" title={v.value}>{v.key === 'apiKey' ? `${v.value.slice(0, 10)}…` : v.value}</span>
              </div>
            ))}
          </div>
        </div>

        {currentEnv && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">Biến môi trường: {currentEnv.name}</h4>
            {currentEnv.vars.length === 0 ? (
              <p className="text-xs text-slate-500">Môi trường này chưa có biến tự đặt.</p>
            ) : (
              <div className="space-y-1.5 rounded-xl border border-slate-700/60 bg-ink-950/60 p-2.5">
                {currentEnv.vars.map((v) => (
                  <div key={v.key} className="flex items-center justify-between gap-2 text-xs mono">
                    <span className="font-semibold text-indigo-300">{`{{${v.key}}}`}</span>
                    <span className="text-slate-300 truncate max-w-[240px]" title={v.value}>{v.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EnvModal({ ws, zenVars, onSave, onClose }: { ws: Workspace; zenVars: KeyValue[]; onSave: (envs: Workspace['environments']) => void; onClose: () => void }) {
  const [envs, setEnvs] = useState(ws.environments);
  const [current, setCurrent] = useState(ws.environments[0]?.id ?? null);
  const env = envs.find((e) => e.id === current);
  return (
    <Modal open onClose={onClose} title="Môi trường & biến" size="lg">
      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-1">
          <div className="rounded-lg bg-zen-blue/10 px-3 py-2 text-xs text-blue-200">ZenPanel AI Gateway (tự động)</div>
          {envs.map((e) => (
            <button key={e.id} onClick={() => setCurrent(e.id)} className={cn('block w-full truncate rounded-lg px-3 py-2 text-left text-sm', current === e.id ? 'bg-slate-700/60 text-white' : 'text-slate-400 hover:bg-slate-800')}>
              {e.name}
            </button>
          ))}
          <Button
            size="xs"
            variant="ghost"
            icon={Plus}
            onClick={() => {
              const id = uid();
              setEnvs([...envs, { id, name: `Môi trường ${envs.length + 1}`, vars: [] }]);
              setCurrent(id);
            }}
          >
            Thêm môi trường
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Biến có sẵn (luôn dùng được)</div>
            <div className="space-y-1 rounded-xl border border-slate-700/50 bg-ink-950/50 p-2">
              {zenVars.map((v) => (
                <div key={v.key} className="mono flex gap-2 truncate text-xs">
                  <span className="text-amber-300">{`{{${v.key}}}`}</span>
                  <span className="truncate text-slate-400">{v.key === 'apiKey' ? `${v.value.slice(0, 8)}…` : v.value}</span>
                </div>
              ))}
            </div>
          </div>
          {env ? (
            <>
              <input className="input" value={env.name} onChange={(e) => setEnvs(envs.map((x) => (x.id === env.id ? { ...x, name: e.target.value } : x)))} />
              <KeyValueEditor rows={env.vars} onChange={(vars) => setEnvs(envs.map((x) => (x.id === env.id ? { ...x, vars } : x)))} keyPlaceholder="Tên biến" valuePlaceholder="Giá trị" />
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setEnvs(envs.filter((x) => x.id !== env.id))}>
                Xoá môi trường
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Chọn hoặc thêm môi trường.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          variant="primary"
          icon={Save}
          onClick={() => {
            onSave(envs);
            onClose();
          }}
        >
          Lưu
        </Button>
      </div>
    </Modal>
  );
}

export default function ApiTester() {
  const { tunnel } = usePanel();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [gatewayKey, setGatewayKey] = useState('');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [side, setSide] = useState<'collections' | 'history'>('collections');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reqTab, setReqTab] = useState<'params' | 'auth' | 'headers' | 'body' | 'code'>('params');
  const [resTab, setResTab] = useState<'pretty' | 'raw' | 'preview' | 'headers'>('pretty');
  const [envOpen, setEnvOpen] = useState(false);
  const [quickEnvOpen, setQuickEnvOpen] = useState(false);
  const [importCurlOpen, setImportCurlOpen] = useState(false);
  const [codeLang, setCodeLang] = useState<string>('curl');
  const [resExpanded, setResExpanded] = useState(false);
  const [mobileView, setMobileView] = useState<'sidebar' | 'editor'>('sidebar');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { confirm, prompt, run, toast } = useFeedback();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void get<Workspace>('/api/http/workspace').then(setWs);
    void get<{ apiKey: string }>('/api/ai/gateway').then((g) => setGatewayKey(g.apiKey), () => undefined);
  }, []);

  const persist = useCallback((next: Workspace) => {
    setWs(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void put('/api/http/workspace', next).catch(() => undefined), 500);
  }, []);

  // Biến có sẵn của ZenPanel + biến của môi trường đang chọn (biến người dùng ghi đè)
  const zenVars: KeyValue[] = useMemo(
    () => [
      { key: 'baseUrl', value: `${tunnel?.status === 'online' && tunnel.url ? tunnel.url : window.location.origin}/zen/v1`, enabled: true },
      { key: 'apiKey', value: gatewayKey, enabled: true },
      { key: 'panelUrl', value: window.location.origin, enabled: true },
    ],
    [tunnel, gatewayKey],
  );
  const vars = useMemo(() => {
    const env = ws?.environments.find((e) => e.id === ws.activeEnv);
    return Object.fromEntries([...zenVars, ...(env?.vars ?? [])].filter((v) => v.enabled && v.key).map((v) => [v.key, v.value]));
  }, [ws, zenVars]);

  const tab = tabs.find((t) => t.key === active) ?? null;

  const openRequest = (request: RequestDef, source: OpenTab['source']) => {
    const existing = source && tabs.find((t) => t.source?.requestId === source.requestId);
    if (existing) {
      setActive(existing.key);
      setMobileView('editor');
      return;
    }
    const key = uid();
    setTabs([...tabs.slice(-9), { key, request: structuredClone(request), source, dirty: false, response: null, error: null, sending: false }]);
    setActive(key);
    setMobileView('editor');
  };

  const patchTab = (key: string, patch: Partial<OpenTab>) => setTabs((list) => list.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const editRequest = (patch: Partial<RequestDef>) => tab && patchTab(tab.key, { request: { ...tab.request, ...patch }, dirty: true });

  const closeTab = async (key: string) => {
    const t = tabs.find((x) => x.key === key);
    if (t?.dirty && !(await confirm({ title: 'Đóng tab chưa lưu', message: `"${t.request.name}" có thay đổi chưa lưu. Vẫn đóng?`, danger: true, confirmLabel: 'Đóng' }))) return;
    const rest = tabs.filter((x) => x.key !== key);
    setTabs(rest);
    if (active === key) setActive(rest[rest.length - 1]?.key ?? null);
  };

  /** Header cuối cùng gửi đi (đã gộp Auth, đã thay biến) */
  const finalHeaders = (req: RequestDef): [string, string][] => {
    const list: [string, string][] = req.headers.filter((h) => h.enabled && h.key).map((h) => [substitute(h.key, vars), substitute(h.value, vars)]);
    const a = req.auth;
    if (a.type === 'bearer' && a.token) list.push(['Authorization', `Bearer ${substitute(a.token, vars)}`]);
    if (a.type === 'basic') list.push(['Authorization', `Basic ${btoa(unescape(encodeURIComponent(`${substitute(a.username ?? '', vars)}:${substitute(a.password ?? '', vars)}`)))}`]);
    if (a.type === 'apikey' && a.key && (a.in ?? 'header') === 'header') list.push([substitute(a.key, vars), substitute(a.value ?? '', vars)]);
    return list;
  };

  const send = async () => {
    if (!tab || !tab.request.url.trim()) return;
    const req = tab.request;
    let url = substitute(buildUrl(req.url, req.params), vars);
    if (req.auth.type === 'apikey' && req.auth.in === 'query' && req.auth.key) {
      url += `${url.includes('?') ? '&' : '?'}${encodeURIComponent(substitute(req.auth.key, vars))}=${encodeURIComponent(substitute(req.auth.value ?? '', vars))}`;
    }
    patchTab(tab.key, { sending: true, error: null });
    try {
      const result = await post<SendResult>('/api/http/send', {
        method: req.method,
        url,
        headers: finalHeaders(req).map(([key, value]) => ({ key, value })),
        body: {
          mode: req.body.mode,
          rawType: req.body.rawType,
          raw: substitute(req.body.raw, vars),
          form: req.body.form.filter((f) => f.enabled).map((f) => ({ key: f.key, value: substitute(f.value, vars) })),
        },
        record: req,
      });
      patchTab(tab.key, { sending: false, response: result });
      const fresh = await get<Workspace>('/api/http/workspace');
      setWs((cur) => (cur ? { ...cur, history: fresh.history } : fresh));
    } catch (err) {
      patchTab(tab.key, { sending: false, error: (err as Error).message, response: null });
    }
  };

  const saveTab = async (asNew = false) => {
    if (!tab || !ws) return;
    if (tab.source && !asNew) {
      const next = {
        ...ws,
        collections: ws.collections.map((c) =>
          c.id === tab.source!.collectionId ? { ...c, requests: c.requests.map((r) => (r.id === tab.source!.requestId ? { ...tab.request, id: r.id } : r)) } : c,
        ),
      };
      persist(next);
      patchTab(tab.key, { dirty: false });
      toast('Đã lưu request');
      return;
    }
    if (!ws.collections.length) {
      toast('Hãy tạo collection trước', 'info');
      return;
    }
    const name = await prompt({ title: 'Lưu request', label: 'Tên request', defaultValue: tab.request.name, confirmLabel: 'Lưu' });
    if (!name) return;
    const target = ws.collections[0];
    const saved = { ...tab.request, id: uid(), name };
    persist({ ...ws, collections: ws.collections.map((c) => (c.id === target.id ? { ...c, requests: [...c.requests, saved] } : c)) });
    patchTab(tab.key, { request: saved, source: { collectionId: target.id, requestId: saved.id }, dirty: false });
    toast(`Đã lưu vào "${target.name}"`);
  };

  // Ctrl+Enter gửi, Ctrl+S lưu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        void send();
      } else if (e.key.toLowerCase() === 's' && tab) {
        e.preventDefault();
        void saveTab();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!ws) return <Spinner />;

  const res = tab?.response;
  const prettyBody = (() => {
    if (!res || res.encoding !== 'text') return res?.body ?? '';
    try {
      return JSON.stringify(JSON.parse(res.body), null, 2);
    } catch {
      return res.body;
    }
  })();
  const resType = res?.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  const lang = /json/.test(resType) ? 'json' : /html/.test(resType) ? 'html' : /xml/.test(resType) ? 'xml' : /javascript/.test(resType) ? 'javascript' : 'plaintext';

  const totalRequests = ws.collections.reduce((sum, c) => sum + c.requests.length, 0);

  return (
    <div className="-m-3 flex h-[calc(100dvh-5.25rem)] max-h-[calc(100dvh-5.25rem)] min-h-[500px] flex-col overflow-hidden sm:-m-6">
      {/* Thanh trên: tiêu đề + môi trường */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-ink-950/80 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:flex"
            data-tip={sidebarOpen ? 'Thu gọn danh sách' : 'Mở rộng danh sách'}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="size-4" />
          </button>
          <Globe2 className="size-5 text-zen-blue" />
          <span className="font-bold text-white">API Tester</span>
        </div>
        <span className="hidden text-xs text-slate-500 xl:inline">Request gửi từ VPS · Ctrl+Enter gửi · Ctrl+S lưu</span>
        <div className="ml-auto flex items-center gap-2">
          <Select className="h-8 max-w-[170px] sm:w-48 py-0 text-xs" value={ws.activeEnv ?? ''} onChange={(e) => persist({ ...ws, activeEnv: e.target.value || null })}>
            <option value="">Không dùng môi trường</option>
            {ws.environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <IconButton icon={Eye} title="Xem nhanh biến môi trường (Environment Quick Look)" onClick={() => setQuickEnvOpen(true)} />
          <IconButton icon={Settings2} title="Quản lý môi trường & biến" onClick={() => setEnvOpen(true)} />
        </div>
      </div>

      {/* Thanh chuyển đổi chế độ xem cho Mobile & Tablet */}
      <div className="flex lg:hidden border-b border-slate-800 bg-ink-950/95 p-1 gap-1">
        <button
          onClick={() => setMobileView('sidebar')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition',
            mobileView === 'sidebar' ? 'bg-zen-blue text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          )}
        >
          <Folder className="size-3.5" />
          <span>Collections ({totalRequests})</span>
        </button>
        <button
          onClick={() => setMobileView('editor')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition',
            mobileView === 'editor' ? 'bg-zen-blue text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          )}
        >
          <Send className="size-3.5" />
          <span className="truncate">{tab ? `${tab.request.method} ${tab.request.name}` : 'Request'}</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            'flex-col border-r border-slate-800 bg-ink-950/60',
            mobileView === 'sidebar' ? 'flex w-full lg:w-72 lg:shrink-0' : 'hidden',
            sidebarOpen ? 'lg:flex lg:w-72 lg:shrink-0' : 'lg:hidden'
          )}
        >
          <div className="flex border-b border-slate-800">
            {(
              [
                ['collections', 'Collections', Folder],
                ['history', 'Lịch sử', History],
              ] as const
            ).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setSide(id)} className={cn('flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold', side === id ? 'border-b-2 border-zen-blue text-white' : 'text-slate-500')}>
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          {side === 'collections' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                <Button size="xs" variant="ghost" icon={FolderPlus} onClick={async () => {
                  const name = await prompt({ title: 'Tạo collection', label: 'Tên collection', confirmLabel: 'Tạo' });
                  if (name) persist({ ...ws, collections: [...ws.collections, { id: uid(), name, requests: [] }] });
                }}>
                  Collection
                </Button>
                <Button size="xs" variant="ghost" icon={FilePlus} onClick={() => openRequest(blank(), null)}>
                  Request
                </Button>
                <Button size="xs" variant="ghost" icon={Terminal} onClick={() => setImportCurlOpen(true)} title="Nhập cURL">
                  cURL
                </Button>
              </div>
              {ws.collections.map((c) => {
                const open = !collapsed.has(c.id);
                return (
                  <div key={c.id} className="mb-1">
                    <div className="group flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-slate-800/60">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-semibold text-slate-200"
                        onClick={() => {
                          const next = new Set(collapsed);
                          if (open) next.add(c.id);
                          else next.delete(c.id);
                          setCollapsed(next);
                        }}
                      >
                        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                        <Folder className="size-3.5 shrink-0 text-zen-amber" />
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-slate-600">{c.requests.length}</span>
                      </button>
                      <span className="hidden gap-0.5 group-hover:flex">
                        <button className="p-0.5 text-slate-500 hover:text-white" data-tip="Thêm request" onClick={() => {
                          const r = blank();
                          persist({ ...ws, collections: ws.collections.map((x) => (x.id === c.id ? { ...x, requests: [...x.requests, r] } : x)) });
                          openRequest(r, { collectionId: c.id, requestId: r.id });
                        }}>
                          <Plus className="size-3.5" />
                        </button>
                        <button className="p-0.5 text-slate-500 hover:text-white" data-tip="Đổi tên" onClick={async () => {
                          const name = await prompt({ title: 'Đổi tên collection', label: 'Tên', defaultValue: c.name, confirmLabel: 'Lưu' });
                          if (name) persist({ ...ws, collections: ws.collections.map((x) => (x.id === c.id ? { ...x, name } : x)) });
                        }}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button className="p-0.5 text-slate-500 hover:text-zen-red" data-tip="Xoá collection" onClick={async () => {
                          if (await confirm({ title: 'Xoá collection', message: `Xoá "${c.name}" và ${c.requests.length} request?`, danger: true, confirmLabel: 'Xoá' })) {
                            persist({ ...ws, collections: ws.collections.filter((x) => x.id !== c.id) });
                          }
                        }}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>
                    {open &&
                      c.requests.map((r) => (
                        <div key={r.id} className={cn('group ml-4 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-800/60', tab?.source?.requestId === r.id && 'bg-zen-blue/10')}>
                          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openRequest(r, { collectionId: c.id, requestId: r.id })}>
                            <span className={cn('mono w-12 shrink-0 text-[10px] font-bold', METHOD_COLOR[r.method])}>{r.method}</span>
                            <span className="truncate text-xs text-slate-300">{r.name}</span>
                          </button>
                          <button className="hidden p-0.5 text-slate-500 hover:text-zen-red group-hover:block" data-tip="Xoá request" onClick={() =>
                            persist({ ...ws, collections: ws.collections.map((x) => (x.id === c.id ? { ...x, requests: x.requests.filter((y) => y.id !== r.id) } : x)) })
                          }>
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                  </div>
                );
              })}
              <button className="mt-3 text-[11px] text-slate-600 hover:text-slate-400" onClick={async () => {
                if (await confirm({ title: 'Khôi phục mặc định', message: 'Xoá toàn bộ collections, môi trường, lịch sử và nạp lại collection mẫu?', danger: true, confirmLabel: 'Khôi phục' })) {
                  const fresh = await run(() => post<Workspace>('/api/http/workspace/reset'));
                  if (fresh) setWs(fresh);
                }
              }}>
                Khôi phục collection mẫu
              </button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {ws.history.length === 0 && <p className="p-3 text-xs text-slate-500">Chưa có request nào.</p>}
              {ws.history.map((h, i) => (
                <button key={`${h.at}-${i}`} onClick={() => openRequest({ ...h, id: uid() }, null)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/60">
                  <span className={cn('mono w-12 shrink-0 text-[10px] font-bold', METHOD_COLOR[h.method])}>{h.method}</span>
                  <span className="min-w-0 flex-1">
                    <span className="mono block truncate text-xs text-slate-300">{h.url}</span>
                    <span className="block text-[10px] text-slate-600">
                      <span className={statusTone(h.status)}>{h.status}</span> · {h.ms}ms · {formatRelative(h.at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Vùng chính */}
        <div
          className={cn(
            'min-w-0 flex-1 flex-col',
            mobileView === 'editor' ? 'flex w-full' : 'hidden',
            'lg:flex'
          )}
        >
          {/* Tab request đang mở */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-ink-950/40 px-2 pt-1.5">
            <button
              onClick={() => setMobileView('sidebar')}
              className="lg:hidden shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition mr-1"
              title="Quay lại danh sách"
            >
              <Folder className="size-3.5 text-zen-amber" />
              <span>Danh sách</span>
            </button>
            {tabs.map((t) => (
              <div
                key={t.key}
                onClick={() => setActive(t.key)}
                className={cn('group flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border-x border-t px-3 py-1.5 text-xs', t.key === active ? 'border-slate-700 bg-ink-900 text-white' : 'border-transparent text-slate-500 hover:text-slate-300')}
              >
                <span className={cn('mono text-[10px] font-bold', METHOD_COLOR[t.request.method])}>{t.request.method}</span>
                <span className="truncate">{t.request.name}</span>
                {t.dirty && <span className="size-1.5 rounded-full bg-zen-amber" />}
                <button onClick={(e) => { e.stopPropagation(); void closeTab(t.key); }} className="text-slate-600 hover:text-white" aria-label="Đóng tab">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button onClick={() => openRequest(blank(), null)} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Request mới">
              <Plus className="size-4" />
            </button>
            <button onClick={() => setImportCurlOpen(true)} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Nhập lệnh cURL (Import cURL)">
              <Terminal className="size-4" />
            </button>
          </div>

          {!tab ? (
            <EmptyState
              icon={Send}
              title="Mở một request để bắt đầu"
              description={'Chọn request trong collection "ZenPanel AI Gateway" để thử ngay các endpoint của gateway, hoặc tạo request mới tới bất kỳ API nào.'}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" icon={Plus} onClick={() => openRequest(blank(), null)}>
                    Request mới
                  </Button>
                  <Button variant="secondary" icon={Terminal} onClick={() => setImportCurlOpen(true)}>
                    Nhập cURL
                  </Button>
                  <Button variant="secondary" icon={Folder} onClick={() => setMobileView('sidebar')} className="lg:hidden">
                    Xem danh sách Collections ({totalRequests})
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Tên + thanh URL */}
              <div className="space-y-2 border-b border-slate-800 p-3">
                <input className="w-full bg-transparent text-sm font-semibold text-white outline-none" value={tab.request.name} onChange={(e) => editRequest({ name: e.target.value })} />
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-700/60 bg-ink-950/70 focus-within:border-zen-blue/70">
                    <select
                      className={cn('mono shrink-0 border-r border-slate-700/60 bg-transparent px-3 text-xs font-bold outline-none', METHOD_COLOR[tab.request.method])}
                      value={tab.request.method}
                      onChange={(e) => editRequest({ method: e.target.value })}
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m} className="bg-ink-900">
                          {m}
                        </option>
                      ))}
                    </select>
                    <input
                      className="mono min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                      value={tab.request.url}
                      placeholder="https://api.example.com/v1/... hoặc {{baseUrl}}/models"
                      onChange={(e) => editRequest({ url: e.target.value, params: parseParams(e.target.value, tab.request.params) })}
                    />
                  </div>
                  <Button variant="primary" icon={Send} loading={tab.sending} onClick={() => void send()}>
                    Send
                  </Button>
                  <Button icon={Save} onClick={() => void saveTab()} data-tip="Lưu (Ctrl+S)">
                    <span className="hidden sm:inline">Lưu</span>
                  </Button>
                </div>
                {/\{\{/.test(tab.request.url) && (
                  <div className="mono truncate text-[11px] text-slate-500">→ {substitute(buildUrl(tab.request.url, tab.request.params), vars)}</div>
                )}
              </div>

              <div
                className={cn(
                  'grid min-h-0 flex-1 transition-all duration-200',
                  resExpanded ? 'grid-rows-[0px_minmax(0,1fr)]' : 'grid-rows-[minmax(130px,36%)_minmax(0,1fr)]',
                )}
              >
                {/* Cấu hình request */}
                <div className={cn('flex min-h-0 flex-col border-b border-slate-800 overflow-hidden', resExpanded && 'hidden')}>
                  <div className="flex gap-1 overflow-x-auto px-3 pt-2">
                    {(
                      [
                        ['params', `Params${tab.request.params.filter((p) => p.enabled).length ? ` (${tab.request.params.filter((p) => p.enabled).length})` : ''}`],
                        ['auth', 'Authorization'],
                        ['headers', `Headers${tab.request.headers.length ? ` (${tab.request.headers.length})` : ''}`],
                        ['body', 'Body'],
                        ['code', 'Code'],
                      ] as const
                    ).map(([id, label]) => (
                      <button key={id} onClick={() => setReqTab(id)} className={cn('shrink-0 border-b-2 px-3 py-1.5 text-xs font-semibold', reqTab === id ? 'border-zen-blue text-white' : 'border-transparent text-slate-500 hover:text-slate-300')}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {reqTab === 'params' && <KeyValueEditor rows={tab.request.params} onChange={(params) => editRequest({ params, url: buildUrl(tab.request.url, params) })} />}
                    {reqTab === 'headers' && <KeyValueEditor rows={tab.request.headers} onChange={(headers) => editRequest({ headers })} keyPlaceholder="Header" />}
                    {reqTab === 'auth' && (
                      <div className="grid max-w-2xl gap-3 sm:grid-cols-[180px_1fr]">
                        <Select value={tab.request.auth.type} onChange={(e) => editRequest({ auth: { ...tab.request.auth, type: e.target.value as RequestDef['auth']['type'] } })}>
                          <option value="none">Không xác thực</option>
                          <option value="bearer">Bearer Token</option>
                          <option value="basic">Basic Auth</option>
                          <option value="apikey">API Key</option>
                        </Select>
                        <div className="space-y-2">
                          {tab.request.auth.type === 'bearer' && (
                            <input className="input mono" placeholder="Token hoặc {{apiKey}}" value={tab.request.auth.token ?? ''} onChange={(e) => editRequest({ auth: { ...tab.request.auth, token: e.target.value } })} />
                          )}
                          {tab.request.auth.type === 'basic' && (
                            <>
                              <input className="input mono" placeholder="Username" value={tab.request.auth.username ?? ''} onChange={(e) => editRequest({ auth: { ...tab.request.auth, username: e.target.value } })} />
                              <input className="input mono" type="password" placeholder="Password" value={tab.request.auth.password ?? ''} onChange={(e) => editRequest({ auth: { ...tab.request.auth, password: e.target.value } })} />
                            </>
                          )}
                          {tab.request.auth.type === 'apikey' && (
                            <>
                              <input className="input mono" placeholder="Tên (vd X-API-Key)" value={tab.request.auth.key ?? ''} onChange={(e) => editRequest({ auth: { ...tab.request.auth, key: e.target.value } })} />
                              <input className="input mono" placeholder="Giá trị" value={tab.request.auth.value ?? ''} onChange={(e) => editRequest({ auth: { ...tab.request.auth, value: e.target.value } })} />
                              <Select value={tab.request.auth.in ?? 'header'} onChange={(e) => editRequest({ auth: { ...tab.request.auth, in: e.target.value as 'header' | 'query' } })}>
                                <option value="header">Gửi trong Header</option>
                                <option value="query">Gửi trong Query</option>
                              </Select>
                            </>
                          )}
                          {tab.request.auth.type === 'none' && <p className="text-xs text-slate-500">Request không có header xác thực.</p>}
                        </div>
                      </div>
                    )}
                    {reqTab === 'body' && (() => {
                      const mode = tab.request.body.mode;
                      const rawType = tab.request.body.rawType ?? (mode === 'text' ? 'text' : 'json');
                      const isRaw = mode === 'raw' || mode === 'json' || mode === 'text';

                      const setRawType = (type: 'json' | 'text' | 'javascript' | 'html' | 'xml') => {
                        const ctypeMap: Record<string, string> = {
                          json: 'application/json',
                          text: 'text/plain',
                          javascript: 'application/javascript',
                          html: 'text/html',
                          xml: 'application/xml',
                        };
                        const targetCT = ctypeMap[type];
                        const headers = [...tab.request.headers];
                        const ctIdx = headers.findIndex((h) => h.key.toLowerCase() === 'content-type');
                        if (ctIdx >= 0) {
                          headers[ctIdx] = { ...headers[ctIdx], value: targetCT, enabled: true };
                        } else {
                          headers.push({ key: 'Content-Type', value: targetCT, enabled: true });
                        }
                        editRequest({
                          headers,
                          body: { ...tab.request.body, mode: 'raw', rawType: type },
                        });
                      };

                      return (
                        <div className="flex h-full min-h-[160px] flex-col gap-2.5">
                          {/* Radio bar chuẩn Postman kèm Dropdown Raw */}
                          <div className="flex flex-wrap items-center gap-3 border-b border-slate-800/80 pb-2 text-xs">
                            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-zen-blue"
                                checked={mode === 'none'}
                                onChange={() => editRequest({ body: { ...tab.request.body, mode: 'none' } })}
                              />
                              none
                            </label>
                            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-zen-blue"
                                checked={mode === 'form'}
                                onChange={() => editRequest({ body: { ...tab.request.body, mode: 'form' } })}
                              />
                              form-data
                            </label>
                            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-zen-blue"
                                checked={mode === 'urlencoded'}
                                onChange={() => editRequest({ body: { ...tab.request.body, mode: 'urlencoded' } })}
                              />
                              x-www-form-urlencoded
                            </label>
                            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-zen-blue"
                                checked={isRaw}
                                onChange={() => editRequest({ body: { ...tab.request.body, mode: 'raw', rawType } })}
                              />
                              raw
                            </label>
                            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-zen-blue"
                                checked={mode === 'binary'}
                                onChange={() => editRequest({ body: { ...tab.request.body, mode: 'binary' } })}
                              />
                              binary
                            </label>

                            {/* Dropdown chọn kiểu Raw (Postman Style) */}
                            {isRaw && (
                              <div className="ml-auto flex items-center gap-2">
                                <span className="text-[11px] text-slate-500 font-medium">Định dạng Raw:</span>
                                <select
                                  className="h-6 rounded border border-slate-700 bg-ink-900 px-2 text-xs font-semibold text-cyan-300 outline-none hover:border-cyan-500/50"
                                  value={rawType}
                                  onChange={(e) => setRawType(e.target.value as any)}
                                >
                                  <option value="json">JSON</option>
                                  <option value="text">Text</option>
                                  <option value="javascript">JavaScript</option>
                                  <option value="html">HTML</option>
                                  <option value="xml">XML</option>
                                </select>

                                {rawType === 'json' && (
                                  <button
                                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                                    onClick={() => {
                                      try {
                                        const formatted = JSON.stringify(JSON.parse(tab.request.body.raw || '{}'), null, 2);
                                        editRequest({ body: { ...tab.request.body, mode: 'raw', rawType: 'json', raw: formatted } });
                                        toast('Đã format JSON');
                                      } catch {
                                        toast('JSON chưa đúng cú pháp', 'error');
                                      }
                                    }}
                                    title="Beautify / Format JSON"
                                  >
                                    <Sparkles className="size-3" />
                                    <span>Beautify</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Editor cho Raw body */}
                          {isRaw && (
                            <div className="relative min-h-[140px] flex-1 overflow-hidden rounded-xl border border-slate-700/50">
                              <div className="absolute inset-0">
                                <Editor
                                  height="100%"
                                  width="100%"
                                  theme="vs-dark"
                                  language={rawType === 'json' ? 'json' : rawType === 'javascript' ? 'javascript' : rawType === 'html' ? 'html' : rawType === 'xml' ? 'xml' : 'plaintext'}
                                  value={tab.request.body.raw}
                                  onChange={(v) => editRequest({ body: { ...tab.request.body, mode: 'raw', rawType, raw: v ?? '' } })}
                                  options={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2 }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Key-Value Editor cho urlencoded / form-data */}
                          {(mode === 'urlencoded' || mode === 'form') && (
                            <KeyValueEditor rows={tab.request.body.form} onChange={(form) => editRequest({ body: { ...tab.request.body, form } })} />
                          )}

                          {/* Upload / Binary Mode */}
                          {mode === 'binary' && (
                            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-ink-950/40 p-6 text-center">
                              <input
                                type="file"
                                id="binary-file-input"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const base64 = (reader.result as string).split(',')[1] || '';
                                    editRequest({ body: { ...tab.request.body, mode: 'binary', raw: base64 } });
                                    toast(`Đã nạp file "${file.name}" (${formatBytes(file.size)})`);
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                              <Upload className="size-8 text-slate-500 mb-2" />
                              <label htmlFor="binary-file-input" className="cursor-pointer text-xs font-semibold text-zen-blue hover:underline">
                                Chọn file từ máy tính để tải lên
                              </label>
                              {tab.request.body.raw ? (
                                <p className="mt-2 text-xs mono text-emerald-400">
                                  ✓ Đã sẵn sàng dữ liệu nhị phân base64 ({tab.request.body.raw.length} bytes)
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">Hỗ trợ gửi file binary qua POST/PUT</p>
                              )}
                            </div>
                          )}

                          {mode === 'none' && <p className="text-xs text-slate-500 italic">Request này không gửi body.</p>}
                        </div>
                      );
                    })()}

                    {/* Tab Code Snippets đa ngôn ngữ */}
                    {reqTab === 'code' && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <div className="flex items-center gap-2">
                            <Code2 className="size-4 text-zen-blue" />
                            <span className="font-semibold text-slate-200">Ngôn ngữ sinh code:</span>
                            <select
                              className="h-7 rounded-lg border border-slate-700 bg-ink-900 px-2 text-xs font-semibold text-cyan-300 outline-none"
                              value={codeLang}
                              onChange={(e) => setCodeLang(e.target.value)}
                            >
                              <option value="curl">cURL</option>
                              <option value="js-fetch">JavaScript - Fetch</option>
                              <option value="js-axios">JavaScript - Axios</option>
                              <option value="node-fetch">Node.js - Fetch</option>
                              <option value="python-requests">Python - Requests</option>
                              <option value="php-curl">PHP - cURL</option>
                              <option value="go-http">Go - net/http</option>
                            </select>
                          </div>
                          <CopyButton value={generateCodeSnippet(tab.request, codeLang, vars, finalHeaders(tab.request))} label="Sao chép mã" />
                        </div>
                        <pre className="mono max-h-[350px] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-[#0a0e17] p-3 text-xs text-emerald-300">
                          {generateCodeSnippet(tab.request, codeLang, vars, finalHeaders(tab.request))}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Response */}
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-xs bg-ink-950/60">
                    <span className="font-semibold text-slate-300">Response</span>
                    {res && (
                      <>
                        <span className={cn('mono font-bold px-1.5 py-0.5 rounded', statusTone(res.status))}>
                          {res.status} {res.statusText}
                        </span>
                        <span className="mono flex items-center gap-1 text-slate-400">
                          <Clock className="size-3" /> {res.ms.toFixed(0)} ms
                        </span>
                        <span className="mono text-slate-400">{formatBytes(res.size)}</span>
                        {res.truncated && <span className="text-amber-300">đã cắt ở 10MB</span>}
                      </>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {(['pretty', 'raw', 'preview', 'headers'] as const).map((t) => (
                        <button key={t} onClick={() => setResTab(t)} className={cn('rounded-md px-2 py-0.5 font-semibold', resTab === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white')}>
                          {t === 'pretty' ? 'Pretty' : t === 'raw' ? 'Raw' : t === 'preview' ? 'Preview' : `Headers${res ? ` (${res.headers.length})` : ''}`}
                        </button>
                      ))}

                      {res && (
                        <>
                          <button
                            className="rounded-md p-1 text-slate-400 hover:text-white hover:bg-slate-800"
                            data-tip="Tải kết quả Response về máy"
                            onClick={() => {
                              const isJson = /json/.test(resType);
                              const isHtml = /html/.test(resType);
                              const ext = isJson ? 'json' : isHtml ? 'html' : 'txt';
                              const blob = new Blob([res.body], { type: isJson ? 'application/json' : isHtml ? 'text/html' : 'text/plain' });
                              const u = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = u;
                              a.download = `response-${Date.now()}.${ext}`;
                              a.click();
                              URL.revokeObjectURL(u);
                              toast(`Đã tải file response.${ext}`);
                            }}
                          >
                            <Download className="size-3.5" />
                          </button>
                          <button
                            className="rounded-md p-1 text-slate-400 hover:text-white hover:bg-slate-800"
                            data-tip="Sao chép body"
                            onClick={() => void navigator.clipboard?.writeText(prettyBody).then(() => toast('Đã sao chép body'))}
                          >
                            <Copy className="size-3.5" />
                          </button>
                          <button
                            className="rounded-md p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                            data-tip="Xoá kết quả Response"
                            onClick={() => patchTab(tab.key, { response: null, error: null })}
                          >
                            <Eraser className="size-3.5" />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => setResExpanded(!resExpanded)}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-xs transition border',
                          resExpanded ? 'border-zen-blue/60 bg-zen-blue/20 text-blue-300' : 'border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-800',
                        )}
                        data-tip={resExpanded ? 'Thu nhỏ Response (hiện lại Request)' : 'Phóng to xem toàn màn hình Response'}
                      >
                        {resExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                        <span className="hidden sm:inline">{resExpanded ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="relative min-h-0 flex-1 w-full overflow-hidden">
                    {tab.sending ? (
                      <div className="flex h-full items-center justify-center p-6">
                        <Spinner label="Đang gửi request..." />
                      </div>
                    ) : tab.error ? (
                      <div className="h-full overflow-auto p-4 text-sm text-red-300">{tab.error}</div>
                    ) : !res ? (
                      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-600">
                        Bấm Send (Ctrl+Enter) để xem response.
                      </div>
                    ) : resTab === 'headers' ? (
                      <div className="h-full overflow-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {res.headers.map(([k, v]) => (
                              <tr key={k} className="border-b border-slate-800">
                                <td className="mono w-1/3 px-3 py-1.5 font-semibold text-slate-300">{k}</td>
                                <td className="mono break-all px-3 py-1.5 text-slate-400">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : resTab === 'preview' ? (
                      <div className="h-full overflow-auto">
                        {/html/.test(resType) ? (
                          <iframe title="Preview" sandbox="" srcDoc={res.body} className="h-full w-full bg-white" />
                        ) : /image\//.test(resType) && res.encoding === 'base64' ? (
                          <img src={`data:${resType};base64,${res.body}`} alt="Response" className="max-w-full p-3" />
                        ) : (
                          <p className="p-4 text-sm text-slate-500">Preview chỉ hỗ trợ HTML và ảnh.</p>
                        )}
                      </div>
                    ) : resTab === 'pretty' && res.encoding === 'text' ? (
                      <div className="absolute inset-0">
                        <Editor
                          height="100%"
                          width="100%"
                          theme="vs-dark"
                          language={lang}
                          value={prettyBody}
                          options={{
                            readOnly: true,
                            fontFamily: "'JetBrains Mono', Consolas, monospace",
                            fontSize: 12,
                            minimap: { enabled: true, maxColumn: 40 },
                            automaticLayout: true,
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            scrollbar: {
                              vertical: 'auto',
                              horizontal: 'auto',
                              verticalScrollbarSize: 10,
                              horizontalScrollbarSize: 10,
                            },
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-full overflow-auto">
                        <pre className="mono whitespace-pre-wrap break-all p-3 text-xs text-slate-300">{res.encoding === 'base64' ? `[Dữ liệu nhị phân ${formatBytes(res.size)} — base64]\n${res.body.slice(0, 5000)}` : res.body}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {envOpen && <EnvModal ws={ws} zenVars={zenVars} onClose={() => setEnvOpen(false)} onSave={(environments) => persist({ ...ws, environments })} />}
      {importCurlOpen && (
        <ImportCurlModal
          open={importCurlOpen}
          onClose={() => setImportCurlOpen(false)}
          onImport={(imported) => {
            let reqName = 'Imported cURL';
            try {
              if (imported.url) {
                const u = new URL(imported.url.startsWith('http') ? imported.url : 'http://localhost/' + imported.url.replace(/^\{\{[^}]+\}\}\/?/, ''));
                reqName = `${imported.method} ${u.pathname}`;
              }
            } catch {
              reqName = `${imported.method} Request`;
            }
            openRequest({ ...blank(), ...imported, name: reqName }, null);
            toast('Đã nhập request từ cURL thành công');
          }}
        />
      )}
      {quickEnvOpen && ws && (
        <QuickEnvModal
          open={quickEnvOpen}
          onClose={() => setQuickEnvOpen(false)}
          zenVars={zenVars}
          activeEnv={ws.activeEnv}
          envs={ws.environments}
        />
      )}
    </div>
  );
}
