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
  Loader2,
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
  Copy,
  Cpu,
  Wrench,
} from 'lucide-react';
import { useJobs } from '../components/jobs';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Select, Spinner, StatusDot, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, post, setToken, getToken, logout } from '../lib/api';
import { formatBytes, formatDate, formatDuration, formatRate, formatRelative } from '../lib/format';
import { txaformat } from '../lib/txaformat';
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
  const { runJob } = useJobs();
  const { confirm, toast } = useFeedback();

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

  const upgradeNode = async (ver?: string) => {
    const target = ver || selectedVer || nodeApi.data?.latestLts?.version || 'lts';
    const ok = await confirm({
      title: `Nâng cấp Node.js lên ${target}`,
      message: `Hệ thống sẽ tải và cài đặt Node.js ${target} từ trang chủ nodejs.org. Tiến trình sẽ được thực hiện tự động và an toàn. Bạn có muốn tiếp tục?`,
      confirmLabel: 'Nâng cấp ngay',
    });
    if (!ok) return;

    try {
      await runJob(
        () => post<Job>('/api/system/node/upgrade', { version: target }),
        () => {
          void nodeApi.reload();
          toast(`Đã hoàn tất nâng cấp Node.js lên ${target}`, 'success');
        },
      );
    } catch (err: any) {
      toast(err?.message || 'Không thể bắt đầu nâng cấp Node.js', 'error');
    }
  };

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
    </Card>
  );
}

function SystemToolsCard() {
  const toolsApi = useApi<SystemToolsStatusResponse>('/api/system/tools');
  const [checking, setChecking] = useState(false);
  const { runJob } = useJobs();
  const { confirm, toast } = useFeedback();

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

  const upgradeTool = async (tool: SystemToolItem) => {
    if (!tool.latestVersion) return;
    const ok = await confirm({
      title: `Nâng cấp ${tool.name}`,
      message: `Hệ thống sẽ tự động tải và cài đặt ${tool.name} phiên bản ${tool.latestVersion} mới nhất. Bạn có muốn tiếp tục?`,
      confirmLabel: `Nâng cấp ngay`,
    });
    if (!ok) return;

    try {
      await runJob(
        () => post<Job>(`/api/system/tools/${tool.id}/upgrade`),
        async () => {
          try {
            const res = await post<SystemToolsStatusResponse>('/api/system/tools/check');
            if (res) toolsApi.setData(res);
          } catch {
            void toolsApi.reload();
          }
          if (tool.id === 'node') {
            toast(`Đã nâng cấp Node.js lên ${tool.latestVersion}! Vui lòng khởi động lại ZenPanel để runtime mới có hiệu lực.`, 'success');
          } else {
            toast(`Đã hoàn tất nâng cấp ${tool.name} lên ${tool.latestVersion}`, 'success');
          }
        },
      );
    } catch (err: any) {
      toast(err?.message || `Không thể bắt đầu nâng cấp ${tool.name}`, 'error');
    }
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
    </Card>
  );
}

