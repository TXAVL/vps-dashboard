// ZenPanel - Kho ứng dụng 1-Click (Docker Compose)
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  Cloud,
  Code,
  Container,
  Database,
  Download,
  ExternalLink,
  FileCode,
  FolderOpen,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  LayoutGrid,
  Leaf,
  Newspaper,
  Package,
  Play,
  RefreshCw,
  RotateCw,
  Square,
  Table,
  Table2,
  Trash2,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, SearchInput, Spinner, Tabs, Toggle, cn, type Tone } from '../components/ui';
import { get, post } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { AppView, DockerInfo } from '../lib/types';
import { DockerMissing } from './Docker';

const ICONS: Record<string, LucideIcon> = {
  Globe, Newspaper, Database, Zap, Leaf, Table, Table2, Container, Activity, Workflow, GitBranch, HardDrive, FolderOpen, Code, KeyRound, Cloud,
};

const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'web', label: 'Web' },
  { id: 'database', label: 'Database' },
  { id: 'tools', label: 'Công cụ' },
  { id: 'devops', label: 'DevOps' },
  { id: 'storage', label: 'Lưu trữ' },
  { id: 'network', label: 'Mạng' },
] as const;

const statusInfo: Record<AppView['status'], { tone: Tone; label: string }> = {
  running: { tone: 'green', label: 'Đang chạy' },
  stopped: { tone: 'red', label: 'Đã dừng' },
  partial: { tone: 'amber', label: 'Chạy một phần' },
  'not-installed': { tone: 'slate', label: 'Chưa cài' },
};

