// ZenPanel - AI Gateway: nhà cung cấp, kho model, playground, định tuyến & fallback, sub-agents, multi-account rotation
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  KeyRound,
  Layers,
  ListOrdered,
  MessageSquare,
  Network,
  Pencil,
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
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
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
}

export interface CompanyWorker {
  id: string;
  name: string;
  role: string;
  avatar: string;
  targetModel: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface MasterBotConfig {
  name: string;
  role: string;
  targetModel: string;
  systemPrompt: string;
}

export interface AiCompanyConfig {
  enabled: boolean;
  masterBot: MasterBotConfig;
  workers: CompanyWorker[];
}

export interface CompanyStreamEvent {
  type: 'phase' | 'plan' | 'worker_start' | 'worker_done' | 'worker_error' | 'boss_chunk' | 'done' | 'error';
  phase?: 'planning' | 'working' | 'synthesizing' | 'completed';
  message?: string;
  plan?: {
    taskSummary: string;
    subtasks: { workerId: string; workerName: string; instruction: string }[];
  };
  workerId?: string;
  workerName?: string;
  modelUsed?: string;
  instruction?: string;
  result?: string;
  delta?: string;
  fullReport?: string;
  error?: string;
}

interface GatewaySettings {
  enabled: boolean;
  apiKey: string;
  defaultModel: string | null;
  fallbacks: string[];
}

export interface GatewayApiKeyView {
  id: string;
  name: string;
  masked: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  enabled: boolean;
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

function ProvidersTab({
  providers,
  setProviders,
  gateway,
  onGoOverview,
}: {
  providers: AiProvider[];
  setProviders: (l: AiProvider[]) => void;
  gateway: GatewaySettings;
  onGoOverview: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Banner trợ giúp tìm Gateway Key của ZenPanel */}
      <div className="rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/30 text-xl ring-1 ring-indigo-400/30">
            🔑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-white text-sm">Bạn đang tìm Gateway Key của ZenPanel?</h4>
              <Badge tone="blue">API Key cho n8n & App ngoài</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Để kết nối n8n, Flowise, NextChat... với ZenPanel, hãy sao chép <b>Gateway Key</b> bên phải hoặc xem chi tiết cấu hình tại tab Tổng quan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton value={gateway.apiKey} label="Sao chép Gateway Key" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-md" />
          <Button size="xs" variant="secondary" onClick={onGoOverview}>
            Xem Endpoint & Cấu hình →
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} p={p} onChanged={setProviders} />
        ))}
      </div>
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
  const [system, setSystem] = useState('Bạn tên TXAZENPANEL BOT, được tạo bởi TXA STUDIO. Bạn là trợ lý hữu ích, trả lời bằng tiếng Việt.');
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
      const fixedIdentity = 'Bạn tên TXAZENPANEL BOT, được tạo bởi TXA STUDIO.';
      const effectiveSystem = system
        ? system.includes('TXAZENPANEL BOT')
          ? system
          : `${fixedIdentity}\n\n${system}`
        : fixedIdentity;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        signal: abort.current.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ model: model || 'auto', stream: true, temperature, messages: [{ role: 'system', content: effectiveSystem }, ...history] }),
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
      systemPrompt: 'Bạn tên TXAZENPANEL BOT, được tạo bởi TXA STUDIO. Bạn là chuyên gia AI, trả lời rõ ràng và chính xác bằng tiếng Việt.',
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

// ------------------------------------------------------------------ AI Company Orchestrator (Sếp & Công nhân)