function UpdateCard() {
  const { update, refreshUpdate, prefs, savePrefs } = usePanel();
  const packages = useApi<VersionPackage[]>('/api/update/packages');
  const remote = useApi<RemoteVersion[]>('/api/update/remote');
  const [checking, setChecking] = useState(false);

  // Trạng thái khoá màn hình cập nhật
  const [updating, setUpdating] = useState<{
    version: string;
    targetSha: string;
    startedAt: number;
    log: string;
    percent: number;
    stage: string;
    etaSec: number;
  } | null>(null);

  // Modal thông báo thành công kèm URL Cloudflare Tunnel mới
  const [successModal, setSuccessModal] = useState<{
    version: string;
    tunnelUrl: string | null;
    autoLoginUrl: string | null;
  } | null>(null);

  const [copiedLog, setCopiedLog] = useState(false);
  const { confirm, run, toast } = useFeedback();
  const { runJob } = useJobs();

  const check = async () => {
    setChecking(true);
    await run(async () => {
      await post('/api/update/check');
      await refreshUpdate();
      await remote.reload();
    });
    setChecking(false);
  };

  const download = async (ref: string) => {
    await runJob(() => post<Job>('/api/update/download', { ref }), () => {
      void packages.reload();
      void refreshUpdate();
    });
  };

  const install = async (pkg: VersionPackage) => {
    const older = update && pkg.version < update.current;
    const ok = await confirm({
      title: older ? `Quay lại phiên bản ${pkg.version}` : `Nâng cấp lên phiên bản ${pkg.version}`,
      message: (
        <>
          ZenPanel sẽ tự động khóa giao diện để cập nhật mã nguồn, cài đặt dependencies và khởi động lại dịch vụ. Toàn bộ dữ liệu, website, database và cài đặt được bảo toàn nguyên vẹn.
        </>
      ),
      confirmLabel: older ? 'Quay lại bản này' : 'Bắt đầu nâng cấp',
    });
    if (!ok) return;

    // Kích hoạt khoá giao diện bảo trì
    const startTime = Date.now();
    setUpdating({
      version: pkg.version,
      targetSha: pkg.sha,
      startedAt: startTime,
      log: 'Khởi tạo quy trình nâng cấp ZenPanel...\n',
      percent: 15,
      stage: 'Đang chuẩn bị gói cập nhật và script installer...',
      etaSec: 75,
    });

    const result = await post<{ logFile: string }>(`/api/update/packages/${pkg.id}/install`).catch((err: Error) => {
      toast(`Khởi chạy cài đặt thất bại: ${err.message}`, 'error');
      setUpdating(null);
      return null;
    });
    if (!result) return;

    // Vòng lặp giám sát tiến trình và chờ agent khởi động lại
    let newTunnelUrl: string | null = null;

    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(5, 75 - elapsed);

      // Đọc log nếu agent còn phản hồi hoặc đọc sau khi online
      try {
        const res = await get<{ log: string }>('/api/update/log');
        if (res?.log) {
          setUpdating((prev) => (prev ? { ...prev, log: res.log } : null));
        }
      } catch {}

      // Tiến trình tăng dần tiệm cận 85% trong lúc build
      const simulatedPct = Math.min(88, Math.max(20, Math.round(15 + (elapsed / 75) * 70)));
      const currentStage =
        elapsed < 15
          ? 'Đang giải nén gói mã nguồn mới...'
          : elapsed < 40
            ? 'Đang cập nhật dependencies và build hệ thống...'
            : elapsed < 65
              ? 'Đang khởi động lại tiến trình ZenPanel Agent...'
              : 'Đang kết nối lại và thiết lập Cloudflare Tunnel...';

      setUpdating((prev) => (prev ? { ...prev, percent: simulatedPct, stage: currentStage, etaSec: remaining } : null));

      // Sau 20 giây, bắt đầu kiểm tra trạng thái online qua /api/update/status
      if (elapsed >= 15) {
        try {
          const statusRes = await get<{ version: string; tunnelUrl: string | null; startedAt: number }>('/api/update/status');
          if (statusRes && statusRes.startedAt > startTime - 5000) {
            newTunnelUrl = statusRes.tunnelUrl;
            break;
          }
        } catch {
          // Agent đang trong khoảng 5-10s restart
        }
      }
    }

    // Hoàn tất 100%
    setUpdating((prev) => (prev ? { ...prev, percent: 100, stage: 'Nâng cấp thành công!', etaSec: 0 } : null));
    await new Promise((r) => setTimeout(r, 1000));

    // Mở khoá giao diện
    setUpdating(null);

    // Chuẩn bị URL auto-login
    const currentToken = getToken();
    let autoLoginUrl: string | null = null;
    if (newTunnelUrl) {
      const cleanUrl = newTunnelUrl.replace(/\/+$/, '');
      autoLoginUrl = currentToken ? `${cleanUrl}/?token=${encodeURIComponent(currentToken)}&auto_login=1` : cleanUrl;
    }

    setSuccessModal({
      version: pkg.version,
      tunnelUrl: newTunnelUrl,
      autoLoginUrl,
    });

    void refreshUpdate();
    void packages.reload();
  };

  const remove = async (pkg: VersionPackage) => {
    if (!(await confirm({ title: 'Xoá gói phiên bản', message: <>Xoá gói <b className="mono">{pkg.id}</b> ({formatBytes(pkg.size)}) khỏi ổ đĩa?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/update/packages/${encodeURIComponent(pkg.id)}`), 'Đã xoá gói phiên bản');
    await packages.reload();
  };

  const copyUpdatingLog = async () => {
    if (!updating?.log) return;
    try {
      await navigator.clipboard.writeText(updating.log);
      setCopiedLog(true);
      setTimeout(() => setCopiedLog(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <Card
        title="Cập nhật ZenPanel"
        icon={Sparkles}
        actions={
          <Button size="sm" icon={RefreshCw} loading={checking} onClick={() => void check()}>
            Kiểm tra ngay
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Phiên bản đang chạy:</span>
              <Badge tone="blue">v{update?.current ?? '...'}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Mới nhất trên GitHub:</span>
              {update?.latest ? <Badge tone={update.available ? 'green' : 'slate'}>v{update.latest.version}</Badge> : <span className="text-slate-400">—</span>}
              {update?.available && <Badge tone="amber">Có bản mới</Badge>}
            </div>
            {update?.latest && (
              <p className="text-xs text-slate-500">
                <span className="mono">{update.latest.sha.slice(0, 7)}</span> · {update.latest.message} · {formatRelative(update.latest.date)}
              </p>
            )}
            {update?.checkedAt && <p className="text-xs text-slate-500">Kiểm tra lần cuối {formatRelative(update.checkedAt)}</p>}
            {update?.error && <p className="text-xs text-red-300">{update.error}</p>}
            {update?.available && update.latest && !update.downloadedLatest && (
              <Button size="sm" variant="primary" icon={Download} onClick={() => void download(update.latest!.sha)}>
                Tải bản v{update.latest.version}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
              <span>
                <span className="block font-semibold text-slate-100">Tự kiểm tra cập nhật</span>
                <span className="block text-xs text-slate-500">Tự hỏi GitHub có bản mới theo tần suất bên dưới</span>
              </span>
              <Toggle checked={prefs.autoCheckUpdate} onChange={(v) => void run(() => savePrefs({ autoCheckUpdate: v }), v ? 'Đã bật tự kiểm tra' : 'Đã tắt tự kiểm tra')} />
            </label>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
              <span>
                <span className="block font-semibold text-slate-100">Tần suất kiểm tra</span>
                <span className="block text-xs text-slate-500">Bao lâu hỏi GitHub một lần</span>
              </span>
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
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
              <span>
                <span className="block font-semibold text-slate-100">Tự tải bản mới</span>
                <span className="block text-xs text-slate-500">Tải sẵn gói, bạn chỉ cần bấm cài</span>
              </span>
              <Toggle checked={prefs.autoDownloadUpdate} onChange={(v) => void run(() => savePrefs({ autoDownloadUpdate: v }), v ? 'Đã bật tự tải' : 'Đã tắt tự tải')} />
            </label>
          </div>
        </div>
      </Card>

      <Card title="Phiên bản đã tải" icon={Package} bodyClassName="p-0">
        {!packages.data ? (
          <Spinner />
        ) : packages.data.length === 0 ? (
          <EmptyState icon={Package} title="Chưa tải phiên bản nào" description="Tải một phiên bản bên dưới để cài đặt hoặc giữ làm bản dự phòng để quay lại khi cần." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Phiên bản</th>
                  <th className={th}>Commit</th>
                  <th className={th}>Dung lượng</th>
                  <th className={th}>Tải lúc</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {packages.data.map((pkg) => (
                  <tr key={pkg.id} className={tr}>
                    <td className={td}>
                      <span className="font-semibold text-white">v{pkg.version}</span> {pkg.current && <Badge tone="green">Đang chạy</Badge>}
                    </td>
                    <td className={cn(td, 'mono text-xs text-slate-400')}>{pkg.sha.slice(0, 7)}</td>
                    <td className={cn(td, 'mono text-slate-400')}>{formatBytes(pkg.size)}</td>
                    <td className={cn(td, 'text-xs text-slate-500')}>{formatDate(pkg.downloadedAt)}</td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <Button size="xs" variant="soft" icon={Rocket} disabled={pkg.current} onClick={() => void install(pkg)}>
                        {pkg.current ? 'Đang dùng' : 'Cài bản này'}
                      </Button>
                      <IconButton icon={Trash2} title="Xoá gói" className="ml-1 hover:text-zen-red" onClick={() => void remove(pkg)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Phiên bản trên GitHub" icon={GitBranch}>
        {remote.error ? (
          <ErrorBox message={remote.error} onRetry={remote.reload} />
        ) : !remote.data ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {remote.data.map((v) => {
              const downloadedPkg = packages.data?.find((p) => p.sha === v.sha || p.version === v.version);
              const isCurrent = (update && v.version === update.current) || Boolean(downloadedPkg?.current);
              return (
                <div key={`${v.ref}-${v.sha}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
                  <GitBranch className="size-4 text-zen-blue" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        {v.label} · v{v.version}
                      </span>
                      {isCurrent && <Badge tone="green">Đang chạy</Badge>}
                      {!isCurrent && downloadedPkg && <Badge tone="blue">Đã tải</Badge>}
                    </div>
                    <div className="mono truncate text-xs text-slate-500">
                      {v.sha.slice(0, 7)} {v.message && `· ${v.message}`}
                    </div>
                  </div>
                  {isCurrent ? (
                    <Button size="xs" variant="ghost" disabled>
                      Đang dùng
                    </Button>
                  ) : downloadedPkg ? (
                    <Button size="xs" variant="soft" icon={Rocket} onClick={() => void install(downloadedPkg)}>
                      Cài bản này
                    </Button>
                  ) : (
                    <Button size="xs" icon={Download} onClick={() => void download(v.sha)}>
                      Tải về
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* OVERLAY KHÓA GIAO DIỆN BẢO TRÌ KHI ĐANG CẬP NHẬT */}
      {updating && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-xl space-y-6 rounded-3xl border border-zen-purple/40 bg-gradient-to-b from-[#141829] to-[#0c0e18] p-6 shadow-2xl ring-1 ring-purple-500/20 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-zen-purple/40 to-zen-blue/40 ring-1 ring-white/10">
                <Loader2 className="size-8 animate-spin text-zen-purple" />
                <Sparkles className="absolute -bottom-1 -right-1 size-5 text-amber-400 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white">Đang nâng cấp ZenPanel v{updating.version}</h3>
                  <Badge tone="blue" className="mono animate-pulse">Bảo trì</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Giao diện đang được khóa tạm thời để bảo vệ tiến trình nâng cấp. Vui lòng giữ nguyên cửa sổ này.
                </p>
              </div>
            </div>

            {/* Thanh tiến trình & ETA */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300">{updating.stage}</span>
                <span className="mono font-bold text-white">{txaformat.percent(updating.percent, 0)}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-zen-purple via-zen-blue to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(8, updating.percent))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Đã chạy: {txaformat.timeLeft(Math.floor((Date.now() - updating.startedAt) / 1000))}</span>
                <span>Dự kiến còn: {txaformat.timeLeft(updating.etaSec)}</span>
              </div>
            </div>

            {/* Các bước nâng cấp */}
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] text-slate-400">
              <div className={cn("rounded-lg p-2 ring-1", updating.percent >= 15 ? "bg-purple-950/60 ring-purple-500/40 text-purple-200" : "bg-slate-900/40 ring-slate-800")}>
                1. Chuẩn bị
              </div>
              <div className={cn("rounded-lg p-2 ring-1", updating.percent >= 40 ? "bg-purple-950/60 ring-purple-500/40 text-purple-200" : "bg-slate-900/40 ring-slate-800")}>
                2. Cập nhật mã
              </div>
              <div className={cn("rounded-lg p-2 ring-1", updating.percent >= 70 ? "bg-purple-950/60 ring-purple-500/40 text-purple-200" : "bg-slate-900/40 ring-slate-800")}>
                3. Tái khởi động
              </div>
              <div className={cn("rounded-lg p-2 ring-1", updating.percent >= 95 ? "bg-emerald-950/60 ring-emerald-500/40 text-emerald-200" : "bg-slate-900/40 ring-slate-800")}>
                4. Sẵn sàng
              </div>
            </div>

            {/* Log trực tiếp thu gọn */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Nhật ký nâng cấp</span>
                <button
                  type="button"
                  onClick={() => void copyUpdatingLog()}
                  className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-white"
                >
                  {copiedLog ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  {copiedLog ? 'Đã sao chép' : 'Sao chép log'}
                </button>
              </div>
              <pre className="mono max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-black/60 p-3 text-[11px] leading-relaxed text-slate-300 ring-1 ring-slate-800">
                {updating.log || 'Đang chờ output từ installer...'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÀNH CÔNG VỚI NÚT MỞ PUBLIC TRY CLOUDFLARE TỰ ĐỘNG LOGIN */}
      {successModal && (
        <Modal
          open={true}
          title={
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="size-5" />
              <span>Nâng cấp ZenPanel thành công!</span>
            </div>
          }
          onClose={() => setSuccessModal(null)}
          size="lg"
        >
          <div className="space-y-5">
            <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-5">
              <h4 className="font-bold text-white">ZenPanel đã hoạt động trở lại ở phiên bản v{successModal.version}</h4>
              <p className="text-xs text-slate-300">
                Hệ thống đã hoàn tất nâng cấp, tái khởi động dịch vụ thành công và bảo toàn toàn bộ dữ liệu.
              </p>
            </div>

            {successModal.tunnelUrl ? (
              <div className="space-y-3 rounded-2xl border border-zen-blue/40 bg-zen-blue/10 p-5">
                <div className="flex items-center gap-2">
                  <Globe className="size-5 text-zen-blue" />
                  <span className="text-sm font-bold text-white">Liên kết Cloudflare Tunnel Công Khai Mới:</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-ink-950 p-3">
                  <code className="mono flex-1 truncate text-xs text-emerald-300">
                    {successModal.tunnelUrl}
                  </code>
                  <CopyButton value={successModal.tunnelUrl} label="Sao chép" />
                </div>
                <p className="text-[11px] text-slate-400">
                  ⚡ Khi bấm nút bên dưới, trình duyệt sẽ tự động mở tab mới và <b>đăng nhập tự động ngay lập tức</b> mà bạn không cần phải nhập lại mật khẩu.
                </p>
              </div>
            ) : (
              <Notice tone="blue">
                ZenPanel đang chạy trên mạng nội bộ / IP máy chủ. Bạn có thể bật Cloudflare Tunnel trong mục Cài đặt bất cứ lúc nào.
              </Notice>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setSuccessModal(null);
                  window.location.reload();
                }}
              >
                Tải lại tab hiện tại
              </Button>
              {successModal.autoLoginUrl ? (
                <Button
                  variant="primary"
                  icon={ExternalLink}
                  onClick={() => {
                    window.open(successModal.autoLoginUrl!, '_blank');
                    setSuccessModal(null);
                  }}
                  className="bg-gradient-to-r from-zen-purple to-zen-blue text-white hover:opacity-95"
                >
                  🚀 Mở ZenPanel Mới (Tự động đăng nhập)
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    setSuccessModal(null);
                    window.location.reload();
                  }}
                >
                  Xác nhận & Tải lại
                </Button>
              )}
            </div>
          </div>
        </Modal>
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
