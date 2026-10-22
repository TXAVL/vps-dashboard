// ZenPanel - Cài đặt: tài khoản quản trị, Cloudflare Tunnel, thông tin agent
import { useState, type FormEvent } from 'react';
import { Cloud, Cog, Info, KeyRound, LogOut, Save } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, Field, PageHeader, StatusDot } from '../components/ui';
import { post, setToken } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';

export default function Settings() {
  const { info, tunnel } = usePanel();
  const me = useApi<{ username: string }>('/api/auth/me');
  const [form, setForm] = useState({ username: '', currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const { run, toast } = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirm) {
      toast('Mật khẩu nhập lại không khớp', 'error');
      return;
    }
    setSaving(true);
    const result = await run(
      () => post<{ token: string }>('/api/auth/password', { username: form.username || undefined, currentPassword: form.currentPassword, newPassword: form.newPassword }),
      'Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.',
    );
    setSaving(false);
    if (result) {
      setToken(result.token);
      setForm({ username: '', currentPassword: '', newPassword: '', confirm: '' });
      await me.reload();
    }
  };

  return (
    <>
      <PageHeader title="Cài đặt" description="Tài khoản quản trị và thông tin ZenPanel Agent" icon={Cog} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Tài khoản quản trị" icon={KeyRound}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Tên đăng nhập" hint={`Hiện tại: ${me.data?.username ?? '...'} — để trống nếu không đổi`}>
              <input className="input mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
            </Field>
            <Field label="Mật khẩu hiện tại">
              <input className="input" type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
                <input className="input" type="password" required minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Nhập lại mật khẩu mới">
                <input className="input" type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
              </Field>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" icon={LogOut} onClick={() => setToken(null)}>
                Đăng xuất
              </Button>
              <Button type="submit" variant="primary" icon={Save} loading={saving}>
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </Card>

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
