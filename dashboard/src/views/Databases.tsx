// ZenPanel - Quản lý Database (MySQL, MariaDB, PostgreSQL, Redis, MongoDB) + Adminer/phpMyAdmin 1-click
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Database, ExternalLink, Plus, RefreshCw, Server, Table2, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Secret, Spinner, cn, td, th, tr } from '../components/ui';
import { del, post } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { AppView, DatabaseItem, DatabaseServer, ServiceInfo } from '../lib/types';

const ENGINE_LABEL: Record<DatabaseServer['engine'], string> = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', redis: 'Redis', mongodb: 'MongoDB' };

function CreateModal({ server, onClose, onCreated }: { server: DatabaseServer; onClose: () => void; onCreated: () => void }) {
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
          <ConnectionInfo rows={[['Host', `127.0.0.1:${server.port}`], ['Database', result.name], ['User', result.username], ['Password', result.password]]} />
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

function ServerPanel({ server, adminUrl }: { server: DatabaseServer; adminUrl: string | null }) {
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
          {sql && adminUrl && (
            <a href={adminUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="soft" icon={ExternalLink}>
                Mở {server.engine === 'postgres' ? 'Adminer' : 'quản trị web'}
              </Button>
            </a>
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
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ConnectionInfo
          rows={[
            ['Engine', ENGINE_LABEL[server.engine]],
            ['Host', `127.0.0.1:${server.port}`],
            ['Container', server.container],
            ['User', server.username],
            ['Password', server.password],
          ]}
        />
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

export default function Databases() {
  const { data, error, loading, reload } = useApi<{ servers: DatabaseServer[]; native: ServiceInfo[] }>('/api/databases');
  const apps = useApi<AppView[]>('/api/apps');
  const adminers = useMemo(() => {
    const url = (id: string) => {
      const port = apps.data?.find((a) => a.id === id)?.installed?.params.port;
      return port ? `http://${window.location.hostname}:${port}` : null;
    };
    return { adminer: url('adminer'), phpmyadmin: url('phpmyadmin') };
  }, [apps.data]);

  const adminUrlFor = (server: DatabaseServer) => {
    if (server.engine === 'postgres') return adminers.adminer ? `${adminers.adminer}/?pgsql=host.docker.internal:${server.port}&username=postgres` : null;
    if (adminers.phpmyadmin) return adminers.phpmyadmin;
    return adminers.adminer ? `${adminers.adminer}/?server=host.docker.internal:${server.port}&username=root` : null;
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

      {!adminers.adminer && !adminers.phpmyadmin && (
        <div className="mb-4">
          <Notice>
            Cài <b>Adminer</b> hoặc <b>phpMyAdmin</b> trong{' '}
            <Link to="/apps" className="font-semibold text-blue-300 underline">
              App Store
            </Link>{' '}
            để có nút mở trang quản trị database 1-click.
          </Notice>
        </div>
      )}

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
            data.servers.map((server) => <ServerPanel key={server.appId} server={server} adminUrl={adminUrlFor(server)} />)
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
    </>
  );
}
