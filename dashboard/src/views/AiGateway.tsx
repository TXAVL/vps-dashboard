// ZenPanel - AI Gateway: nhà cung cấp, kho model, playground, định tuyến & fallback, sub-agents, multi-account rotation
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  KeyRound,
  ListOrdered,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Route,
  Save,
  Search,
  Send,
  Sparkles,
  Star,
  Terminal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Notice, PageHeader, Secret, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, getToken, post, put } from '../lib/api';
import { formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { AiAccountKey, AiProvider } from '../lib/types';

interface AiModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  pricing: { prompt: number; completion: number } | null;
  description?: string;
}

export interface SubAgent {
  id: string;
  name: string;
  description: string;
  targetModel: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  resolvedModel?: string;
  provider: string;
  accountName?: string | null;
  subAgent?: string | null;
  status: number;
  ms: number;
  stream: boolean;
  source: 'api' | 'playground' | 'agent';
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  fallbackFrom: string | null;
  rotatedFrom?: string | null;
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
  const [showAccounts, setShowAccounts] = useState(false);
  const [addingAcc, setAddingAcc] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const models = useApi<AiModel[]>(p.configured ? `/api/ai/providers/${p.id}/models` : null);
  const [query, setQuery] = useState('');
  const { confirm, run, toast } = useFeedback();

  const accounts = p.accounts ?? [];
  const hasMultipleAccounts = accounts.length > 1;

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

  const addAccount = async () => {
    if (!newKey.trim()) return;
    setBusy(true);
    const list = await run(() => post<AiProvider[]>(`/api/ai/providers/${p.id}/accounts`, { key: newKey.trim(), name: newName.trim() || undefined }), 'Đã thêm tài khoản mới vào pool');
    setBusy(false);
    if (list) {
      setNewKey('');
      setNewName('');
      setAddingAcc(false);
      onChanged(list);
    }
  };

  const removeAccount = async (acc: AiAccountKey) => {
    if (!(await confirm({ title: `Xóa ${acc.name}`, message: `Xóa tài khoản (${acc.masked}) khỏi pool xoay vòng của ${p.label}?`, danger: true, confirmLabel: 'Xóa tài khoản' }))) return;
    const list = await run(() => del<AiProvider[]>(`/api/ai/providers/${p.id}/accounts/${acc.id}`), 'Đã xóa tài khoản');
    if (list) onChanged(list);
  };

  const resetAccount = async (acc: AiAccountKey) => {
    const list = await run(() => put<AiProvider[]>(`/api/ai/providers/${p.id}/accounts/${acc.id}/reset`), 'Đã kích hoạt lại tài khoản');
    if (list) onChanged(list);
  };

  const setDefault = async (model: string) => {
    const list = await run(() => put<AiProvider[]>(`/api/ai/providers/${p.id}/default-model`, { model }), model ? `Model mặc định của ${p.label}: ${model}` : 'Đã bỏ model mặc định');
    if (list) onChanged(list);
  };

  const remove = async () => {
    if (!(await confirm({ title: `Ngắt kết nối ${p.label}`, message: 'Xoá tất cả API key của nhà cung cấp này khỏi ZenPanel. Các app AI đang dùng key này cần "Cấu hình lại".', danger: true, confirmLabel: 'Ngắt kết nối' }))) return;
    const list = await run(() => del<AiProvider[]>(`/api/ai/providers/${p.id}`), 'Đã ngắt kết nối nhà cung cấp');
    if (list) onChanged(list);
  };

