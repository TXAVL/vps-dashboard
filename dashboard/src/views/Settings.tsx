// ZenPanel - Cài đặt: tài khoản quản trị, Cloudflare Tunnel, thông tin agent
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  Bot,
  CalendarClock,
  Check,
  CircleCheck,
  CircleX,
  Cloud,
  Cog,
  Dices,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  History,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  Package,
  Palette,
  PenLine,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useJobs } from '../components/jobs';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Notice, PageHeader, Spinner, StatusDot, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, post, put, setToken } from '../lib/api';
import { formatBytes, formatDate, formatDuration, formatRate, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import { PASSWORD_RULES, RANDOM_DEFAULT_LENGTH, RANDOM_MAX_LENGTH, RANDOM_MIN_LENGTH } from '../lib/password';
import type { AiProvider, Job, LoginRecord, PanelPrefs, RemoteVersion, VersionPackage } from '../lib/types';

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
          <Button type="button" variant="ghost" icon={LogOut} onClick={() => setToken(null)}>
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
              { id: 'bytes', title: 'Byte / giây', units: 'KB/s · MB/s · GB/s', desc: 'Giống trình tải file, dễ ước lượng dung lượng (mặc định)' },
              { id: 'bits', title: 'Bit / giây', units: 'Kbps · Mbps · Gbps', desc: 'Giống thông số băng thông nhà mạng / nhà cung cấp VPS công bố' },
            ] as const
          ).map((opt, index) => (
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
                  Mục {index + 1}: {opt.title}
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

function UpdateCard() {
  const { update, refreshUpdate, prefs, savePrefs } = usePanel();
  const packages = useApi<VersionPackage[]>('/api/update/packages');
  const remote = useApi<RemoteVersion[]>('/api/update/remote');
  const [checking, setChecking] = useState(false);
  const [installLog, setInstallLog] = useState<string | null>(null);
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
      title: older ? `Quay lại phiên bản ${pkg.version}` : `Cài phiên bản ${pkg.version}`,
      message: (
        <>
          ZenPanel sẽ build lại và <b>khởi động lại agent</b> (khoảng 1-3 phút). Trang sẽ mất kết nối trong lúc cài, sau đó tự kết nối lại. Dữ liệu, mật khẩu, website, ứng dụng
          được giữ nguyên.
        </>
      ),
      confirmLabel: older ? 'Quay lại bản này' : 'Cài đặt',
    });
    if (!ok) return;
    const result = await run(() => post(`/api/update/packages/${pkg.id}/install`));
    if (!result) return;
    toast('Đang cài đặt phiên bản mới, panel sẽ tự khởi động lại...', 'info');
    setInstallLog('');
    // Theo dõi log cài đặt tới khi agent khởi động lại
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await get<{ log: string }>('/api/update/log').catch(() => null);
      if (res) setInstallLog(res.log);
    }
  };

  const remove = async (pkg: VersionPackage) => {
    if (!(await confirm({ title: 'Xoá gói phiên bản', message: <>Xoá gói <b className="mono">{pkg.id}</b> ({formatBytes(pkg.size)}) khỏi ổ đĩa?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/update/packages/${encodeURIComponent(pkg.id)}`), 'Đã xoá gói phiên bản');
    await packages.reload();
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
                <span className="block text-xs text-slate-500">Kiểm tra GitHub mỗi 6 giờ</span>
              </span>
              <Toggle checked={prefs.autoCheckUpdate} onChange={(v) => void run(() => savePrefs({ autoCheckUpdate: v }), v ? 'Đã bật tự kiểm tra' : 'Đã tắt tự kiểm tra')} />
            </label>
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
            {remote.data.map((v) => (
              <div key={`${v.ref}-${v.sha}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
                <GitBranch className="size-4 text-zen-blue" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-100">
                    {v.label} · v{v.version}
                  </div>
                  <div className="mono truncate text-xs text-slate-500">
                    {v.sha.slice(0, 7)} {v.message && `· ${v.message}`}
                  </div>
                </div>
                <Button size="xs" icon={Download} onClick={() => void download(v.sha)}>
                  Tải về
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {installLog !== null && (
        <Card title="Log cài đặt phiên bản" icon={FileText}>
          <pre className="mono max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[#0a0e17] p-4 text-xs text-slate-300">{installLog || 'Đang chờ installer khởi chạy...'}</pre>
        </Card>
      )}
    </div>
  );
}

function SessionsCard() {
  const history = useApi<LoginRecord[]>('/api/auth/history');
  const { confirm, run } = useFeedback();

  const logoutAll = async () => {
    if (!(await confirm({ title: 'Đăng xuất mọi thiết bị', message: 'Tất cả phiên đăng nhập trên các thiết bị khác sẽ bị đăng xuất ngay. Phiên hiện tại được giữ lại.', confirmLabel: 'Đăng xuất tất cả' }))) return;
    const result = await run(() => post<{ token: string }>('/api/auth/logout-all'), 'Đã đăng xuất mọi thiết bị khác');
    if (result) setToken(result.token);
  };

  return (
    <Card
      title="Lịch sử đăng nhập"
      icon={History}
      bodyClassName="p-0"
      actions={
        <Button size="sm" variant="danger" icon={LogOut} onClick={() => void logoutAll()}>
          Đăng xuất mọi thiết bị
        </Button>
      }
    >
      {!history.data ? (
        <Spinner />
      ) : history.data.length === 0 ? (
        <EmptyState icon={History} title="Chưa có lần đăng nhập nào được ghi lại" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className={th}>Thời gian</th>
                <th className={th}>IP</th>
                <th className={th}>Kết quả</th>
                <th className={th}>Trình duyệt</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((h, i) => (
                <tr key={`${h.at}-${i}`} className={tr}>
                  <td className={cn(td, 'text-xs text-slate-400')}>{formatDate(h.at)}</td>
                  <td className={cn(td, 'mono text-slate-200')}>{h.ip}</td>
                  <td className={td}>
                    <Badge tone={h.ok ? 'green' : 'red'}>{h.ok ? 'Thành công' : 'Sai mật khẩu'}</Badge>
                  </td>
                  <td className={cn(td, 'max-w-[320px] truncate text-xs text-slate-500')} data-tip={h.userAgent}>
                    {h.userAgent || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AiCard() {
  const providers = useApi<AiProvider[]>('/api/ai/providers');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, run, toast } = useFeedback();

  const save = async (p: AiProvider) => {
    const key = drafts[p.id]?.trim();
    if (!key) return;
    setBusy(p.id);
    const list = await run(() => put<AiProvider[]>(`/api/ai/providers/${p.id}`, { key }));
    setBusy(null);
    if (!list) return;
    providers.setData(list);
    setDrafts({ ...drafts, [p.id]: '' });
    const saved = list.find((x) => x.id === p.id);
    toast(saved?.lastTest?.ok ? `${p.label}: key hợp lệ, đã lưu` : `${p.label}: đã lưu nhưng ${saved?.lastTest?.message ?? 'chưa kiểm tra được'}`, saved?.lastTest?.ok ? 'success' : 'error');
  };

  const test = async (p: AiProvider) => {
    setBusy(p.id);
    const result = await run(() => post<{ ok: boolean; message: string }>(`/api/ai/providers/${p.id}/test`));
    setBusy(null);
    if (result) toast(`${p.label}: ${result.message}`, result.ok ? 'success' : 'error');
    await providers.reload();
  };

  const remove = async (p: AiProvider) => {
    if (!(await confirm({ title: `Xoá key ${p.label}`, message: 'Các app AI đang dùng key này cần "Cấu hình lại" để gỡ key khỏi container.', danger: true, confirmLabel: 'Xoá key' }))) return;
    const list = await run(() => del<AiProvider[]>(`/api/ai/providers/${p.id}`), 'Đã xoá API key');
    if (list) providers.setData(list);
  };

  return (
    <div className="space-y-4">
      <Notice icon={Sparkles}>
        Lưu API key 1 lần, các app AI trong App Store (AI Gateway, Open WebUI...) tự dùng chung. Key được lưu trên VPS, chỉ hiện 6 ký tự đầu và 4 ký tự cuối. Đổi key xong
        hãy vào App Store bấm <b>Cấu hình lại</b> cho các app AI.
      </Notice>
      {!providers.data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {providers.data.map((p) => (
            <Card
              key={p.id}
              title={p.label}
              icon={Bot}
              actions={
                p.configured ? (
                  <Badge tone={p.lastTest?.ok ? 'green' : p.lastTest ? 'red' : 'amber'}>{p.lastTest?.ok ? 'Hoạt động' : p.lastTest ? 'Lỗi' : 'Chưa kiểm tra'}</Badge>
                ) : (
                  <Badge>Chưa có key</Badge>
                )
              }
            >
              <div className="space-y-3 text-sm">
                {p.configured && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
                    <KeyRound className="size-4 text-slate-500" />
                    <span className="mono flex-1 text-slate-300">{p.masked}</span>
                    <Button size="xs" variant="soft" loading={busy === p.id} onClick={() => void test(p)}>
                      Kiểm tra
                    </Button>
                    <IconButton icon={Trash2} title="Xoá key" className="hover:text-zen-red" onClick={() => void remove(p)} />
                  </div>
                )}
                {p.lastTest && !p.lastTest.ok && <p className="text-xs text-red-300">{p.lastTest.message}</p>}
                <div className="flex gap-2">
                  <input
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    placeholder={p.configured ? 'Nhập key mới để thay thế' : p.keyHint}
                    value={drafts[p.id] ?? ''}
                    onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                  />
                  <Button variant="primary" icon={Save} loading={busy === p.id} disabled={!drafts[p.id]?.trim()} onClick={() => void save(p)}>
                    Lưu
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Endpoint OpenAI-compatible: <code className="mono text-slate-400">{p.baseUrl}</code>
                  </span>
                  <a href={p.keyUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-300 hover:underline">
                    Lấy API key →
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PublicHostCard() {
  const { prefs, savePrefs } = usePanel();
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
        <p className="text-sm text-slate-400">
          Dùng để hiển thị địa chỉ truy cập app (IP:cổng) và host kết nối database cho máy bên ngoài. Để trống = tự lấy IP public. Có domain riêng (vd <code className="mono">vps.example.com</code>
          ) trỏ bản ghi A về IP VPS thì nhập vào đây.
        </p>
        <div className="flex flex-wrap gap-2">
          <input className="input mono max-w-md" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Tự phát hiện IP public" />
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

type TabId = 'account' | 'appearance' | 'ai' | 'vps' | 'update' | 'sessions' | 'system';

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const { update } = usePanel();
  const tab = (params.get('tab') as TabId | null) ?? 'account';

  return (
    <>
      <PageHeader title="Cài đặt" description="Tài khoản, giao diện, hạn VPS, cập nhật & phiên bản ZenPanel" icon={Cog} />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={(next) => setParams({ tab: next })}
          tabs={[
            { id: 'account', label: 'Tài khoản', icon: KeyRound },
            { id: 'appearance', label: 'Giao diện', icon: Palette },
            { id: 'ai', label: 'AI', icon: Bot },
            { id: 'vps', label: 'Hạn VPS', icon: CalendarClock },
            { id: 'update', label: update?.available ? 'Cập nhật •' : 'Cập nhật', icon: Sparkles },
            { id: 'sessions', label: 'Đăng nhập', icon: History },
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
      {tab === 'update' && <UpdateCard />}
      {tab === 'sessions' && <SessionsCard />}
      {tab === 'system' && <SystemCard />}
    </>
  );
}
