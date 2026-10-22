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


const ctx = (n: number | null) => (n ? (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`) : '—');
const price = (n: number) => (n === 0 ? 'Miễn phí' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`);

// --- Biểu tượng Vector SVG chính thức cho các nhà cung cấp AI & Sub-Agents ---

function OpenAiIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="OpenAI">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6669zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

function ClaudeSparkIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Anthropic Claude">
      <path d="M13.827 3.5a.75.75 0 0 0-1.404-.374l-2.316 8.7a.75.75 0 0 1-.95.525L4.72 10.97a.75.75 0 0 0-.73 1.282l6.892 5.06a.75.75 0 0 1 .288 1.05l-4.22 6.86a.75.75 0 0 0 1.233.84l7.147-5.83a.75.75 0 0 1 1.066.273l3.784 6.78a.75.75 0 0 0 1.348-.68l-3.32-8.38a.75.75 0 0 1 .458-1.002l7.747-2.67a.75.75 0 0 0-.416-1.424l-8.11 1.76a.75.75 0 0 1-.89-.572L13.827 3.5Z" />
    </svg>
  );
}

function GeminiIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Google Gemini">
      <defs>
        <linearGradient id="gemini-star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1B72E8" />
          <stop offset="35%" stopColor="#8AB4F8" />
          <stop offset="70%" stopColor="#C58AF9" />
          <stop offset="100%" stopColor="#F28B82" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill="url(#gemini-star-grad)"
      />
    </svg>
  );
}

function OpenRouterIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="OpenRouter">
      <path d="M18.82 7.74a1.64 1.64 0 0 0-1.63-1.64h-3.14V3.64A1.64 1.64 0 0 0 12.41 2h-.82a1.64 1.64 0 0 0-1.64 1.64v2.46H6.81a1.64 1.64 0 0 0-1.64 1.64v5.46a1.64 1.64 0 0 0 1.64 1.64h3.14v4.46a1.64 1.64 0 0 0 1.64 1.64h.82a1.64 1.64 0 0 0 1.64-1.64v-4.46h3.14a1.64 1.64 0 0 0 1.64-1.64V7.74Zm-5.38 6.06h-2.88V9.12h2.88v4.68Z" />
    </svg>
  );
}

function NvidiaIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="NVIDIA">
      <path d="M8.938 6.477c-.504.095-.98.24-1.428.432-.38.163-.733.36-1.057.59-.22.155-.262.333-.127.533.125.183.332.188.54.083.748-.38 1.573-.59 2.457-.624.473-.018.94.025 1.396.126.963.212 1.77.685 2.392 1.405.62.718.93 1.576.93 2.545 0 .807-.22 1.545-.657 2.19-.435.642-1.028 1.13-1.764 1.45-.733.318-1.544.475-2.414.475-.828 0-1.603-.146-2.308-.432-.698-.283-1.282-.69-1.737-1.21-.45-.515-.718-1.127-.8-1.82a4.42 4.42 0 0 1 .472-2.525c.34-.633.82-1.17 1.425-1.597.168-.118.2-.284.096-.457-.107-.175-.297-.2-.486-.07-.743.513-1.33 1.168-1.745 1.947-.417.78-.584 1.63-.497 2.534.098.98.442 1.83 1.025 2.53.585.702 1.328 1.233 2.213 1.58.887.346 1.837.52 2.83.52 1.05 0 2.036-.188 2.936-.56.9-.373 1.635-.935 2.188-1.67.553-.736.833-1.604.833-2.585 0-1.162-.365-2.188-1.085-3.05-.72-.86-1.66-1.424-2.8-1.68a7.82 7.82 0 0 0-1.28-.108zm2.664-3.52c-.785-.098-1.59-.06-2.397.112-1.092.23-2.102.666-3.006 1.298-.445.31-.854.67-1.22 1.07-.184.202-.15.38.077.518.21.126.39.076.57-.123.633-.69 1.378-1.22 2.217-1.576.845-.357 1.74-.526 2.662-.504 1.13.027 2.2.296 3.18.8 1.01.52 1.836 1.248 2.457 2.164.625.92.94 1.966.94 3.11 0 1.02-.24 1.964-.712 2.813-.474.85-1.127 1.528-1.942 2.018-.816.49-1.728.756-2.716.79-1.02.035-2.003-.17-2.923-.61-.918-.44-1.665-1.077-2.223-1.896-.554-.816-.867-1.747-.932-2.77-.07-1.082.176-2.113.73-3.07.55-.95 1.31-1.71 2.26-2.26.19-.11.23-.28.11-.47-.11-.18-.28-.21-.48-.09-1.11.634-1.99 1.515-2.628 2.623-.637 1.11-.92 2.308-.84 3.565.076 1.19.435 2.264 1.07 3.203.64.94 1.487 1.677 2.52 2.193 1.038.514 2.15.764 3.31.744 1.12-.02 2.17-.3 3.13-.836.96-.537 1.724-1.288 2.274-2.235.553-.948.835-2.012.835-3.17 0-1.3-.356-2.484-1.06-3.52-.705-1.037-1.64-1.86-2.787-2.45-1.144-.588-2.38-.9-3.682-.93z" />
    </svg>
  );
}

function SubAgentIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-label="Sub-Agent">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" fill="currentColor" fillOpacity="0.15" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function DeepSeekIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="DeepSeek">
      <path d="M12 2a10 10 0 0 0-10 10c0 4.14 2.52 7.69 6.14 9.19.16-.72.37-1.57.65-2.52-2.56-.63-3.61-2.48-3.61-2.48-.38-.97-.93-1.23-.93-1.23-.84-.57.06-.56.06-.56.93.07 1.42.95 1.42.95.82 1.41 2.16 1 2.68.77.08-.6.33-1 .59-1.23-2.31-.26-4.74-1.16-4.74-5.15 0-1.14.41-2.07 1.08-2.8-.11-.26-.47-1.32.1-2.76 0 0 .88-.28 2.88 1.07a10.05 10.05 0 0 1 5.24 0c2-1.35 2.88-1.07 2.88-1.07.57 1.44.21 2.5.1 2.76.67.73 1.08 1.66 1.08 2.8 0 4-2.44 4.88-4.76 5.14.34.29.64.87.64 1.75 0 1.26-.01 2.28-.01 2.59 0 .25.17.55.65.45A10 10 0 0 0 22 12A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function ProviderLogo({ id, size = 'md', className }: { id: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const norm = (id.includes('/') ? id.split('/')[0] : id).toLowerCase();
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const iconClass = isSm ? 'size-3.5' : isLg ? 'size-6' : 'size-5';
  const boxClass = isSm ? 'size-7 rounded-lg' : isLg ? 'size-12 rounded-2xl' : 'size-10 rounded-xl';

  let iconNode = null;
  let bgStyles = 'bg-slate-800/80 text-slate-300 border border-slate-700/60 shadow-inner';

  if (norm.includes('openai')) {
    iconNode = <OpenAiIcon className={cn(iconClass, 'text-emerald-400')} />;
    bgStyles = 'bg-gradient-to-br from-emerald-950/80 via-emerald-900/30 to-ink-950 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,163,127,0.18)]';
  } else if (norm.includes('anthropic') || norm.includes('claude')) {
    iconNode = <ClaudeSparkIcon className={cn(iconClass, 'text-[#D97706]')} />;
    bgStyles = 'bg-gradient-to-br from-amber-950/80 via-orange-950/30 to-ink-950 border border-amber-500/30 shadow-[0_0_12px_rgba(217,119,6,0.18)]';
  } else if (norm.includes('gemini') || norm.includes('google')) {
    iconNode = <GeminiIcon className={iconClass} />;
    bgStyles = 'bg-gradient-to-br from-indigo-950/80 via-blue-950/30 to-ink-950 border border-indigo-500/30 shadow-[0_0_12px_rgba(79,70,229,0.22)]';
  } else if (norm.includes('openrouter')) {
    iconNode = <OpenRouterIcon className={cn(iconClass, 'text-purple-400')} />;
    bgStyles = 'bg-gradient-to-br from-purple-950/80 via-violet-950/30 to-ink-950 border border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.18)]';
  } else if (norm.includes('nvidia')) {
    iconNode = <NvidiaIcon className={cn(iconClass, 'text-[#76B900]')} />;
    bgStyles = 'bg-gradient-to-br from-lime-950/80 via-emerald-950/30 to-ink-950 border border-lime-500/30 shadow-[0_0_12px_rgba(118,185,0,0.2)]';
  } else if (norm.startsWith('agent') || norm.includes('subagent') || norm.includes('bot')) {
    iconNode = <SubAgentIcon className={cn(iconClass, 'text-cyan-400')} />;
    bgStyles = 'bg-gradient-to-br from-cyan-950/80 via-blue-950/30 to-ink-950 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.2)]';
  } else if (norm.includes('deepseek')) {
    iconNode = <DeepSeekIcon className={cn(iconClass, 'text-blue-400')} />;
    bgStyles = 'bg-gradient-to-br from-blue-950/80 via-sky-950/30 to-ink-950 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.2)]';
  } else {
    iconNode = <Sparkles className={cn(iconClass, 'text-slate-400')} />;
  }

  return (
    <div className={cn('flex shrink-0 items-center justify-center transition-all duration-200 hover:scale-105', boxClass, bgStyles, className)}>
      {iconNode}
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
                <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', m.role === 'user' ? 'bg-zen-blue/20 text-blue-300 font-semibold text-xs' : '')}>
                  {m.role === 'user' ? 'Bạn' : <ProviderLogo id={model} size="sm" />}
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
                  <ProviderLogo id="agent" size="md" />
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
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Model đích:</span>
                    <span className="mono font-semibold text-slate-200 flex items-center gap-1.5">
                      <ProviderLogo id={a.targetModel} size="sm" />
                      {a.targetModel}
                    </span>
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
                        <div className="flex items-center gap-2">
                          <ProviderLogo id={l.subAgent ? 'agent' : (l.provider || l.model)} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="mono truncate font-semibold text-slate-100">{l.model}</span>
                              {l.subAgent && <Badge tone="blue" className="text-[10px]">🤖 {l.subAgent}</Badge>}
                            </div>
                            {l.fallbackFrom && <div className="text-xs text-amber-300">dự phòng cho {l.fallbackFrom}</div>}
                            {l.error && <div className="truncate text-xs text-red-300" title={l.error}>{l.error}</div>}
                          </div>
                        </div>
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

  const dockerBase = 'http://host.docker.internal:8000/zen/v1';

  const samples = {
    curl: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${gateway.apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Xin chào"}]}'`,
    python: `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="${gateway.apiKey}")\nres = client.chat.completions.create(\n    model="${model}",\n    messages=[{"role": "user", "content": "Xin chào"}],\n)\nprint(res.choices[0].message.content)`,
    node: `import OpenAI from 'openai';\n\nconst client = new OpenAI({ baseURL: '${base}', apiKey: '${gateway.apiKey}' });\nconst res = await client.chat.completions.create({\n  model: '${model}',\n  messages: [{ role: 'user', content: 'Xin chào' }],\n});\nconsole.log(res.choices[0].message.content);`,
    n8n: `=== CÁCH KẾT NỐI N8N VỚI ZENPANEL AI GATEWAY ===\n\n1. Tạo Credential trong n8n:\n   - Menu trái: Credentials → Add Credential → Chọn "OpenAI"\n   - API Key: ${gateway.apiKey}\n   - Base URL (trong Advanced/URL Options):\n     * Nếu n8n chạy Docker trên cùng VPS (Khuyên dùng):\n       ${dockerBase}\n     * Nếu n8n chạy ngoài hoặc qua Domain/Tunnel:\n       ${base}\n\n2. Kéo Node trong Workflow:\n   - Kéo node "AI Agent" (hoặc "Chat Model")\n   - Kéo node "OpenAI Chat Model" gắn vào cổng Model của AI Agent\n   - Chọn Credential OpenAI vừa tạo ở trên\n\n3. BẬT CUSTOM MODEL (Mấu chốt):\n   - Ô "Model" bấm biểu tượng chuyển sang "Custom" / "Expression"\n   - Gõ tên model bất kỳ:\n     • gemini/gemini-2.5-flash (siêu nhanh, rẻ)\n     • anthropic/claude-3-7-sonnet (thông minh nhất)\n     • openai/gpt-4o\n     • agent/coder (Sub-Agent của bạn)\n     • auto (ZenPanel tự động phân luồng)`,
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
              <div className="text-xs text-slate-500">Base URL (Public / Mạng ngoài)</div>
              <div className="flex items-center gap-2">
                <span className="mono min-w-0 flex-1 truncate text-slate-100">{base}</span>
                <CopyButton value={base} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
              <div className="text-xs text-slate-500">Base URL nội bộ Docker (n8n, Flowise, Open WebUI chạy cùng VPS)</div>
              <div className="flex items-center gap-2">
                <span className="mono min-w-0 flex-1 truncate text-emerald-300">{dockerBase}</span>
                <CopyButton value={dockerBase} />
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
                  {l === 'node' ? 'Node.js' : l === 'n8n' ? '⚡ n8n Setup' : l === 'python' ? 'Python' : 'cURL'}
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

      {/* Card Hướng dẫn setup n8n chuyên sâu chuẩn chỉ */}
      <Card
        title="Hướng dẫn thiết lập n8n kết nối ZenPanel AI Gateway (Chuẩn 100% không lỗi kết nối)"
        icon={Boxes}
      >
        <div className="space-y-4">
          <Notice tone="blue">
            <strong>Nguyên tắc vàng:</strong> Vì n8n chạy trong container Docker, <code className="mono">localhost</code> trong n8n là chính container đó. Để n8n kết nối về ZenPanel Gateway trên cùng máy chủ VPS, bạn <strong>bắt buộc</strong> dùng <code className="mono font-bold text-emerald-300">http://host.docker.internal:8000/zen/v1</code>.
          </Notice>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-700/60 bg-ink-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">1</span>
                <h4 className="font-bold text-white text-sm">Tạo Credential</h4>
              </div>
              <p className="text-xs text-slate-400">
                Trong n8n, menu trái chọn <strong>Credentials</strong> → <strong>Add Credential</strong> → tìm và chọn <strong>OpenAI</strong>.
              </p>
              <div className="text-[11px] text-slate-500">
                (Không chọn Anthropic hay Gemini vì Gateway của ZenPanel chuẩn hóa theo giao thức OpenAI).
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-ink-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">2</span>
                <h4 className="font-bold text-white text-sm">Nhập URL & API Key</h4>
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <div className="text-slate-400">Base URL:</div>
                  <div className="flex items-center justify-between gap-1 rounded bg-slate-900 px-2 py-1 mono text-[11px] text-emerald-300">
                    <span className="truncate">{dockerBase}</span>
                    <CopyButton value={dockerBase} />
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">API Key:</div>
                  <div className="flex items-center justify-between gap-1 rounded bg-slate-900 px-2 py-1 mono text-[11px] text-slate-300">
                    <span className="truncate">{gateway.apiKey.slice(0, 10)}...</span>
                    <CopyButton value={gateway.apiKey} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-ink-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">3</span>
                <h4 className="font-bold text-white text-sm">Bật Custom Model</h4>
              </div>
              <p className="text-xs text-slate-400">
                Kéo node <strong>AI Agent</strong> + <strong>OpenAI Chat Model</strong>.
              </p>
              <p className="text-xs text-amber-300">
                ⚠️ Bấm biểu tượng bút/chuyển đổi cạnh ô <strong>Model</strong> sang chế độ <strong>Expression (Custom Input)</strong> để gõ tay:
              </p>
              <div className="mono text-[11px] text-slate-300 space-y-0.5">
                <div>• <code className="text-sky-300">gemini/gemini-2.5-flash</code></div>
                <div>• <code className="text-orange-300">anthropic/claude-3-7-sonnet</code></div>
                <div>• <code className="text-purple-300">agent/coder</code> (Sub-Agent)</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-ink-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">4</span>
                <h4 className="font-bold text-white text-sm">Test & Theo dõi Log</h4>
              </div>
              <p className="text-xs text-slate-400">
                Thêm node <strong>Window Buffer Memory</strong> + <strong>Chat Trigger</strong> để chat thử trực tiếp trong n8n.
              </p>
              <p className="text-xs text-emerald-400">
                Mở tab <strong>Hoạt động</strong> trong ZenPanel để xem log request nhảy về realtime, đo tốc độ ms, token và trạng thái xoay vòng tài khoản!
              </p>
            </div>
          </div>
        </div>
      </Card>
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