  const filtered = (models.data ?? []).filter((m) => !query || m.id.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={cn('glass flex flex-col gap-4 p-5', p.configured && p.lastTest?.ok && 'border-zen-green/30')}>
      <div className="flex items-start gap-3">
        <ProviderLogo id={p.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-white">{p.label}</h3>
            <div className="flex items-center gap-1.5">
              {hasMultipleAccounts && (
                <Badge tone="blue" className="flex items-center gap-1">
                  <RotateCw className="size-3 animate-spin text-purple-300" style={{ animationDuration: '4s' }} />
                  Xoay vòng {p.activeAccounts ?? accounts.length}/{accounts.length} acc
                </Badge>
              )}
              {p.configured ? (
                <Badge tone={p.lastTest?.ok ? 'green' : 'red'}>{p.lastTest?.ok ? 'Đã kết nối' : 'Lỗi key'}</Badge>
              ) : (
                <Badge>Chưa kết nối</Badge>
              )}
            </div>
          </div>
          <div className="mono truncate text-xs text-slate-500">{p.baseUrl}</div>
        </div>
      </div>

      {/* Hiển thị Pool tài khoản / API keys */}
      {p.configured && (
        <div className="space-y-2 rounded-2xl border border-slate-700/60 bg-ink-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-purple-400" />
              <span className="text-xs font-semibold text-slate-200">
                Tài khoản & Key Pool ({accounts.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant="ghost"
                icon={Plus}
                onClick={() => setAddingAcc((v) => !v)}
              >
                Thêm key
              </Button>
              {accounts.length > 0 && (
                <IconButton
                  icon={showAccounts ? ChevronUp : ChevronDown}
                  title={showAccounts ? 'Thu gọn' : 'Xem danh sách tài khoản'}
                  onClick={() => setShowAccounts((v) => !v)}
                />
              )}
            </div>
          </div>

          {/* Form thêm tài khoản mới */}
          {addingAcc && (
            <div className="space-y-2 rounded-xl border border-purple-500/30 bg-purple-950/20 p-2.5 animate-fadeIn">
              <div className="text-[11px] font-semibold text-purple-300">Thêm tài khoản vào vòng xoay:</div>
              <input
                className="input h-8 py-0 text-xs"
                placeholder="Tên tài khoản (vd: Account Gemini VIP 2)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="input mono h-8 py-0 text-xs"
                type="password"
                placeholder="Dán API Key..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <div className="flex justify-end gap-1.5">
                <Button size="xs" variant="ghost" onClick={() => setAddingAcc(false)}>
                  Hủy
                </Button>
                <Button size="xs" variant="primary" icon={Save} loading={busy} disabled={!newKey.trim()} onClick={() => void addAccount()}>
                  Lưu vào pool
                </Button>
              </div>
            </div>
          )}

          {/* Danh sách accounts chi tiết */}
          {showAccounts ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {accounts.map((acc, idx) => (
                <div key={acc.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/40 bg-ink-900/60 px-2.5 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-200">{acc.name || `Account #${idx + 1}`}</span>
                      {acc.status === 'active' && <Badge tone="green">Hoạt động</Badge>}
                      {acc.status === 'rate_limited' && (
                        <Badge tone="amber" className="flex items-center gap-1">
                          <Clock className="size-3" />
                          429 Tạm dừng
                        </Badge>
                      )}
                      {acc.status === 'error' && <Badge tone="red">Lỗi</Badge>}
                    </div>
                    <div className="mono text-[11px] text-slate-400">{acc.masked}</div>
                    {acc.errorMsg && <div className="truncate text-[10px] text-amber-300">{acc.errorMsg}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    {acc.status === 'rate_limited' && (
                      <IconButton icon={RotateCw} title="Kích hoạt lại ngay" onClick={() => void resetAccount(acc)} />
                    )}
                    <IconButton
                      icon={Trash2}
                      title="Xóa tài khoản này khỏi pool"
                      className="hover:text-zen-red"
                      onClick={() => void removeAccount(acc)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="mono truncate text-slate-300">{p.masked}</span>
              {hasMultipleAccounts && (
                <span className="text-[11px] text-purple-300">
                  (+{accounts.length - 1} acc khác đang tự xoay vòng)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {p.lastTest && !p.lastTest.ok && <p className="text-xs text-red-300">{p.lastTest.message}</p>}

      {/* Nhập key thay thế hoặc dán nhiều key cùng lúc */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input
            className="input mono"
            type="password"
            autoComplete="off"
            placeholder={p.configured ? 'Dán key mới hoặc nhiều key (mỗi dòng 1 key)...' : p.keyHint}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button variant="primary" icon={Save} loading={busy} disabled={!draft.trim()} onClick={() => void save()}>
            {p.configured ? 'Cập nhật' : 'Kết nối'}
          </Button>
        </div>
        <p className="text-[11px] text-slate-500">
          Mẹo: Có thể dán nhiều key (mỗi dòng 1 key) để tự động nạp thành nhiều tài khoản xoay vòng Round-Robin.
        </p>
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
      <div className="mt-auto flex items-center justify-between text-xs">
        <a href={p.keyUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-300 hover:underline">
          Lấy API key {p.label} →
        </a>
        {p.configured && (
          <button type="button" className="text-red-400/80 hover:text-red-300 hover:underline" onClick={() => void remove()}>
            Ngắt kết nối
          </button>
        )}
      </div>
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
  const subagents = useApi<SubAgent[]>('/api/ai/subagents');
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

  useEffect(() => {
    setModel(initialModel);
    if (initialModel.startsWith('agent/')) {
      const slug = initialModel.replace(/^agent\//, '');
      const matched = subagents.data?.find((a) => a.id === slug);
      if (matched) {
        setSystem(matched.systemPrompt);
        if (matched.temperature !== undefined) setTemperature(matched.temperature);
      }
    }
  }, [initialModel, subagents.data]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [messages]);

  const onSelectModel = (val: string) => {
    setModel(val);
    if (val.startsWith('agent/')) {
      const slug = val.replace(/^agent\//, '');
      const matched = subagents.data?.find((a) => a.id === slug);
      if (matched) {
        setSystem(matched.systemPrompt);
        if (matched.temperature !== undefined) setTemperature(matched.temperature);
      }
    }
  };

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
              <Select value={model} onChange={(e) => onSelectModel(e.target.value)}>
                <option value="">auto (model mặc định)</option>
                {subagents.data && subagents.data.length > 0 && (
                  <optgroup label="🤖 Sub AI Agents (Chuyên gia)">
                    {subagents.data.map((a) => (
                      <option key={a.id} value={`agent/${a.id}`}>
                        🤖 {a.name} (agent/{a.id})
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Models đã kết nối">
                  {models
                    .filter((m) => !m.id.startsWith('agent/'))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                </optgroup>
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

// ------------------------------------------------------------------ Sub AI Agents

function SubAgentsTab({ models, onTry }: { models: AiModel[]; onTry: (model: string) => void }) {
  const subagents = useApi<SubAgent[]>('/api/ai/subagents');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubAgent | null>(null);
  const [form, setForm] = useState({
    id: '',
    name: '',
    description: '',
    targetModel: 'auto',
    systemPrompt: 'Bạn là chuyên gia lập trình Fullstack, hỗ trợ giải quyết vấn đề kỹ thuật...',
    temperature: 0.7,
  });
  const [saving, setSaving] = useState(false);
  const { confirm, run } = useFeedback();

  const openCreate = () => {
    setEditing(null);
    setForm({
      id: '',
      name: '',
      description: '',
      targetModel: 'auto',
      systemPrompt: 'Bạn là chuyên gia AI, trả lời rõ ràng và chính xác bằng tiếng Việt.',
      temperature: 0.7,
    });
    setModalOpen(true);
  };

  const openEdit = (a: SubAgent) => {
    setEditing(a);
    setForm({
      id: a.id,
      name: a.name,
      description: a.description,
      targetModel: a.targetModel,
      systemPrompt: a.systemPrompt,
      temperature: a.temperature ?? 0.7,
    });
    setModalOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await run(() => post<SubAgent>('/api/ai/subagents', form), editing ? 'Đã cập nhật Sub-Agent' : 'Đã tạo Sub-Agent mới');
    setSaving(false);
    if (res) {
      setModalOpen(false);
      void subagents.reload();
    }
  };

  const remove = async (a: SubAgent) => {
    if (!(await confirm({ title: `Xóa ${a.name}`, message: `Xóa Sub-Agent "${a.name}" (agent/${a.id}) khỏi danh sách?`, danger: true, confirmLabel: 'Xóa' }))) return;
    await run(() => del(`/api/ai/subagents/${a.id}`), 'Đã xóa Sub-Agent');
    void subagents.reload();
  };

  if (!subagents.data) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">Danh sách Sub AI Agents ({subagents.data.length})</h3>
          <p className="text-xs text-slate-400">
            Tự động chia các tác vụ chuyên biệt (Lập trình, Dịch thuật, Phân tích dữ liệu...) với System Prompt và model riêng.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          Tạo Sub-Agent mới
        </Button>
      </div>

      <Notice icon={Bot}>
        Trong <b>n8n</b>, <b>Flowise</b>, <b>NextChat</b> hoặc code API: nhập tên model là <code className="mono text-emerald-300">agent/&lt;mã-agent&gt;</code> hoặc <code className="mono text-emerald-300">&lt;mã-agent&gt;</code>. Gateway sẽ tự động nạp System Prompt chuyên môn và điều phối API keys xoay vòng!
      </Notice>

      {subagents.data.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Chưa có Sub AI Agent nào"
          description="Tạo Sub-Agent đầu tiên để chuyên môn hóa tác vụ cho workflow hoặc team của bạn."
          action={
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              Tạo Sub-Agent ngay
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subagents.data.map((a) => (
            <div key={a.id} className="glass flex flex-col justify-between p-5 border-slate-700/60 hover:border-purple-500/40 transition">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/30 to-indigo-900/30 text-purple-300 ring-1 ring-white/10">
                    <Bot className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-white truncate">{a.name}</h4>
                      <Badge tone={a.enabled ? 'green' : 'slate'}>{a.enabled ? 'Hoạt động' : 'Tắt'}</Badge>
                    </div>
                    <div className="mono text-xs text-emerald-300 truncate">agent/{a.id}</div>
                  </div>
                </div>

                {a.description && <p className="text-xs text-slate-400 line-clamp-2">{a.description}</p>}

                <div className="rounded-xl border border-slate-800 bg-ink-950/60 p-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Model đích:</span>
                    <span className="mono font-semibold text-slate-200">{a.targetModel}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Nhiệt độ (temp):</span>
                    <span className="mono text-slate-200">{a.temperature ?? 0.7}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-slate-500 italic">
                    "{a.systemPrompt}"
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
                <div className="flex items-center gap-1">
                  <CopyButton value={`agent/${a.id}`} label="Copy ID" />
                  <Button size="xs" variant="ghost" onClick={() => openEdit(a)}>
                    Sửa
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="xs" variant="soft" icon={MessageSquare} onClick={() => onTry(`agent/${a.id}`)}>
                    Chat thử
                  </Button>
                  <IconButton icon={Trash2} title="Xóa Sub-Agent" className="hover:text-zen-red" onClick={() => void remove(a)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Tạo/Sửa Sub-Agent */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-700 bg-ink-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">{editing ? 'Chỉnh sửa Sub-Agent' : 'Tạo Sub-Agent mới'}</h3>
              </div>
              <IconButton icon={X} title="Đóng" onClick={() => setModalOpen(false)} />
            </div>

            <form onSubmit={submit} className="space-y-3 text-sm">
              <Field label="Tên Sub-Agent">
                <input
                  className="input"
                  required
                  placeholder="vd: Chuyên gia Lập trình Fullstack"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mã gọi tắt (Slug)">
                  <input
                    className="input mono"
                    placeholder="vd: coder, translator"
                    value={form.id}
                    disabled={Boolean(editing)}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                  />
                </Field>
                <Field label="Model đích">
                  <Select value={form.targetModel} onChange={(e) => setForm({ ...form, targetModel: e.target.value })}>
                    <option value="auto">auto (Model mặc định của Gateway)</option>
                    {models.filter((m) => !m.id.startsWith('agent/')).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Mô tả ngắn">
                <input
                  className="input"
                  placeholder="vd: Viết code sạch, tối ưu hiệu năng và debug lỗi"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <Field label="System Prompt (Định hình chuyên môn)">
                <textarea
                  className="input h-28 text-xs font-mono"
                  required
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  placeholder="Nhập hướng dẫn chi tiết về phong cách, chuyên môn và yêu cầu trả lời của Agent..."
                />
              </Field>

              <Field label={`Nhiệt độ (Temperature): ${form.temperature.toFixed(1)}`}>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                  className="w-full accent-zen-blue"
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" icon={Save} loading={saving}>
                  {editing ? 'Cập nhật' : 'Tạo Agent'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Hoạt động & Logs

function ActivityTab() {
  const logs = useApi<GatewayLog[]>('/api/ai/gateway/logs', 5000);
  const [viewMode, setViewMode] = useState<'table' | 'console'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'error' | 'agent'>('all');
  const [copied, setCopied] = useState(false);
  const { confirm, run, toast } = useFeedback();

  const clear = async () => {
    if (!(await confirm({ title: 'Xóa toàn bộ lịch sử log', message: 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử gọi AI Gateway?', danger: true, confirmLabel: 'Xóa sạch' }))) return;
    await run(() => del('/api/ai/gateway/logs'), 'Đã xóa toàn bộ log');
    void logs.reload();
  };

  const copyAll = async () => {
    if (!logs.data?.length) return;
    await navigator.clipboard.writeText(JSON.stringify(logs.data, null, 2));
    setCopied(true);
    toast('Đã sao chép toàn bộ logs vào clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadJson = () => {
    if (!logs.data?.length) return;
    const blob = new Blob([JSON.stringify(logs.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenpanel-ai-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = useMemo(() => {
    if (!logs.data) return [];
    const q = search.toLowerCase().trim();
    return logs.data.filter((l) => {
      if (statusFilter === 'ok' && (l.status < 200 || l.status >= 300)) return false;
      if (statusFilter === 'error' && l.status >= 200 && l.status < 300) return false;
      if (statusFilter === 'agent' && !l.subAgent) return false;
      if (!q) return true;
      return (
        l.model.toLowerCase().includes(q) ||
        (l.subAgent && l.subAgent.toLowerCase().includes(q)) ||
        (l.accountName && l.accountName.toLowerCase().includes(q)) ||
        (l.error && l.error.toLowerCase().includes(q))
      );
    });
  }, [logs.data, search, statusFilter]);

  if (!logs.data) return <Spinner />;

  return (
    <div className="space-y-4">
      {/* Thanh điều khiển Logs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-800/80 p-1">
            <button
              onClick={() => setViewMode('table')}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', viewMode === 'table' ? 'bg-zen-blue text-white shadow' : 'text-slate-400 hover:text-white')}
            >
              Bảng kết nối ({logs.data.length})
            </button>
            <button
              onClick={() => setViewMode('console')}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', viewMode === 'console' ? 'bg-zen-blue text-white shadow' : 'text-slate-400 hover:text-white')}
            >
              <Terminal className="size-3.5" />
              Live Console Logs
            </button>
          </div>

          {viewMode === 'table' && (
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn('rounded-lg px-2 py-1', statusFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')}
              >
                Tất cả
              </button>
              <button
                onClick={() => setStatusFilter('ok')}
                className={cn('rounded-lg px-2 py-1', statusFilter === 'ok' ? 'bg-emerald-950/60 text-emerald-300' : 'text-slate-400 hover:text-white')}
              >
                200 OK
              </button>
              <button
                onClick={() => setStatusFilter('error')}
                className={cn('rounded-lg px-2 py-1', statusFilter === 'error' ? 'bg-red-950/60 text-red-300' : 'text-slate-400 hover:text-white')}
              >
                Lỗi / 429
              </button>
              <button
                onClick={() => setStatusFilter('agent')}
                className={cn('rounded-lg px-2 py-1', statusFilter === 'agent' ? 'bg-purple-950/60 text-purple-300' : 'text-slate-400 hover:text-white')}
              >
                Sub-Agents
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="xs" variant="ghost" icon={copied ? Check : Copy} onClick={() => void copyAll()}>
            {copied ? 'Đã chép' : 'Sao chép logs'}
          </Button>
          <Button size="xs" variant="ghost" icon={Download} onClick={downloadJson}>
            Tải JSON
          </Button>
          <Button size="xs" variant="ghost" icon={Trash2} className="hover:text-zen-red" onClick={() => void clear()}>
            Xóa lịch sử
          </Button>
          <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void logs.reload()} />
        </div>
      </div>

      {viewMode === 'console' ? (
        /* Màn hình Live Terminal Console */
        <div className="rounded-2xl border border-slate-800 bg-[#090c15] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="mono font-semibold text-slate-200">AI Gateway Runtime Live Stream (Port /zen/v1)</span>
            </div>
            <span className="mono text-[11px] text-slate-500">Tự động nạp mỗi 5s</span>
          </div>
          <div className="mono h-[480px] overflow-y-auto space-y-1.5 text-xs text-slate-300 select-text">
            {logs.data.length === 0 ? (
              <p className="text-slate-600 italic">Chưa có sự kiện nào được ghi nhận...</p>
            ) : (
              logs.data.map((l, idx) => (
                <div key={`${l.at}-${idx}`} className="flex flex-wrap items-baseline gap-2 py-0.5 border-b border-slate-900/60 font-mono">
                  <span className="text-slate-500 text-[11px]">[{new Date(l.at).toLocaleTimeString('vi-VN')}]</span>
                  <span className={cn('px-1.5 py-0.2 rounded font-bold text-[10px]', l.status >= 200 && l.status < 300 ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400')}>
                    HTTP {l.status}
                  </span>
                  <span className="text-purple-300 font-semibold">{l.model}</span>
                  {l.subAgent && <span className="text-indigo-400">🤖 [{l.subAgent}]</span>}
                  {l.accountName && <span className="text-amber-300 text-[11px]">🔑 {l.accountName}</span>}
                  <span className="text-slate-500 text-[11px]">{(l.ms / 1000).toFixed(2)}s</span>
                  {l.rotatedFrom && <span className="text-amber-400 text-[11px]">↳ ({l.rotatedFrom})</span>}
                  {l.error && <span className="text-red-400 text-[11px]">ERR: {l.error}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Bảng danh sách chi tiết các requests */
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input h-9 pl-9 text-xs"
              placeholder="Tìm theo model, sub-agent, account hoặc mã lỗi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredLogs.length === 0 ? (
            <EmptyState icon={Activity} title="Không tìm thấy request nào" description="Thử thay đổi bộ lọc tìm kiếm hoặc thực hiện request mới." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr>
                    <th className={th}>Thời gian</th>
                    <th className={th}>Model / Sub-Agent</th>
                    <th className={th}>Tài khoản xoay vòng</th>
                    <th className={th}>Nguồn</th>
                    <th className={th}>Kết quả</th>
                    <th className={cn(th, 'text-right')}>Thời gian</th>
                    <th className={cn(th, 'text-right')}>Token vào/ra</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l, i) => (
                    <tr key={`${l.at}-${i}`} className={tr}>
                      <td className={cn(td, 'text-xs text-slate-400 whitespace-nowrap')}>{formatRelative(l.at)}</td>
                      <td className={cn(td, 'max-w-[320px]')}>
                        <div className="flex items-center gap-1.5">
                          <span className="mono truncate font-semibold text-slate-100">{l.model}</span>
                          {l.subAgent && <Badge tone="blue" className="text-[10px]">🤖 {l.subAgent}</Badge>}
                        </div>
                        {l.fallbackFrom && <div className="text-xs text-amber-300">dự phòng cho {l.fallbackFrom}</div>}
                        {l.error && <div className="truncate text-xs text-red-300" title={l.error}>{l.error}</div>}
                      </td>
                      <td className={cn(td, 'text-xs')}>
                        {l.accountName ? (
                          <div className="space-y-0.5">
                            <span className="mono font-semibold text-purple-300">{l.accountName}</span>
                            {l.rotatedFrom && (
                              <div className="text-[10px] text-amber-400 flex items-center gap-1">
                                <RotateCw className="size-2.5" />
                                <span>{l.rotatedFrom}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className={td}>
                        <Badge>{l.source === 'api' ? 'API' : l.source === 'agent' ? 'Sub-Agent' : 'Playground'}</Badge> {l.stream && <Badge tone="blue">stream</Badge>}
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
          )}
        </div>
      )}
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
  const totalAccounts = providers.reduce((sum, p) => sum + (p.totalAccounts ?? (p.configured ? 1 : 0)), 0);

  const samples = {
    curl: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${gateway.apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Xin chào"}]}'`,
    python: `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="${gateway.apiKey}")\nres = client.chat.completions.create(\n    model="${model}",\n    messages=[{"role": "user", "content": "Xin chào"}],\n)\nprint(res.choices[0].message.content)`,
    node: `import OpenAI from 'openai';\n\nconst client = new OpenAI({ baseURL: '${base}', apiKey: '${gateway.apiKey}' });\nconst res = await client.chat.completions.create({\n  model: '${model}',\n  messages: [{ role: 'user', content: 'Xin chào' }],\n});\nconsole.log(res.choices[0].message.content);`,
    n8n: `Credentials → New → "OpenAI"\n  API Key : ${gateway.apiKey}\n  Base URL: ${base}\n\nNode "AI Agent" / "OpenAI Chat Model" → Model: ${model}\n(gõ tên model dạng provider/model hoặc sub-agent dạng agent/coder)`,
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Nhà cung cấp & Keys', `${connected}/${providers.length} (${totalAccounts} acc)`, 'đã kết nối & xoay vòng'],
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
              <code className="mono">nvidia/…</code>, Sub-Agent <code className="mono">agent/coder</code>, hoặc <code className="mono">auto</code>.
            </p>
          </div>
        </Card>
        <div className="space-y-4">
        <Card title="Endpoint" icon={ListOrdered} actions={<Link to="/api-tester" className="text-xs font-semibold text-blue-300 hover:underline">Thử trong API Tester →</Link>}>
          <div className="space-y-1.5">
            {[
              ['GET', '/health', 'Kiểm tra gateway (không cần key)'],
              ['GET', '/models', 'Danh sách model & Sub-Agents'],
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

type TabId = 'overview' | 'subagents' | 'providers' | 'models' | 'playground' | 'routing' | 'activity';

export default function AiGateway() {
  const providers = useApi<AiProvider[]>('/api/ai/providers');
  const gatewayApi = useApi<GatewaySettings>('/api/ai/gateway');
  const allModels = useApi<AiModel[]>('/api/ai/models');
  const subagents = useApi<SubAgent[]>('/api/ai/subagents');
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
        description="1 endpoint chuẩn OpenAI cho ChatGPT, Claude, Gemini, OpenRouter, NVIDIA — tự định tuyến, tự xoay vòng API keys và chia Sub-Agents"
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
            Bắt đầu bằng cách kết nối API key ở tab <b>Nhà cung cấp</b>, rồi chọn model mặc định hoặc tạo <b>Sub-Agents</b> chuyên biệt.
          </Notice>
        </div>
      )}
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Tổng quan', icon: Route },
            { id: 'subagents', label: 'Sub AI Agents', icon: Bot, count: subagents.data?.length },
            { id: 'providers', label: 'Nhà cung cấp & Keys', icon: KeyRound, count: providers.data.filter((p) => p.configured).length },
            { id: 'models', label: 'Models', icon: Boxes, count: allModels.data?.length },
            { id: 'playground', label: 'Playground', icon: MessageSquare },
            { id: 'routing', label: 'Định tuyến', icon: ListOrdered },
            { id: 'activity', label: 'Nhật ký & Logs', icon: Activity },
          ]}
        />
      </div>
      {tab === 'overview' && <OverviewTab gateway={gateway} saveGateway={saveGateway} regenerate={() => void regenerate()} providers={providers.data} />}
      {tab === 'subagents' && (
        <SubAgentsTab
          models={allModels.data ?? []}
          onTry={(m) => {
            setTryModel(m);
            setTab('playground');
          }}
        />
      )}
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

