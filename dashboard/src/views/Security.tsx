// ZenPanel - Bảo mật & WAF: Cloudflare Anti-DDoS (Under Attack Mode), DNS, cache + danh sách IP bị chặn
import { useState, type FormEvent } from 'react';
import { Ban, Cloud, Eraser, Globe, KeyRound, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Select, Spinner, Toggle, cn, td, th, tr } from '../components/ui';
import { del, patch, post, put } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { CloudflareZone, DnsRecord, FirewallRule, FirewallStatus } from '../lib/types';
import { RuleModal } from './Firewall';

function DnsModal({ zone, onClose }: { zone: CloudflareZone; onClose: () => void }) {
  const records = useApi<DnsRecord[]>(`/api/cloudflare/zones/${zone.id}/dns`);
  const [form, setForm] = useState({ type: 'A', name: '', content: '', proxied: true });
  const [saving, setSaving] = useState(false);
  const { confirm, run } = useFeedback();

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(() => post(`/api/cloudflare/zones/${zone.id}/dns`, form), 'Đã thêm bản ghi DNS');
    setSaving(false);
    if (ok) {
      setForm({ ...form, name: '', content: '' });
      await records.reload();
    }
  };

  const remove = async (record: DnsRecord) => {
    if (!(await confirm({ title: 'Xóa bản ghi DNS', message: <>Xóa {record.type} <b className="mono">{record.name}</b>?</>, danger: true, confirmLabel: 'Xóa' }))) return;
    await run(() => del(`/api/cloudflare/zones/${zone.id}/dns/${record.id}`), 'Đã xóa bản ghi');
    await records.reload();
  };

  return (
    <Modal open onClose={onClose} title={`DNS · ${zone.name}`} size="xl">
      <form onSubmit={add} className="mb-4 grid gap-3 sm:grid-cols-[110px_1fr_1fr_auto_auto] sm:items-end">
        <Field label="Loại">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'CAA', 'SRV'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tên">
          <input className="input mono" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={`www hoặc ${zone.name}`} />
        </Field>
        <Field label="Nội dung">
          <input className="input mono" required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="IP máy chủ" />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm text-slate-300">
          <Toggle checked={form.proxied} onChange={(proxied) => setForm({ ...form, proxied })} /> Proxy
        </label>
        <Button type="submit" variant="primary" icon={Plus} loading={saving}>
          Thêm
        </Button>
      </form>
      {records.error ? (
        <ErrorBox message={records.error} onRetry={records.reload} />
      ) : !records.data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className={th}>Loại</th>
                <th className={th}>Tên</th>
                <th className={th}>Nội dung</th>
                <th className={th}>Proxy</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {records.data.map((record) => (
                <tr key={record.id} className={tr}>
                  <td className={td}>
                    <Badge tone="blue">{record.type}</Badge>
                  </td>
                  <td className={cn(td, 'mono text-slate-100')}>{record.name}</td>
                  <td className={cn(td, 'mono max-w-[260px] truncate text-slate-400')} title={record.content}>
                    {record.content}
                  </td>
                  <td className={td}>{record.proxied ? <Cloud className="size-4 text-orange-400" /> : <span className="text-xs text-slate-500">DNS only</span>}</td>
                  <td className={cn(td, 'text-right')}>
                    <IconButton icon={Trash2} title="Xóa" className="hover:text-zen-red" onClick={() => void remove(record)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function CloudflarePanel() {
  const status = useApi<{ configured: boolean }>('/api/cloudflare');
  const zones = useApi<CloudflareZone[]>(status.data?.configured ? '/api/cloudflare/zones' : null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dnsZone, setDnsZone] = useState<CloudflareZone | null>(null);
  const { confirm, run } = useFeedback();

  const saveToken = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(() => put('/api/cloudflare/token', { token }), 'Đã kết nối Cloudflare');
    setSaving(false);
    if (ok) {
      setToken('');
      await status.reload();
    }
  };

  const disconnect = async () => {
    if (!(await confirm({ title: 'Ngắt kết nối Cloudflare', message: 'Xóa API Token đã lưu khỏi ZenPanel?', danger: true, confirmLabel: 'Ngắt kết nối' }))) return;
    await run(() => put('/api/cloudflare/token', { token: '' }), 'Đã xóa API Token');
    zones.setData(null);
    await status.reload();
  };

  const setSetting = async (zone: CloudflareZone, setting: string, value: string, label: string) => {
    setBusy(zone.id);
    await run(() => patch(`/api/cloudflare/zones/${zone.id}/settings/${setting}`, { value }), `${zone.name}: ${label}`);
    setBusy(null);
    await zones.reload();
  };

  const purge = async (zone: CloudflareZone) => {
    if (!(await confirm({ title: 'Xóa toàn bộ cache', message: <>Xóa cache Cloudflare của <b>{zone.name}</b>? Lượt truy cập tiếp theo sẽ tải lại từ máy chủ.</>, confirmLabel: 'Purge cache' }))) return;
    await run(() => post(`/api/cloudflare/zones/${zone.id}/purge`), 'Đã xóa cache');
  };

  if (!status.data) return <Spinner />;

  if (!status.data.configured) {
    return (
      <Card title="Kết nối Cloudflare" icon={Cloud}>
        <form onSubmit={saveToken} className="space-y-4">
          <p className="text-sm text-slate-400">
            Tạo API Token tại{' '}
            <a className="text-blue-300 underline" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
              dash.cloudflare.com/profile/api-tokens
            </a>{' '}
            với quyền <b>Zone · Zone Settings · Edit</b>, <b>Zone · DNS · Edit</b> và <b>Zone · Cache Purge · Purge</b>.
          </p>
          <Field label="Cloudflare API Token">
            <input className="input mono" type="password" required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </Field>
          <Button type="submit" variant="primary" icon={KeyRound} loading={saving}>
            Kết nối
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card
      title="Cloudflare Anti-DDoS"
      icon={Cloud}
      bodyClassName="p-0"
      actions={
        <>
          <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void zones.reload()} />
          <Button size="sm" variant="ghost" onClick={() => void disconnect()}>
            Ngắt kết nối
          </Button>
        </>
      }
    >
      {zones.error ? (
        <div className="p-4">
          <ErrorBox message={zones.error} onRetry={zones.reload} />
        </div>
      ) : !zones.data ? (
        <Spinner label="Đang tải danh sách domain từ Cloudflare..." />
      ) : zones.data.length === 0 ? (
        <EmptyState icon={Globe} title="Token chưa có quyền truy cập domain nào" />
      ) : (
        <div className="divide-y divide-slate-700/40">
          {zones.data.map((zone) => {
            const underAttack = zone.settings.security_level === 'under_attack';
            return (
              <div key={zone.id} className={cn('space-y-4 p-5', busy === zone.id && 'opacity-60')}>
                <div className="flex flex-wrap items-center gap-3">
                  <Globe className="size-5 text-orange-400" />
                  <span className="mono text-base font-bold text-white">{zone.name}</span>
                  <Badge tone={zone.status === 'active' ? 'green' : 'amber'}>{zone.status}</Badge>
                  <Badge>{zone.plan}</Badge>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" icon={Globe} onClick={() => setDnsZone(zone)}>
                      DNS
                    </Button>
                    <Button size="sm" icon={Eraser} onClick={() => void purge(zone)}>
                      Purge cache
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ZoneSetting
                    icon={ShieldAlert}
                    title="Under Attack Mode"
                    description="Bắt mọi khách qua thử thách JS khi đang bị DDoS"
                    danger={underAttack}
                  >
                    <Toggle checked={underAttack} onChange={(on) => void setSetting(zone, 'security_level', on ? 'under_attack' : 'medium', on ? 'Bật Under Attack' : 'Tắt Under Attack')} />
                  </ZoneSetting>
                  <ZoneSetting icon={ShieldCheck} title="Always Use HTTPS" description="Tự chuyển HTTP sang HTTPS">
                    <Toggle checked={zone.settings.always_use_https === 'on'} onChange={(on) => void setSetting(zone, 'always_use_https', on ? 'on' : 'off', 'Always HTTPS')} />
                  </ZoneSetting>
                  <ZoneSetting icon={Zap} title="Development Mode" description="Tạm tắt cache 3 giờ khi đang sửa site">
                    <Toggle checked={zone.settings.development_mode === 'on'} onChange={(on) => void setSetting(zone, 'development_mode', on ? 'on' : 'off', 'Development Mode')} />
                  </ZoneSetting>
                  <ZoneSetting icon={KeyRound} title="Chế độ SSL" description="Full (strict) khi máy chủ đã có chứng chỉ">
                    <Select className="h-9 w-32 py-0 text-xs" value={zone.settings.ssl ?? 'off'} onChange={(e) => void setSetting(zone, 'ssl', e.target.value, `SSL ${e.target.value}`)}>
                      <option value="off">Off</option>
                      <option value="flexible">Flexible</option>
                      <option value="full">Full</option>
                      <option value="strict">Full (strict)</option>
                    </Select>
                  </ZoneSetting>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  Mức bảo mật hiện tại: <Badge tone={underAttack ? 'red' : 'blue'}>{zone.settings.security_level ?? '—'}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dnsZone && <DnsModal zone={dnsZone} onClose={() => setDnsZone(null)} />}
    </Card>
  );
}

function ZoneSetting({ icon: Icon, title, description, danger, children }: { icon: typeof Cloud; title: string; description: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', danger ? 'border-zen-red/50 bg-zen-red/10' : 'border-slate-700/50 bg-ink-950/50')}>
      <Icon className={cn('size-5 shrink-0', danger ? 'text-zen-red' : 'text-zen-blue')} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      {children}
    </div>
  );
}

function BlockedIps() {
  const firewall = useApi<{ status: FirewallStatus; rules: FirewallRule[] }>('/api/firewall');
  const [blocking, setBlocking] = useState(false);
  const { confirm, run } = useFeedback();
  const blocked = (firewall.data?.rules ?? []).filter((r) => r.action === 'deny' && r.source);

  const unblock = async (rule: FirewallRule) => {
    if (!(await confirm({ title: 'Bỏ chặn IP', message: <>Cho phép <b className="mono">{rule.source}</b> truy cập lại?</>, confirmLabel: 'Bỏ chặn' }))) return;
    await run(() => del(`/api/firewall/rules/${encodeURIComponent(rule.id)}`), `Đã bỏ chặn ${rule.source}`);
    await firewall.reload();
  };

  return (
    <Card
      title="IP bị chặn"
      icon={Ban}
      actions={
        <Button size="sm" variant="danger" icon={Ban} onClick={() => setBlocking(true)}>
          Chặn IP
        </Button>
      }
    >
      {firewall.data && !firewall.data.status.enabled && (
        <div className="mb-4">
          <Notice tone="amber">Tường lửa đang tắt nên các luật chặn IP chưa có hiệu lực. Bật trong mục Tường lửa.</Notice>
        </div>
      )}
      {firewall.error ? (
        <ErrorBox message={firewall.error} onRetry={firewall.reload} />
      ) : !firewall.data ? (
        <Spinner />
      ) : blocked.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Chưa chặn IP nào" />
      ) : (
        <div className="space-y-2">
          {blocked.map((rule) => (
            <div key={rule.id} className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-2.5">
              <Ban className="size-4 text-zen-red" />
              <span className="mono font-semibold text-white">{rule.source}</span>
              <span className="flex-1 truncate text-xs text-slate-500">{rule.description}</span>
              <Button size="xs" variant="ghost" onClick={() => void unblock(rule)}>
                Bỏ chặn
              </Button>
            </div>
          ))}
        </div>
      )}
      {blocking && <RuleModal open initial={{ mode: 'block' }} onClose={() => setBlocking(false)} onSaved={() => void firewall.reload()} />}
    </Card>
  );
}

export default function Security() {
  return (
    <>
      <PageHeader title="Bảo mật & WAF" description="Chống DDoS qua Cloudflare, quản lý DNS và chặn IP độc hại" icon={ShieldCheck} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <CloudflarePanel />
        <div className="space-y-4">
          <BlockedIps />
          <Card title="Lớp bảo vệ của ZenPanel" icon={ShieldCheck}>
            <ul className="space-y-2.5 text-sm text-slate-300">
              {[
                'Đăng nhập bằng mật khẩu băm scrypt, token ký HMAC hết hạn sau 7 ngày',
                'Khóa đăng nhập 5 phút sau 5 lần sai mật khẩu (theo IP thật qua Cloudflare)',
                'Đổi mật khẩu sẽ đăng xuất mọi phiên khác',
                'Truy cập công khai qua Cloudflare Tunnel, không cần mở cổng panel ra Internet',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-zen-green" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
