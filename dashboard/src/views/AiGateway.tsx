// ZenPanel - AI Gateway (giống OpenRouter / 9router): nhà cung cấp, kho model, playground, định tuyến & fallback, hoạt động
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Boxes,
  KeyRound,
  ListOrdered,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Notice, PageHeader, Secret, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, getToken, post, put } from '../lib/api';
import { formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { AiProvider } from '../lib/types';

interface AiModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  pricing: { prompt: number; completion: number } | null;
  description?: string;
}

interface GatewaySettings {
  enabled: boolean;
  apiKey: string;
  defaultModel: string | null;
  fallbacks: string[];
}

interface GatewayLog {
  at: string;
  model: string;
  provider: string;
  status: number;
  ms: number;
  stream: boolean;
  source: 'api' | 'playground';
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  fallbackFrom: string | null;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'from-emerald-500/30 to-emerald-900/10 text-emerald-300',
  anthropic: 'from-orange-500/30 to-orange-900/10 text-orange-300',
  gemini: 'from-sky-500/30 to-indigo-900/10 text-sky-300',
  openrouter: 'from-violet-500/30 to-violet-900/10 text-violet-300',
  nvidia: 'from-lime-500/30 to-lime-900/10 text-lime-300',
};

const ctx = (n: number | null) => (n ? (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`) : '—');
const price = (n: number) => (n === 0 ? 'Miễn phí' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`);

function ProviderLogo({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-extrabold uppercase', PROVIDER_COLORS[id] ?? 'text-slate-300', size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-xs')}>
      {id.slice(0, 2)}
    </div>
  );
}

// ------------------------------------------------------------------ Nhà cung cấp

