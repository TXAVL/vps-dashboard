import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Activity, AlertTriangle, Database, DoorOpen, ExternalLink, Globe, Plus, RefreshCw, Server, Table2, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Secret, Spinner, cn, td, th, tr } from '../components/ui';
import { del, get, post } from '../lib/api';
import { useJobs } from '../components/jobs';
import { formatBytes } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePublicHost } from '../lib/panel';
import type { AppView, DatabaseItem, DatabaseServer, Job, ServiceInfo, TunnelState } from '../lib/types';

const ENGINE_LABEL: Record<DatabaseServer['engine'], string> = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', redis: 'Redis', mongodb: 'MongoDB' };

function CreateModal({ server, onClose, onCreated }: { server: DatabaseServer; onClose: () => void; onCreated: () => void }) {
  const { host } = usePublicHost();
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [result, setResult] = useState<{ name: string; username: string; password: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const created = await run(() => post<{ name: string; username: string; password: string }>(`/api/databases/${server.appId}`, form), `Đã tạo database ${form.name}`);
    setSaving(false);
    if (created) {
      setResult(created);
      onCreated();
    }
  };

  return (
    <Modal open onClose={onClose} title={`Tạo database trên ${server.name}`}>
      {result ? (
        <div className="space-y-4">
          <Notice tone="green">Database đã sẵn sàng. Hãy lưu lại thông tin đăng nhập bên dưới.</Notice>
          <ConnectionInfo rows={[['Host', `${host}:${server.port}`], ['Host nội bộ', `127.0.0.1:${server.port}`], ['Database', result.name], ['User', result.username], ['Password', result.password]]} />
          <div className="flex items-center gap-2 rounded-lg bg-ink-950/80 px-3 py-2">
            <code className="mono min-w-0 flex-1 truncate text-xs text-emerald-300">{connectionUri(server, host, result.name, result.username, result.password)}</code>
            <CopyButton value={connectionUri(server, host, result.name, result.username, result.password)} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Xong
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tên database" hint="Chỉ gồm chữ, số, gạch dưới">
            <input className="input mono" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my_app" />
          </Field>
          <Field label="User riêng cho database" hint="Để trống = trùng tên database">
            <input className="input mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Mật khẩu" hint="Để trống để tự sinh mật khẩu mạnh">
            <input className="input mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" icon={Plus} loading={saving}>
              Tạo database
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ConnectionInfo({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-slate-700/40 rounded-xl border border-slate-700/50 bg-ink-950/60 text-sm">
      {rows.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 px-4 py-2">
          <dt className="text-slate-500">{key}</dt>
          <dd className="flex items-center gap-1">
            {key === 'Password' ? (
              <Secret value={value} />
            ) : (
              <>
                <span className="mono text-slate-200">{value}</span>
                <CopyButton value={value} />
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const SCHEME: Record<DatabaseServer['engine'], string> = { mysql: 'mysql', mariadb: 'mysql', postgres: 'postgresql', redis: 'redis', mongodb: 'mongodb' };

/** Chuỗi kết nối chuẩn cho ứng dụng / máy khác */
function connectionUri(server: DatabaseServer, host: string, db?: string, user?: string, pass?: string): string {
  const u = encodeURIComponent(user ?? server.username);
  const pw = encodeURIComponent(pass ?? server.password);
  const h = host.includes(':') ? `[${host}]` : host;
  const path = db ? `/${db}` : server.engine === 'mongodb' ? '/' : '';
  return `${SCHEME[server.engine]}://${u}:${pw}@${h}:${server.port}${path}`;
}

interface RemoteCheck { ok: boolean | null; detail: string }
interface RemoteStatus { port: number; publicHost: string | null; binding: RemoteCheck; engine: RemoteCheck; firewall: RemoteCheck; local: RemoteCheck; internet: RemoteCheck; open: boolean }

function ExternalAccess({ server }: { server: DatabaseServer }) {
  const { host, rawIp, isTunnel } = usePublicHost();
  const [source_, setSource] = useState('');
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const { runJob } = useJobs();
  const { toast } = useFeedback();

  const effectiveHost = status?.publicHost || (isTunnel ? rawIp || '<IP_VPS>' : host);

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await get<RemoteStatus>(`/api/databases/${server.appId}/remote`));
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setChecking(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    await runJob(
      () => post<Job>(`/api/databases/${server.appId}/remote`, { enabled, source: source_.trim() || null }),
      (job) => {
        if (job.result) setStatus(job.result as RemoteStatus);
        else void check();
      },
    );
  };

  const layers: [string, RemoteCheck | undefined][] = [
    ['Docker publish cổng', status?.binding],
    ['Cấu hình database', status?.engine],
    ['Tường lửa máy chủ', status?.firewall],
    ['Lắng nghe nội bộ', status?.local],
    ['Từ Internet vào', status?.internet],
  ];

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/50 bg-ink-950/50 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-white">
          <Globe className="size-4 text-zen-blue" /> Truy cập từ xa
        </span>
        {status && <Badge tone={status.open ? 'green' : status.internet.ok === false ? 'red' : 'amber'}>{status.open ? 'Đã mở ra Internet' : 'Chưa thông'}</Badge>}
      </div>
      <ConnectionInfo rows={[['Host', effectiveHost], ['Port', String(server.port)], ['User', server.username], ['Password', server.password]]} />
      <div className="flex items-center gap-2 rounded-lg bg-ink-950/80 px-3 py-2">
        <code className="mono min-w-0 flex-1 truncate text-xs text-emerald-300">{connectionUri(server, effectiveHost)}</code>
        <CopyButton value={connectionUri(server, effectiveHost)} />
      </div>

      {status ? (
        <ol className="space-y-1.5">
          {layers.map(([label, c]) => (
            <li key={label} className="flex items-start gap-2 text-xs">
              <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', c?.ok === true ? 'bg-emerald-500/20 text-emerald-300' : c?.ok === false ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700 text-slate-400')}>
                {c?.ok === true ? '✓' : c?.ok === false ? '✕' : '?'}
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-slate-200">{label}:</span> <span className="text-slate-400">{c?.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-slate-500">Bấm "Kiểm tra" để ZenPanel thử từng lớp (Docker → database → tường lửa → Internet thật qua portchecker.io).</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Chỉ cho phép IP (khuyên dùng)">
          <input className="input mono h-9 w-44 py-0" value={source_} onChange={(e) => setSource(e.target.value)} placeholder="Trống = mọi IP" />
        </Field>
        <Button size="sm" variant="primary" icon={DoorOpen} onClick={() => void toggle(true)}>
          Mở truy cập từ xa
        </Button>
        <Button size="sm" variant="ghost" icon={Activity} loading={checking} onClick={() => void check()}>
          Kiểm tra
        </Button>
        <Button size="sm" variant="ghost" className="hover:text-zen-red" onClick={() => void toggle(false)}>
          Đóng
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        Database dùng TCP nên không đi qua link trycloudflare được — kết nối bằng IP public. Nếu "Từ Internet vào" vẫn ✕ khi các lớp khác ✓, hãy mở cổng {server.port}/TCP trong Security Group của nhà cung cấp VPS.
      </p>
    </div>
  );
}

function ServerPanel({
  server,
  onOpenAdmin,
}: {
  server: DatabaseServer;
  onOpenAdmin: (server: DatabaseServer) => void;
}) {
  const list = useApi<DatabaseItem[]>(server.running ? `/api/databases/${server.appId}` : null);
  const [creating, setCreating] = useState(false);
  const { confirm, run } = useFeedback();
  const sql = server.engine === 'mysql' || server.engine === 'mariadb' || server.engine === 'postgres';

  const drop = async (item: DatabaseItem) => {
    const ok = await confirm({
      title: server.engine === 'redis' ? 'Xóa toàn bộ key' : 'Xóa database',
      message: <>Toàn bộ dữ liệu trong <b className="mono">{item.name}</b> sẽ bị xóa vĩnh viễn.</>,
      danger: true,
      confirmLabel: 'Xóa',
      typeToConfirm: item.name,
    });
    if (!ok) return;
    await run(() => del(`/api/databases/${server.appId}/${encodeURIComponent(item.name)}`), `Đã xóa ${item.name}`);
    await list.reload();
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {server.name}
          <Badge tone={server.running ? 'green' : 'red'}>{server.running ? 'Đang chạy' : 'Đã dừng'}</Badge>
        </span>
      }
      icon={Database}
      actions={
        <>
          {sql && (
            <Button size="sm" variant="soft" icon={ExternalLink} onClick={() => onOpenAdmin(server)}>
              Mở {server.engine === 'postgres' ? 'Adminer' : 'quản trị web'}
            </Button>
          )}
          {server.engine !== 'redis' && (
            <Button size="sm" variant="primary" icon={Plus} disabled={!server.running} onClick={() => setCreating(true)}>
              Tạo database
            </Button>
          )}
          <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void list.reload()} />
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-3">
          <ConnectionInfo
            rows={[
              ['Engine', ENGINE_LABEL[server.engine]],
              ['Host nội bộ', `127.0.0.1:${server.port}`],
              ['Trong Docker', `host.docker.internal:${server.port}`],
              ['Container', server.container],
            ]}
          />
          <ExternalAccess server={server} />
        </div>
        <div className="min-w-0">
          {!server.running ? (
            <Notice tone="amber">
              Server đang dừng. Khởi động lại trong{' '}
              <Link to="/apps" className="font-semibold text-blue-300 underline">
                App Store
              </Link>
              .
            </Notice>
          ) : list.error ? (
            <ErrorBox message={list.error} onRetry={list.reload} />
          ) : !list.data ? (
            <Spinner />
          ) : list.data.length === 0 ? (
            <EmptyState icon={Table2} title="Chưa có database nào" description={server.engine === 'redis' ? 'Redis chưa có key nào.' : 'Bấm "Tạo database" để tạo database và user riêng.'} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Tên</th>
                    <th className={th}>Dung lượng</th>
                    <th className={th}>Chi tiết</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((item) => (
                    <tr key={item.name} className={tr}>
                      <td className={cn(td, 'mono font-semibold text-white')}>{item.name}</td>
                      <td className={cn(td, 'mono text-slate-400')}>{formatBytes(item.size)}</td>
                      <td className={cn(td, 'text-slate-500')}>{item.detail}</td>
                      <td className={cn(td, 'text-right')}>
                        <IconButton icon={Trash2} title="Xóa" className="hover:text-zen-red" onClick={() => void drop(item)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {creating && <CreateModal server={server} onClose={() => setCreating(false)} onCreated={() => void list.reload()} />}
    </Card>
  );
}

function AdminAccessModal({
  server,
  app,
  onClose,
  onReloadApps,
}: {
  server: DatabaseServer;
  app: AppView | null;
  onClose: () => void;
  onReloadApps: () => void;
}) {
  const { host, rawIp, isTunnel } = usePublicHost();
  const { toast, run } = useFeedback();
  const [enabling, setEnabling] = useState(false);
  const [openingPort, setOpeningPort] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diag, setDiag] = useState<{
    localListening: boolean;
    bindAddress?: string;
    process?: string;
    latencyMs?: number;
    iptablesAllowed?: boolean;
    cloudWarning?: string;
    suggestion: string;
  } | null>(null);

  const port = app?.installed?.params.port ?? (server.engine === 'postgres' ? 8082 : 8083);
  const isPostgres = server.engine === 'postgres';
  const queryStr = isPostgres
    ? `pgsql=host.docker.internal:${server.port}&username=postgres`
    : `server=host.docker.internal:${server.port}&username=root`;

  const effectiveHost = isTunnel ? (rawIp || host || window.location.hostname) : host;
  const tunnelUrl = app?.publicLink?.url ? `${app.publicLink.url}/?${queryStr}` : null;
  const directIpUrl = `http://${effectiveHost}:${port}/?${queryStr}`;
  const localUrl = `http://localhost:${port}/?${queryStr}`;

  const enablePublicLink = async () => {
    if (!app) return;
    setEnabling(true);
    try {
      const res = await post<TunnelState & { enabled: boolean }>(`/api/apps/${app.id}/public-link`, { enabled: true });
      if (res?.url) {
        toast('Đã khởi tạo link public Cloudflare!', 'success');
        onReloadApps();
        window.open(`${res.url}/?${queryStr}`, '_blank');
        onClose();
      } else {
        toast('Đang xin domain từ Cloudflare, vui lòng đợi 5-10 giây...', 'info');
        setTimeout(() => {
          onReloadApps();
          setEnabling(false);
        }, 6000);
      }
    } catch (err) {
      toast((err as Error).message, 'error');
      setEnabling(false);
    }
  };

  const openFirewallPort = async () => {
    setOpeningPort(true);
    // Mở cả port web admin lẫn port database
    await run(async () => {
      await post('/api/firewall/rules', { port: Number(port), protocol: 'tcp', direction: 'in', action: 'allow', description: `ZenPanel - Adminer (${server.name})` });
      if (server.port && server.port !== port) {
        await post('/api/firewall/rules', { port: Number(server.port), protocol: 'tcp', direction: 'in', action: 'allow', description: `ZenPanel - Database (${server.name})` }).catch(() => {});
      }
    }, `Đã mở cổng web ${port} và cổng DB ${server.port} trên tường lửa VPS`);
    setOpeningPort(false);
    void runDiagnose();
  };

  const runDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await post<any>('/api/system/tools/diagnose-port', { port: Number(port) });
      if (res) setDiag(res);
    } catch (e: any) {
      toast(e?.message || 'Không thể kiểm tra cổng', 'error');
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <Modal
      open={true}
      title={`Mở Web Quản trị Database (${server.name})`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Notice tone="amber" icon={AlertTriangle}>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-amber-200">
              Không thể truy cập cổng :{port} qua Cloudflare Tunnel ({window.location.hostname})!
            </p>
            <p className="text-slate-300">
              Domain <code className="mono">trycloudflare.com</code> của dashboard chỉ chuyển tiếp cổng bảng điều khiển và chặn các cổng dịch vụ khác như <code className="mono">:{port}</code>. Hãy chọn 1 trong các cách kết nối bên dưới:
            </p>
          </div>
        </Notice>

        {app?.publicLink?.url ? (
          <div className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
            <div className="flex items-center gap-2 font-semibold text-emerald-300">
              <Globe className="size-4" /> Link Public Cloudflare (Khuyên dùng)
            </div>
            <p className="text-xs text-slate-300">Đã bật tunnel HTTPS riêng cho {app.name}, truy cập an toàn từ mọi nơi mà không lo bị firewall Cloud chặn:</p>
            <div className="flex items-center gap-2">
              <input readOnly value={tunnelUrl ?? ''} className="input mono h-9 flex-1 text-xs" />
              <CopyButton value={tunnelUrl ?? ''} />
              <a href={tunnelUrl ?? ''} target="_blank" rel="noreferrer">
                <Button size="sm" variant="success" icon={ExternalLink}>
                  Mở ngay
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-zen-blue/40 bg-zen-blue/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Globe className="size-4 text-blue-400" /> Cách 1: Bật Link Public Cloudflare (Khuyên dùng)
              </div>
              <Badge tone="blue">Tiện lợi nhất</Badge>
            </div>
            <p className="text-xs text-slate-300">
              Tạo đường dẫn HTTPS riêng từ Cloudflare cho {app?.name ?? 'Adminer'}, mở được từ mọi thiết bị mà không cần mở cổng tường lửa hay cấu hình Cloud Security Group.
            </p>
            <Button
              variant="primary"
              icon={Globe}
              loading={enabling}
              onClick={() => void enablePublicLink()}
              className="w-full"
            >
              ⚡ Bật Link Public & Mở {app?.name ?? 'Adminer'} ngay
            </Button>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-slate-700/50 bg-ink-950/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Server className="size-4 text-slate-400" /> Cách 2: Truy cập bằng IP Public của VPS
            </div>
            {rawIp && <Badge tone="blue">IP: {rawIp}</Badge>}
          </div>
          <p className="text-xs text-slate-400">
            Dùng IP trực tiếp của máy chủ (cần mở cổng {port} trên tường lửa VPS và Security Group của nhà mạng Cloud):
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={directIpUrl} className="input mono h-9 flex-1 text-xs" />
            <CopyButton value={directIpUrl} />
            <a href={directIpUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="soft" icon={ExternalLink}>
                Mở
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="xs" variant="ghost" icon={DoorOpen} loading={openingPort} onClick={() => void openFirewallPort()}>
              Mở cổng {port} (Web) & {server.port} (DB) trên tường lửa
            </Button>
            <Button size="xs" variant="ghost" icon={Activity} loading={diagnosing} onClick={() => void runDiagnose()}>
              Kiểm tra kết nối cổng {port}
            </Button>
          </div>

          {diag && (
            <div className="space-y-1.5 rounded-lg border border-slate-700/70 bg-ink-900/90 p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Chẩn đoán cổng {port}:</span>
                <Badge tone={diag.localListening ? 'green' : 'red'}>
                  {diag.localListening ? `Đang Listen (${diag.latencyMs}ms)` : 'Chưa lắng nghe'}
                </Badge>
              </div>
              <p className="text-slate-300 text-[11px]">{diag.suggestion}</p>
              {diag.cloudWarning && (
                <div className="mt-1 rounded border border-amber-500/30 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                  ⚠️ <b>Lưu ý Cloud VPS:</b> Nếu dùng AWS/Oracle/GCP, hãy mở thêm Ingress Rule cho cổng {port} trên Console nhà cung cấp!
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5 rounded-xl border border-slate-800 bg-ink-950/30 p-3">
          <p className="text-xs font-semibold text-slate-400">Cách 3: Nếu bạn đang ở mạng LAN hoặc Localhost:</p>
          <div className="flex items-center justify-between text-xs">
            <code className="mono text-slate-300">{localUrl}</code>
            <CopyButton value={localUrl} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Databases() {
  const { data, error, loading, reload } = useApi<{ servers: DatabaseServer[]; native: ServiceInfo[] }>('/api/databases');
  const apps = useApi<AppView[]>('/api/apps');
  const { host } = usePublicHost();
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const [adminModal, setAdminModal] = useState<{ server: DatabaseServer; app: AppView | null } | null>(null);

  const handleOpenAdmin = async (server: DatabaseServer) => {
    const adminerApp = apps.data?.find((a) => a.id === (server.engine === 'postgres' ? 'adminer' : 'adminer'))
      ?? apps.data?.find((a) => a.id === 'phpmyadmin')
      ?? null;

    if (!adminerApp || !adminerApp.installed) {
      const ok = await confirm({
        title: 'Chưa cài đặt Web Quản trị Database',
        message: 'Bạn chưa cài đặt Adminer hoặc phpMyAdmin. Bạn có muốn mở App Store để cài đặt Adminer chỉ với 1 click không?',
        confirmLabel: 'Mở App Store',
      });
      if (ok) navigate('/apps?install=adminer');
      return;
    }

    const port = adminerApp.installed.params.port;
    const isPostgres = server.engine === 'postgres';
    const queryStr = isPostgres
      ? `pgsql=host.docker.internal:${server.port}&username=postgres`
      : `server=host.docker.internal:${server.port}&username=root`;

    if (adminerApp.publicLink?.enabled && adminerApp.publicLink?.url) {
      window.open(`${adminerApp.publicLink.url}/?${queryStr}`, '_blank');
      return;
    }

    const isTunnel = window.location.hostname.includes('trycloudflare.com');
    if (isTunnel) {
      setAdminModal({ server, app: adminerApp });
      return;
    }

    const targetHost = host && host !== 'localhost' ? host : window.location.hostname;
    window.open(`http://${targetHost}:${port}/?${queryStr}`, '_blank');
  };

  return (
    <>
      <PageHeader
        title="Databases"
        description="Quản lý database trong các server cài từ App Store"
        icon={Database}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
              Làm mới
            </Button>
            <Link to="/apps">
              <Button variant="primary" icon={Plus}>
                Cài database server
              </Button>
            </Link>
          </>
        }
      />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        !error && <Spinner />
      ) : (
        <div className="space-y-4">
          {data.servers.length === 0 ? (
            <Card>
              <EmptyState
                icon={Database}
                title="Chưa có database server nào"
                description="Cài MySQL, MariaDB, PostgreSQL, Redis hoặc MongoDB chỉ với 1 click trong App Store."
                action={
                  <Link to="/apps">
                    <Button variant="primary" icon={Plus}>
                      Mở App Store
                    </Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            data.servers.map((server) => (
              <ServerPanel key={server.appId} server={server} onOpenAdmin={handleOpenAdmin} />
            ))
          )}

          {data.native.length > 0 && (
            <Card title="Database cài trực tiếp trên hệ điều hành" icon={Server}>
              <p className="mb-3 text-sm text-slate-400">
                Các dịch vụ này không do ZenPanel cài nên chỉ hiển thị trạng thái. Quản lý chúng trong mục{' '}
                <Link to="/services" className="text-blue-300 underline">
                  Dịch vụ
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-2">
                {data.native.map((service) => (
                  <Badge key={service.name} tone={service.state === 'running' ? 'green' : 'slate'}>
                    {service.displayName} · {service.state}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {adminModal && (
        <AdminAccessModal
          server={adminModal.server}
          app={adminModal.app}
          onClose={() => setAdminModal(null)}
          onReloadApps={() => void apps.reload()}
        />
      )}
    </>
  );
}
