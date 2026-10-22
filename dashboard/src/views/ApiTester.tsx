// ZenPanel - API Tester kiểu Postman: request gửi từ chính VPS nên gọi được mọi URL (không vướng CORS)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  FilePlus,
  Folder,
  FolderPlus,
  Globe2,
  History,
  PanelLeft,
  Pencil,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
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
  body: { mode: 'none' | 'json' | 'text' | 'urlencoded' | 'form'; raw: string; form: KeyValue[] };
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
  body: { mode: 'none', raw: '', form: [] },
});

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
  if (req.body.mode === 'json' || req.body.mode === 'text') parts.push(`  -d '${substitute(req.body.raw, vars).replace(/'/g, "'\\''")}'`);
  if (req.body.mode === 'urlencoded') for (const f of req.body.form.filter((f) => f.enabled)) parts.push(`  --data-urlencode '${f.key}=${substitute(f.value, vars)}'`);
  if (req.body.mode === 'form') for (const f of req.body.form.filter((f) => f.enabled)) parts.push(`  -F '${f.key}=${substitute(f.value, vars)}'`);
  return parts.join(' \\\n');
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
        body: { mode: req.body.mode, raw: substitute(req.body.raw, vars), form: req.body.form.filter((f) => f.enabled).map((f) => ({ key: f.key, value: substitute(f.value, vars) })) },
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
    <div className="-m-3 flex h-[calc(100vh-4rem)] min-h-[560px] flex-col sm:-m-6">
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
              <div className="mb-2 flex gap-1">
                <Button size="xs" variant="ghost" icon={FolderPlus} onClick={async () => {
                  const name = await prompt({ title: 'Tạo collection', label: 'Tên collection', confirmLabel: 'Tạo' });
                  if (name) persist({ ...ws, collections: [...ws.collections, { id: uid(), name, requests: [] }] });
                }}>
                  Collection
                </Button>
                <Button size="xs" variant="ghost" icon={FilePlus} onClick={() => openRequest(blank(), null)}>
                  Request
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

              <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,45%)_minmax(0,1fr)]">
                {/* Cấu hình request */}
                <div className="flex min-h-0 flex-col border-b border-slate-800">
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
                    {reqTab === 'body' && (
                      <div className="flex h-full min-h-[140px] flex-col gap-2">
                        <div className="flex flex-wrap gap-3 text-xs">
                          {(['none', 'json', 'text', 'urlencoded', 'form'] as const).map((m) => (
                            <label key={m} className="flex items-center gap-1.5 text-slate-400">
                              <input type="radio" className="accent-zen-blue" checked={tab.request.body.mode === m} onChange={() => editRequest({ body: { ...tab.request.body, mode: m } })} />
                              {m === 'none' ? 'none' : m === 'json' ? 'raw JSON' : m === 'text' ? 'raw Text' : m === 'urlencoded' ? 'x-www-form-urlencoded' : 'form-data'}
                            </label>
                          ))}
                          {tab.request.body.mode === 'json' && (
                            <button className="ml-auto text-blue-300 hover:underline" onClick={() => {
                              try {
                                editRequest({ body: { ...tab.request.body, raw: JSON.stringify(JSON.parse(tab.request.body.raw), null, 2) } });
                              } catch {
                                toast('JSON chưa hợp lệ', 'error');
                              }
                            }}>
                              Format JSON
                            </button>
                          )}
                        </div>
                        {(tab.request.body.mode === 'json' || tab.request.body.mode === 'text') && (
                          <div className="min-h-[140px] flex-1 overflow-hidden rounded-xl border border-slate-700/50">
                            <Editor
                              height="100%"
                              theme="vs-dark"
                              language={tab.request.body.mode === 'json' ? 'json' : 'plaintext'}
                              value={tab.request.body.raw}
                              onChange={(v) => editRequest({ body: { ...tab.request.body, raw: v ?? '' } })}
                              options={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2 }}
                            />
                          </div>
                        )}
                        {(tab.request.body.mode === 'urlencoded' || tab.request.body.mode === 'form') && (
                          <KeyValueEditor rows={tab.request.body.form} onChange={(form) => editRequest({ body: { ...tab.request.body, form } })} />
                        )}
                        {tab.request.body.mode === 'none' && <p className="text-xs text-slate-500">Request không có body.</p>}
                      </div>
                    )}
                    {reqTab === 'code' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Code2 className="size-4" /> cURL (đã thay biến)
                          <span className="ml-auto">
                            <CopyButton value={curlOf(tab.request, vars, finalHeaders(tab.request))} label="Sao chép" />
                          </span>
                        </div>
                        <pre className="mono overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#0a0e17] p-3 text-xs text-emerald-200">{curlOf(tab.request, vars, finalHeaders(tab.request))}</pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Response */}
                <div className="flex min-h-0 flex-col">
                  <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-3 py-1.5 text-xs">
                    <span className="font-semibold text-slate-300">Response</span>
                    {res && (
                      <>
                        <span className={cn('mono font-bold', statusTone(res.status))}>
                          {res.status} {res.statusText}
                        </span>
                        <span className="mono flex items-center gap-1 text-slate-400">
                          <Clock className="size-3" /> {res.ms.toFixed(0)} ms
                        </span>
                        <span className="mono text-slate-400">{formatBytes(res.size)}</span>
                        {res.truncated && <span className="text-amber-300">đã cắt ở 10MB</span>}
                      </>
                    )}
                    <div className="ml-auto flex gap-1">
                      {(['pretty', 'raw', 'preview', 'headers'] as const).map((t) => (
                        <button key={t} onClick={() => setResTab(t)} className={cn('rounded-md px-2 py-0.5 font-semibold', resTab === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white')}>
                          {t === 'pretty' ? 'Pretty' : t === 'raw' ? 'Raw' : t === 'preview' ? 'Preview' : `Headers${res ? ` (${res.headers.length})` : ''}`}
                        </button>
                      ))}
                      {res && (
                        <button className="ml-1 text-slate-500 hover:text-white" data-tip="Sao chép body" onClick={() => void navigator.clipboard?.writeText(prettyBody).then(() => toast('Đã sao chép body'))}>
                          <Copy className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    {tab.sending ? (
                      <Spinner label="Đang gửi request..." />
                    ) : tab.error ? (
                      <div className="p-4 text-sm text-red-300">{tab.error}</div>
                    ) : !res ? (
                      <p className="p-6 text-center text-sm text-slate-600">Bấm Send (Ctrl+Enter) để xem response.</p>
                    ) : resTab === 'headers' ? (
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
                    ) : resTab === 'preview' ? (
                      /html/.test(resType) ? (
                        <iframe title="Preview" sandbox="" srcDoc={res.body} className="h-full w-full bg-white" />
                      ) : /image\//.test(resType) && res.encoding === 'base64' ? (
                        <img src={`data:${resType};base64,${res.body}`} alt="Response" className="max-w-full p-3" />
                      ) : (
                        <p className="p-4 text-sm text-slate-500">Preview chỉ hỗ trợ HTML và ảnh.</p>
                      )
                    ) : resTab === 'pretty' && res.encoding === 'text' ? (
                      <Editor
                        height="100%"
                        theme="vs-dark"
                        language={lang}
                        value={prettyBody}
                        options={{ readOnly: true, fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, wordWrap: 'on' }}
                      />
                    ) : (
                      <pre className="mono whitespace-pre-wrap break-all p-3 text-xs text-slate-300">{res.encoding === 'base64' ? `[Dữ liệu nhị phân ${formatBytes(res.size)} — base64]\n${res.body.slice(0, 5000)}` : res.body}</pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {envOpen && <EnvModal ws={ws} zenVars={zenVars} onClose={() => setEnvOpen(false)} onSave={(environments) => persist({ ...ws, environments })} />}
    </div>
  );
}
