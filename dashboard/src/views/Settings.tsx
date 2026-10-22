// ZenPanel - Cài đặt: tài khoản quản trị, Cloudflare Tunnel, thông tin agent
import { useState, type FormEvent } from 'react';
import { CircleCheck, CircleX, Cloud, Cog, Dices, Eye, EyeOff, Info, KeyRound, Lock, LogOut, PenLine, Save } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, Field, Notice, PageHeader, StatusDot, cn } from '../components/ui';
import { post, setToken } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import { PASSWORD_RULES } from '../lib/password';

type Mode = 'random' | 'custom';

function AccountCard() {
  const me = useApi<{ username: string }>('/api/auth/me');
  const [mode, setMode] = useState<Mode>('random');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
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
        message: 'ZenPanel sẽ tạo mật khẩu mạnh 20 ký tự và chỉ hiển thị 1 lần. Các phiên đăng nhập khác sẽ bị đăng xuất.',
        confirmLabel: 'Sinh mật khẩu',
      });
      if (!ok) return;
    }
    setSaving(true);
    const result = await run(
      () =>
        post<{ token: string; password?: string }>('/api/auth/password', {
          mode,
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
              { id: 'random', icon: Dices, title: 'Sinh ngẫu nhiên', desc: 'Mật khẩu mạnh 20 ký tự' },
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

export default function Settings() {
  const { info, tunnel } = usePanel();

  return (
    <>
      <PageHeader title="Cài đặt" description="Tài khoản quản trị và thông tin ZenPanel Agent" icon={Cog} />
      <div className="grid gap-4 xl:grid-cols-2">
        <AccountCard />

        <div className="space-y-4">
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
              <dl className="space-y-2.5 text-sm">
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
                  <div key={key} className="flex items-center justify-between gap-4">
                    <dt className="shrink-0 text-slate-500">{key}</dt>
                    <dd className="text-right text-slate-200">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
