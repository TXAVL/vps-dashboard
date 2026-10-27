// ZenPanel - Truy cập & Máy chủ: SSH (port, root, mật khẩu, key), Fail2ban, lịch sử đăng nhập, hostname / DNS / múi giờ
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Ban, Clock, Download, Globe, KeyRound, Lock, Plus, RefreshCw, Save, ShieldAlert, ShieldCheck, Terminal, Trash2, Undo2, UserX } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Notice, PageHeader, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, post, put } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Ssh { installed: boolean; running: boolean; configFile: string; port: number; permitRootLogin: 'yes' | 'no' | 'prohibit-password'; passwordAuthentication: boolean; pubkeyAuthentication: boolean; maxAuthTries: number; clientAliveInterval: number; serviceName: string }
interface SshKey { fingerprint: string; type: string; comment: string; bits: string }
interface LoginEvent { time: string; user: string; ip: string; method: string; ok: boolean }
interface Jail { name: string; currentlyBanned: number; totalBanned: number; currentlyFailed: number; bannedIps: string[] }
interface Host { hostname: string; timezone: string; timezoneIana: string; utcOffset: string; time: string; ntpSynced: boolean | null; dns: string[]; uptimeSec: number; kernel: string }
interface Zone { id: string; label: string; offset: string; group: string }

