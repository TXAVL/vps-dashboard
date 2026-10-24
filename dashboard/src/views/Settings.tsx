// ZenPanel - Cài đặt: tài khoản quản trị, Cloudflare Tunnel, thông tin agent
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Bot,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleCheck,
  CircleX,
  Cloud,
  Cog,
  Dices,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  GitBranch,
  Globe,
  History,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Package,
  Palette,
  PenLine,
  RefreshCw,
  Rocket,
  Save,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Terminal,
  Trash2,
  Cpu,
  Wrench,
  RotateCcw,
} from 'lucide-react';
import { PanelUpdateModal, type UpdateTarget } from '../components/modals/PanelUpdateModal';
import { ToolUpgradeModal } from '../components/modals/ToolUpgradeModal';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Notice, PageHeader, Select, Spinner, StatusDot, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, post, setToken, logout } from '../lib/api';
import { formatBytes, formatDate, formatDuration, formatRate, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import { PASSWORD_RULES, RANDOM_DEFAULT_LENGTH, RANDOM_MAX_LENGTH, RANDOM_MIN_LENGTH } from '../lib/password';
import type { Job, LoginRecord, NetworkInfo, NodeStatusResponse, PanelPrefs, RemoteVersion, SystemToolItem, SystemToolsStatusResponse, UserSessionView, VersionPackage } from '../lib/types';

type Mode = 'random' | 'custom';

function AccountCard() {
  const me = useApi<{ username: string }>('/api/auth/me');
  const [mode, setMode] = useState<Mode>('random');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [length, setLength] = useState(RANDOM_DEFAULT_LENGTH);
  const [saving, setSaving] = useState(false);
  const { run, confirm } = useFeedback();

  const checks = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.newPassword) }));
  const matches = form.confirm.length > 0 && form.confirm === form.newPassword;
  const passed = checks.filter((c) => c.ok).length;
  const strong = passed === checks.length;
  const ready = Boolean(form.currentPassword) && (mode === 'random' || (strong && matches));
  const meter = ['bg-zen-red', 'bg-zen-red', 'bg-zen-amber', 'bg-zen-amber', 'bg-zen-amber', 'bg-zen-blue', 'bg-zen-blue', 'bg-zen-green'][passed];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    if (mode === 'random') {
      const ok = await confirm({
        title: 'Sinh mật khẩu ngẫu nhiên',
        message: `ZenPanel sẽ tạo mật khẩu ngẫu nhiên ${length} ký tự (đủ chữ hoa, chữ thường, số, ký tự đặc biệt) và chỉ hiển thị 1 lần. Các phiên đăng nhập khác sẽ bị đăng xuất.`,
        confirmLabel: 'Sinh mật khẩu',
      });
      if (!ok) return;
    }
    setSaving(true);
    const result = await run(
      () =>
        post<{ token: string; password?: string }>('/api/auth/password', {
          mode,
          length: mode === 'random' ? length : undefined,
          currentPassword: form.currentPassword,
          newPassword: mode === 'custom' ? form.newPassword : undefined,
        }),
      'Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.',
    );
    setSaving(false);
    if (result) {
      setToken(result.token);
      setGenerated(result.password ?? null);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    }
  };

  return (
    <Card title="Tài khoản quản trị" icon={KeyRound}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tên đăng nhập" hint="Tài khoản admin cố định, không thể đổi tên">
          <div className="relative">
            <input className="input mono pr-9 text-slate-400" value={me.data?.username ?? 'admin'} readOnly disabled />
            <Lock className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          </div>
        </Field>
        <Field label="Mật khẩu hiện tại">
          <input className="input" type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'random', icon: Dices, title: 'Sinh ngẫu nhiên', desc: `Chọn độ dài ${RANDOM_MIN_LENGTH}-${RANDOM_MAX_LENGTH} ký tự` },
              { id: 'custom', icon: PenLine, title: 'Tự đặt', desc: 'Phải đạt đủ tiêu chí' },
            ] as const
          ).map(({ id, icon: Icon, title, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                mode === id ? 'border-zen-blue/70 bg-zen-blue/10 ring-2 ring-zen-blue/20' : 'border-slate-700/50 bg-ink-950/50 hover:border-slate-600',
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', mode === id ? 'text-blue-300' : 'text-slate-500')} />
              <span>
                <span className="block text-sm font-semibold text-slate-100">{title}</span>
                <span className="block text-xs text-slate-500">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        {mode === 'random' && (
          <div className="space-y-2 rounded-xl border border-slate-700/50 bg-ink-950/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-200">Độ dài mật khẩu</span>
              <span className="mono rounded-lg bg-zen-blue/15 px-2 py-0.5 font-bold text-blue-300">{length} ký tự</span>
            </div>
            <input
              type="range"
              min={RANDOM_MIN_LENGTH}
              max={RANDOM_MAX_LENGTH}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full accent-zen-blue"
              aria-label="Độ dài mật khẩu"
            />
            <div className="flex flex-wrap gap-1.5">
              {[8, 12, 16, 24, 32, 64].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLength(n)}
                  className={cn('mono rounded-lg px-2 py-1 text-xs font-semibold transition', length === n ? 'bg-zen-blue text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}
                >
                  {n}
                </button>
              ))}
            </div>
            {length < 12 && <p className="text-xs text-amber-300">Mật khẩu dưới 12 ký tự dễ bị dò hơn. Nên chọn từ 16 ký tự trở lên cho panel quản trị VPS.</p>}
          </div>
        )}

        {mode === 'custom' && (
          <div className="space-y-4">
            <Field label="Mật khẩu mới">
              <div className="relative">
                <input
                  className="input mono pr-10"
                  type={show ? 'text' : 'password'}
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className={cn('h-full rounded-full transition-all duration-300', meter)} style={{ width: `${(passed / checks.length) * 100}%` }} />
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {checks.map((c) => (
                <li key={c.id} className={cn('flex items-center gap-2 text-xs transition', c.ok ? 'text-emerald-300' : 'text-slate-500')}>
                  {c.ok ? <CircleCheck className="size-4 shrink-0" /> : <CircleX className="size-4 shrink-0" />}
                  {c.label}
                </li>
              ))}
            </ul>
            <Field label="Nhập lại mật khẩu mới">
              <input className="input mono" type={show ? 'text' : 'password'} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
            </Field>
            {form.confirm && (
              <p className={cn('flex items-center gap-2 text-xs', matches ? 'text-emerald-300' : 'text-red-300')}>
                {matches ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
                {matches ? 'Mật khẩu nhập lại khớp' : 'Mật khẩu nhập lại chưa khớp'}
              </p>
            )}
          </div>
        )}

        {generated && (
          <Notice tone="green">
            <div className="space-y-2">
              <div className="font-semibold text-emerald-200">Mật khẩu mới (chỉ hiển thị 1 lần — hãy lưu lại):</div>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-ink-950/70 px-3 py-2">
                <code className="mono break-all text-white">{generated}</code>
                <CopyButton value={generated} />
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={() => setGenerated(null)}>
                Đã lưu, ẩn đi
              </Button>
            </div>
          </Notice>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" icon={LogOut} onClick={() => void logout()}>
            Đăng xuất
          </Button>
          <Button type="submit" variant="primary" icon={mode === 'random' ? Dices : Save} loading={saving} disabled={!ready}>
            {mode === 'random' ? 'Sinh mật khẩu mới' : 'Lưu mật khẩu'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const THEMES: { id: PanelPrefs['theme']; label: string; color: string }[] = [
  { id: 'zen', label: 'Zen Blue', color: '#3b82f6' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
  { id: 'rose', label: 'Rose', color: '#f43f5e' },
];

const BASES: { id: PanelPrefs['base']; label: string; colors: [string, string] }[] = [
  { id: 'slate', label: 'Dark Slate', colors: ['#0b0f19', '#1e293b'] },
  { id: 'navy', label: 'Midnight Navy', colors: ['#060b1f', '#16224a'] },
  { id: 'oled', label: 'OLED Black', colors: ['#000000', '#171717'] },
];

const UPDATE_INTERVALS: [number, string][] = [
  [15, '15 phút'],
  [30, '30 phút'],
  [60, '1 giờ'],
  [120, '2 giờ'],
  [180, '3 giờ'],
  [240, '4 giờ'],
  [360, '6 giờ'],
  [480, '8 giờ'],
  [720, '12 giờ'],
  [1440, '1 ngày'],
  [2880, '2 ngày'],
  [4320, '3 ngày'],
  [10080, '1 tuần'],
  [20160, '2 tuần'],
  [43200, '1 tháng'],
];

function AppearanceCard() {
  const { prefs, savePrefs, latest } = usePanel();
  const { run } = useFeedback();
  const save = (patch: Partial<PanelPrefs>, message: string) => void run(() => savePrefs(patch), message);
  const sample = latest?.network.rxRate ?? 1_572_864;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Màu nhấn" icon={Palette}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => save({ theme: t.id }, `Đã đổi màu nhấn: ${t.label}`)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold transition',
                prefs.theme === t.id ? 'border-zen-blue/70 bg-zen-blue/10 text-white ring-2 ring-zen-blue/20' : 'border-slate-700/50 bg-ink-950/50 text-slate-300 hover:border-slate-500',
              )}
            >
              <span className="size-6 shrink-0 rounded-lg shadow-lg" style={{ background: t.color, boxShadow: `0 0 16px ${t.color}66` }} />
              {t.label}
              {prefs.theme === t.id && <Check className="ml-auto size-4 text-blue-300" />}
            </button>
          ))}
        </div>
      </Card>
      <Card title="Màu nền" icon={Moon}>
        <div className="grid gap-2 sm:grid-cols-3">
          {BASES.map((b) => (
            <button
              key={b.id}
              onClick={() => save({ base: b.id }, `Đã đổi nền: ${b.label}`)}
              className={cn(
                'overflow-hidden rounded-xl border text-left text-sm font-semibold transition',
                prefs.base === b.id ? 'border-zen-blue/70 ring-2 ring-zen-blue/20' : 'border-slate-700/50 hover:border-slate-500',
              )}
            >
              <div className="flex h-14 items-end gap-1.5 p-2" style={{ background: b.colors[0] }}>
                <div className="h-6 flex-1 rounded-md" style={{ background: b.colors[1] }} />
                <div className="h-9 flex-1 rounded-md" style={{ background: b.colors[1] }} />
              </div>
              <div className="flex items-center justify-between px-3 py-2 text-slate-200">
                {b.label}
                {prefs.base === b.id && <Check className="size-4 text-blue-300" />}
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Đơn vị tốc độ mạng" icon={Gauge} className="xl:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { id: 'bytes', title: 'Theo dung lượng (Byte/giây)', units: 'B/s · KB/s · MB/s · GB/s · TB/s', desc: 'Giống tốc độ tải file trên trình duyệt / IDM, dễ ước lượng thời gian tải (mặc định)' },
              { id: 'bits', title: 'Theo băng thông (bit/giây)', units: 'bps · Kbps · Mbps · Gbps · Tbps', desc: 'Giống thông số gói cước nhà mạng và băng thông VPS (vd cổng 1 Gbps)' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => save({ networkUnit: opt.id }, `Đơn vị mạng: ${opt.units}`)}
              className={cn(
                'rounded-xl border p-4 text-left transition',
                prefs.networkUnit === opt.id ? 'border-zen-blue/70 bg-zen-blue/10 ring-2 ring-zen-blue/20' : 'border-slate-700/50 bg-ink-950/50 hover:border-slate-500',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">
                  {opt.title}
                </span>
                {prefs.networkUnit === opt.id && <Check className="size-4 text-blue-300" />}
              </div>
              <div className="mono mt-1 text-xs text-blue-300">{opt.units}</div>
              <div className="mt-1 text-xs text-slate-500">{opt.desc}</div>
              <div className="mono mt-3 text-lg font-extrabold text-white">{formatRate(sample, opt.id)}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VpsCard() {
  const { prefs, savePrefs } = usePanel();
  const [form, setForm] = useState({
    vpsExpiry: prefs.vpsExpiry ?? '',
    vpsProvider: prefs.vpsProvider,
    vpsPrice: prefs.vpsPrice,
    vpsRenewUrl: prefs.vpsRenewUrl,
    expiryWarnDays: String(prefs.expiryWarnDays),
  });
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await run(
      () => savePrefs({ ...form, vpsExpiry: form.vpsExpiry || null, expiryWarnDays: Number(form.expiryWarnDays) }),
      'Đã lưu thông tin hạn VPS',
    );
    setSaving(false);
  };

  return (
    <Card title="Hạn sử dụng VPS" icon={CalendarClock}>
      <form onSubmit={submit} className="space-y-4">
        <Notice>
          Nhà cung cấp VPS không công khai ngày hết hạn cho hệ điều hành nên ZenPanel không tự đọc được. Hãy nhập theo hoá đơn: panel sẽ đếm ngược trên trang Tổng quan và
          hiện cảnh báo ở đầu trang trước khi hết hạn.
        </Notice>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ngày hết hạn">
            <input className="input mono" type="date" value={form.vpsExpiry} onChange={(e) => setForm({ ...form, vpsExpiry: e.target.value })} />
          </Field>
          <Field label="Cảnh báo trước (ngày)">
            <input className="input mono" type="number" min={1} max={90} value={form.expiryWarnDays} onChange={(e) => setForm({ ...form, expiryWarnDays: e.target.value })} />
          </Field>
          <Field label="Nhà cung cấp">
            <input className="input" value={form.vpsProvider} onChange={(e) => setForm({ ...form, vpsProvider: e.target.value })} placeholder="Vultr, DigitalOcean, Viettel IDC..." />
          </Field>
          <Field label="Chi phí">
            <input className="input" value={form.vpsPrice} onChange={(e) => setForm({ ...form, vpsPrice: e.target.value })} placeholder="200.000đ / tháng" />
          </Field>
        </div>
        <Field label="Link trang gia hạn">
          <input className="input mono" value={form.vpsRenewUrl} onChange={(e) => setForm({ ...form, vpsRenewUrl: e.target.value })} placeholder="https://..." />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => setForm({ ...form, vpsExpiry: '' })}>
            Xoá ngày hết hạn
          </Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving}>
            Lưu
          </Button>
        </div>
      </form>
    </Card>
  );
}

function NodeRuntimeCard() {
  const nodeApi = useApi<NodeStatusResponse>('/api/system/node');
  const [checking, setChecking] = useState(false);
  const [selectedVer, setSelectedVer] = useState('');
  const { toast } = useFeedback();

  const check = async () => {
    setChecking(true);
    try {
      const res = await post<NodeStatusResponse>('/api/system/node/check');
      if (res) nodeApi.setData(res);
      toast('Đã kiểm tra bảo mật Node.js từ nodejs.org', 'success');
    } catch (err: any) {
      toast(err?.message || 'Không thể kiểm tra Node.js', 'error');
    } finally {
      setChecking(false);
    }
  };

  const [upgrading, setUpgrading] = useState<string | null>(null);
  const upgradeNode = (ver?: string) => setUpgrading(ver || selectedVer || nodeApi.data?.latestLts?.version || 'lts');

  if (!nodeApi.data) return null;
  const data = nodeApi.data;
  const installed = data.installed;
  const targetLts = data.latestLts;
  const targetVer = selectedVer || targetLts?.version || '';

  return (
    <Card
      title="Runtime Node.js & Cảnh báo bảo mật (Node.js Security)"
      icon={Cpu}
      actions={
        <div className="flex items-center gap-2">
          <Button size="xs" variant="ghost" icon={RefreshCw} loading={checking} onClick={() => void check()}>
            Kiểm tra bảo mật
          </Button>
          <a
            href="https://nodejs.org/en/blog/vulnerability"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-blue-300 hover:underline flex items-center gap-1"
          >
            <span>Node.js Advisories</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      }
    >
      <div className="space-y-4">
        {/* BANNER THÔNG BÁO ĐÃ CÀI BẢN MỚI, CHỜ KHỞI ĐỘNG LẠI AGENT */}
        {installed.pendingRestart && (
          <div className="rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/40 p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/30 text-xl ring-1 ring-emerald-400/40">
                <CheckCircle2 className="size-6 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-extrabold text-white">
                    Đã cài đặt thành công Node.js {installed.systemVersion} trên hệ thống!
                  </h4>
                  <Badge tone="green" className="text-[10px]">Đã cài trên đĩa</Badge>
                  <Badge tone="amber" className="text-[10px]">Cần khởi động lại ZenPanel</Badge>
                </div>
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  Bản cài đặt mới đã được thiết lập vào hệ điều hành. Do tiến trình ZenPanel Agent hiện tại đang chạy runtime cũ ({installed.version}) trong bộ nhớ RAM, vui lòng khởi động lại dịch vụ ZenPanel (restart service / chạy lại script khởi động) để runtime mới có hiệu lực.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* BANNER CẢNH BÁO NẾU ĐANG CHẠY BẢN EOL / LỖI HỔNG (VÍ DỤ V21.10) */}
        {!installed.pendingRestart && installed.hasSecurityRisk ? (
          <div className="rounded-2xl border-2 border-red-500/50 bg-gradient-to-r from-red-950/70 via-slate-900 to-red-950/40 p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-600/30 text-xl ring-1 ring-red-400/40">
                <ShieldAlert className="size-6 text-red-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-extrabold text-white">
                    Cảnh báo bảo mật nghiêm trọng: Phiên bản Node.js {installed.version}
                  </h4>
                  {installed.isEol && (
                    <Badge tone="red" className="font-bold uppercase tracking-wider text-[10px]">
                      End-of-Life (Đã hết hạn hỗ trợ)
                    </Badge>
                  )}
                  {installed.isOddRelease && (
                    <Badge tone="amber" className="text-[10px]">
                      Bản thử nghiệm số lẻ
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-red-200/90 leading-relaxed">
                  {installed.isOddRelease
                    ? `Dòng Node.js ${installed.major}.x (như ${installed.version}) là bản thử nghiệm số lẻ đã chính thức kết thúc vòng đời (EOL). Bản này chứa các lỗ hổng bảo mật nghiêm trọng như HTTP Request Smuggling, Command Injection và rò rỉ bộ nhớ chưa được vá.`
                    : `Phiên bản Node.js ${installed.version} của máy chủ đã cũ hơn bản vá bảo mật mới nhất từ Node.js Foundation.`}
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Rocket}
                    onClick={() => void upgradeNode(targetLts?.version)}
                    className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold shadow-lg shadow-red-950/50"
                  >
                    Nâng cấp ngay lên {targetLts?.version || 'LTS mới nhất'} (Khuyên dùng)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <span>
                Node.js <b>{installed.version}</b> đang ở trạng thái ổn định và bảo mật.
              </span>
            </div>
            <Badge tone="green">An toàn</Badge>
          </div>
        )}

        {/* THÔNG TIN SO SÁNH PHIÊN BẢN */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 p-3.5 space-y-1">
            <div className="text-xs text-slate-400 font-medium">Phiên bản đang chạy</div>
            <div className="flex items-center gap-2">
              <span className="mono text-lg font-black text-white">{installed.version}</span>
              <Badge tone={installed.hasSecurityRisk ? 'red' : 'green'}>
                {installed.isEol ? 'Hết hạn (EOL)' : 'Đang dùng'}
              </Badge>
            </div>
            <div className="mono text-[11px] text-slate-500 truncate" title={installed.execPath}>
              {installed.platform} ({installed.arch}) • {installed.execPath}
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 space-y-1">
            <div className="text-xs text-indigo-300 font-medium">Bản Active LTS mới nhất</div>
            <div className="flex items-center gap-2">
              <span className="mono text-lg font-black text-emerald-300">
                {targetLts?.version || 'Đang tải...'}
              </span>
              {targetLts?.lts && (
                <Badge tone="blue" className="text-[10px]">
                  LTS {targetLts.lts}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              Phát hành: {targetLts?.date || '—'} {targetLts?.security && '• Có bản vá bảo mật'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="text-xs text-slate-400 font-medium">Nâng cấp phiên bản tùy chọn</div>
              <div className="text-[11px] text-slate-500">Chọn bản LTS mong muốn</div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={targetVer}
                onChange={(e) => setSelectedVer(e.target.value)}
                className="h-8 py-0 text-xs mono"
              >
                {data.availableLtsVersions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version} (LTS {v.lts})
                  </option>
                ))}
                {data.latestCurrent && (
                  <option value={data.latestCurrent.version}>
                    {data.latestCurrent.version} (Current mới nhất)
                  </option>
                )}
              </Select>
              <Button
                size="xs"
                variant="primary"
                icon={Rocket}
                disabled={targetVer === installed.version}
                onClick={() => void upgradeNode(targetVer)}
              >
                Cài
              </Button>
            </div>
          </div>
        </div>

        {/* DANH SÁCH LỖ HỔNG BẢO MẬT (SECURITY ADVISORIES TỪ BLOGS) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="size-4 text-amber-400" />
              <span>Các lỗ hổng bảo mật tiêu biểu cần khắc phục:</span>
            </div>
            <span className="text-[11px] font-normal text-slate-500">Nguồn: Node.js Security Team</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {data.securityAdvisories.map((adv) => (
              <div
                key={adv.cve}
                className="rounded-xl border border-slate-800 bg-black/40 p-3 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono font-bold text-indigo-300">{adv.cve}</span>
                  <Badge tone={adv.severity === 'critical' ? 'red' : adv.severity === 'high' ? 'amber' : 'slate'} className="uppercase text-[9px]">
                    {adv.severity}
                  </Badge>
                </div>
                <div className="font-semibold text-slate-200 line-clamp-1">{adv.title}</div>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{adv.description}</p>
                <div className="text-[10px] text-amber-300/80 pt-0.5 truncate">
                  💡 {adv.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CHANGELOG TÓM TẮT */}
        {data.changelogSummary && data.changelogSummary.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2 text-xs">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="size-4 text-indigo-400" />
              <span>Điểm mới & Bản sửa lỗi trên Node.js mới:</span>
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2 text-[11px] text-slate-400">
              {data.changelogSummary[0].highlights.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <Check className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {upgrading && (
        <ToolUpgradeModal
          tool={{
            name: 'Node.js',
            icon: <Cpu className="size-6" />,
            currentVersion: installed.version,
            targetVersion: upgrading,
            changelogUrl: 'https://nodejs.org/en/blog/release',
            restartNote: 'Sau khi cài, khởi động lại ZenPanel (zenpanel restart) để agent chạy bằng Node.js mới.',
          }}
          start={() => post<Job>('/api/system/node/upgrade', { version: upgrading })}
          verify={async () => {
            const res = await post<NodeStatusResponse>('/api/system/node/check');
            nodeApi.setData(res);
            return res.installed.systemVersion ?? res.installed.version;
          }}
          onClose={() => setUpgrading(null)}
        />
      )}
    </Card>
  );
}

function SystemToolsCard() {
  const toolsApi = useApi<SystemToolsStatusResponse>('/api/system/tools');
  const [checking, setChecking] = useState(false);
  const { toast } = useFeedback();

  const check = async () => {
    setChecking(true);
    try {
      const res = await post<SystemToolsStatusResponse>('/api/system/tools/check');
      if (res) toolsApi.setData(res);
      toast('Đã kiểm tra phiên bản mới nhất của các công cụ hệ thống', 'success');
    } catch (err: any) {
      toast(err?.message || 'Không thể kiểm tra công cụ hệ thống', 'error');
    } finally {
      setChecking(false);
    }
  };

  const [upgrading, setUpgrading] = useState<SystemToolItem | null>(null);
  const upgradeTool = (tool: SystemToolItem) => {
    if (tool.latestVersion) setUpgrading(tool);
  };

  const getToolIcon = (id: SystemToolItem['id']) => {
    switch (id) {
      case 'node':
        return Cpu;
      case 'npm':
        return Package;
      case 'git':
        return GitBranch;
      case 'cloudflared':
        return Cloud;
      case 'docker':
        return Boxes;
      default:
        return Wrench;
    }
  };

  return (
    <Card
      title="Công cụ hệ thống & Môi trường chạy (System Tools)"
      icon={Wrench}
      actions={
        <div className="flex items-center gap-2">
          {toolsApi.data && (
            toolsApi.data.totalWithUpdates > 0 ? (
              <Badge tone="amber" className="font-semibold text-xs">
                Có {toolsApi.data.totalWithUpdates} bản cập nhật mới
              </Badge>
            ) : (
              <Badge tone="green" className="font-semibold text-xs">
                Tất cả đã mới nhất
              </Badge>
            )
          )}
          <Button size="xs" variant="ghost" icon={RefreshCw} loading={checking} onClick={() => void check()}>
            Kiểm tra bản mới
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {toolsApi.error ? (
          <ErrorBox message={toolsApi.error} onRetry={toolsApi.reload} />
        ) : !toolsApi.data ? (
          <Spinner />
        ) : (
          toolsApi.data.tools.map((tool) => {
            const Icon = getToolIcon(tool.id);
            return (
              <div
                key={tool.id}
                className={cn(
                  'rounded-2xl border p-4 transition-all',
                  tool.hasUpdate
                    ? 'border-amber-500/50 bg-gradient-to-r from-amber-950/25 via-slate-900/60 to-ink-950/80 shadow-lg ring-1 ring-amber-500/20'
                    : 'border-slate-700/50 bg-ink-950/60 hover:border-slate-600',
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div
                      className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-xl ring-1',
                        tool.hasUpdate
                          ? 'bg-amber-500/20 text-amber-300 ring-amber-500/40'
                          : 'bg-slate-800 text-slate-300 ring-slate-700/60',
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{tool.name}</h4>
                        {tool.isCrucialForZenPanel && (
                          <Badge tone="blue" className="text-[10px]">
                            Cần cho ZenPanel
                          </Badge>
                        )}
                        {tool.installed ? (
                          tool.hasUpdate ? (
                            <Badge tone="amber" className="text-[10px] font-bold">
                              Có bản mới: {tool.latestVersion}
                            </Badge>
                          ) : (
                            <Badge tone="green" className="text-[10px]">
                              Đã mới nhất
                            </Badge>
                          )
                        ) : (
                          <Badge tone="red" className="text-[10px]">
                            Chưa cài đặt
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{tool.description}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
                        <span className="text-slate-400">
                          Phiên bản hiện tại: <b className="mono text-slate-200">{tool.currentVersion || 'Chưa cài'}</b>
                        </span>
                        {tool.latestVersion && (
                          <span className="text-slate-400">
                            Bản mới nhất: <b className="mono text-emerald-400">{tool.latestVersion}</b>
                          </span>
                        )}
                        {tool.releaseDate && (
                          <span className="text-slate-500 text-[11px]">
                            Phát hành: {tool.releaseDate}
                          </span>
                        )}
                        {tool.changelogUrl && (
                          <a
                            href={tool.changelogUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-400 hover:underline flex items-center gap-0.5"
                          >
                            Changelog <ExternalLink className="size-2.5" />
                          </a>
                        )}
                      </div>

                      {tool.securityNotes && (
                        <div className="mt-2 rounded-xl border border-red-500/40 bg-red-950/20 px-3 py-2 text-xs text-red-200 flex items-start gap-2">
                          <ShieldAlert className="size-4 shrink-0 text-red-400 mt-0.5" />
                          <span>{tool.securityNotes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* NÚT NÂNG CẤP: CHỈ HIỆN KHI CÓ BẢN MỚI */}
                  <div className="shrink-0 sm:self-center flex items-center gap-2">
                    {tool.hasUpdate && tool.latestVersion ? (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Download}
                        onClick={() => void upgradeTool(tool)}
                        className="font-bold bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white shadow-lg shadow-amber-950/40"
                      >
                        Nâng cấp lên {tool.latestVersion}
                      </Button>
                    ) : tool.installed ? (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                        <CheckCircle2 className="size-4" />
                        <span>Đã mới nhất</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Chưa cài trên máy</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {upgrading && (
        <ToolUpgradeModal
          tool={{
            name: upgrading.name,
            icon: (() => {
              const Icon = getToolIcon(upgrading.id);
              return <Icon className="size-6" />;
            })(),
            currentVersion: upgrading.currentVersion,
            targetVersion: upgrading.latestVersion ?? '',
            description: upgrading.description,
            changelogUrl: upgrading.changelogUrl,
            securityNotes: upgrading.securityNotes,
            restartNote: upgrading.id === 'node' ? 'Sau khi cài, khởi động lại ZenPanel để agent chạy bằng Node.js mới.' : undefined,
          }}
          start={() => post<Job>(`/api/system/tools/${upgrading.id}/upgrade`)}
          verify={async () => {
            const res = await post<SystemToolsStatusResponse>('/api/system/tools/check');
            toolsApi.setData(res);
            return res.tools.find((t) => t.id === upgrading.id)?.currentVersion ?? null;
          }}
          onClose={() => setUpgrading(null)}
        />
      )}
    </Card>
  );
}

function UpdateCard() {
  const { update, refreshUpdate, prefs, savePrefs } = usePanel();
  const packages = useApi<VersionPackage[]>('/api/update/packages');
  const remote = useApi<RemoteVersion[]>('/api/update/remote');
  const [checking, setChecking] = useState(false);
  const [target, setTarget] = useState<{ target: UpdateTarget; pkg?: VersionPackage } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { confirm, run } = useFeedback();

  const check = async () => {
    setChecking(true);
    await run(async () => {
      await post('/api/update/check');
      await refreshUpdate();
      await remote.reload();
    });
    setChecking(false);
  };

  const pkgFor = (sha: string, version: string) => packages.data?.find((p) => p.sha === sha) ?? packages.data?.find((p) => p.version === version && !p.current);

  const open = (v: { ref: string; sha: string; version: string; label?: string }) => setTarget({ target: v, pkg: pkgFor(v.sha, v.version) });

  const remove = async (pkg: VersionPackage) => {
    if (!(await confirm({ title: 'Xoá gói phiên bản', message: <>Xoá gói <b className="mono">v{pkg.version}</b> ({formatBytes(pkg.size)}) khỏi ổ đĩa?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/update/packages/${encodeURIComponent(pkg.id)}`), 'Đã xoá gói phiên bản');
    await packages.reload();
  };

  const latest = update?.latest;
  const available = Boolean(update?.available && latest);
  const history = (remote.data ?? []).filter((v) => v.version !== update?.current || v.sha !== latest?.sha);
  const visible = showAll ? history : history.slice(0, 5);
  const spare = (packages.data ?? []).filter((p) => !p.current);

  return (
    <div className="space-y-4">
      {/* Trạng thái chính: 1 nút cập nhật */}
      <div
        className={cn(
          'overflow-hidden rounded-2xl border p-5 sm:p-6',
          available ? 'border-sky-500/40 bg-gradient-to-br from-sky-950/60 via-ink-950 to-indigo-950/40' : 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-ink-950 to-ink-950',
        )}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl ring-1', available ? 'bg-sky-500/15 text-sky-300 ring-sky-400/40' : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40')}>
            {available ? <Rocket className="size-7" /> : <CheckCircle2 className="size-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-white">{available ? `Có bản mới v${latest!.version}` : 'ZenPanel đang ở bản mới nhất'}</div>
            <div className="mt-0.5 text-sm text-slate-400">
              Đang dùng <b className="mono text-slate-200">v{update?.current ?? '...'}</b>
              {update?.checkedAt && <> · kiểm tra {formatRelative(update.checkedAt)}</>}
              {available && latest?.date && <> · phát hành {formatRelative(latest.date)}</>}
            </div>
            {update?.error && <div className="mt-1 text-xs text-red-300">{update.error}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={checking} onClick={() => void check()}>
              Kiểm tra
            </Button>
            {available && (
              <Button size="sm" variant="primary" icon={Sparkles} onClick={() => open(latest!)}>
                Xem có gì mới & cập nhật
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Lịch sử phiên bản & Quay lại bản cũ */}
        <Card title="Lịch sử phiên bản & Quay lại bản cũ" icon={History} bodyClassName="p-0">
          {remote.error ? (
            <div className="p-4">
              <ErrorBox message={remote.error} onRetry={remote.reload} />
            </div>
          ) : !remote.data ? (
            <Spinner />
          ) : history.length === 0 ? (
            <EmptyState
              icon={History}
              title="Chưa có bản ghi lịch sử khác"
              description="Các phiên bản trước đó và gói sao lưu của ZenPanel sẽ hiển thị ở đây để bạn có thể xem chi tiết hoặc quay lại bất kỳ lúc nào."
            />
          ) : (
            <div className="divide-y divide-slate-800/80">
              {visible.map((v) => {
                const pkg = pkgFor(v.sha, v.version);
                const isCurrent = v.version === update?.current;
                const newer = update ? v.version.localeCompare(update.current, undefined, { numeric: true }) > 0 : false;
                return (
                  <div key={`${v.ref}-${v.sha}`} className="flex items-center gap-3 px-4 py-3">
                    <div className={cn('size-2 shrink-0 rounded-full', isCurrent ? 'bg-emerald-400' : newer ? 'bg-sky-400' : 'bg-amber-400')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-sm font-bold text-white">v{v.version}</span>
                        <span className="truncate text-xs text-slate-500">{v.label}</span>
                        {isCurrent && <Badge tone="green">Đang dùng</Badge>}
                        {pkg && !isCurrent && <Badge tone="blue">Có sẵn trên máy</Badge>}
                        {!pkg && !isCurrent && <Badge tone="slate">Từ GitHub</Badge>}
                      </div>
                      {v.message && <div className="truncate text-xs text-slate-400">{v.message}</div>}
                    </div>
                    {!isCurrent && (
                      <Button
                        size="xs"
                        variant={newer ? 'primary' : pkg ? 'secondary' : 'ghost'}
                        icon={newer ? Rocket : RotateCcw}
                        onClick={() => open(v)}
                      >
                        {newer ? 'Cập nhật' : 'Quay lại bản này'}
                      </Button>
                    )}
                  </div>
                );
              })}
              {history.length > 5 && (
                <button type="button" onClick={() => setShowAll(!showAll)} className="w-full py-2.5 text-xs font-semibold text-blue-300 hover:bg-slate-800/40">
                  {showAll ? 'Thu gọn' : `Xem thêm ${history.length - 5} phiên bản`}
                </button>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Tự động" icon={Cog}>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-semibold text-slate-100">Tự kiểm tra bản mới</span>
                  <span className="block text-xs text-slate-500">Chỉ hỏi GitHub, không tải gì</span>
                </span>
                <Toggle checked={prefs.autoCheckUpdate} onChange={(v) => void run(() => savePrefs({ autoCheckUpdate: v }), v ? 'Đã bật tự kiểm tra' : 'Đã tắt tự kiểm tra')} />
              </label>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-100">Tần suất</span>
                <Select
                  className="h-9 w-36 py-0 text-xs"
                  value={prefs.updateCheckMinutes}
                  disabled={!prefs.autoCheckUpdate}
                  onChange={(e) => void run(() => savePrefs({ updateCheckMinutes: Number(e.target.value) }), `Kiểm tra cập nhật mỗi ${e.target.selectedOptions[0].text}`)}
                >
                  {UPDATE_INTERVALS.map(([minutes, label]) => (
                    <option key={minutes} value={minutes}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-semibold text-slate-100">Tải sẵn bản mới</span>
                  <span className="block text-xs text-slate-500">Chỉ tải bản mới nhất, tự xoá gói cũ</span>
                </span>
                <Toggle checked={prefs.autoDownloadUpdate} onChange={(v) => void run(() => savePrefs({ autoDownloadUpdate: v }), v ? 'Đã bật tải sẵn' : 'Đã tắt tải sẵn')} />
              </label>
            </div>
          </Card>

          <Card title="Gói dự phòng trên máy" icon={Package} bodyClassName="p-0">
            {!packages.data ? (
              <Spinner />
            ) : spare.length === 0 ? (
              <p className="px-4 py-5 text-xs text-slate-500">Không có gói nào. ZenPanel chỉ tải gói khi bạn bấm cập nhật và tự giữ tối đa 2 bản gần nhất để quay lại khi cần.</p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {spare.map((pkg) => (
                  <div key={pkg.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="mono font-semibold text-slate-200">v{pkg.version}</span>
                        <span className="mono text-xs text-slate-500">{pkg.sha.slice(0, 7)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{formatBytes(pkg.size)} · Tải lúc {formatRelative(pkg.downloadedAt)}</div>
                    </div>
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={RotateCcw}
                      title={`Quay lại phiên bản v${pkg.version}`}
                      onClick={() => open({ ref: pkg.sha, sha: pkg.sha, version: pkg.version, label: `Bản sao lưu v${pkg.version}` })}
                    >
                      Quay lại
                    </Button>
                    <IconButton icon={Trash2} title="Xoá gói khỏi ổ đĩa" className="hover:text-zen-red" onClick={() => void remove(pkg)} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {target && update && (
        <PanelUpdateModal
          target={target.target}
          pkg={target.pkg}
          current={update.current}
          onClose={() => {
            setTarget(null);
            void packages.reload();
          }}
          onFinished={() => {
            void refreshUpdate();
            void packages.reload();
          }}
        />
      )}
    </div>
  );
}

function getCountryName(code?: string): string {
  if (!code) return '';
  const names: Record<string, string> = {
    VN: 'Việt Nam',
    US: 'Hoa Kỳ',
    SG: 'Singapore',
    JP: 'Nhật Bản',
    KR: 'Hàn Quốc',
    DE: 'Đức',
    GB: 'Vương quốc Anh',
    FR: 'Pháp',
    NL: 'Hà Lan',
    AU: 'Úc',
    HK: 'Hồng Kông',
    TW: 'Đài Loan',
    CA: 'Canada',
    TH: 'Thái Lan',
  };
  return names[code.toUpperCase()] || code.toUpperCase();
}

function getCountryFlag(code?: string): string {
  if (!code || code.length !== 2) return '🌐';
  const upper = code.toUpperCase();
  return String.fromCodePoint(...[...upper].map((c) => 127397 + c.charCodeAt(0)));
}

function getDeviceIcon(type?: string) {
  switch (type) {
    case 'mobile':
      return Smartphone;
    case 'tablet':
      return Tablet;
    case 'bot':
      return Terminal;
    case 'desktop':
    default:
      return Monitor;
  }
}

function SessionsCard() {
  const sessions = useApi<UserSessionView[]>('/api/auth/sessions');
  const history = useApi<LoginRecord[]>('/api/auth/history');
  const { confirm, run } = useFeedback();

  const otherSessionsCount = (sessions.data ?? []).filter((s) => !s.isCurrent).length;

  const logoutAll = async () => {
    if (
      !(await confirm({
        title: 'Đăng xuất mọi thiết bị khác',
        message: `Tất cả ${otherSessionsCount} phiên đăng nhập trên các thiết bị khác sẽ bị đăng xuất ngay lập tức. Phiên trên thiết bị hiện tại của bạn vẫn được giữ nguyên.`,
        confirmLabel: 'Đăng xuất tất cả thiết bị khác',
      }))
    )
      return;
    const result = await run(() => post<{ ok: boolean; token?: string }>('/api/auth/logout-all'), 'Đã đăng xuất mọi thiết bị khác');
    if (result) {
      if (result.token) setToken(result.token);
      void sessions.reload();
      void history.reload();
    }
  };

  const revoke = async (session: UserSessionView) => {
    if (session.isCurrent) return;
    const ok = await confirm({
      title: 'Đăng xuất thiết bị',
      message: `Bạn có chắc muốn đăng xuất thiết bị ${session.browser || 'này'} (${session.os || 'Hệ điều hành khác'}) từ IP ${session.ip}? Thiết bị này sẽ bị ngắt kết nối ngay lập tức.`,
      confirmLabel: 'Đăng xuất thiết bị',
    });
    if (!ok) return;
    await run(() => post(`/api/auth/sessions/${session.id}/revoke`), 'Đã thu hồi phiên đăng nhập thiết bị');
    void sessions.reload();
    void history.reload();
  };

  return (
    <div className="space-y-6">
      {/* Khối 1: Các phiên đang hoạt động */}
      <Card
        title="Thiết bị & Phiên đang hoạt động"
        icon={ShieldCheck}
        actions={
          otherSessionsCount > 0 ? (
            <Button size="sm" variant="danger" icon={LogOut} onClick={() => void logoutAll()}>
              Đăng xuất các thiết bị khác ({otherSessionsCount})
            </Button>
          ) : undefined
        }
      >
        <p className="mb-4 text-xs text-slate-400">
          Danh sách các trình duyệt và thiết bị đang duy trì phiên đăng nhập vào ZenPanel. Bạn có thể thu hồi quyền truy cập từ xa cho bất kỳ thiết bị nào.
        </p>

        {!sessions.data ? (
          <Spinner />
        ) : sessions.data.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Không tìm thấy phiên đăng nhập nào" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.data.map((s) => {
              const DevIcon = getDeviceIcon(s.deviceType);
              const isLocal = s.ip === '127.0.0.1' || s.ip === '::1' || s.ip.startsWith('192.168.') || s.ip.startsWith('10.');
              return (
                <div
                  key={s.id}
                  className={cn(
                    'relative flex flex-col justify-between rounded-xl border p-4 transition-all',
                    s.isCurrent
                      ? 'border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent shadow-lg shadow-emerald-500/5'
                      : 'border-slate-800 bg-ink-950/60 hover:border-slate-700/80',
                  )}
                >
                  <div>
                    {/* Header: Icon + Trình duyệt + Badge phiên hiện tại */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg border',
                            s.isCurrent ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400' : 'border-slate-800 bg-slate-900 text-slate-400',
                          )}
                        >
                          <DevIcon className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-slate-100" title={`${s.browser} · ${s.os}`}>
                            {s.browser || 'Trình duyệt Web'}
                          </h4>
                          <p className="truncate text-xs text-slate-400">{s.os || 'Hệ điều hành'}</p>
                        </div>
                      </div>

                      {s.isCurrent ? (
                        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/40">
                          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Phiên hiện tại
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-400">
                          Thiết bị khác
                        </span>
                      )}
                    </div>

                    {/* Thông tin IP, vị trí và thời gian */}
                    <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Địa chỉ IP:</span>
                        <span className="mono font-semibold text-slate-200">
                          {s.ip}{' '}
                          {s.country && <span className="ml-1 text-slate-300">{getCountryFlag(s.country)} {getCountryName(s.country)}</span>}
                          {isLocal && <span className="ml-1 text-[11px] text-slate-400">(Nội bộ)</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Đăng nhập:</span>
                        <span className="text-slate-300">{formatDate(s.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Hoạt động cuối:</span>
                        <span className="text-emerald-400/90 font-medium">{formatRelative(s.lastActiveAt || s.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Hành động dưới cùng: Nút Đăng xuất ở phiên khác, còn phiên hiện tại XÓA HOÀN TOÀN nút Đăng xuất */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                    {s.isCurrent ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                        <CircleCheck className="size-3.5" /> Thiết bị này đang được sử dụng
                      </span>
                    ) : (
                      <>
                        <span className="text-slate-500">Phiên từ xa</span>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
                          icon={LogOut}
                          onClick={() => void revoke(s)}
                        >
                          Đăng xuất
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Khối 2: Nhật ký đăng nhập chi tiết */}
      <Card
        title="Nhật ký đăng nhập chi tiết (Audit Log)"
        icon={History}
        bodyClassName="p-0"
        actions={
          history.data && history.data.length > 0 ? (
            <span className="text-xs text-slate-400 font-medium">Ghi nhận {history.data.length} lần</span>
          ) : undefined
        }
      >
        {!history.data ? (
          <Spinner />
        ) : history.data.length === 0 ? (
          <EmptyState icon={History} title="Chưa có lần đăng nhập nào được ghi lại" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Thời gian</th>
                  <th className={th}>Thiết bị / Trình duyệt</th>
                  <th className={th}>Địa chỉ IP & Vị trí</th>
                  <th className={th}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((h, i) => {
                  const DevIcon = getDeviceIcon(h.deviceType);
                  const isLocal = h.ip === '127.0.0.1' || h.ip === '::1' || h.ip.startsWith('192.168.') || h.ip.startsWith('10.');
                  return (
                    <tr key={`${h.at}-${i}`} className={tr}>
                      <td className={td}>
                        <div className="text-xs font-semibold text-slate-200">{formatDate(h.at)}</div>
                        <div className="text-[11px] text-slate-500">{formatRelative(h.at)}</div>
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-2.5" data-tip={h.userAgent}>
                          <DevIcon className="size-4 shrink-0 text-slate-400" />
                          <div>
                            <div className="text-xs font-semibold text-slate-200">{h.browser || 'Trình duyệt khác'}</div>
                            <div className="text-[11px] text-slate-500">{h.os || 'Hệ điều hành khác'}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <div className="mono text-xs font-semibold text-slate-200">{h.ip}</div>
                        <div className="text-[11px] text-slate-400">
                          {h.country ? (
                            <span>{getCountryFlag(h.country)} {getCountryName(h.country)}</span>
                          ) : isLocal ? (
                            <span>🏠 Mạng nội bộ / Localhost</span>
                          ) : (
                            <span>Mạng ngoài</span>
                          )}
                        </div>
                      </td>
                      <td className={td}>
                        <div className="space-y-0.5">
                          <Badge tone={h.ok ? 'green' : 'red'}>
                            {h.ok ? 'Thành công' : 'Thất bại'}
                          </Badge>
                          {h.reason && (
                            <span className={cn('block text-[11px]', h.ok ? 'text-slate-400' : 'text-rose-400 font-medium')}>
                              {h.reason}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function AiCard() {
  return (
    <Card title="AI đã chuyển sang trang AI Gateway" icon={Bot}>
      <p className="mb-4 text-sm text-slate-400">Kết nối API key, tải danh sách model, chọn model mặc định, playground và định tuyến dự phòng nằm trong trang AI Gateway.</p>
      <Link to="/ai">
        <Button variant="primary" icon={Sparkles}>
          Mở AI Gateway
        </Button>
      </Link>
    </Card>
  );
}

function PublicHostCard() {
  const { prefs, savePrefs } = usePanel();
  const network = useApi<NetworkInfo>('/api/system/network');
  const [value, setValue] = useState(prefs.publicHost);
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();
  useEffect(() => setValue(prefs.publicHost), [prefs.publicHost]);

  return (
    <Card title="Domain / IP public của VPS" icon={Globe} className="xl:col-span-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSaving(true);
          void run(() => savePrefs({ publicHost: value }), value ? `Đã đặt host public: ${value}` : 'Đã chuyển về tự phát hiện IP public').finally(() => setSaving(false));
        }}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ['IP public (tự phát hiện)', network.data?.publicIpv4],
              ['IPv6', network.data?.publicIpv6],
              ['Hostname (reverse DNS)', network.data?.reverseDns],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="flex items-center justify-between gap-2">
                <span className="mono truncate text-slate-200">{value ?? (network.loading ? 'Đang lấy...' : 'Không có')}</span>
                {value && <CopyButton value={value} />}
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          ZenPanel <b>tự dùng IP public ở trên</b> để hiện địa chỉ truy cập app (IP:cổng) và host database, bạn không cần nhập gì. Chỉ điền ô dưới khi có domain riêng (vd{' '}
          <code className="mono">vps.example.com</code> đã trỏ bản ghi A về IP VPS) hoặc muốn dùng hostname reverse DNS.
        </p>
        {network.data?.reverseDns && !prefs.publicHost && (
          <Button type="button" size="sm" variant="soft" onClick={() => setValue(network.data!.reverseDns!)}>
            Dùng hostname {network.data.reverseDns}
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          <input className="input mono max-w-md" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Để trống = dùng ${network.data?.publicIpv4 ?? 'IP public'}`} />
          <Button type="submit" variant="primary" icon={Save} loading={saving}>
            Lưu
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SystemCard() {
  const { info, tunnel } = usePanel();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <PublicHostCard />
      <Card title="Cloudflare Tunnel" icon={Cloud}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusDot tone={tunnel?.status === 'online' ? 'green' : tunnel?.status === 'starting' ? 'amber' : 'red'} pulse={tunnel?.status === 'online'} />
            <span className="font-semibold text-slate-200">
              {tunnel?.status === 'online' ? 'Đang hoạt động' : tunnel?.status === 'starting' ? 'Đang kết nối' : tunnel?.status === 'stopped' ? 'Đã tắt' : 'Lỗi'}
            </span>
          </div>
          {tunnel?.url && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
              <a href={tunnel.url} target="_blank" rel="noreferrer" className="mono truncate text-blue-300 hover:underline">
                {tunnel.url}
              </a>
              <CopyButton value={tunnel.url} />
            </div>
          )}
          {tunnel?.error && <p className="text-xs text-red-300">{tunnel.error}</p>}
          <p className="text-xs text-slate-500">
            Domain miễn phí <span className="mono">*.trycloudflare.com</span> đổi mỗi lần khởi động lại agent. Tắt tunnel bằng biến môi trường{' '}
            <code className="mono text-slate-300">ZENPANEL_TUNNEL=0</code>. Cần domain cố định: cài app <b>Cloudflare Tunnel</b> trong App Store.
          </p>
        </div>
      </Card>
      <Card title="ZenPanel Agent" icon={Info}>
        {info && (
          <dl className="divide-y divide-slate-700/40 text-sm">
            {(
              [
                ['Phiên bản', <Badge tone="blue">v{info.version}</Badge>],
                ['Hệ điều hành', `${info.os.name} (${info.os.arch})`],
                ['Hostname', info.os.hostname],
                ['Cổng panel', <span className="mono">{info.port}</span>],
                ['Thư mục dữ liệu', <span className="mono break-all">{info.dataDir}</span>],
                ['Đã chạy', formatDuration(info.agentUptime)],
                ['Quyền', info.os.isAdmin ? <Badge tone="green">Quản trị viên</Badge> : <Badge tone="amber">Người dùng thường</Badge>],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-2">
                <dt className="shrink-0 text-slate-500">{key}</dt>
                <dd className="min-w-0 text-right text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}

type TabId = 'account' | 'appearance' | 'ai' | 'vps' | 'tools' | 'update' | 'sessions' | 'system';

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const { update } = usePanel();
  const tab = (params.get('tab') as TabId | null) ?? 'account';

  return (
    <>
      <PageHeader title="Cài đặt" description="Tài khoản, giao diện, công cụ hệ thống, hạn VPS, cập nhật & phiên bản ZenPanel" icon={Cog} />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={(next) => setParams({ tab: next })}
          tabs={[
            { id: 'account', label: 'Tài khoản', icon: KeyRound },
            { id: 'appearance', label: 'Giao diện', icon: Palette },
            { id: 'ai', label: 'AI', icon: Bot },
            { id: 'vps', label: 'Hạn VPS', icon: CalendarClock },
            { id: 'tools', label: 'Công cụ hệ thống', icon: Wrench },
            { id: 'update', label: update?.available ? 'Cập nhật •' : 'Cập nhật', icon: Sparkles },
            { id: 'sessions', label: 'Phiên & Đăng nhập', icon: ShieldCheck },
            { id: 'system', label: 'Hệ thống', icon: Info },
          ]}
        />
      </div>
      {tab === 'account' && (
        <div className="max-w-3xl">
          <AccountCard />
        </div>
      )}
      {tab === 'appearance' && <AppearanceCard />}
      {tab === 'ai' && <AiCard />}
      {tab === 'vps' && (
        <div className="max-w-3xl">
          <VpsCard />
        </div>
      )}
      {tab === 'tools' && (
        <div className="space-y-5">
          <SystemToolsCard />
          <NodeRuntimeCard />
        </div>
      )}
      {tab === 'update' && (
        <div className="space-y-5">
          <UpdateCard />
        </div>
      )}
      {tab === 'sessions' && <SessionsCard />}
      {tab === 'system' && <SystemCard />}
    </>
  );
}
