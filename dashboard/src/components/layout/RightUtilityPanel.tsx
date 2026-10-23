// ZenPanel - Kho tính năng & Panel tiện ích bên phải (Right Utility Panel & Feature Store)
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Globe,
  HeartPulse,
  KeyRound,
  Lock,
  Pin,
  PinOff,
  Radio,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { post } from '../../lib/api';
import { formatBytes, formatPercent } from '../../lib/format';
import { useLocalStorage } from '../../lib/hooks';
import { usePanel } from '../../lib/panel';
import { useFeedback } from '../feedback';
import { CopyButton, cn } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenDoctor: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}

export function RightUtilityPanel({ open, onClose, onOpenDoctor, pinned, onTogglePin }: Props) {
  const [tab, setTab] = useState<'tools' | 'pulse' | 'scratchpad'>('tools');
  const { latest, info } = usePanel();
  const { toast } = useFeedback();

  // Tool 1: Xả RAM
  const [purgingRam, setPurgingRam] = useState(false);
  const handlePurgeRam = async () => {
    setPurgingRam(true);
    try {
      const res = await post<{ ok: boolean; message: string }>('/api/system/tools/purge-ram');
      toast(res.message || 'Đã giải phóng bộ nhớ đệm RAM thành công!', 'success');
    } catch (e: any) {
      toast(e.message || 'Không thể xả RAM', 'error');
    } finally {
      setPurgingRam(false);
    }
  };

  // Tool 2: Check Port
  const [portHost, setPortHost] = useState('127.0.0.1');
  const [portNumber, setPortNumber] = useState('80');
  const [portChecking, setPortChecking] = useState(false);
  const [portResult, setPortResult] = useState<{ open: boolean; latencyMs: number; error?: string } | null>(null);

  const handleCheckPort = async () => {
    const port = Number(portNumber);
    if (!port || port < 1 || port > 65535) {
      toast('Cổng không hợp lệ (1 - 65535)', 'error');
      return;
    }
    setPortChecking(true);
    setPortResult(null);
    try {
      const res = await post<{ open: boolean; latencyMs: number; error?: string }>('/api/system/tools/check-port', {
        host: portHost.trim(),
        port,
      });
      setPortResult(res);
    } catch (e: any) {
      setPortResult({ open: false, latencyMs: 0, error: e.message });
    } finally {
      setPortChecking(false);
    }
  };

  // Tool 3: DNS Lookup
  const [dnsDomain, setDnsDomain] = useState('google.com');
  const [dnsChecking, setDnsChecking] = useState(false);
  const [dnsResult, setDnsResult] = useState<{ records: Array<{ type: string; value: string }>; latencyMs: number } | null>(null);

  const handleLookupDns = async () => {
    if (!dnsDomain.trim()) return;
    setDnsChecking(true);
    setDnsResult(null);
    try {
      const res = await post<{ records: Array<{ type: string; value: string }>; latencyMs: number }>('/api/system/tools/dns-lookup', {
        domain: dnsDomain.trim(),
      });
      setDnsResult(res);
    } catch (e: any) {
      toast(e.message || 'Lỗi tra cứu DNS', 'error');
    } finally {
      setDnsChecking(false);
    }
  };

  // Tool 4: SSL Check
  const [sslDomain, setSslDomain] = useState('');
  const [sslChecking, setSslChecking] = useState(false);
  const [sslResult, setSslResult] = useState<{ valid: boolean; issuer: string; daysRemaining: number; validTo: string; error?: string } | null>(null);

  const handleCheckSsl = async () => {
    if (!sslDomain.trim()) return;
    setSslChecking(true);
    setSslResult(null);
    try {
      const res = await post<{ valid: boolean; issuer: string; daysRemaining: number; validTo: string; error?: string }>('/api/system/tools/ssl-check', {
        domain: sslDomain.trim(),
      });
      setSslResult(res);
    } catch (e: any) {
      setSslResult({ valid: false, issuer: 'Lỗi', daysRemaining: 0, validTo: '', error: e.message });
    } finally {
      setSslChecking(false);
    }
  };

  // Tool 5: Sinh Password / Token
  const [pwdLength, setPwdLength] = useState(20);
  const [pwdType, setPwdType] = useState<'strong' | 'hex' | 'base64'>('strong');
  const [generatedSecret, setGeneratedSecret] = useState('');

  const generateSecret = () => {
    let result = '';
    if (pwdType === 'strong') {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><,./-=';
      for (let i = 0; i < pwdLength; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } else if (pwdType === 'hex') {
      const chars = '0123456789abcdef';
      for (let i = 0; i < pwdLength * 2; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } else {
      const bytes = new Uint8Array(pwdLength);
      crypto.getRandomValues(bytes);
      result = btoa(String.fromCharCode(...bytes)).substring(0, pwdLength);
    }
    setGeneratedSecret(result);
  };

  useEffect(() => {
    generateSecret();
  }, [pwdLength, pwdType]);

  // Tool 6: Cron Expression Explainer
  const [cronInput, setCronInput] = useState('*/15 * * * *');
  const cronHuman = useMemo(() => {
    const parts = cronInput.trim().split(/\s+/);
    if (parts.length < 5) return 'Cần đủ 5 trường: [Phút] [Giờ] [Ngày] [Tháng] [Thứ]';
    const [min, hour, dom, mon, dow] = parts;
    if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Chạy liên tục mỗi phút';
    if (min.startsWith('*/')) return `Chạy mỗi ${min.slice(2)} phút`;
    if (hour.startsWith('*/') && min === '0') return `Chạy mỗi ${hour.slice(2)} giờ một lần`;
    if (hour !== '*' && min !== '*' && dom === '*' && mon === '*' && dow === '*') return `Chạy hàng ngày vào lúc ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    if (dow !== '*' && hour !== '*' && min !== '*') return `Chạy vào thứ ${dow} hàng tuần lúc ${hour}:${min}`;
    return `Cú pháp hợp lệ: Phút ${min}, Giờ ${hour}, Ngày ${dom}, Tháng ${mon}, Thứ ${dow}`;
  }, [cronInput]);

  // Tab 3: Scratchpad
  const [scratchpadText, setScratchpadText] = useLocalStorage<string>('zenpanel.quicknotes', '');

  const memPct = latest ? (latest.memory.used / latest.memory.total) * 100 : 0;
  const disk = latest?.disks?.[0];
  const diskPct = disk ? (disk.used / disk.total) * 100 : 0;

  if (!open) return null;

  return (
    <>
      {/* Backdrop trên màn hình mobile / tablet khi panel mở */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity',
          pinned ? 'lg:hidden' : 'block',
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'flex flex-col border-l border-slate-800/80 bg-ink-950/95 backdrop-blur-2xl transition-all duration-300 z-50',
          pinned
            ? 'fixed inset-y-0 right-0 w-full sm:w-96 lg:relative lg:w-96 shrink-0 shadow-2xl lg:shadow-none'
            : 'fixed inset-y-0 right-0 w-full sm:w-96 shadow-2xl shadow-black/80',
        )}
      >
        {/* Panel Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-zen-blue to-purple-600 shadow-sm shadow-zen-blue/30">
              <Wrench className="size-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                Kho Tính Năng
                <span className="rounded bg-zen-blue/20 px-1.5 py-0.2 text-[10px] font-bold uppercase text-blue-300">
                  PRO
                </span>
              </div>
              <div className="text-[11px] text-slate-500">Tiện ích nhanh & Giám sát</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onTogglePin}
              className={cn(
                'hidden lg:flex rounded-lg p-1.5 transition',
                pinned ? 'bg-zen-blue/20 text-blue-300' : 'text-slate-400 hover:bg-slate-800 hover:text-white',
              )}
              data-tip={pinned ? 'Bỏ ghim (Dạng Drawer)' : 'Ghim cố định (Docked)'}
              aria-label="Ghim panel"
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              data-tip="Đóng panel"
              aria-label="Đóng panel"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-slate-800/80 bg-ink-900/40 p-1 text-xs">
        <button
          onClick={() => setTab('tools')}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition',
            tab === 'tools'
              ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/60'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Sparkles className="size-3.5 text-amber-400" />
          Tiện ích
        </button>
        <button
          onClick={() => setTab('pulse')}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition',
            tab === 'pulse'
              ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/60'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Activity className="size-3.5 text-emerald-400" />
          Chỉ số
        </button>
        <button
          onClick={() => setTab('scratchpad')}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition',
            tab === 'scratchpad'
              ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/60'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Terminal className="size-3.5 text-blue-400" />
          Ghi chú
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-200">
        {tab === 'tools' && (
          <div className="space-y-4">
            {/* Quick 1-Click Actions Banner */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePurgeRam}
                disabled={purgingRam}
                className="flex flex-col items-start gap-1 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-left transition hover:bg-purple-500/20 disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                  <Flame className={cn('size-4', purgingRam && 'animate-spin text-purple-400')} />
                  Xả RAM Đệm
                </div>
                <span className="text-[11px] text-slate-400">Hạ RAM đệm Linux</span>
              </button>

              <button
                onClick={onOpenDoctor}
                className="flex flex-col items-start gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left transition hover:bg-emerald-500/20"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <HeartPulse className="size-4 text-emerald-400" />
                  Bác Sĩ VPS
                </div>
                <span className="text-[11px] text-slate-400">Swap, BBR & Mạng</span>
              </button>
            </div>

            {/* Tool: Port Reachability */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Radio className="size-3.5 text-zen-blue" />
                Kiểm Tra Cổng (Port Checker)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={portHost}
                  onChange={(e) => setPortHost(e.target.value)}
                  placeholder="Host / IP (127.0.0.1)"
                  className="input min-w-0 flex-1 text-xs py-1.5"
                />
                <input
                  type="number"
                  value={portNumber}
                  onChange={(e) => setPortNumber(e.target.value)}
                  placeholder="Port (80)"
                  className="input w-20 text-xs py-1.5"
                />
                <button
                  onClick={handleCheckPort}
                  disabled={portChecking}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 shrink-0"
                >
                  {portChecking ? '...' : 'Check'}
                </button>
              </div>

              {portResult && (
                <div
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium',
                    portResult.open
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {portResult.open ? <CheckCircle2 className="size-3.5" /> : <X className="size-3.5" />}
                    {portResult.open ? 'Cổng đang MỞ (Open)' : `ĐÓNG: ${portResult.error || 'Từ chối kết nối'}`}
                  </span>
                  {portResult.open && <span className="mono text-[11px]">{portResult.latencyMs} ms</span>}
                </div>
              )}
            </div>

            {/* Tool: DNS Lookup */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Globe className="size-3.5 text-zen-green" />
                Phân Giải Tên Miền (DNS Lookup)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dnsDomain}
                  onChange={(e) => setDnsDomain(e.target.value)}
                  placeholder="Tên miền (domain.com)"
                  className="input min-w-0 flex-1 text-xs py-1.5"
                />
                <button
                  onClick={handleLookupDns}
                  disabled={dnsChecking}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600 disabled:opacity-50 shrink-0"
                >
                  {dnsChecking ? '...' : 'Lookup'}
                </button>
              </div>

              {dnsResult && (
                <div className="space-y-1 rounded-lg bg-ink-950 p-2 text-xs">
                  <div className="text-[11px] text-slate-400">Độ trễ: {dnsResult.latencyMs} ms</div>
                  {dnsResult.records.length > 0 ? (
                    dnsResult.records.map((r, i) => (
                      <div key={i} className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-blue-300 font-bold">{r.type}</span>
                        <span className="text-slate-300">{r.value}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500 text-[11px]">Không tìm thấy bản ghi nào</div>
                  )}
                </div>
              )}
            </div>

            {/* Tool: SSL Checker */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Lock className="size-3.5 text-amber-400" />
                Kiểm Tra Chứng Chỉ SSL
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sslDomain}
                  onChange={(e) => setSslDomain(e.target.value)}
                  placeholder="Tên miền (vd google.com)"
                  className="input min-w-0 flex-1 text-xs py-1.5"
                />
                <button
                  onClick={handleCheckSsl}
                  disabled={sslChecking}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600 disabled:opacity-50 shrink-0"
                >
                  {sslChecking ? '...' : 'Kiểm tra'}
                </button>
              </div>

              {sslResult && (
                <div
                  className={cn(
                    'rounded-lg p-2.5 text-xs space-y-1',
                    sslResult.valid
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-rose-500/10 border border-rose-500/30',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Cấp bởi: {sslResult.issuer}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        sslResult.valid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300',
                      )}
                    >
                      {sslResult.valid ? `Còn ${sslResult.daysRemaining} ngày` : 'Hết hạn'}
                    </span>
                  </div>
                  {sslResult.validTo && <div className="text-[11px] text-slate-400">Hết hạn: {sslResult.validTo}</div>}
                  {sslResult.error && <div className="text-[11px] text-rose-400">{sslResult.error}</div>}
                </div>
              )}
            </div>

            {/* Tool: Generator Secret / Password */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <KeyRound className="size-3.5 text-purple-400" />
                  Sinh Mật Khẩu & API Key
                </div>
                <button
                  onClick={generateSecret}
                  className="text-[11px] font-semibold text-blue-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="size-3" /> Đổi mới
                </button>
              </div>

              <div className="flex gap-2 text-xs">
                <select
                  value={pwdType}
                  onChange={(e: any) => setPwdType(e.target.value)}
                  className="input py-1 text-xs w-28"
                >
                  <option value="strong">Mật khẩu</option>
                  <option value="hex">HEX Key</option>
                  <option value="base64">Base64</option>
                </select>
                <select
                  value={pwdLength}
                  onChange={(e) => setPwdLength(Number(e.target.value))}
                  className="input py-1 text-xs w-24"
                >
                  <option value="16">16 ký tự</option>
                  <option value="24">24 ký tự</option>
                  <option value="32">32 ký tự</option>
                  <option value="48">48 ký tự</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-ink-950 p-2 border border-slate-800">
                <span className="mono text-xs text-amber-300 truncate max-w-[220px]">{generatedSecret}</span>
                <CopyButton value={generatedSecret} />
              </div>
            </div>

            {/* Tool: Cron Expression */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Clock className="size-3.5 text-blue-400" />
                Giải Thích Cú Pháp Cron
              </div>
              <input
                type="text"
                value={cronInput}
                onChange={(e) => setCronInput(e.target.value)}
                placeholder="*/15 * * * *"
                className="input text-xs py-1.5 font-mono"
              />
              <div className="rounded-lg bg-ink-950 p-2 text-[11px] text-slate-300 leading-relaxed border border-slate-800">
                💡 {cronHuman}
              </div>
            </div>
          </div>
        )}

        {tab === 'pulse' && (
          <div className="space-y-4">
            {/* Server Quick Stats */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3.5 text-zen-blue" />
                  Chỉ Số Máy Chủ Thực Tế
                </span>
                <span className="text-[11px] text-slate-400">{info?.os.hostname}</span>
              </div>

              {latest && (
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>CPU ({info?.os.cpuCores} nhân)</span>
                      <span className="font-semibold text-white">{formatPercent(latest.cpu.usage, 1)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', latest.cpu.usage > 80 ? 'bg-rose-500' : 'bg-zen-blue')}
                        style={{ width: `${Math.min(100, latest.cpu.usage)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>RAM ({formatBytes(latest.memory.used)} / {formatBytes(latest.memory.total)})</span>
                      <span className="font-semibold text-white">{formatPercent(memPct, 1)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', memPct > 85 ? 'bg-rose-500' : 'bg-purple-500')}
                        style={{ width: `${Math.min(100, memPct)}%` }}
                      />
                    </div>
                  </div>

                  {disk && (
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Ổ đĩa ({disk.mount} - {formatBytes(disk.used)} / {formatBytes(disk.total)})</span>
                        <span className="font-semibold text-white">{formatPercent(diskPct, 1)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', diskPct > 85 ? 'bg-rose-500' : 'bg-emerald-500')}
                          style={{ width: `${Math.min(100, diskPct)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions List */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3.5 space-y-2">
              <div className="text-xs font-bold text-white mb-2">Truy Cập Tiện Ích Độc Quyền</div>
              <a
                href="/ai"
                className="flex items-center justify-between rounded-lg bg-ink-950 p-2.5 text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-purple-400" />
                  AI Gateway Đa Model
                </span>
                <ChevronRight className="size-4 text-slate-500" />
              </a>

              <a
                href="/api-tester"
                className="flex items-center justify-between rounded-lg bg-ink-950 p-2.5 text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                <span className="flex items-center gap-2">
                  <Radio className="size-4 text-blue-400" />
                  API Tester Postman
                </span>
                <ChevronRight className="size-4 text-slate-500" />
              </a>

              <a
                href="/cleanup"
                className="flex items-center justify-between rounded-lg bg-ink-950 p-2.5 text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="size-4 text-amber-400" />
                  Dọn Dẹp & Hạ Tải CPU
                </span>
                <ChevronRight className="size-4 text-slate-500" />
              </a>
            </div>
          </div>
        )}

        {tab === 'scratchpad' && (
          <div className="space-y-4">
            {/* Scratchpad Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Terminal className="size-3.5 text-zen-blue" />
                  Ghi Chú Nhanh (Auto-save)
                </span>
                <span className="text-[10px] text-slate-500">Lưu trực tiếp trên máy</span>
              </div>
              <textarea
                value={scratchpadText}
                onChange={(e) => setScratchpadText(e.target.value)}
                placeholder="Dán tạm mật khẩu, lệnh SSH, token API, cấu hình .env tại đây..."
                rows={9}
                className="w-full rounded-xl border border-slate-700/60 bg-ink-950 p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-zen-blue focus:outline-none"
              />
            </div>

            {/* Quick Linux Cheatsheet */}
            <div className="rounded-xl border border-slate-700/60 bg-ink-900/60 p-3 space-y-2">
              <div className="text-xs font-bold text-white">Lệnh SSH Thường Dùng (1-Click Copy)</div>
              {[
                { label: 'Top 10 file/thư mục nặng nhất', cmd: 'du -ahx / 2>/dev/null | sort -rh | head -10' },
                { label: 'Phân quyền chuẩn Web (755/644)', cmd: 'find . -type d -exec chmod 755 {} \\;; find . -type f -exec chmod 644 {} \\;' },
                { label: 'Kiểm tra port đang lắng nghe', cmd: 'netstat -tulnp | grep LISTEN' },
                { label: 'Khởi động lại Docker Service', cmd: 'systemctl restart docker' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-ink-950 p-2 text-xs">
                  <div className="min-w-0 pr-2">
                    <div className="text-[11px] font-semibold text-slate-300">{item.label}</div>
                    <div className="mono text-[10px] text-slate-500 truncate">{item.cmd}</div>
                  </div>
                  <CopyButton value={item.cmd} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  </>
);
}