function ProviderCard({ p, onChanged }: { p: AiProvider; onChanged: (list: AiProvider[]) => void }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const models = useApi<AiModel[]>(p.configured ? `/api/ai/providers/${p.id}/models` : null);
  const [query, setQuery] = useState('');
  const { confirm, run, toast } = useFeedback();

  const save = async () => {
    setBusy(true);
    const list = await run(() => put<AiProvider[]>(`/api/ai/providers/${p.id}`, { key: draft.trim() }));
    setBusy(false);
    if (!list) return;
    setDraft('');
    onChanged(list);
    const saved = list.find((x) => x.id === p.id);
    toast(saved?.lastTest?.ok ? `${p.label}: đã kết nối, đang tải danh sách model...` : `${p.label}: ${saved?.lastTest?.message ?? 'đã lưu'}`, saved?.lastTest?.ok ? 'success' : 'error');
  };

  const setDefault = async (model: string) => {
    const list = await run(() => put<AiProvider[]>(`/api/ai/providers/${p.id}/default-model`, { model }), model ? `Model mặc định của ${p.label}: ${model}` : 'Đã bỏ model mặc định');
    if (list) onChanged(list);
  };

  const remove = async () => {
    if (!(await confirm({ title: `Ngắt kết nối ${p.label}`, message: 'Xoá API key khỏi ZenPanel. Các app AI đang dùng key này cần "Cấu hình lại".', danger: true, confirmLabel: 'Xoá key' }))) return;
    const list = await run(() => del<AiProvider[]>(`/api/ai/providers/${p.id}`), 'Đã xoá API key');
    if (list) onChanged(list);
  };

  const filtered = (models.data ?? []).filter((m) => !query || m.id.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={cn('glass flex flex-col gap-4 p-5', p.configured && p.lastTest?.ok && 'border-zen-green/30')}>
      <div className="flex items-start gap-3">
        <ProviderLogo id={p.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-white">{p.label}</h3>
            {p.configured ? <Badge tone={p.lastTest?.ok ? 'green' : 'red'}>{p.lastTest?.ok ? 'Đã kết nối' : 'Lỗi key'}</Badge> : <Badge>Chưa kết nối</Badge>}
          </div>
          <div className="mono truncate text-xs text-slate-500">{p.baseUrl}</div>
        </div>
      </div>

      {p.configured && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2 text-sm">
          <KeyRound className="size-4 text-slate-500" />
          <span className="mono flex-1 truncate text-slate-300">{p.masked}</span>
          <IconButton icon={Trash2} title="Xoá key" className="hover:text-zen-red" onClick={() => void remove()} />
        </div>
      )}
      {p.lastTest && !p.lastTest.ok && <p className="text-xs text-red-300">{p.lastTest.message}</p>}

      <div className="flex gap-2">
        <input className="input mono" type="password" autoComplete="off" placeholder={p.configured ? 'Dán key mới để thay' : p.keyHint} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button variant="primary" icon={Save} loading={busy} disabled={!draft.trim()} onClick={() => void save()}>
          {p.configured ? 'Đổi' : 'Kết nối'}
        </Button>
      </div>

      {p.configured && (
        <div className="space-y-2 rounded-xl border border-slate-700/50 bg-ink-950/40 p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-slate-400">Model mặc định</span>
            <span className="flex items-center gap-1 text-slate-500">
              {models.data ? `${models.data.length} model` : ''}
              <IconButton icon={RefreshCw} title="Tải lại danh sách model" onClick={() => void get<AiModel[]>(`/api/ai/providers/${p.id}/models?refresh=1`).then(models.setData, () => undefined)} />
            </span>
          </div>
          {models.error ? (
            <ErrorBox message={models.error} onRetry={models.reload} />
          ) : !models.data ? (
            <Spinner label="Đang tải danh sách model..." />
          ) : (
            <>
              {models.data.length > 15 && <input className="input h-8 py-0 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Lọc model..." />}
              <Select value={p.defaultModel ?? ''} onChange={(e) => void setDefault(e.target.value)}>
                <option value="">— Chọn model mặc định —</option>
                {p.defaultModel && !filtered.some((m) => m.id === p.defaultModel) && <option value={p.defaultModel}>{p.defaultModel}</option>}
                {filtered.slice(0, 400).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                  </option>
                ))}
              </Select>
              {p.defaultModel && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  Gọi tắt:
                  <code className="mono text-emerald-300">{p.id}</code>
                  hoặc
                  <code className="mono truncate text-emerald-300">
                    {p.id}/{p.defaultModel}
                  </code>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <a href={p.keyUrl} target="_blank" rel="noreferrer" className="mt-auto text-xs font-semibold text-blue-300 hover:underline">
        Lấy API key {p.label} →
      </a>
    </div>
  );
}

function ProvidersTab({ providers, setProviders }: { providers: AiProvider[]; setProviders: (l: AiProvider[]) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {providers.map((p) => (
        <ProviderCard key={p.id} p={p} onChanged={setProviders} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Kho model

function ModelsTab({ onTry, gateway, saveGateway }: { onTry: (model: string) => void; gateway: GatewaySettings; saveGateway: (patch: Partial<GatewaySettings>, msg: string) => Promise<void> }) {
  const models = useApi<AiModel[]>('/api/ai/models');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [sort, setSort] = useState<'name' | 'context' | 'price'>('name');
  const [freeOnly, setFreeOnly] = useState(false);

  const providers = useMemo(() => [...new Set((models.data ?? []).map((m) => m.provider))], [models.data]);
  const list = useMemo(() => {
    const q = query.toLowerCase();
    return (models.data ?? [])
      .filter((m) => (provider === 'all' || m.provider === provider) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)))
      .filter((m) => !freeOnly || (m.pricing && m.pricing.prompt === 0 && m.pricing.completion === 0) || m.id.endsWith(':free'))
      .sort((a, b) =>
        sort === 'context' ? (b.contextLength ?? 0) - (a.contextLength ?? 0) : sort === 'price' ? (a.pricing?.prompt ?? 1e9) - (b.pricing?.prompt ?? 1e9) : a.id.localeCompare(b.id),
      );
  }, [models.data, query, provider, sort, freeOnly]);

  if (models.error) return <ErrorBox message={models.error} onRetry={models.reload} />;
  if (!models.data) return <Spinner label="Đang tải model từ các nhà cung cấp..." />;
  if (!models.data.length) return <EmptyState icon={Boxes} title="Chưa có model" description="Kết nối ít nhất 1 nhà cung cấp ở tab Nhà cung cấp." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input className="input h-10 py-0 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Tìm trong ${models.data.length} model...`} />
        </div>
        <Select className="h-10 w-40 py-0" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="name">Sắp xếp: tên</option>
          <option value="context">Context dài nhất</option>
          <option value="price">Giá rẻ nhất</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <Toggle checked={freeOnly} onChange={setFreeOnly} /> Miễn phí
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['all', ...providers].map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition', provider === p ? 'border-zen-blue/60 bg-zen-blue/15 text-white' : 'border-slate-700/50 text-slate-400 hover:text-white')}
          >
            {p !== 'all' && <ProviderLogo id={p} size="sm" />}
            {p === 'all' ? `Tất cả (${models.data!.length})` : `${p} (${models.data!.filter((m) => m.provider === p).length})`}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr>
              <th className={th}>Model</th>
              <th className={cn(th, 'text-right')}>Context</th>
              <th className={cn(th, 'text-right')}>Input / 1M</th>
              <th className={cn(th, 'text-right')}>Output / 1M</th>
              <th className={cn(th, 'text-right')}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((m) => (
              <tr key={m.id} className={tr}>
                <td className={cn(td, 'max-w-[420px]')}>
                  <div className="flex items-center gap-2">
                    <ProviderLogo id={m.provider} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 truncate font-semibold text-slate-100">
                        {m.name}
                        {gateway.defaultModel === m.id && <Badge tone="green">Mặc định</Badge>}
                        {gateway.fallbacks.includes(m.id) && <Badge tone="amber">Dự phòng</Badge>}
                      </div>
                      <div className="mono truncate text-xs text-slate-500">{m.id}</div>
                    </div>
                  </div>
                </td>
                <td className={cn(td, 'mono text-right text-slate-300')}>{ctx(m.contextLength)}</td>
                <td className={cn(td, 'mono text-right text-slate-300')}>{m.pricing ? price(m.pricing.prompt) : '—'}</td>
                <td className={cn(td, 'mono text-right text-slate-300')}>{m.pricing ? price(m.pricing.completion) : '—'}</td>
                <td className={cn(td, 'whitespace-nowrap text-right')}>
                  <CopyButton value={m.id} />
                  <IconButton icon={Star} title="Đặt làm model mặc định của gateway" className={gateway.defaultModel === m.id ? 'text-zen-amber' : ''} onClick={() => void saveGateway({ defaultModel: m.id }, `Model mặc định: ${m.id}`)} />
                  <IconButton
                    icon={ListOrdered}
                    title="Thêm vào danh sách dự phòng"
                    disabled={gateway.fallbacks.includes(m.id) || gateway.fallbacks.length >= 5}
                    onClick={() => void saveGateway({ fallbacks: [...gateway.fallbacks, m.id] }, `Đã thêm ${m.id} vào dự phòng`)}
                  />
                  <IconButton icon={MessageSquare} title="Thử trong Playground" onClick={() => onTry(m.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > 300 && <p className="p-3 text-center text-xs text-slate-500">Hiển thị 300/{list.length} model, hãy tìm kiếm để lọc.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Playground

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function PlaygroundTab({ initialModel, models }: { initialModel: string; models: AiModel[] }) {
  const [model, setModel] = useState(initialModel);
  const [system, setSystem] = useState('Bạn là trợ lý hữu ích, trả lời bằng tiếng Việt.');
  const [temperature, setTemperature] = useState(0.7);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ ms: number; chars: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setModel(initialModel), [initialModel]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setStreaming(true);
    const started = performance.now();
    abort.current = new AbortController();
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        signal: abort.current.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ model: model || 'auto', stream: true, temperature, messages: [...(system ? [{ role: 'system', content: system }] : []), ...history] }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Lỗi ${res.status}`);
      }
      // Đọc stream SSE chuẩn OpenAI: "data: {...choices[0].delta.content}"
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '').trim();
          if (!data || data === '[DONE]' || !line.startsWith('data:')) continue;
          try {
            const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
            if (delta) {
              answer += delta;
              setMessages([...history, { role: 'assistant', content: answer }]);
            }
          } catch {
            // dòng keep-alive
          }
        }
      }
      setStats({ ms: performance.now() - started, chars: answer.length });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
        setMessages(history);
      }
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="glass flex h-[65vh] min-h-[420px] flex-col">
        <div ref={box} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <EmptyState icon={MessageSquare} title="Chat thử với model" description="Mọi request đi qua đúng logic định tuyến và fallback của gateway." />
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', m.role === 'user' ? 'bg-zen-blue/20 text-blue-300' : 'bg-zen-green/15 text-emerald-300')}>
                  {m.role === 'user' ? 'Bạn' : <Bot className="size-4" />}
                </div>
                <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm', m.role === 'user' ? 'bg-zen-blue/15 text-slate-100' : 'bg-ink-950/70 text-slate-200')}>
                  {m.content || (streaming && i === messages.length - 1 ? <span className="animate-pulse text-slate-500">Đang trả lời...</span> : '')}
                </div>
              </div>
            ))
          )}
          {error && <ErrorBox message={error} />}
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-slate-700/40 p-3">
          <textarea
            className="input h-12 min-h-0 resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"
          />
          {streaming ? (
            <Button type="button" variant="danger" icon={X} onClick={() => abort.current?.abort()}>
              Dừng
            </Button>
          ) : (
            <Button type="submit" variant="primary" icon={Send} disabled={!input.trim()}>
              Gửi
            </Button>
          )}
        </form>
      </div>
      <div className="space-y-4">
        <Card title="Thiết lập" icon={Sparkles}>
          <div className="space-y-4">
            <Field label="Model">
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">auto (model mặc định)</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="System prompt">
              <textarea className="input h-24 text-xs" value={system} onChange={(e) => setSystem(e.target.value)} />
            </Field>
            <Field label={`Temperature: ${temperature.toFixed(1)}`}>
              <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-zen-blue" />
            </Field>
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setMessages([])} disabled={streaming}>
              Xoá hội thoại
            </Button>
            {stats && (
              <p className="mono text-xs text-slate-500">
                {(stats.ms / 1000).toFixed(1)}s · {stats.chars} ký tự
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Định tuyến

function RoutingTab({ gateway, saveGateway, models }: { gateway: GatewaySettings; saveGateway: (patch: Partial<GatewaySettings>, msg: string) => Promise<void>; models: AiModel[] }) {
  const [pick, setPick] = useState('');
  const move = (index: number, dir: -1 | 1) => {
    const next = [...gateway.fallbacks];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    void saveGateway({ fallbacks: next }, 'Đã đổi thứ tự dự phòng');
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Model mặc định" icon={Star}>
        <p className="mb-3 text-sm text-slate-400">Dùng khi request gửi <code className="mono">"model": "auto"</code> hoặc không gửi model.</p>
        <Select value={gateway.defaultModel ?? ''} onChange={(e) => void saveGateway({ defaultModel: e.target.value || null }, e.target.value ? `Model mặc định: ${e.target.value}` : 'Đã bỏ model mặc định')}>
          <option value="">— Dùng model mặc định của nhà cung cấp đầu tiên —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </Select>
      </Card>
      <Card title="Fallback (dự phòng)" icon={Route}>
        <p className="mb-3 text-sm text-slate-400">Model chính bị lỗi 429 (quá giới hạn), 5xx hoặc mất kết nối thì gateway tự thử lần lượt các model này.</p>
        <div className="space-y-2">
          {gateway.fallbacks.length === 0 && <p className="text-sm text-slate-500">Chưa có model dự phòng.</p>}
          {gateway.fallbacks.map((m, i) => (
            <div key={m} className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-ink-950/50 px-3 py-2">
              <span className="mono flex size-6 items-center justify-center rounded-full bg-zen-amber/15 text-xs font-bold text-amber-300">{i + 1}</span>
              <span className="mono min-w-0 flex-1 truncate text-sm text-slate-200">{m}</span>
              <IconButton icon={ArrowUp} title="Lên" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} title="Xuống" disabled={i === gateway.fallbacks.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon={X} title="Bỏ" className="hover:text-zen-red" onClick={() => void saveGateway({ fallbacks: gateway.fallbacks.filter((x) => x !== m) }, `Đã bỏ ${m}`)} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— Chọn model để thêm —</option>
            {models
              .filter((m) => !gateway.fallbacks.includes(m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
          </Select>
          <Button
            icon={Plus}
            disabled={!pick || gateway.fallbacks.length >= 5}
            onClick={() => {
              void saveGateway({ fallbacks: [...gateway.fallbacks, pick] }, `Đã thêm ${pick}`);
              setPick('');
            }}
          >
            Thêm
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Hoạt động

function ActivityTab() {
  const logs = useApi<GatewayLog[]>('/api/ai/gateway/logs', 10000);
  if (!logs.data) return <Spinner />;
  if (!logs.data.length) return <EmptyState icon={Activity} title="Chưa có request nào" description="Gọi API gateway hoặc chat trong Playground để thấy hoạt động ở đây." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr>
            <th className={th}>Thời gian</th>
            <th className={th}>Model</th>
            <th className={th}>Nguồn</th>
            <th className={th}>Kết quả</th>
            <th className={cn(th, 'text-right')}>Thời gian xử lý</th>
            <th className={cn(th, 'text-right')}>Token vào / ra</th>
          </tr>
        </thead>
        <tbody>
          {logs.data.map((l, i) => (
            <tr key={`${l.at}-${i}`} className={tr}>
              <td className={cn(td, 'text-xs text-slate-400')}>{formatRelative(l.at)}</td>
              <td className={cn(td, 'max-w-[320px]')}>
                <div className="mono truncate text-slate-100">{l.model}</div>
                {l.fallbackFrom && <div className="text-xs text-amber-300">dự phòng cho {l.fallbackFrom}</div>}
                {l.error && <div className="truncate text-xs text-red-300" data-tip={l.error}>{l.error}</div>}
              </td>
              <td className={td}>
                <Badge>{l.source === 'api' ? 'API' : 'Playground'}</Badge> {l.stream && <Badge tone="blue">stream</Badge>}
              </td>
              <td className={td}>
                <Badge tone={l.status >= 200 && l.status < 300 ? 'green' : 'red'}>{l.status}</Badge>
              </td>
              <td className={cn(td, 'mono text-right text-slate-300')}>{(l.ms / 1000).toFixed(2)}s</td>
              <td className={cn(td, 'mono text-right text-slate-400')}>{l.promptTokens !== null ? `${l.promptTokens} / ${l.completionTokens ?? 0}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Tổng quan

function OverviewTab({ gateway, saveGateway, regenerate, providers }: { gateway: GatewaySettings; saveGateway: (patch: Partial<GatewaySettings>, msg: string) => Promise<void>; regenerate: () => void; providers: AiProvider[] }) {
  const { tunnel } = usePanel();
  const logs = useApi<GatewayLog[]>('/api/ai/gateway/logs', 15000);
  const [lang, setLang] = useState<'curl' | 'python' | 'node' | 'n8n'>('curl');
  const base = `${tunnel?.status === 'online' && tunnel.url ? tunnel.url : window.location.origin}/zen/v1`;
  const model = gateway.defaultModel ?? 'auto';
  const day = (logs.data ?? []).filter((l) => Date.now() - new Date(l.at).getTime() < 86_400_000);
  const ok = day.filter((l) => l.status >= 200 && l.status < 300).length;
  const tokens = day.reduce((s, l) => s + (l.promptTokens ?? 0) + (l.completionTokens ?? 0), 0);
  const top = Object.entries(day.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.model]: (acc[l.model] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const connected = providers.filter((p) => p.configured).length;

  const samples = {
    curl: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${gateway.apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Xin chào"}]}'`,
    python: `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="${gateway.apiKey}")\nres = client.chat.completions.create(\n    model="${model}",\n    messages=[{"role": "user", "content": "Xin chào"}],\n)\nprint(res.choices[0].message.content)`,
    node: `import OpenAI from 'openai';\n\nconst client = new OpenAI({ baseURL: '${base}', apiKey: '${gateway.apiKey}' });\nconst res = await client.chat.completions.create({\n  model: '${model}',\n  messages: [{ role: 'user', content: 'Xin chào' }],\n});\nconsole.log(res.choices[0].message.content);`,
    n8n: `Credentials → New → "OpenAI"\n  API Key : ${gateway.apiKey}\n  Base URL: ${base}\n\nNode "AI Agent" / "OpenAI Chat Model" → Model: ${model}\n(gõ tay tên model dạng provider/model, vd anthropic/claude-sonnet-5-5)`,
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Nhà cung cấp', `${connected}/${providers.length}`, 'đã kết nối'],
          ['Request 24h', String(day.length), `${day.length ? Math.round((ok / day.length) * 100) : 100}% thành công`],
          ['Token 24h', tokens.toLocaleString('vi-VN'), 'không tính request stream'],
          ['Model mặc định', gateway.defaultModel ?? 'chưa chọn', gateway.fallbacks.length ? `${gateway.fallbacks.length} model dự phòng` : 'không có dự phòng'],
        ].map(([label, value, sub]) => (
          <div key={label} className="glass min-w-0 p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mono truncate text-lg font-extrabold text-white">{value}</div>
            <div className="truncate text-xs text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          title="Endpoint chuẩn OpenAI"
          icon={Route}
          actions={
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <Toggle checked={gateway.enabled} onChange={(v) => void saveGateway({ enabled: v }, v ? 'Đã bật AI Gateway' : 'Đã tắt AI Gateway')} />
              {gateway.enabled ? 'Đang bật' : 'Đang tắt'}
            </label>
          }
        >
          <div className="space-y-3">
            {!gateway.enabled && <Notice tone="amber">Gateway đang tắt: endpoint trả lỗi 503. Bật công tắc ở góc trên để dùng từ app khác.</Notice>}
            <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
              <div className="text-xs text-slate-500">Base URL</div>
              <div className="flex items-center gap-2">
                <span className="mono min-w-0 flex-1 truncate text-slate-100">{base}</span>
                <CopyButton value={base} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
              <div className="text-xs text-slate-500">API key</div>
              <div className="flex items-center justify-between gap-2">
                <Secret value={gateway.apiKey} />
                <Button size="xs" variant="ghost" icon={RefreshCw} onClick={regenerate}>
                  Tạo key mới
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['curl', 'python', 'node', 'n8n'] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={cn('rounded-lg px-2.5 py-1 text-xs font-semibold', lang === l ? 'bg-zen-blue text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
                  {l === 'node' ? 'Node.js' : l === 'n8n' ? 'n8n' : l === 'python' ? 'Python' : 'cURL'}
                </button>
              ))}
              <span className="ml-auto">
                <CopyButton value={samples[lang]} label="Sao chép" />
              </span>
            </div>
            <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#0a0e17] p-4 text-xs text-emerald-200">{samples[lang]}</pre>
            <p className="text-xs text-slate-500">
              Tên model: <code className="mono">openai/…</code>, <code className="mono">anthropic/…</code>, <code className="mono">gemini/…</code>, <code className="mono">openrouter/…</code>,{' '}
              <code className="mono">nvidia/…</code>, gọi tắt <code className="mono">anthropic</code> = model mặc định của Anthropic, hoặc <code className="mono">auto</code>.
            </p>
          </div>
        </Card>
        <div className="space-y-4">
        <Card title="Endpoint" icon={ListOrdered} actions={<Link to="/api-tester" className="text-xs font-semibold text-blue-300 hover:underline">Thử trong API Tester →</Link>}>
          <div className="space-y-1.5">
            {[
              ['GET', '/health', 'Kiểm tra gateway (không cần key)'],
              ['GET', '/models', 'Danh sách model'],
              ['GET', '/models/{id}', 'Chi tiết 1 model'],
              ['GET', '/providers', 'Nhà cung cấp đã kết nối'],
              ['GET', '/key', 'Thông tin API key & sử dụng 24h'],
              ['GET', '/usage?hours=24', 'Thống kê theo model'],
              ['POST', '/chat/completions', 'Chat (hỗ trợ stream)'],
              ['POST', '/completions', 'Prompt → text'],
              ['POST', '/embeddings', 'Vector embedding'],
            ].map(([method, path, desc]) => (
              <div key={path} className="flex items-center gap-2 text-xs">
                <span className={cn('mono w-10 shrink-0 font-bold', method === 'GET' ? 'text-emerald-400' : 'text-amber-400')}>{method}</span>
                <span className="mono min-w-0 flex-1 truncate text-slate-200">{path}</span>
                <span className="hidden truncate text-slate-500 sm:inline">{desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Đường dẫn cũ /ai/v1 vẫn dùng được.</p>
        </Card>
        <Card title="Model dùng nhiều (24h)" icon={Activity}>
          {top.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có request nào trong 24 giờ.</p>
          ) : (
            <div className="space-y-2">
              {top.map(([m, count]) => (
                <div key={m} className="space-y-1">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="mono truncate text-slate-200">{m}</span>
                    <span className="mono text-slate-400">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-zen-blue" style={{ width: `${(count / top[0][1]) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}

type TabId = 'overview' | 'providers' | 'models' | 'playground' | 'routing' | 'activity';

export default function AiGateway() {
  const providers = useApi<AiProvider[]>('/api/ai/providers');
  const gatewayApi = useApi<GatewaySettings>('/api/ai/gateway');
  const allModels = useApi<AiModel[]>('/api/ai/models');
  const [tab, setTab] = useState<TabId>('overview');
  const [tryModel, setTryModel] = useState('');
  const { confirm, run } = useFeedback();

  const saveGateway = async (patch: Partial<GatewaySettings>, msg: string) => {
    const next = await run(() => put<GatewaySettings>('/api/ai/gateway', patch), msg);
    if (next) gatewayApi.setData(next);
  };

  const regenerate = async () => {
    if (!(await confirm({ title: 'Tạo API key mới', message: 'Key cũ ngừng hoạt động ngay, các app đang dùng gateway cần đổi sang key mới.', danger: true, confirmLabel: 'Tạo key mới' }))) return;
    const next = await run(() => post<GatewaySettings>('/api/ai/gateway/regenerate'), 'Đã tạo API key mới');
    if (next) gatewayApi.setData(next);
  };

  const setProviders = (list: AiProvider[]) => {
    providers.setData(list);
    void allModels.reload();
  };

  if (providers.error) return <ErrorBox message={providers.error} onRetry={providers.reload} />;
  if (!providers.data || !gatewayApi.data) return <Spinner />;
  const gateway = gatewayApi.data;
  const connected = providers.data.some((p) => p.configured);

  return (
    <>
      <PageHeader
        title="AI Gateway"
        description="1 endpoint chuẩn OpenAI cho ChatGPT, Claude, Gemini, OpenRouter, NVIDIA — tự định tuyến & dự phòng"
        icon={Sparkles}
        actions={
          <Link to="/apps">
            <Button icon={Play}>Cài AI Agent (App Store)</Button>
          </Link>
        }
      />
      {!connected && (
        <div className="mb-4">
          <Notice icon={KeyRound}>
            Bắt đầu bằng cách kết nối API key ở tab <b>Nhà cung cấp</b>, rồi chọn model mặc định trong danh sách model vừa tải về.
          </Notice>
        </div>
      )}
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Tổng quan', icon: Route },
            { id: 'providers', label: 'Nhà cung cấp', icon: KeyRound, count: providers.data.filter((p) => p.configured).length },
            { id: 'models', label: 'Models', icon: Boxes, count: allModels.data?.length },
            { id: 'playground', label: 'Playground', icon: MessageSquare },
            { id: 'routing', label: 'Định tuyến', icon: ListOrdered },
            { id: 'activity', label: 'Hoạt động', icon: Activity },
          ]}
        />
      </div>
      {tab === 'overview' && <OverviewTab gateway={gateway} saveGateway={saveGateway} regenerate={() => void regenerate()} providers={providers.data} />}
      {tab === 'providers' && <ProvidersTab providers={providers.data} setProviders={setProviders} />}
      {tab === 'models' && (
        <ModelsTab
          gateway={gateway}
          saveGateway={saveGateway}
          onTry={(m) => {
            setTryModel(m);
            setTab('playground');
          }}
        />
      )}
      {tab === 'playground' && <PlaygroundTab initialModel={tryModel || gateway.defaultModel || ''} models={allModels.data ?? []} />}
      {tab === 'routing' && <RoutingTab gateway={gateway} saveGateway={saveGateway} models={allModels.data ?? []} />}
      {tab === 'activity' && <ActivityTab />}
    </>
  );
}