function InstallModal({ app, onClose, onDone }: { app: AppView; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(app.params.map((p) => [p.key, p.default !== undefined ? String(p.default) : ''])));
  const [installing, setInstalling] = useState(false);
  const { run } = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setInstalling(true);
    const ok = await run(() => post(`/api/apps/${app.id}/install`, values), `Đã cài ${app.name}`);
    setInstalling(false);
    if (ok) {
      onDone();
      onClose();
    }
  };

  return (
    <Modal open onClose={installing ? () => undefined : onClose} title={`Cài đặt ${app.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-400">{app.description}</p>
        {app.params.map((param) => (
          <Field
            key={param.key}
            label={param.label}
            hint={param.type === 'password' && param.generate ? 'Để trống để ZenPanel tự sinh mật khẩu mạnh' : param.type === 'port' ? 'Cổng trên máy chủ, không được trùng ứng dụng khác' : undefined}
          >
            <input
              className="input mono"
              type={param.type === 'port' ? 'number' : 'text'}
              value={values[param.key] ?? ''}
              required={!param.generate}
              onChange={(e) => setValues({ ...values, [param.key]: e.target.value })}
            />
          </Field>
        ))}
        {installing && <Notice>Đang tải image và khởi động container. Lần đầu có thể mất vài phút tùy tốc độ mạng...</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={installing}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" icon={Download} loading={installing}>
            Cài đặt
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function AppStore() {
  const docker = useApi<DockerInfo>('/api/docker/info');
  const apps = useApi<AppView[]>('/api/apps');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('all');
  const [query, setQuery] = useState('');
  const [installing, setInstalling] = useState<AppView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uninstall, setUninstall] = useState<{ app: AppView; removeData: boolean } | null>(null);
  const { run } = useFeedback();
  const navigate = useNavigate();

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return (apps.data ?? []).filter((a) => (category === 'all' || a.category === category) && (!q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)));
  }, [apps.data, category, query]);

  const installedCount = (apps.data ?? []).filter((a) => a.installed).length;

  const act = async (app: AppView, action: string, label: string) => {
    setBusy(app.id);
    await run(() => post(`/api/apps/${app.id}/${action}`), `${label}: ${app.name}`);
    setBusy(null);
    await apps.reload();
  };

  const doUninstall = async () => {
    if (!uninstall) return;
    const { app, removeData } = uninstall;
    setUninstall(null);
    setBusy(app.id);
    await run(() => post(`/api/apps/${app.id}/uninstall`, { removeData }), `Đã gỡ ${app.name}`);
    setBusy(null);
    await apps.reload();
  };

  const composePath = async (app: AppView) => {
    const result = await run(() => get<{ path: string }>(`/api/apps/${app.id}/compose`));
    if (result) navigate(`/files?open=${encodeURIComponent(result.path)}`);
  };

  const webUrl = (app: AppView) => {
    const port = app.webPort && app.installed?.params[app.webPort];
    if (!port) return null;
    return `${app.id === 'portainer' ? 'https' : 'http'}://${window.location.hostname}:${port}`;
  };

  return (
    <>
      <PageHeader
        title="App Store"
        description={`Cài ứng dụng bằng 1 click qua Docker Compose · đã cài ${installedCount}`}
        icon={LayoutGrid}
        actions={
          <Button icon={RefreshCw} onClick={() => void apps.reload()} loading={apps.loading}>
            Làm mới
          </Button>
        }
      />

      {docker.data && !docker.data.running ? (
        <DockerMissing info={docker.data} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={category} onChange={setCategory} tabs={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} />
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm ứng dụng..." className="w-full sm:w-64" />
          </div>
          {apps.error && <ErrorBox message={apps.error} onRetry={apps.reload} />}
          {!apps.data ? (
            <Spinner />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {list.map((app) => {
                const Icon = ICONS[app.icon] ?? Package;
                const status = statusInfo[app.status];
                const url = webUrl(app);
                return (
                  <div key={app.id} className={cn('glass flex flex-col p-5 transition hover:border-zen-blue/40', busy === app.id && 'opacity-60')}>
                    <div className="flex items-start gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-slate-700/50 bg-gradient-to-br from-ink-800 to-ink-950 text-blue-300">
                        <Icon className="size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate font-bold text-white">{app.name}</h3>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{app.description}</p>
                      </div>
                    </div>
                    {app.installed && (
                      <div className="mono mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                        {Object.entries(app.installed.params).map(([key, value]) => (
                          <span key={key} className="rounded-md bg-ink-950/70 px-1.5 py-0.5">
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
                      {!app.installed ? (
                        <Button size="sm" variant="primary" icon={Download} onClick={() => setInstalling(app)} className="w-full">
                          Cài đặt
                        </Button>
                      ) : (
                        <>
                          {url && (
                            <a href={url} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="soft" icon={ExternalLink}>
                                Mở
                              </Button>
                            </a>
                          )}
                          {app.database && (
                            <Link to="/databases">
                              <Button size="sm" variant="soft" icon={Database}>
                                Quản lý
                              </Button>
                            </Link>
                          )}
                          <div className="ml-auto flex">
                            {app.status === 'running' || app.status === 'partial' ? (
                              <>
                                <IconButton icon={RotateCw} title="Khởi động lại" onClick={() => void act(app, 'restart', 'Khởi động lại')} />
                                <IconButton icon={Square} title="Dừng" onClick={() => void act(app, 'stop', 'Dừng')} />
                              </>
                            ) : (
                              <IconButton icon={Play} title="Khởi động" onClick={() => void act(app, 'start', 'Khởi động')} />
                            )}
                            <IconButton icon={Download} title="Cập nhật lên bản mới nhất" onClick={() => void act(app, 'update', 'Cập nhật')} />
                            <IconButton icon={FileCode} title="Xem docker-compose.yml" onClick={() => void composePath(app)} />
                            <IconButton icon={Trash2} title="Gỡ cài đặt" className="hover:text-zen-red" onClick={() => setUninstall({ app, removeData: false })} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {installing && <InstallModal app={installing} onClose={() => setInstalling(null)} onDone={() => void apps.reload()} />}

      <Modal open={Boolean(uninstall)} onClose={() => setUninstall(null)} title={`Gỡ ${uninstall?.app.name ?? ''}`} size="sm">
        {uninstall && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Container của ứng dụng sẽ bị dừng và xóa.</p>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-zen-red/30 bg-zen-red/10 px-4 py-3 text-sm">
              <span className="text-red-200">Xóa luôn dữ liệu (volumes) — không thể khôi phục</span>
              <Toggle checked={uninstall.removeData} onChange={(removeData) => setUninstall({ ...uninstall, removeData })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setUninstall(null)}>
                Hủy
              </Button>
              <Button variant="danger" icon={Trash2} onClick={() => void doUninstall()}>
                Gỡ cài đặt
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