function SshTab() {
  const ssh = useApi<Ssh>('/api/access/ssh');
  const keys = useApi<{ file: string; keys: SshKey[] }>('/api/access/ssh/keys');
  const [form, setForm] = useState<Ssh | null>(null);
  const [newKey, setNewKey] = useState('');
  const [generated, setGenerated] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { run, confirm, toast } = useFeedback();

  useEffect(() => {
    if (ssh.data) setForm(ssh.data);
  }, [ssh.data]);

  if (ssh.error) return <ErrorBox message={ssh.error} onRetry={ssh.reload} />;
  if (!ssh.data || !form) return <Spinner />;
  if (!ssh.data.installed) return <Notice tone="amber">Máy chủ chưa cài OpenSSH Server. Cài bằng App Store (OpenSSH) hoặc <code className="mono">apt install openssh-server</code>.</Notice>;

  const dirty = JSON.stringify(form) !== JSON.stringify(ssh.data);
  const hasKeys = (keys.data?.keys.length ?? 0) > 0;

  const save = async () => {
    if (form.port !== ssh.data!.port) {
      if (!(await confirm({ title: `Đổi cổng SSH sang ${form.port}`, message: <>Kết nối mới phải dùng cổng <b>{form.port}</b>. ZenPanel sẽ mở cổng này trên tường lửa máy chủ, nhưng nếu VPS có <b>Security Group</b> của nhà cung cấp, bạn cần mở cổng {form.port}/TCP ở đó <b>trước</b>, nếu không sẽ không SSH vào được nữa.</>, danger: true, confirmLabel: 'Đã hiểu, đổi cổng' }))) return;
    }
    if (form.permitRootLogin === 'yes' && ssh.data!.permitRootLogin !== 'yes') {
      if (!(await confirm({ title: 'Cho phép root đăng nhập bằng mật khẩu', message: 'Đây là cấu hình rủi ro cao, bot dò mật khẩu root liên tục. Nên dùng SSH key thay thế.', danger: true, confirmLabel: 'Vẫn cho phép' }))) return;
    }
    setSaving(true);
    const res = await run(() => put<{ warnings: string[]; settings: Ssh }>('/api/access/ssh', form), 'Đã áp dụng cấu hình SSH');
    setSaving(false);
    if (res) {
      res.warnings.forEach((w) => toast(w, 'info'));
      await ssh.reload();
    }
  };

  const addKey = async () => {
    const ok = await run(() => post('/api/access/ssh/keys', { publicKey: newKey }), 'Đã thêm SSH key');
    if (ok !== undefined) {
      setNewKey('');
      await keys.reload();
    }
  };

  const generate = async () => {
    const res = await run(() => post<{ privateKey: string; publicKey: string }>('/api/access/ssh/keys/generate', { comment: 'zenpanel' }));
    if (res) {
      setGenerated(res);
      await keys.reload();
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Cấu hình SSH" icon={Terminal} actions={<Badge tone={ssh.data.running ? 'green' : 'red'}>{ssh.data.running ? 'Đang chạy' : 'Đã dừng'}</Badge>}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cổng SSH" hint="Đổi khỏi 22 giúp giảm hẳn bot dò mật khẩu">
              <input type="number" min={1} max={65535} className="input mono" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </Field>
            <Field label="Đăng nhập root">
              <Select value={form.permitRootLogin} onChange={(e) => setForm({ ...form, permitRootLogin: e.target.value as Ssh['permitRootLogin'] })}>
                <option value="prohibit-password">Chỉ bằng SSH key (khuyên dùng)</option>
                <option value="no">Cấm hoàn toàn</option>
                <option value="yes">Cho phép cả mật khẩu (rủi ro)</option>
              </Select>
            </Field>
            <Field label="Số lần thử sai tối đa">
              <input type="number" min={1} max={20} className="input" value={form.maxAuthTries} onChange={(e) => setForm({ ...form, maxAuthTries: Number(e.target.value) })} />
            </Field>
            <Field label="Giữ kết nối (giây, 0 = tắt)" hint="Tránh phiên SSH bị rớt khi im lặng">
              <input type="number" min={0} max={3600} className="input" value={form.clientAliveInterval} onChange={(e) => setForm({ ...form, clientAliveInterval: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
            <span>
              <span className="block font-semibold text-slate-100">Đăng nhập bằng mật khẩu</span>
              <span className="block text-xs text-slate-500">{hasKeys ? 'Có thể tắt vì đã có SSH key' : 'Cần thêm SSH key trước khi tắt'}</span>
            </span>
            <Toggle checked={form.passwordAuthentication} disabled={!hasKeys && form.passwordAuthentication} onChange={(v) => setForm({ ...form, passwordAuthentication: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
            <span>
              <span className="block font-semibold text-slate-100">Đăng nhập bằng SSH key</span>
              <span className="block text-xs text-slate-500">An toàn hơn mật khẩu rất nhiều</span>
            </span>
            <Toggle checked={form.pubkeyAuthentication} onChange={(v) => setForm({ ...form, pubkeyAuthentication: v })} />
          </label>
          <div className="mono truncate text-[11px] text-slate-500">{ssh.data.configFile} · tự sao lưu .zenpanel.bak, kiểm tra cú pháp và hoàn tác nếu lỗi</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" icon={Undo2} disabled={!dirty} onClick={() => setForm(ssh.data)}>Hoàn lại</Button>
            <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={() => void save()}>Áp dụng</Button>
          </div>
        </div>
      </Card>

      <Card title="SSH key được phép" icon={KeyRound} actions={<Button size="sm" variant="soft" icon={Plus} onClick={() => void generate()}>Tạo cặp key mới</Button>}>
        {generated && (
          <div className="mb-4 space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
              <AlertTriangle className="size-4" /> Lưu private key ngay — sẽ không hiển thị lại
            </div>
            <pre className="mono max-h-40 overflow-auto rounded-lg bg-black/40 p-2 text-[10px] text-slate-300">{generated.privateKey}</pre>
            <div className="flex gap-2">
              <CopyButton value={generated.privateKey} label="Sao chép" />
              <Button size="xs" variant="ghost" icon={Download} onClick={() => {
                const url = URL.createObjectURL(new Blob([generated.privateKey], { type: 'text/plain' }));
                Object.assign(document.createElement('a'), { href: url, download: 'zenpanel_ed25519' }).click();
                URL.revokeObjectURL(url);
              }}>Tải file</Button>
              <Button size="xs" variant="ghost" onClick={() => setGenerated(null)}>Đã lưu xong</Button>
            </div>
          </div>
        )}
        {!keys.data ? (
          <Spinner />
        ) : keys.data.keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="Chưa có SSH key" description="Thêm public key của máy bạn (nội dung file .pub) hoặc để ZenPanel tạo cặp key mới." />
        ) : (
          <div className="mb-4 divide-y divide-slate-800/80 rounded-xl border border-slate-700/50">
            {keys.data.keys.map((k) => (
              <div key={k.fingerprint} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <KeyRound className="size-4 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-100">{k.comment || 'Không tên'} <span className="text-xs font-normal text-slate-500">{k.type} {k.bits}</span></div>
                  <div className="mono truncate text-[11px] text-slate-500">{k.fingerprint}</div>
                </div>
                <IconButton icon={Trash2} title="Xoá key" className="hover:text-zen-red" onClick={async () => {
                  if (!(await confirm({ title: 'Xoá SSH key', message: `Máy dùng key "${k.comment || k.fingerprint}" sẽ không đăng nhập được nữa.`, danger: true, confirmLabel: 'Xoá' }))) return;
                  await run(() => del(`/api/access/ssh/keys?fingerprint=${encodeURIComponent(k.fingerprint)}`), 'Đã xoá key');
                  await keys.reload();
                }} />
              </div>
            ))}
          </div>
        )}
        <Field label="Thêm public key" hint={keys.data ? `Lưu vào ${keys.data.file}` : undefined}>
          <textarea className="input mono min-h-[80px] text-xs" placeholder="ssh-ed25519 AAAAC3... user@laptop" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        </Field>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="primary" icon={Plus} disabled={!newKey.trim()} onClick={() => void addKey()}>Thêm key</Button>
        </div>
      </Card>
    </div>
  );
}

function Fail2banTab() {
  const f2b = useApi<{ supported: boolean; installed: boolean; running: boolean; jails: Jail[] }>('/api/access/fail2ban');
  const [ip, setIp] = useState('');
  const [jail, setJail] = useState('sshd');
  const { run, confirm } = useFeedback();

  if (f2b.error) return <ErrorBox message={f2b.error} onRetry={f2b.reload} />;
  if (!f2b.data) return <Spinner />;
  if (!f2b.data.supported) return <Notice tone="amber">Fail2ban chỉ có trên Linux. Trên Windows hãy dùng tab "Đăng nhập" để xem IP dò mật khẩu và chặn ở Tường lửa.</Notice>;
  if (!f2b.data.installed) {
    return (
      <EmptyState icon={ShieldAlert} title="Chưa cài Fail2ban" description="Fail2ban tự động chặn IP dò mật khẩu SSH và tấn công web." action={<a href="/apps?install=fail2ban"><Button variant="primary" icon={Download}>Cài từ App Store</Button></a>} />
    );
  }
  if (!f2b.data.running) return <Notice tone="red">Fail2ban đã cài nhưng dịch vụ không chạy. Khởi động trong tab Dịch vụ.</Notice>;

  const act = async (action: 'ban' | 'unban', j: string, address: string) => {
    if (action === 'ban' && !(await confirm({ title: `Chặn ${address}`, message: `IP sẽ bị chặn trong jail ${j}.`, danger: true, confirmLabel: 'Chặn' }))) return;
    await run(() => post(`/api/access/fail2ban/${action}`, { jail: j, ip: address }), action === 'ban' ? `Đã chặn ${address}` : `Đã bỏ chặn ${address}`);
    await f2b.reload();
  };

  const total = f2b.data.jails.reduce((n, j) => n + j.currentlyBanned, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Jail đang bật', f2b.data.jails.length], ['IP đang bị chặn', total], ['Tổng đã chặn', f2b.data.jails.reduce((n, j) => n + j.totalBanned, 0)]].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="mono mt-1 text-2xl font-black text-white">{v}</div>
          </div>
        ))}
      </div>
      <Card title="Chặn IP thủ công" icon={Ban}>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Jail"><Select value={jail} onChange={(e) => setJail(e.target.value)}>{f2b.data.jails.map((j) => <option key={j.name}>{j.name}</option>)}</Select></Field>
          <Field label="Địa chỉ IP"><input className="input mono w-48" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="1.2.3.4" /></Field>
          <Button variant="danger" icon={Ban} disabled={!ip.trim()} onClick={() => void act('ban', jail, ip.trim()).then(() => setIp(''))}>Chặn</Button>
        </div>
      </Card>
      {f2b.data.jails.map((j) => (
        <Card key={j.name} title={<span className="flex items-center gap-2">{j.name} <Badge tone={j.currentlyBanned ? 'red' : 'green'}>{j.currentlyBanned} đang chặn</Badge></span>} icon={ShieldCheck} actions={<span className="text-xs text-slate-500">đang theo dõi {j.currentlyFailed} lần sai · tổng chặn {j.totalBanned}</span>}>
          {j.bannedIps.length === 0 ? (
            <p className="text-sm text-slate-500">Không có IP nào đang bị chặn.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {j.bannedIps.map((address) => (
                <span key={address} className="mono flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/20 py-1 pl-2.5 pr-1 text-xs text-red-200">
                  {address}
                  <button type="button" className="rounded p-0.5 hover:bg-red-900/40" data-tip="Bỏ chặn" onClick={() => void act('unban', j.name, address)}><Undo2 className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function LoginsTab() {
  const data = useApi<{ events: LoginEvent[]; topAttackers: { ip: string; count: number }[]; timezone: string; utcOffset: string }>('/api/access/logins');
  const { run } = useFeedback();
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data) return <Spinner label="Đang đọc nhật ký đăng nhập..." />;
  const block = async (ip: string) => {
    await run(() => post('/api/firewall/rules', { action: 'deny', port: null, protocol: 'any', source: ip, description: `ZenPanel chặn ${ip}` }), `Đã chặn ${ip} ở tường lửa`);
  };
  const zone = data.data.timezone;
  // Hiện giờ theo múi giờ của MÁY CHỦ (không phải của trình duyệt) để khớp với log trên VPS
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    try {
      return d.toLocaleString('vi-VN', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return d.toLocaleString('vi-VN', { hour12: false });
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card
        title="Đăng nhập gần đây"
        icon={Lock}
        bodyClassName="p-0"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="slate">Giờ máy chủ: {zone} ({data.data.utcOffset})</Badge>
            <IconButton icon={RefreshCw} title="Tải lại" onClick={() => void data.reload()} />
          </div>
        }
      >
        {data.data.events.length === 0 ? (
          <EmptyState icon={Lock} title="Chưa có dữ liệu đăng nhập" description="Cần quyền root/Administrator để đọc nhật ký xác thực." />
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><th className={th}>Thời gian</th><th className={th}>Người dùng</th><th className={th}>IP</th><th className={th}>Kết quả</th></tr></thead>
              <tbody>
                {data.data.events.map((e, i) => (
                  <tr key={i} className={tr}>
                    <td className={cn(td, 'mono whitespace-nowrap text-xs text-slate-400')}>{fmt(e.time)}</td>
                    <td className={cn(td, 'font-semibold text-slate-200')}>{e.user}</td>
                    <td className={cn(td, 'mono text-xs text-slate-300')}>{e.ip || '—'}</td>
                    <td className={td}><Badge tone={e.ok ? 'green' : 'red'}>{e.ok ? 'Thành công' : 'Thất bại'}</Badge> <span className="text-xs text-slate-500">{e.method}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="IP dò mật khẩu nhiều nhất" icon={UserX}>
        {data.data.topAttackers.length === 0 ? (
          <p className="text-sm text-slate-500">Không thấy lần đăng nhập thất bại nào gần đây.</p>
        ) : (
          <div className="space-y-2">
            {data.data.topAttackers.map((a) => (
              <div key={a.ip} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-ink-950/40 px-3 py-2 text-sm">
                <span className="mono flex-1 text-slate-200">{a.ip}</span>
                <Badge tone="red">{a.count} lần</Badge>
                <Button size="xs" variant="ghost" icon={Ban} onClick={() => void block(a.ip)}>Chặn</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HostTab() {
  const host = useApi<Host>('/api/access/host');
  const zones = useApi<Zone[]>('/api/access/host/timezones');
  const [hostname, setHostname] = useState('');
  const [tz, setTz] = useState('');
  const [dns, setDns] = useState('');
  const { run, toast } = useFeedback();

  useEffect(() => {
    if (host.data) {
      setHostname(host.data.hostname);
      setTz(host.data.timezone);
      setDns(host.data.dns.join(', '));
    }
  }, [host.data]);

  if (host.error) return <ErrorBox message={host.error} onRetry={host.reload} />;
  if (!host.data) return <Spinner />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Hostname" icon={Globe}>
        <div className="flex items-end gap-2">
          <Field label="Tên máy chủ"><input className="input mono w-64" value={hostname} onChange={(e) => setHostname(e.target.value)} /></Field>
          <Button variant="primary" icon={Save} disabled={hostname === host.data.hostname} onClick={async () => {
            const r = await run(() => put<{ rebootRequired: boolean }>('/api/access/host/hostname', { hostname }), 'Đã đổi hostname');
            if (r?.rebootRequired) toast('Windows cần khởi động lại để áp dụng tên mới', 'info');
            await host.reload();
          }}>Lưu</Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Nhân hệ điều hành {host.data.kernel} · đã chạy {formatDuration(host.data.uptimeSec)}</p>
      </Card>
      <Card title="Múi giờ & đồng bộ giờ" icon={Clock}>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-ink-950/50 px-3 py-2 text-sm">
            <span className="mono text-slate-200">{host.data.time}</span>
            {host.data.ntpSynced !== null && <Badge tone={host.data.ntpSynced ? 'green' : 'amber'}>{host.data.ntpSynced ? 'Đã đồng bộ NTP' : 'Chưa đồng bộ'}</Badge>}
          </div>
          <div className="flex items-end gap-2">
            <Field label={`Múi giờ (${zones.data ? `${zones.data.length} múi giờ trên máy này` : 'đang tải...'})`}>
              <Select className="w-full" value={tz} disabled={!zones.data} onChange={(e) => setTz(e.target.value)}>
                {!zones.data && <option value={tz}>{tz}</option>}
                {zones.data &&
                  [...new Set(zones.data.map((z) => z.group))].map((group) => (
                    <optgroup key={group} label={group === 'Windows' ? 'Múi giờ Windows' : group}>
                      {zones.data!.filter((z) => z.group === group).map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.label} ({z.offset}){z.id === host.data!.timezone ? '  ★ Default' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </Select>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Badge tone="green">Default</Badge> hiện tại: <span className="mono text-slate-300">{host.data.timezone}</span> ({host.data.utcOffset})
              </div>
            </Field>
            <Button variant="primary" icon={Save} disabled={tz === host.data.timezone} onClick={async () => { await run(() => put('/api/access/host/timezone', { timezone: tz }), 'Đã đổi múi giờ'); await host.reload(); }}>Lưu</Button>
            <Button variant="ghost" icon={RefreshCw} onClick={async () => { await run(() => post('/api/access/host/sync-time'), 'Đã yêu cầu đồng bộ giờ'); await host.reload(); }}>Đồng bộ giờ</Button>
          </div>
          {zones.data && (() => {
            const vn = zones.data.find((z) => z.id === 'Asia/Ho_Chi_Minh') ?? zones.data.find((z) => z.id === 'SE Asia Standard Time');
            return vn && vn.id !== host.data.timezone ? (
              <button type="button" className="text-xs font-semibold text-blue-300 hover:underline" onClick={() => setTz(vn.id)}>Chọn giờ Việt Nam ({vn.offset})</button>
            ) : null;
          })()}
        </div>
      </Card>
      <Card title="DNS resolver" icon={Globe} className="lg:col-span-2">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Máy chủ DNS (phân tách bằng dấu phẩy, tối đa 4)"><input className="input mono w-96 max-w-full" value={dns} onChange={(e) => setDns(e.target.value)} placeholder="1.1.1.1, 8.8.8.8" /></Field>
          <Button variant="primary" icon={Save} onClick={async () => { await run(() => put('/api/access/host/dns', { servers: dns.split(/[,\s]+/).filter(Boolean) }), 'Đã đổi DNS'); await host.reload(); }}>Lưu</Button>
          {[['Cloudflare', '1.1.1.1, 1.0.0.1'], ['Google', '8.8.8.8, 8.8.4.4'], ['Quad9', '9.9.9.9, 149.112.112.112']].map(([name, value]) => (
            <Button key={name} size="sm" variant="ghost" onClick={() => setDns(value)}>{name}</Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

type TabId = 'ssh' | 'fail2ban' | 'logins' | 'host';

export default function Access() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId | null) ?? 'ssh';
  return (
    <>
      <PageHeader title="Truy cập & Máy chủ" description="Khoá cửa SSH, chặn IP dò mật khẩu, theo dõi đăng nhập, đặt hostname / DNS / múi giờ" icon={ShieldCheck} />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={(next) => setParams({ tab: next })}
          tabs={[
            { id: 'ssh', label: 'SSH', icon: Terminal },
            { id: 'fail2ban', label: 'Fail2ban', icon: Ban },
            { id: 'logins', label: 'Đăng nhập', icon: Lock },
            { id: 'host', label: 'Hostname & DNS', icon: Globe },
          ]}
        />
      </div>
      {tab === 'ssh' && <SshTab />}
      {tab === 'fail2ban' && <Fail2banTab />}
      {tab === 'logins' && <LoginsTab />}
      {tab === 'host' && <HostTab />}
    </>
  );
}