function CompanyTab({ models, providers }: { models: AiModel[]; providers: AiProvider[] }) {
  const company = useApi<AiCompanyConfig>('/api/ai/company');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'planning' | 'working' | 'synthesizing' | 'completed'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [plan, setPlan] = useState<{ taskSummary: string; subtasks: { workerId: string; workerName: string; instruction: string }[] } | null>(null);
  const [workerProgress, setWorkerProgress] = useState<Record<string, { status: 'running' | 'done' | 'error'; model?: string; result?: string }>>({});
  const [bossReport, setBossReport] = useState('');
  const [selectedWorkerDetail, setSelectedWorkerDetail] = useState<{ name: string; avatar: string; result: string } | null>(null);

  // Modal Sửa Sếp Tổng & Sửa Worker
  const [editMasterOpen, setEditMasterOpen] = useState(false);
  const [masterForm, setMasterForm] = useState<MasterBotConfig>({ name: '', role: '', targetModel: 'auto', systemPrompt: '' });
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<CompanyWorker | null>(null);
  const [workerForm, setWorkerForm] = useState<CompanyWorker>({ id: '', name: '', role: '', avatar: '👷', targetModel: 'auto', systemPrompt: '', enabled: true });

  const { confirm, run, toast } = useFeedback();

  const configuredProviders = useMemo(() => providers.filter((p) => p.configured), [providers]);
  const isMultiModel = configuredProviders.length > 1;

  const startOrchestration = async () => {
    const text = prompt.trim();
    if (!text || running) return;

    setRunning(true);
    setCurrentPhase('planning');
    setStatusMessage('👔 Sếp Tổng đang tiếp nhận đề bài và lập kế hoạch phân việc...');
    setPlan(null);
    setWorkerProgress({});
    setBossReport('');

    try {
      const res = await fetch('/api/ai/company/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Lỗi kết nối Sếp Tổng: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') continue;

          try {
            const ev = JSON.parse(dataStr) as CompanyStreamEvent;
            if (ev.type === 'phase' && ev.phase) {
              setCurrentPhase(ev.phase);
              if (ev.message) setStatusMessage(ev.message);
            } else if (ev.type === 'plan' && ev.plan) {
              setPlan(ev.plan);
              if (ev.message) setStatusMessage(ev.message);
            } else if (ev.type === 'worker_start' && ev.workerId) {
              setWorkerProgress((prev) => ({
                ...prev,
                [ev.workerId!]: { status: 'running', model: ev.modelUsed },
              }));
              if (ev.message) setStatusMessage(ev.message);
            } else if (ev.type === 'worker_done' && ev.workerId) {
              setWorkerProgress((prev) => ({
                ...prev,
                [ev.workerId!]: { status: 'done', result: ev.result },
              }));
              if (ev.message) setStatusMessage(ev.message);
            } else if (ev.type === 'boss_chunk' && ev.delta) {
              setCurrentPhase('synthesizing');
              setBossReport((prev) => prev + ev.delta);
            } else if (ev.type === 'done') {
              setCurrentPhase('completed');
              if (ev.fullReport) setBossReport(ev.fullReport);
              if (ev.message) setStatusMessage(ev.message);
            } else if (ev.type === 'error') {
              toast(ev.error || 'Lỗi điều phối', 'error');
            }
          } catch {
            // ignore non-json
          }
        }
      }
    } catch (err) {
      toast((err as Error).message, 'error');
      setCurrentPhase('idle');
    } finally {
      setRunning(false);
    }
  };

  const openEditMaster = () => {
    if (!company.data) return;
    setMasterForm(company.data.masterBot);
    setEditMasterOpen(true);
  };

  const saveMaster = async (e: FormEvent) => {
    e.preventDefault();
    if (!masterForm.name.trim()) return;
    await run(() => put('/api/ai/company', { masterBot: masterForm }), 'Đã cập nhật thông tin Sếp Tổng');
    setEditMasterOpen(false);
    void company.reload();
  };

  const openCreateWorker = () => {
    setEditingWorker(null);
    setWorkerForm({
      id: '',
      name: '',
      role: '',
      avatar: '👷',
      targetModel: 'auto',
      systemPrompt: 'Bạn là chuyên viên thực thi nhiệm vụ chuyên nghiệp.',
      enabled: true,
    });
    setWorkerModalOpen(true);
  };

  const openEditWorker = (w: CompanyWorker) => {
    setEditingWorker(w);
    setWorkerForm(w);
    setWorkerModalOpen(true);
  };

  const saveWorkerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workerForm.name.trim()) return;
    await run(() => post('/api/ai/company/workers', workerForm), editingWorker ? 'Đã cập nhật phòng ban' : 'Đã thêm phòng ban mới');
    setWorkerModalOpen(false);
    void company.reload();
  };

  const toggleWorker = async (w: CompanyWorker) => {
    await run(() => post('/api/ai/company/workers', { ...w, enabled: !w.enabled }), w.enabled ? `Đã tạm dừng ${w.name}` : `Đã kích hoạt ${w.name}`);
    void company.reload();
  };

  const deleteWorker = async (w: CompanyWorker) => {
    if (!(await confirm({ title: `Xóa phòng ban ${w.name}`, message: `Bạn có chắc muốn xóa phòng ban ${w.name} khỏi công ty?`, danger: true, confirmLabel: 'Xóa' }))) return;
    await run(() => del(`/api/ai/company/workers/${w.id}`), 'Đã xóa phòng ban');
    void company.reload();
  };

  const resetDefault = async () => {
    if (!(await confirm({ title: 'Khôi phục phòng ban mẫu', message: 'Hệ thống sẽ đặt lại Sếp Tổng và 4 phòng ban mẫu chuẩn (Dev, Content, QA, Research).', confirmLabel: 'Khôi phục' }))) return;
    await run(() => post('/api/ai/company/reset'), 'Đã khôi phục công ty mẫu');
    void company.reload();
  };

  if (!company.data) return <Spinner label="Đang tải dữ liệu Công ty AI..." />;

  const { masterBot, workers } = company.data;
  const activeWorkers = workers.filter((w) => w.enabled);

  return (
    <div className="space-y-6">
      {/* HEADER TỔNG QUAN HỆ THỐNG CÔNG TY AI */}
      <div className="glass flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-slate-700/60 bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-2xl shadow-lg ring-2 ring-amber-400/30">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Hệ thống Công ty AI Agent (AI Company)</h2>
              <Badge tone="blue" className="flex items-center gap-1 font-semibold">
                <Network className="size-3 text-purple-300" /> Master & Workers Dispatcher
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Sếp Tổng ({masterBot.name}) bóc tách đề bài, phân chia việc cho {activeWorkers.length}/{workers.length} phòng ban chuyên môn, sau đó kiểm duyệt và tổng hợp báo cáo.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs" variant="secondary" icon={RotateCw} onClick={resetDefault}>
            Đặt lại mẫu chuẩn
          </Button>
          <Button size="xs" variant="primary" icon={Plus} onClick={openCreateWorker} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500">
            Thêm phòng ban
          </Button>
        </div>
      </div>

      {/* THÔNG BÁO CHẾ ĐỘ PHÂN BỔ MODEL */}
      <Notice icon={Briefcase}>
        {isMultiModel ? (
          <span>
            <b>Đa Model đã kết nối ({configuredProviders.length} nhà cung cấp):</b> Sếp Tổng sẽ phân chia nhiệm vụ cho các model AI chuyên biệt (ví dụ: Claude/GPT giải quyết Code, Gemini phân tích Data & Content).
          </span>
        ) : (
          <span>
            <b>Chế độ 1 AI Đa vai trò (Single-Agent Multi-Persona):</b> Hiện chỉ có 1 nhà cung cấp/API key kết nối, 1 con AI duy nhất sẽ tự động hoán đổi vai trò để lần lượt thực hiện mọi nhiệm vụ của từng phòng ban rồi tổng hợp!
          </span>
        )}
      </Notice>

      {/* BÀN ĐIỀU HÀNH & TRÒ CHUYỆN VỚI SẾP TỔNG (LIVE ORCHESTRATION DESK) */}
      <div className="glass rounded-2xl border border-indigo-500/30 p-5 space-y-4 shadow-2xl bg-ink-950/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👔</span>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Bàn Điều Phối Sếp Tổng: {masterBot.name}
                <span className="text-[11px] font-normal text-slate-400">({masterBot.role})</span>
              </h3>
              <p className="text-xs text-slate-400">Giao việc cho Sếp. Sếp sẽ họp công ty, chia việc và trả về giải pháp hoàn chỉnh.</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sẵn sàng tiếp nhận dự án</span>
          </div>
        </div>

        {/* Ô NHẬP ĐỀ BÀI */}
        <div className="space-y-2">
          <textarea
            className="input min-h-[90px] w-full text-sm resize-none focus:ring-2 focus:ring-indigo-500/50"
            disabled={running}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Mô tả dự án, tính năng hoặc bài toán bạn cần giải quyết... (Ví dụ: Xây dựng hệ thống tự động backup database MySQL lên Google Drive kèm bot Telegram thông báo khi lỗi)"
          />

          {/* Gợi ý mẫu 1-click */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Gợi ý nhanh:</span>
            {[
              'Xây dựng hệ thống auto backup database lên S3 kèm bot Telegram cảnh báo',
              'Audit bảo mật toàn diện cho VPS Ubuntu và cấu hình Firewall chuẩn',
              'Kế hoạch ra mắt sản phẩm SaaS mới: Landing page, Marketing, và DevOps',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setPrompt(sample)}
                className="rounded-lg border border-slate-800 bg-slate-800/40 px-2 py-1 hover:border-slate-600 hover:text-white transition text-left truncate max-w-[280px]"
                title={sample}
              >
                {sample}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-400 italic">
              {running && statusMessage ? statusMessage : 'Bấm nút bên phải để Sếp phân công các phòng ban thực thi'}
            </div>

            <Button
              variant="primary"
              icon={Send}
              loading={running}
              disabled={!prompt.trim() || running}
              onClick={startOrchestration}
              className="bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 font-semibold px-5 shadow-lg shadow-indigo-900/30"
            >
              👔 Sếp Điều Phối & Báo Cáo
            </Button>
          </div>
        </div>

        {/* TIẾN TRÌNH THỰC THI THỜI GIAN THỰC (LIVE STEPPER) */}
        {currentPhase !== 'idle' && (
          <div className="space-y-4 pt-3 border-t border-slate-800">
            {/* GIAI ĐOẠN 1: KẾ HOẠCH CỦA SẾP */}
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">👔</span>
                  <span className="font-semibold text-xs text-amber-300 uppercase tracking-wider">
                    Giai đoạn 1: Sếp Tổng Lập Kế Hoạch & Phân Công
                  </span>
                </div>
                {plan ? (
                  <Badge tone="green" className="text-[10px]">Đã duyệt kế hoạch</Badge>
                ) : (
                  <Badge tone="blue" className="text-[10px] animate-pulse">Đang phân tích...</Badge>
                )}
              </div>

              {plan ? (
                <div className="space-y-2">
                  <div className="text-xs text-slate-200 font-medium">
                    🎯 <b>Mục tiêu chiến lược:</b> {plan.taskSummary}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                    {plan.subtasks.map((st, idx) => {
                      const w = workers.find((item) => item.id === st.workerId);
                      return (
                        <div key={idx} className="rounded-lg border border-slate-800 bg-black/40 p-2.5 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-white">
                            <span>{w?.avatar || '👷'}</span>
                            <span className="truncate">{st.workerName}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2">{st.instruction}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <RefreshCw className="size-3.5 animate-spin text-amber-400" />
                  <span>Sếp đang họp ban giám đốc và chuẩn bị danh sách nhiệm vụ...</span>
                </div>
              )}
            </div>

            {/* GIAI ĐOẠN 2: CÁC PHÒNG BAN THỰC THI */}
            {plan && (
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">👷</span>
                    <span className="font-semibold text-xs text-blue-300 uppercase tracking-wider">
                      Giai đoạn 2: Các Phòng Ban AI Đồng Loạt Xử Lý
                    </span>
                  </div>
                  <Badge tone="blue" className="text-[10px]">
                    {Object.values(workerProgress).filter((p) => p.status === 'done').length}/{plan.subtasks.length} Hoàn thành
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {plan.subtasks.map((st, idx) => {
                    const w = workers.find((item) => item.id === st.workerId);
                    const prog = workerProgress[st.workerId];
                    const isDone = prog?.status === 'done';
                    const isRunning = prog?.status === 'running';

                    return (
                      <div
                        key={idx}
                        className={cn(
                          'rounded-xl border p-3 text-xs space-y-2 transition shadow-sm',
                          isDone
                            ? 'border-emerald-500/40 bg-emerald-950/20'
                            : isRunning
                              ? 'border-blue-500/50 bg-blue-950/30 ring-1 ring-blue-500/30'
                              : 'border-slate-800 bg-black/30 opacity-60',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-white">
                            <span className="text-base">{w?.avatar || '👷'}</span>
                            <span className="truncate">{st.workerName}</span>
                          </div>
                          {isDone ? (
                            <CheckCircle2 className="size-4 text-emerald-400" />
                          ) : isRunning ? (
                            <RefreshCw className="size-3.5 animate-spin text-blue-400" />
                          ) : (
                            <Clock className="size-3.5 text-slate-500" />
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 line-clamp-2">{st.instruction}</div>

                        {prog?.model && (
                          <div className="mono text-[10px] text-indigo-300 truncate">Model: {prog.model}</div>
                        )}

                        {isDone && prog?.result && (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedWorkerDetail({
                                name: st.workerName,
                                avatar: w?.avatar || '👷',
                                result: prog.result!,
                              })
                            }
                            className="w-full text-center rounded-lg bg-emerald-900/40 hover:bg-emerald-900/70 py-1 text-[11px] font-semibold text-emerald-300 transition"
                          >
                            Xem bài làm phòng ban →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GIAI ĐOẠN 3: BÁO CÁO TỔNG HỢP TOÀN DIỆN CỦA SẾP */}
            {(currentPhase === 'synthesizing' || currentPhase === 'completed' || bossReport) && (
              <div className="rounded-xl border border-indigo-500/40 bg-slate-900/95 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <div>
                      <h4 className="text-sm font-bold text-white">Báo Cáo Tổng Hợp từ Sếp Tổng ({masterBot.name})</h4>
                      <p className="text-[11px] text-slate-400">Đã chắt lọc, nghiệm thu và tích hợp giải pháp từ mọi phòng ban</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {bossReport && (
                      <CopyButton value={bossReport} label="Sao chép báo cáo" />
                    )}
                    {currentPhase === 'completed' ? (
                      <Badge tone="green">Hoàn tất 100%</Badge>
                    ) : (
                      <Badge tone="blue" className="flex items-center gap-1">
                        <RefreshCw className="size-3 animate-spin" /> Sếp đang soạn...
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-xs leading-relaxed max-h-[460px] overflow-y-auto whitespace-pre-wrap p-3 rounded-xl bg-black/40 border border-slate-800/80 font-sans text-slate-200">
                  {bossReport || <span className="text-slate-500 italic animate-pulse">Sếp đang viết báo cáo gửi bạn...</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SƠ ĐỒ CƠ CẤU CÔNG TY & QUẢN LÝ PHÒNG BAN (ORG CHART) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Sơ đồ Cơ cấu & Danh sách Phòng Ban Công ty</h3>
          </div>
          <Button size="xs" variant="primary" icon={Plus} onClick={openCreateWorker}>
            Thêm phòng ban mới
          </Button>
        </div>

        {/* THẺ SẾP TỔNG (MASTER BOT) */}
        <div className="relative rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-950/30 via-slate-900 to-indigo-950/30 p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">👔</span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-white text-base">{masterBot.name}</h4>
                  <Badge tone="amber" className="text-[10px] font-bold uppercase tracking-wider">
                    Sếp Tổng (CEO & Orchestrator)
                  </Badge>
                </div>
                <div className="text-xs text-amber-300/80 font-medium">{masterBot.role}</div>
                <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 max-w-xl">{masterBot.systemPrompt}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="mono text-xs text-slate-400 bg-black/40 px-2 py-1 rounded-lg border border-slate-800">
                Model: {masterBot.targetModel || 'auto'}
              </span>
              <Button size="xs" variant="secondary" icon={Pencil} onClick={openEditMaster}>
                Sửa Sếp
              </Button>
            </div>
          </div>
        </div>

        {/* DANH SÁCH PHÒNG BAN CÔNG NHÂN (WORKERS) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workers.map((w) => (
            <div
              key={w.id}
              className={cn(
                'glass rounded-2xl p-4 flex flex-col justify-between gap-3 border transition-all',
                w.enabled ? 'border-slate-700/80 hover:border-indigo-500/50' : 'border-slate-800/40 opacity-50 bg-black/40',
              )}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{w.avatar || '👷'}</span>
                    <div>
                      <h4 className="font-bold text-white text-xs">{w.name}</h4>
                      <span className="mono text-[10px] text-slate-500">#{w.id}</span>
                    </div>
                  </div>
                  <Toggle checked={w.enabled} onChange={() => void toggleWorker(w)} />
                </div>

                <div className="text-xs text-slate-300 font-medium">{w.role}</div>
                <div className="text-[11px] text-slate-400 line-clamp-3 bg-black/30 p-2 rounded-lg border border-slate-800">
                  {w.systemPrompt}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="mono text-[10px] text-indigo-300 font-semibold truncate max-w-[120px]">
                  {w.targetModel || 'auto'}
                </span>

                <div className="flex items-center gap-1">
                  <IconButton icon={Pencil} title="Chỉnh sửa" onClick={() => openEditWorker(w)} />
                  <IconButton icon={Trash2} title="Xóa" onClick={() => void deleteWorker(w)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL SỬA SẾP TỔNG */}
      <Modal open={editMasterOpen} title="Thiết lập Sếp Tổng (Master Bot)" onClose={() => setEditMasterOpen(false)}>
        <form onSubmit={saveMaster} className="space-y-3 text-sm">
          <Field label="Tên Sếp Tổng">
            <input
              className="input"
              required
              value={masterForm.name}
              onChange={(e) => setMasterForm({ ...masterForm, name: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chức danh & Vai trò">
              <input
                className="input"
                required
                value={masterForm.role}
                onChange={(e) => setMasterForm({ ...masterForm, role: e.target.value })}
              />
            </Field>
            <Field label="Model AI phụ trách">
              <Select value={masterForm.targetModel} onChange={(e) => setMasterForm({ ...masterForm, targetModel: e.target.value })}>
                <option value="auto">auto (Model mặc định của Gateway)</option>
                {models.filter((m) => !m.id.startsWith('agent/')).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="System Prompt Chỉ Đạo (Quy định tư duy lãnh đạo, bóc tách và tổng hợp)">
            <textarea
              className="input h-32 text-xs font-mono"
              required
              value={masterForm.systemPrompt}
              onChange={(e) => setMasterForm({ ...masterForm, systemPrompt: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditMasterOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" icon={Save}>
              Lưu Sếp Tổng
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL THÊM / SỬA PHÒNG BAN */}
      <Modal open={workerModalOpen} title={editingWorker ? `Sửa phòng ban: ${editingWorker.name}` : 'Thêm phòng ban mới'} onClose={() => setWorkerModalOpen(false)}>
        <form onSubmit={saveWorkerSubmit} className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Tên phòng ban">
                <input
                  className="input"
                  required
                  placeholder="vd: Kỹ sư Phần mềm"
                  value={workerForm.name}
                  onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Biểu tượng (Emoji)">
              <input
                className="input text-center text-lg"
                value={workerForm.avatar}
                onChange={(e) => setWorkerForm({ ...workerForm, avatar: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mã gọi (Slug)">
              <input
                className="input mono"
                placeholder="vd: dev, content"
                value={workerForm.id}
                disabled={Boolean(editingWorker)}
                onChange={(e) => setWorkerForm({ ...workerForm, id: e.target.value })}
              />
            </Field>
            <Field label="Model AI phân bổ">
              <Select value={workerForm.targetModel} onChange={(e) => setWorkerForm({ ...workerForm, targetModel: e.target.value })}>
                <option value="auto">auto (Tự động linh hoạt theo kết nối)</option>
                {models.filter((m) => !m.id.startsWith('agent/')).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Mô tả vai trò chuyên môn">
            <input
              className="input"
              required
              placeholder="vd: Phụ trách code, kiến trúc hệ thống, Linux shell..."
              value={workerForm.role}
              onChange={(e) => setWorkerForm({ ...workerForm, role: e.target.value })}
            />
          </Field>

          <Field label="System Prompt Chuyên Môn">
            <textarea
              className="input h-32 text-xs font-mono"
              required
              value={workerForm.systemPrompt}
              onChange={(e) => setWorkerForm({ ...workerForm, systemPrompt: e.target.value })}
              placeholder="Hướng dẫn cách tư duy, phong cách trả lời và nhiệm vụ cốt lõi..."
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setWorkerModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" icon={Save}>
              {editingWorker ? 'Cập nhật' : 'Thêm phòng ban'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL CHI TIẾT BÀI LÀM CỦA PHÒNG BAN */}
      <Modal
        open={Boolean(selectedWorkerDetail)}
        title={selectedWorkerDetail ? `Chi tiết bài làm: ${selectedWorkerDetail.avatar} ${selectedWorkerDetail.name}` : ''}
        onClose={() => setSelectedWorkerDetail(null)}
      >
        {selectedWorkerDetail && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Báo cáo thô nộp lên Sếp Tổng</span>
              <CopyButton value={selectedWorkerDetail.result} label="Chép nội dung" />
            </div>
            <div className="prose prose-invert max-w-none text-xs leading-relaxed max-h-[400px] overflow-y-auto whitespace-pre-wrap p-3 rounded-xl bg-black/50 border border-slate-800 font-sans text-slate-200">
              {selectedWorkerDetail.result}
            </div>
          </div>
        )}
      </Modal>
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

// ------------------------------------------------------------------ Quản lý Cấp phát API Keys (Developer Keys)

function getExpiryInfo(expiresAt: string | null): { label: string; tone: 'green' | 'amber' | 'red' | 'blue'; isExpired: boolean } {
  if (!expiresAt) return { label: 'Vĩnh viễn', tone: 'blue', isExpired: false };
  const target = new Date(expiresAt).getTime();
  const diff = target - Date.now();
  if (diff <= 0) {
    return { label: `Đã hết hạn (${new Date(expiresAt).toLocaleDateString('vi-VN')})`, tone: 'red', isExpired: true };
  }
  const days = Math.ceil(diff / 86_400_000);
  if (days <= 3) {
    return { label: `Còn ${days} ngày (${new Date(expiresAt).toLocaleDateString('vi-VN')})`, tone: 'amber', isExpired: false };
  }
  return { label: `Còn ${days} ngày (${new Date(expiresAt).toLocaleDateString('vi-VN')})`, tone: 'green', isExpired: false };
}

function ApiKeysTab({
  keys,
  reloadKeys,
  createModalOpen,
  setCreateModalOpen,
}: {
  keys: GatewayApiKeyView[];
  reloadKeys: () => void;
  createModalOpen: boolean;
  setCreateModalOpen: (open: boolean) => void;
}) {
  const { toast, confirm } = useFeedback();
  const { tunnel } = usePanel();
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Form state tạo key
  const [name, setName] = useState('');
  const [expiryOption, setExpiryOption] = useState<'never' | '7' | '30' | '60' | '90' | 'custom'>('never');
  const [customDate, setCustomDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const base = `${tunnel?.status === 'online' && tunnel.url ? tunnel.url : window.location.origin}/zen/v1`;
  const dockerBase = 'http://host.docker.internal:8000/zen/v1';

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let expiresInDays: number | null = null;
      let customExpiresAt: string | null = null;

      if (expiryOption === 'custom') {
        if (!customDate) {
          toast('Vui lòng chọn ngày hết hạn tùy chọn', 'error');
          setSubmitting(false);
          return;
        }
        customExpiresAt = new Date(customDate).toISOString();
      } else if (expiryOption !== 'never') {
        expiresInDays = parseInt(expiryOption, 10);
      }

      const res = await post<{ key: string; info: GatewayApiKeyView }>('/api/ai/gateway/keys', {
        name: name.trim() || undefined,
        expiresInDays,
        customExpiresAt,
      });

      // Mở modal hiển thị secret key (chỉ hiện 1 lần)
      setCreatedSecret(res.key);
      setCreateModalOpen(false);
      setName('');
      setExpiryOption('never');
      setCustomDate('');
      reloadKeys();
      toast('Đã tạo API Key thành công!', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
    } catch {
      const area = document.createElement('textarea');
      area.value = secret;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopiedKey(true);
    toast('Đã sao chép API Key vào clipboard!', 'success');
    setTimeout(() => setCopiedKey(false), 3000);
  };

  const handleToggle = async (key: GatewayApiKeyView) => {
    try {
      await put(`/api/ai/gateway/keys/${key.id}`, { enabled: !key.enabled });
      reloadKeys();
      toast(key.enabled ? `Đã tạm dừng API Key "${key.name}"` : `Đã kích hoạt API Key "${key.name}"`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleDelete = (key: GatewayApiKeyView) => {
    if (key.id === 'key_default') {
      toast('Khóa mặc định (Default Gateway Key) không thể xoá!', 'error');
      return;
    }
    void confirm({
      title: 'Xóa & Thu hồi API Key',
      message: `Bạn có chắc chắn muốn thu hồi API Key "${key.name}"?\nMọi ứng dụng (n8n, Dify, Bot AI...) đang dùng key này sẽ bị ngắt kết nối ngay lập tức!`,
      danger: true,
      confirmLabel: 'Thu hồi key',
    }).then(async (yes) => {
      if (!yes) return;
      await del(`/api/ai/gateway/keys/${key.id}`);
      reloadKeys();
      toast(`Đã thu hồi API Key "${key.name}"`, 'success');
    });
  };

  const activeKeysCount = keys.filter((k) => k.enabled && !getExpiryInfo(k.expiresAt).isExpired).length;

  return (
    <div className="space-y-4">
      {/* Banner & Nút Tạo Key */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/50 via-slate-900 to-purple-950/40 p-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-white">Quản lý Cấp phát API Keys</h3>
            <Badge tone="blue" className="text-xs">Format: tzp_live_*</Badge>
          </div>
          <p className="text-xs text-slate-300">
            Tạo và phân bổ API Key riêng biệt cho từng website, workflow n8n, AI Agent hoặc ứng dụng ngoài. Đặt hạn dùng và thu hồi bất kỳ lúc nào.
          </p>
        </div>
        <Button
          onClick={() => setCreateModalOpen(true)}
          icon={Plus}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-900/50"
        >
          Tạo API Key mới
        </Button>
      </div>

      {/* Thẻ thống kê */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Tổng số API Keys', String(keys.length), 'khóa đã được cấp'],
          ['Đang hoạt động', String(activeKeysCount), 'sẵn sàng xác thực'],
          ['Khóa vĩnh viễn', String(keys.filter((k) => !k.expiresAt).length), 'không hết hạn'],
          ['Khóa có thời hạn', String(keys.filter((k) => k.expiresAt).length), 'tự động hết hạn khi tới ngày'],
        ].map(([label, val, sub]) => (
          <div key={label} className="glass p-3.5">
            <div className="text-xs text-slate-400">{label}</div>
            <div className="mono text-lg font-black text-white mt-0.5">{val}</div>
            <div className="text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      {/* Bảng danh sách Keys */}
      <Card
        title={`Danh sách API Keys (${keys.length})`}
        icon={KeyRound}
        actions={
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" icon={RefreshCw} onClick={reloadKeys}>
              Làm mới
            </Button>
            <Button size="xs" icon={Plus} onClick={() => setCreateModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
              Tạo key mới
            </Button>
          </div>
        }
      >
        {keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Chưa có API Key nào"
            description="Tạo API Key đầu tiên để kết nối n8n, Dify, Flowise, hoặc AI Agent từ website ngoài vào ZenPanel."
            action={<Button icon={Plus} onClick={() => setCreateModalOpen(true)}>Tạo API Key mới</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={tr}>
                  <th className={th}>Tên Khóa</th>
                  <th className={th}>Mã Khóa (Secret)</th>
                  <th className={th}>Hạn sử dụng</th>
                  <th className={th}>Lần dùng cuối</th>
                  <th className={th}>Ngày tạo</th>
                  <th className={th}>Trạng thái</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {keys.map((k) => {
                  const expiry = getExpiryInfo(k.expiresAt);
                  return (
                    <tr key={k.id} className="hover:bg-slate-900/40 transition">
                      <td className={cn(td, 'font-semibold text-white')}>
                        <div className="flex items-center gap-2">
                          <span>{k.name}</span>
                          {k.id === 'key_default' && (
                            <Badge tone="blue" className="text-[10px]">Mặc định</Badge>
                          )}
                        </div>
                      </td>
                      <td className={td}>
                        <div className="mono flex items-center gap-1.5 text-slate-300 bg-black/40 px-2 py-1 rounded border border-slate-800 max-w-fit">
                          <span>{k.masked}</span>
                        </div>
                      </td>
                      <td className={td}>
                        <Badge tone={expiry.tone} className="text-[11px] font-medium">
                          {expiry.label}
                        </Badge>
                      </td>
                      <td className={cn(td, 'text-slate-400')}>
                        {k.lastUsedAt ? formatRelative(k.lastUsedAt) : 'Chưa sử dụng'}
                      </td>
                      <td className={cn(td, 'text-slate-400')}>
                        {new Date(k.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className={td}>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <Toggle checked={k.enabled} onChange={() => void handleToggle(k)} />
                          <span className={k.enabled ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                            {k.enabled ? (expiry.isExpired ? 'Hết hạn' : 'Đang bật') : 'Đã tắt'}
                          </span>
                        </label>
                      </td>
                      <td className={cn(td, 'text-right')}>
                        {k.id === 'key_default' ? (
                          <div
                            className="inline-block"
                            data-tip="Khóa mặc định (Default Gateway Key) không thể xoá để đảm bảo hệ thống và các dịch vụ cốt lõi không bị mất kết nối"
                          >
                            <button
                              type="button"
                              disabled
                              className="inline-flex size-8 items-center justify-center rounded-lg text-slate-600 opacity-25 cursor-not-allowed transition"
                              aria-label="Khóa mặc định không thể xóa"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <IconButton
                            icon={Trash2}
                            className="text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(k)}
                            title="Thu hồi / Xóa API Key này"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Card Hướng dẫn tích hợp Endpoint AI Gateway */}
      <Card title="Hướng dẫn sử dụng Endpoint AI Gateway với API Key" icon={Route}>
        <div className="space-y-3 text-xs text-slate-300">
          <Notice tone="blue">
            Bất kỳ AI Agent nào (n8n, Flowise, Dify, AutoGPT, Chatbot website...) chỉ cần cấu hình 2 thông tin: <strong>Base URL</strong> và <strong>API Key</strong> là có thể sử dụng toàn bộ sức mạnh của các model và Sub-Agents trong ZenPanel.
          </Notice>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-2">
              <div className="font-bold text-white flex items-center justify-between">
                <span>1. Base URL (Public / Mạng ngoài / Cloud):</span>
                <CopyButton value={base} label="Sao chép" />
              </div>
              <div className="mono rounded bg-black/60 p-2 text-indigo-300 break-all select-all">
                {base}
              </div>
              <p className="text-[11px] text-slate-400">
                Dùng khi AI Agent hoặc website nằm ở máy tính khác, hoặc qua mạng Internet.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 space-y-2">
              <div className="font-bold text-emerald-300 flex items-center justify-between">
                <span>2. Base URL Docker Internal (n8n, Dify trên cùng VPS):</span>
                <CopyButton value={dockerBase} label="Sao chép" />
              </div>
              <div className="mono rounded bg-black/60 p-2 text-emerald-300 break-all select-all">
                {dockerBase}
              </div>
              <p className="text-[11px] text-slate-400">
                Khuyên dùng tối ưu tốc độ, kết nối trực tiếp trong mạng nội bộ Docker.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-black/60 p-3 space-y-2">
            <div className="font-bold text-white">Cách gọi API chuẩn OpenAI:</div>
            <pre className="mono overflow-x-auto text-emerald-300 text-[11px] leading-relaxed">
{`curl ${base}/chat/completions \\
  -H "Authorization: Bearer <API_KEY_CỦA_BẠN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Xin chào AI Agent!"}]
  }'`}
            </pre>
            <p className="text-[11px] text-slate-400">
              * Thay <code className="text-indigo-300">auto</code> bằng bất kỳ model nào: <code className="text-white">gemini/gemini-2.5-flash</code>, <code className="text-white">anthropic/claude-3-7-sonnet</code>, <code className="text-white">openai/gpt-4o</code> hoặc Sub-Agent <code className="text-purple-300">agent/tên_agent</code>.
            </p>
          </div>
        </div>
      </Card>

      {/* MODAL 1: TẠO API KEY MỚI */}
      <Modal
        open={createModalOpen}
        title="Tạo API Key Mới Cho ZenPanel AI Gateway"
        onClose={() => !submitting && setCreateModalOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <Notice tone="blue">
            Khóa API mới sẽ được tạo với định dạng chuẩn <code className="mono font-bold">tzp_live_...</code>. Bạn có thể chọn thời hạn tự động hết hạn cho khóa này.
          </Notice>

          <Field label="Tên API Key (Gợi nhớ mục đích sử dụng)">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: n8n Production Workflow, Dify Chatbot, Webhook CSKH..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              autoFocus
            />
          </Field>

          <div className="space-y-2">
            <label className="font-semibold text-slate-200">Thời hạn sử dụng (Expiration)</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { id: 'never', label: 'Vĩnh viễn', sub: 'Không bao giờ hết hạn' },
                { id: '7', label: '7 ngày', sub: 'Thử nghiệm ngắn hạn' },
                { id: '30', label: '30 ngày', sub: 'Khuyên dùng' },
                { id: '60', label: '60 ngày', sub: '2 tháng' },
                { id: '90', label: '90 ngày', sub: '3 tháng' },
                { id: 'custom', label: 'Tùy chỉnh...', sub: 'Chọn ngày cụ thể' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExpiryOption(opt.id as typeof expiryOption)}
                  className={cn(
                    'flex flex-col items-start p-2.5 rounded-xl border text-left transition cursor-pointer',
                    expiryOption === opt.id
                      ? 'border-indigo-500 bg-indigo-950/60 ring-2 ring-indigo-500/30'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-400'
                  )}
                >
                  <span className={cn('font-bold text-xs', expiryOption === opt.id ? 'text-white' : 'text-slate-300')}>
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{opt.sub}</span>
                </button>
              ))}
            </div>

            {expiryOption === 'custom' && (
              <div className="mt-2.5 space-y-1">
                <label className="text-[11px] text-slate-400">Chọn ngày hết hạn:</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" icon={Plus} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">
              {submitting ? 'Đang tạo...' : 'Tạo API Key'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: HIỂN THỊ SECRET KEY MỚI (CHỈ HIỆN 1 LẦN DUY NHẤT) */}
      <Modal
        open={Boolean(createdSecret)}
        title="🎉 API Key Đã Được Tạo Thành Công!"
        onClose={() => setCreatedSecret(null)}
      >
        <div className="space-y-4 text-xs">
          {/* Cảnh báo bảo mật quan trọng */}
          <div className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-3.5 space-y-1.5 text-amber-200">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
              <span>⚠️ LƯU Ý BẢO MẬT: CHỈ HIỂN THỊ 1 LẦN DUY NHẤT</span>
            </div>
            <p className="text-xs leading-relaxed text-amber-200/90">
              Vì lý do an toàn bảo mật, bạn chỉ có thể <strong>xem và sao chép mã khóa này MỘT LẦN DUY NHẤT</strong> tại đây. Sau khi đóng cửa sổ này, hệ thống sẽ tự động che giấu mã khóa và bạn sẽ không thể xem lại được nữa!
            </p>
          </div>

          {/* Ô Secret Key to rõ */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-200 text-xs">Mã API Key bí mật của bạn:</label>
            <div className="relative rounded-2xl border-2 border-indigo-500/70 bg-black/90 p-3.5 shadow-2xl space-y-3">
              <div className="mono break-all text-xs sm:text-sm font-bold text-emerald-300 select-all leading-relaxed p-1">
                {createdSecret}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => createdSecret && void handleCopySecret(createdSecret)}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition cursor-pointer',
                    copiedKey
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50'
                  )}
                >
                  {copiedKey ? <Check className="size-4" /> : <Copy className="size-4" />}
                  <span>{copiedKey ? 'Đã sao chép vào Clipboard!' : 'Sao chép API Key'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Cách sử dụng nhanh */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5 text-slate-300">
            <div className="font-semibold text-white">Cách cấu hình vào n8n, Flowise, Dify hoặc SDK:</div>
            <div className="text-[11px] space-y-1 text-slate-400">
              <div>• <strong>Base URL:</strong> <code className="text-indigo-300">{base}</code></div>
              <div>• <strong>API Key:</strong> <code className="text-emerald-300">{createdSecret ? `${createdSecret.slice(0, 18)}...` : ''}</code></div>
              <div>• <strong>Authorization Header:</strong> <code className="text-indigo-300">Bearer {createdSecret ? `${createdSecret.slice(0, 18)}...` : ''}</code></div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              onClick={() => setCreatedSecret(null)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg"
            >
              Tôi đã sao chép và lưu khóa an toàn (Hoàn tất)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ Tổng quan

function OverviewTab({
  gateway,
  saveGateway,
  providers,
  keys,
  onOpenCreateKey,
  onSwitchToKeysTab,
}: {
  gateway: GatewaySettings;
  saveGateway: (patch: Partial<GatewaySettings>, msg: string) => Promise<void>;
  providers: AiProvider[];
  keys: GatewayApiKeyView[];
  onOpenCreateKey: () => void;
  onSwitchToKeysTab: () => void;
}) {
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
    curl: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer <API_KEY_CỦA_BẠN>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Xin chào"}]}'`,
    python: `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="<API_KEY_CỦA_BẠN>")\nres = client.chat.completions.create(\n    model="${model}",\n    messages=[{"role": "user", "content": "Xin chào"}],\n)\nprint(res.choices[0].message.content)`,
    node: `import OpenAI from 'openai';\n\nconst client = new OpenAI({ baseURL: '${base}', apiKey: '<API_KEY_CỦA_BẠN>' });\nconst res = await client.chat.completions.create({\n  model: '${model}',\n  messages: [{ role: 'user', content: 'Xin chào' }],\n});\nconsole.log(res.choices[0].message.content);`,
    n8n: `=== CÁCH KẾT NỐI N8N VỚI ZENPANEL AI GATEWAY ===\n\n1. Tạo Credential trong n8n:\n   - Menu trái: Credentials → Add Credential → Chọn "OpenAI"\n   - API Key: Dán API Key bạn tạo tại tab "Cấp phát API Keys" (tzp_live_...)\n   - Base URL (trong Advanced/URL Options):\n     * Nếu n8n chạy Docker trên cùng VPS (Khuyên dùng):\n       ${dockerBase}\n     * Nếu n8n chạy ngoài hoặc qua Domain/Tunnel:\n       ${base}\n\n2. Kéo Node trong Workflow:\n   - Kéo node "AI Agent" (hoặc "Chat Model")\n   - Kéo node "OpenAI Chat Model" gắn vào cổng Model của AI Agent\n   - Chọn Credential OpenAI vừa tạo ở trên\n\n3. BẬT CUSTOM MODEL (Mấu chốt):\n   - Ô "Model" bấm biểu tượng chuyển sang "Custom" / "Expression"\n   - Gõ tên model bất kỳ:\n     • gemini/gemini-2.5-flash (siêu nhanh, rẻ)\n     • anthropic/claude-3-7-sonnet (thông minh nhất)\n     • openai/gpt-4o\n     • agent/coder (Sub-Agent của bạn)\n     • auto (ZenPanel tự động phân luồng)`,
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
          title="ZenPanel AI Gateway (Chuẩn giao thức OpenAI)"
          icon={Route}
          actions={
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <Toggle checked={gateway.enabled} onChange={(v) => void saveGateway({ enabled: v }, v ? 'Đã bật AI Gateway' : 'Đã tắt AI Gateway')} />
              {gateway.enabled ? 'Đang bật' : 'Đang tắt'}
            </label>
          }
        >
          <div className="space-y-3.5">
            {!gateway.enabled && <Notice tone="amber">Gateway đang tắt: endpoint trả lỗi 503. Bật công tắc ở góc trên để dùng từ app khác.</Notice>}

            {/* MỤC QUẢN LÝ CẤP PHÁT API KEYS CỦA ZENPANEL */}
            <div className="rounded-2xl border-2 border-indigo-500/50 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-950 p-4 shadow-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/30 text-lg ring-1 ring-indigo-400/40">
                    🔑
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-white">Quản lý Cấp phát API Keys (Gateway Keys)</h4>
                      <Badge tone="blue" className="text-[10px] font-bold uppercase tracking-wider">Format: tzp_live_*</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Cấp API Key riêng cho từng AI Agent, n8n, Flowise, Dify. Đặt hạn dùng và thu hồi linh hoạt.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="ghost" onClick={onSwitchToKeysTab} className="text-indigo-300 hover:text-white">
                    Quản lý tất cả ({keys.length}) →
                  </Button>
                  <Button size="xs" icon={Plus} onClick={onOpenCreateKey} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">
                    + Tạo API Key mới
                  </Button>
                </div>
              </div>

              {/* Danh sách rút gọn 2 key mới nhất */}
              <div className="space-y-1.5 pt-1">
                {keys.slice(0, 2).map((k) => {
                  const exp = getExpiryInfo(k.expiresAt);
                  return (
                    <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-black/60 p-2.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-white truncate">{k.name}</span>
                        <span className="mono text-[11px] text-slate-400">{k.masked}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={exp.tone} className="text-[10px]">{exp.label}</Badge>
                        <Badge tone={k.enabled ? 'green' : 'slate'} className="text-[10px]">
                          {k.enabled ? 'Đang bật' : 'Đã tắt'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-emerald-400 flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-3 py-2">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                <span>
                  <b>Muốn cấp key mới?</b> Bấm <b>[+ Tạo API Key mới]</b> để đặt tên, chọn hạn dùng (Vĩnh viễn hoặc theo ngày). Khóa bí mật chỉ hiện 1 lần duy nhất trên modal tạo để bạn sao chép an toàn!
                </span>
              </div>
            </div>

            {/* BASE URL PUBLIC */}
            <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3.5 py-2.5">
              <div className="text-xs text-slate-400 font-medium">Base URL (Public / Mạng ngoài / Truy cập từ xa)</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="mono min-w-0 flex-1 truncate text-slate-100 text-xs">{base}</span>
                <CopyButton value={base} label="Sao chép URL" />
              </div>
            </div>

            {/* BASE URL DOCKER INTERNAL */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 px-3.5 py-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Base URL nội bộ Docker (Dành cho n8n, Flowise, Open WebUI chạy cùng VPS)</span>
                <Badge tone="green" className="text-[10px]">Khuyên dùng</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="mono min-w-0 flex-1 truncate text-emerald-300 font-semibold text-xs">{dockerBase}</span>
                <CopyButton value={dockerBase} label="Sao chép Docker URL" />
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

type TabId = 'overview' | 'apikeys' | 'company' | 'subagents' | 'providers' | 'models' | 'playground' | 'routing' | 'activity';

export default function AiGateway() {
  const providers = useApi<AiProvider[]>('/api/ai/providers');
  const gatewayApi = useApi<GatewaySettings>('/api/ai/gateway');
  const keysApi = useApi<GatewayApiKeyView[]>('/api/ai/gateway/keys');
  const allModels = useApi<AiModel[]>('/api/ai/models');
  const subagents = useApi<SubAgent[]>('/api/ai/subagents');
  const [tab, setTab] = useState<TabId>('overview');
  const [tryModel, setTryModel] = useState('');
  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false);
  const { run } = useFeedback();

  const saveGateway = async (patch: Partial<GatewaySettings>, msg: string) => {
    const next = await run(() => put<GatewaySettings>('/api/ai/gateway', patch), msg);
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
        description="Cấp phát API Keys & 1 endpoint chuẩn OpenAI cho ChatGPT, Claude, Gemini, NVIDIA — tự định tuyến, chia Sub-Agents và AI Company"
        icon={Sparkles}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={Plus}
              onClick={() => {
                setTab('apikeys');
                setCreateKeyModalOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-900/40"
            >
              + Cấp API Key mới
            </Button>
            <Link to="/apps">
              <Button icon={Play} variant="ghost" size="sm">Cài AI Agent (App Store)</Button>
            </Link>
          </div>
        }
      />
      {!connected && (
        <div className="mb-4">
          <Notice icon={KeyRound}>
            Bắt đầu bằng cách kết nối API key ở tab <b>Nhà cung cấp</b>, rồi tạo <b>API Keys</b> để phân bổ cho các ứng dụng ngoài hoặc tạo <b>Sub-Agents</b> chuyên biệt.
          </Notice>
        </div>
      )}
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Tổng quan', icon: Route },
            { id: 'apikeys', label: '🔑 Cấp phát API Keys', icon: KeyRound, count: keysApi.data?.length },
            { id: 'company', label: '🏢 AI Company (Sếp & Công nhân)', icon: Building2 },
            { id: 'subagents', label: 'Sub AI Agents', icon: Bot, count: subagents.data?.length },
            { id: 'providers', label: 'Nhà cung cấp & Keys', icon: KeyRound, count: providers.data.filter((p) => p.configured).length },
            { id: 'models', label: 'Models', icon: Boxes, count: allModels.data?.length },
            { id: 'playground', label: 'Playground', icon: MessageSquare },
            { id: 'routing', label: 'Định tuyến', icon: ListOrdered },
            { id: 'activity', label: 'Nhật ký & Logs', icon: Activity },
          ]}
        />
      </div>
      {tab === 'overview' && (
        <OverviewTab
          gateway={gateway}
          saveGateway={saveGateway}
          providers={providers.data}
          keys={keysApi.data ?? []}
          onOpenCreateKey={() => {
            setTab('apikeys');
            setCreateKeyModalOpen(true);
          }}
          onSwitchToKeysTab={() => setTab('apikeys')}
        />
      )}
      {tab === 'apikeys' && (
        <ApiKeysTab
          keys={keysApi.data ?? []}
          reloadKeys={keysApi.reload}
          createModalOpen={createKeyModalOpen}
          setCreateModalOpen={setCreateKeyModalOpen}
        />
      )}
      {tab === 'company' && <CompanyTab models={allModels.data ?? []} providers={providers.data} />}
      {tab === 'subagents' && (
        <SubAgentsTab
          models={allModels.data ?? []}
          onTry={(m) => {
            setTryModel(m);
            setTab('playground');
          }}
        />
      )}
      {tab === 'providers' && (
        <ProvidersTab
          providers={providers.data}
          setProviders={setProviders}
          gateway={gateway}
          onGoOverview={() => setTab('overview')}
        />
      )}
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

