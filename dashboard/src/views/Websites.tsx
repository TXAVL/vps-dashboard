// ZenPanel - Quản lý Website & Domain (Website Isolation) kèm cột tài nguyên bên phải kiểu Jupiter
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FileCode,
  FolderOpen,
  Globe,
  HardDrive,
  Layers,
  Lock,
  LockOpen,
  MemoryStick,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  Settings2,
  Sliders,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Modal, Notice, PageHeader, ResourceBar, Select, Spinner, Toggle, cn } from '../components/ui';
import { del, post, put } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { Job, PhpConfigInput, PhpStatus, Site, SiteStats, WebServerInfo } from '../lib/types';
import { useJobs } from '../components/jobs';

interface SitesResponse {
  sites: Site[];
  defaultRoot: string;
  webServers: WebServerInfo[];
}

const typeLabel: Record<Site['type'], string> = { static: 'HTML tĩnh', php: 'PHP', proxy: 'Reverse Proxy' };

function PhpConfigModal({
  open,
  onClose,
  php,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  php: PhpStatus | null;
  onSave: (cfg: PhpConfigInput) => Promise<void>;
}) {
  const [form, setForm] = useState<PhpConfigInput>({
    memoryLimit: php?.memoryLimit || '256M',
    uploadMaxFilesize: php?.uploadMaxFilesize || '64M',
    postMaxSize: php?.postMaxSize || '64M',
    maxExecutionTime: php?.maxExecutionTime?.replace('s', '') || '60',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (php) {
      setForm({
        memoryLimit: php.memoryLimit || '256M',
        uploadMaxFilesize: php.uploadMaxFilesize || '64M',
        postMaxSize: php.postMaxSize || '64M',
        maxExecutionTime: php.maxExecutionTime?.replace('s', '') || '60',
      });
    }
  }, [php]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <Sliders className="size-5 text-indigo-400" />
          <span>Tùy chỉnh thông số PHP (php.ini)</span>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {php?.iniPath && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">File php.ini nạp:</span>
            <code className="mono block mt-1 text-cyan-300 break-all">{php.iniPath}</code>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bộ nhớ tối đa (memory_limit)" hint="Ví dụ: 128M, 256M, 512M, 1G">
            <input
              className="input mono"
              required
              value={form.memoryLimit}
              onChange={(e) => setForm({ ...form, memoryLimit: e.target.value })}
            />
          </Field>
          <Field label="Upload tối đa (upload_max_filesize)" hint="Ví dụ: 32M, 64M, 128M">
            <input
              className="input mono"
              required
              value={form.uploadMaxFilesize}
              onChange={(e) => setForm({ ...form, uploadMaxFilesize: e.target.value })}
            />
          </Field>
          <Field label="POST tối đa (post_max_size)" hint="Nên >= upload_max_filesize">
            <input
              className="input mono"
              required
              value={form.postMaxSize}
              onChange={(e) => setForm({ ...form, postMaxSize: e.target.value })}
            />
          </Field>
          <Field label="Thời gian thực thi (giây)" hint="max_execution_time (vd: 30, 60, 120)">
            <input
              className="input mono"
              type="number"
              required
              value={form.maxExecutionTime}
              onChange={(e) => setForm({ ...form, maxExecutionTime: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Lưu & Khởi động lại FPM
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PhpExtensionsModal({
  open,
  onClose,
  extensions,
}: {
  open: boolean;
  onClose: () => void;
  extensions: string[];
}) {
  const [filter, setFilter] = useState('');
  const filtered = extensions.filter((ext) => ext.toLowerCase().includes(filter.toLowerCase()));
  const essentials = ['curl', 'mbstring', 'mysqli', 'pdo', 'pdo_mysql', 'zip', 'gd', 'xml', 'opcache', 'bcmath', 'intl', 'soap'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-indigo-400" />
          <span>Danh sách phần mở rộng PHP ({extensions.length})</span>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Tìm kiếm extension (vd: mysql, curl, gd, zip)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-400">Các module phổ biến cho ứng dụng web:</div>
          <div className="flex flex-wrap gap-1.5">
            {essentials.map((item) => {
              const has = extensions.some((e) => e.toLowerCase() === item.toLowerCase());
              return (
                <span
                  key={item}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-mono font-medium ring-1',
                    has
                      ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                      : 'bg-slate-800 text-slate-500 ring-white/5 opacity-60',
                  )}
                >
                  {has ? '✓ ' : '✕ '} {item}
                </span>
              );
            })}
          </div>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-800/80 bg-[#080c14] p-3">
          <div className="flex flex-wrap gap-2">
            {filtered.map((ext) => (
              <span
                key={ext}
                className="mono rounded-lg border border-slate-800/80 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 hover:text-white transition"
              >
                {ext}
              </span>
            ))}
            {filtered.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500 w-full">
                Không tìm thấy extension phù hợp với từ khóa &quot;{filter}&quot;
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SiteForm({ initial, webServers, defaultRoot, phpStatus, onSubmit, submitLabel }: {
  initial?: Site;
  webServers: WebServerInfo[];
  defaultRoot: string;
  phpStatus?: PhpStatus | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  submitLabel: string;
}) {
  const firstInstalled = webServers.find((w) => w.installed)?.kind ?? webServers[0]?.kind;
  const [form, setForm] = useState({
    domain: initial?.domain ?? '',
    aliases: initial?.aliases.join(', ') ?? '',
    type: initial?.type ?? 'static',
    proxyPort: initial?.proxyPort ? String(initial.proxyPort) : '3000',
    webServer: initial?.webServer ?? firstInstalled ?? '',
    root: '',
    quotaMB: initial?.quotaMB ? String(initial.quotaMB) : '0',
  });
  const [saving, setSaving] = useState(false);
  const server = webServers.find((w) => w.kind === form.webServer);
  const unsupported = server && ((form.type === 'php' && !server.supports.php) || (form.type === 'proxy' && !server.supports.proxy));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await onSubmit({
      domain: form.domain,
      aliases: form.aliases.split(/[\s,]+/).filter(Boolean),
      type: form.type,
      proxyPort: form.type === 'proxy' ? Number(form.proxyPort) : null,
      webServer: form.webServer,
      root: form.root || undefined,
      quotaMB: Number(form.quotaMB) || 0,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {!initial && (
        <Field label="Tên miền chính">
          <input className="input mono" required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="example.com" />
        </Field>
      )}
      <Field label="Tên miền phụ (alias)" hint="Phân cách bằng dấu phẩy, vd www.example.com">
        <input className="input mono" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
      </Field>
      <Field label="Loại website">
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Site['type'] })}>
          <option value="static">HTML tĩnh</option>
          <option value="php">PHP (cần php-fpm)</option>
          <option value="proxy">Reverse Proxy (Node.js, Python, Docker...)</option>
        </Select>
      </Field>
      {form.type === 'proxy' && (
        <Field label="Cổng ứng dụng nội bộ" hint="Ứng dụng đang chạy trên 127.0.0.1:<cổng>">
          <input className="input mono" type="number" required value={form.proxyPort} onChange={(e) => setForm({ ...form, proxyPort: e.target.value })} />
        </Field>
      )}
      <Field label="Web server">
        <Select value={form.webServer} onChange={(e) => setForm({ ...form, webServer: e.target.value })}>
          {webServers.map((w) => (
            <option key={w.kind} value={w.kind}>
              {w.label} {w.installed ? '' : '(chưa cài)'}
            </option>
          ))}
        </Select>
      </Field>
      {!initial && (
        <Field label="Thư mục gốc (tùy chọn)" hint={`Mặc định: ${defaultRoot}/<domain>`}>
          <input className="input mono" value={form.root} onChange={(e) => setForm({ ...form, root: e.target.value })} />
        </Field>
      )}
      <Field label="Hạn mức dung lượng (MB)" hint="0 = không giới hạn, ZenPanel cảnh báo khi vượt">
        <input className="input mono" type="number" min={0} value={form.quotaMB} onChange={(e) => setForm({ ...form, quotaMB: e.target.value })} />
      </Field>
      {form.type === 'php' && (
        <div className="sm:col-span-2">
          {phpStatus?.installed && phpStatus.fpmRunning ? (
            <Notice tone="green" icon={CheckCircle2}>
              Máy chủ PHP-FPM ({phpStatus.version || 'Active'}) sẵn sàng phục vụ website PHP qua socket FastCGI <code className="mono">{phpStatus.socketPath || '127.0.0.1:9000'}</code>.
            </Notice>
          ) : phpStatus?.installed && !phpStatus.fpmRunning ? (
            <Notice tone="amber" icon={AlertTriangle}>
              Đã phát hiện PHP ({phpStatus.version}) nhưng dịch vụ PHP-FPM đang tắt. Hãy bấm <b>Khởi động lại</b> ở thẻ Máy chủ PHP phía trên để website hoạt động.
            </Notice>
          ) : (
            <Notice tone="amber" icon={AlertTriangle}>
              Máy chủ chưa cài đặt PHP & PHP-FPM. Bạn cần bấm <b>Cài PHP & PHP-FPM</b> ở thẻ Máy chủ PHP phía trên để chạy được website này.
            </Notice>
          )}
        </div>
      )}
      {unsupported && (
        <div className="sm:col-span-2">
          <Notice tone="amber" icon={AlertTriangle}>
            {server.label} chưa hỗ trợ loại website này trong ZenPanel. Hãy chọn Caddy hoặc Nginx.
          </Notice>
        </div>
      )}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="primary" loading={saving} disabled={Boolean(unsupported)}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ResourceColumn({ site }: { site: Site | null }) {
  const { latest } = usePanel();
  const stats = useApi<SiteStats>(site ? `/api/sites/${site.id}/stats` : null, 30000);
  const memPct = latest ? (latest.memory.used / latest.memory.total) * 100 : 0;
  const diskMB = (stats.data?.diskBytes ?? 0) / 1024 / 1024;
  const quotaPct = site?.quotaMB ? (diskMB / site.quotaMB) * 100 : Math.min(100, diskMB / 10);

  return (
    <Card title="Tài nguyên" icon={HardDrive} className="xl:sticky xl:top-4">
      {!site ? (
        <p className="text-sm text-slate-500">Chọn một website để xem thống kê.</p>
      ) : !stats.data ? (
        <Spinner label="Đang tính dung lượng..." />
      ) : (
        <div className="space-y-5">
          <ResourceBar
            label="Disk Quota"
            icon={HardDrive}
            value={quotaPct}
            detail={site.quotaMB ? `${formatBytes(stats.data.diskBytes)} / ${site.quotaMB} MB` : `${formatBytes(stats.data.diskBytes)} / ∞`}
          />
          <ResourceBar label="Bandwidth" icon={ArrowRightLeft} value={Math.min(100, stats.data.bandwidthBytes / 1024 / 1024 / 1024)} tone="blue" detail={`${formatBytes(stats.data.bandwidthBytes)} · ${stats.data.requests.toLocaleString('vi-VN')} req`} />
          <ResourceBar label="Inodes" icon={FileCode} value={Math.min(100, stats.data.files / 2000)} tone="blue" detail={`${stats.data.files.toLocaleString('vi-VN')} file`} />
          <ResourceBar label="RAM máy chủ" icon={MemoryStick} value={memPct} detail={latest ? `${formatBytes(latest.memory.used)} / ${formatBytes(latest.memory.total)}` : '—'} />
          {site.quotaMB > 0 && diskMB > site.quotaMB && (
            <Notice tone="red" icon={AlertTriangle}>
              Website đã vượt hạn mức dung lượng.
            </Notice>
          )}
          <p className="text-xs text-slate-500">Bandwidth tính từ access log của site (20MB log gần nhất).</p>
        </div>
      )}
    </Card>
  );
}

export default function Websites() {
  const { data, error, reload } = useApi<SitesResponse>('/api/sites');
  const { data: php, reload: reloadPhp } = useApi<PhpStatus>('/api/php/status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sslModal, setSslModal] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installingPhp, setInstallingPhp] = useState(false);
  const [restartingPhp, setRestartingPhp] = useState(false);
  const [phpConfigOpen, setPhpConfigOpen] = useState(false);
  const [phpExtOpen, setPhpExtOpen] = useState(false);
  const { confirm, run, toast } = useFeedback();
  const { runJob } = useJobs();
  const { refreshInfo } = usePanel();

  const sites = data?.sites ?? [];
  const selected = sites.find((s) => s.id === selectedId) ?? sites[0] ?? null;

  useEffect(() => {
    if (!selectedId && sites[0]) setSelectedId(sites[0].id);
  }, [sites, selectedId]);

  const create = async (body: Record<string, unknown>) => {
    const site = await run(() => post<Site>('/api/sites', body));
    if (!site) return;
    toast(site.lastError ? `Đã tạo ${site.domain}, nhưng chưa áp dụng cấu hình: ${site.lastError}` : `Đã tạo website ${site.domain}`, site.lastError ? 'info' : 'success');
    setCreating(false);
    setSelectedId(site.id);
    await reload();
  };

  const update = async (body: Record<string, unknown>) => {
    if (!selected) return;
    const site = await run(() => put<Site>(`/api/sites/${selected.id}`, body));
    if (!site) return;
    toast(site.lastError ? `Đã lưu nhưng có lỗi: ${site.lastError}` : 'Đã cập nhật website', site.lastError ? 'error' : 'success');
    setEditing(false);
    await reload();
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!selected) return;
    setBusy(true);
    await run(() => put(`/api/sites/${selected.id}`, { enabled }), enabled ? 'Đã bật website' : 'Đã tạm dừng website');
    setBusy(false);
    await reload();
  };

  const toggleSSL = async (enabled: boolean) => {
    if (!selected) return;
    setBusy(true);
    setSslModal(false);
    const site = await run(() => post<Site>(`/api/sites/${selected.id}/ssl`, { enabled, email: email || undefined }));
    setBusy(false);
    if (site) toast(site.lastError ? `SSL: ${site.lastError}` : enabled ? 'Đã bật HTTPS' : 'Đã tắt HTTPS', site.lastError ? 'error' : 'success');
    await reload();
  };

  const remove = async () => {
    if (!selected) return;
    const deleteFiles = await confirm({
      title: 'Xóa website',
      message: (
        <>
          Gỡ cấu hình web server của <b>{selected.domain}</b>. Thư mục <code className="mono">{selected.root}</code> cũng sẽ bị <b>xóa vĩnh viễn</b>.
        </>
      ),
      danger: true,
      confirmLabel: 'Xóa website & dữ liệu',
      typeToConfirm: selected.domain,
    });
    if (!deleteFiles) return;
    await run(() => del(`/api/sites/${selected.id}?deleteFiles=true`), `Đã xóa ${selected.domain}`);
    setSelectedId(null);
    await reload();
  };

  const installServer = async (server: WebServerInfo) => {
    setInstalling(server.kind);
    await runJob(() => post<Job>(`/api/webservers/${server.kind}/install`));
    setInstalling(null);
    await Promise.all([reload(), refreshInfo()]);
  };

  const installPhp = async (version?: string) => {
    setInstallingPhp(true);
    await runJob(() => post<Job>('/api/php/install', { version }));
    setInstallingPhp(false);
    await Promise.all([reload(), reloadPhp(), refreshInfo()]);
  };

  const restartPhp = async () => {
    setRestartingPhp(true);
    await run(() => post('/api/php/restart'), 'Đã khởi động lại dịch vụ PHP-FPM');
    setRestartingPhp(false);
    await reloadPhp();
  };

  const savePhpConfig = async (cfg: PhpConfigInput) => {
    await run(() => put('/api/php/config', cfg), 'Đã cập nhật cấu hình php.ini và áp dụng vào PHP-FPM');
    setPhpConfigOpen(false);
    await reloadPhp();
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  const noServer = !data.webServers.some((w) => w.installed);

  return (
    <>
      <PageHeader
        title="Websites"
        description="Mỗi website có thư mục, cấu hình web server và log riêng biệt"
        icon={Globe}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void Promise.all([reload(), reloadPhp()])}>
              Làm mới
            </Button>
            <Button icon={Plus} variant="primary" onClick={() => setCreating(true)}>
              Thêm website
            </Button>
          </>
        }
      />

      {/* Danh sách Web Server & Máy chủ PHP */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.webServers.map((server) => (
          <div key={server.kind} className="glass flex flex-col justify-between p-4">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn('flex size-9 items-center justify-center rounded-xl ring-1', server.installed ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-slate-800 text-slate-500 ring-white/5')}>
                    <Server className="size-5" />
                  </div>
                  <div>
                    <div className="font-bold text-white">{server.label}</div>
                    <div className="text-xs text-slate-400">Web Server</div>
                  </div>
                </div>
                {server.installed ? <Badge tone="green">Đã cài</Badge> : <Badge tone="slate">Chưa cài</Badge>}
              </div>

              <div className="mt-3 text-xs text-slate-400">
                Hỗ trợ: <span className="text-slate-300">{[server.supports.php && 'PHP', server.supports.proxy && 'Proxy', server.supports.ssl && 'SSL'].filter(Boolean).join(' · ') || 'Site tĩnh'}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-end">
              {server.installed ? (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="size-3.5" /> Sẵn sàng
                </span>
              ) : (
                <Button size="sm" variant="soft" icon={Download} loading={installing === server.kind} onClick={() => void installServer(server)}>
                  Cài {server.label}
                </Button>
              )}
            </div>
          </div>
        ))}

        {/* Khối quản trị Máy chủ PHP / PHP-FPM */}
        <div className="glass flex flex-col justify-between p-4 border-indigo-500/20 bg-gradient-to-br from-indigo-950/20 via-slate-900/60 to-slate-900/40">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'flex size-9 items-center justify-center rounded-xl ring-1',
                  php?.installed && php.fpmRunning
                    ? 'bg-indigo-500/20 text-indigo-300 ring-indigo-500/30'
                    : php?.installed
                    ? 'bg-amber-500/20 text-amber-300 ring-amber-500/30'
                    : 'bg-slate-800 text-slate-500 ring-white/5'
                )}>
                  <Code2 className="size-5" />
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Máy chủ PHP</span>
                    {php?.version && <span className="mono rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">{php.version}</span>}
                  </div>
                  <div className="text-xs text-slate-400">PHP-FPM Runtime & Modules</div>
                </div>
              </div>
              {php?.installed && php.fpmRunning ? (
                <Badge tone="green">FPM Active</Badge>
              ) : php?.installed ? (
                <Badge tone="amber">FPM Dừng</Badge>
              ) : (
                <Badge tone="slate">Chưa cài</Badge>
              )}
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>FastCGI Socket:</span>
                <code className="mono text-[11px] text-slate-300 truncate max-w-[150px]">{php?.socketPath || (php?.installed ? '127.0.0.1:9000' : 'Chưa có')}</code>
              </div>
              <div className="flex items-center justify-between">
                <span>Bộ nhớ & Upload:</span>
                <span className="text-slate-300">{php?.memoryLimit || '128M'} / {php?.uploadMaxFilesize || '64M'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Phần mở rộng:</span>
                <span className="text-indigo-300 font-medium">{php?.extensions.length ?? 0} modules đã nạp</span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-end gap-1.5">
            {php?.installed ? (
              <>
                <Button size="sm" variant="ghost" icon={RotateCw} loading={restartingPhp} onClick={() => void restartPhp()} title="Khởi động lại PHP-FPM">
                  Khởi động lại
                </Button>
                <Button size="sm" variant="ghost" icon={Sliders} onClick={() => setPhpConfigOpen(true)} title="Tùy chỉnh php.ini">
                  php.ini
                </Button>
                <Button size="sm" variant="soft" icon={Layers} onClick={() => setPhpExtOpen(true)} title="Xem danh sách extension">
                  Extensions
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" icon={Download} loading={installingPhp} onClick={() => void installPhp()}>
                Cài PHP & PHP-FPM
              </Button>
            )}
          </div>
        </div>
      </div>

      {noServer && (
        <div className="mb-4">
          <Notice tone="amber" icon={AlertTriangle}>
            Máy chủ chưa có web server. Bấm <b>Cài web server</b> ở trên (Caddy được khuyên dùng: tự động HTTPS, chạy được cả Windows lẫn Linux).
          </Notice>
        </div>
      )}

      {sites.length === 0 ? (
        <Card>
          <EmptyState
            icon={Globe}
            title="Chưa có website nào"
            description="Thêm website đầu tiên: ZenPanel tạo thư mục riêng, trang chào mừng và cấu hình web server tự động."
            action={
              <Button icon={Plus} variant="primary" onClick={() => setCreating(true)}>
                Thêm website
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {sites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => setSelectedId(site.id)}
                  className={cn(
                    'glass p-4 text-left transition hover:border-zen-blue/50',
                    selected?.id === site.id && 'border-zen-blue/70 ring-2 ring-zen-blue/20',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {site.ssl ? <Lock className="size-4 text-zen-green" /> : <LockOpen className="size-4 text-slate-500" />}
                    <span className="mono flex-1 truncate font-bold text-white">{site.domain}</span>
                    <Badge tone={site.lastError ? 'red' : site.enabled ? 'green' : 'slate'}>{site.lastError ? 'Lỗi' : site.enabled ? 'Online' : 'Tạm dừng'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge tone="blue">{typeLabel[site.type]}</Badge>
                    <Badge>{data.webServers.find((w) => w.kind === site.webServer)?.label ?? site.webServer}</Badge>
                    {site.aliases.length > 0 && <Badge>+{site.aliases.length} alias</Badge>}
                  </div>
                </button>
              ))}
            </div>

            {selected && (
              <Card
                title={
                  <span className="mono flex items-center gap-2">
                    <Globe className="size-4 text-zen-blue" />
                    {selected.domain}
                  </span>
                }
                actions={
                  <>
                    <a href={`${selected.ssl ? 'https' : 'http'}://${selected.domain}`} target="_blank" rel="noreferrer">
                      <Button size="sm" icon={ExternalLink}>
                        Mở site
                      </Button>
                    </a>
                    <Link to={`/files?path=${encodeURIComponent(selected.root)}`}>
                      <Button size="sm" icon={FolderOpen}>
                        File
                      </Button>
                    </Link>
                    <Button size="sm" icon={Settings2} onClick={() => setEditing(true)}>
                      Cấu hình
                    </Button>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>
                      Xóa
                    </Button>
                  </>
                }
              >
                {selected.lastError && (
                  <div className="mb-4">
                    <ErrorBox message={selected.lastError} />
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <dl className="space-y-3 text-sm">
                    {[
                      ['Thư mục gốc', <code className="mono break-all text-slate-200">{selected.root}</code>],
                      ['Loại', typeLabel[selected.type] + (selected.type === 'proxy' ? ` → 127.0.0.1:${selected.proxyPort}` : '')],
                      ['Tên miền phụ', selected.aliases.join(', ') || '—'],
                      ['Access log', <code className="mono break-all text-xs text-slate-400">{selected.accessLog}</code>],
                      ['Tạo lúc', formatDate(selected.createdAt)],
                    ].map(([key, value]) => (
                      <div key={String(key)}>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</dt>
                        <dd className="mt-0.5 text-slate-200">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="space-y-3">
                    <SettingRow icon={Waypoints} title="Website hoạt động" description="Tạm dừng sẽ gỡ cấu hình khỏi web server">
                      <Toggle checked={selected.enabled} onChange={(v) => void toggleEnabled(v)} disabled={busy} />
                    </SettingRow>
                    <SettingRow icon={Lock} title="HTTPS (Let's Encrypt)" description={selected.webServer === 'caddy' ? 'Caddy tự xin & gia hạn chứng chỉ' : 'Dùng certbot để xin chứng chỉ'}>
                      <Toggle checked={selected.ssl} onChange={(v) => (v ? setSslModal(true) : void toggleSSL(false))} disabled={busy} />
                    </SettingRow>
                    <Notice>Hãy trỏ bản ghi A của tên miền về IP máy chủ (hoặc dùng Cloudflare DNS trong mục Bảo mật) trước khi bật HTTPS.</Notice>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <ResourceColumn site={selected} />
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Thêm website mới" size="lg">
        <SiteForm webServers={data.webServers} defaultRoot={data.defaultRoot} phpStatus={php} onSubmit={create} submitLabel="Tạo website" />
      </Modal>

      <Modal open={editing && Boolean(selected)} onClose={() => setEditing(false)} title={`Cấu hình ${selected?.domain ?? ''}`} size="lg">
        {selected && <SiteForm initial={selected} webServers={data.webServers} defaultRoot={data.defaultRoot} phpStatus={php} onSubmit={update} submitLabel="Lưu cấu hình" />}
      </Modal>

      <Modal open={sslModal} onClose={() => setSslModal(false)} title="Bật HTTPS miễn phí" size="sm">
        <div className="space-y-4">
          <Field label="Email nhận thông báo chứng chỉ" hint="Let's Encrypt gửi cảnh báo hết hạn tới email này">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSslModal(false)}>
              Hủy
            </Button>
            <Button variant="success" icon={Lock} onClick={() => void toggleSSL(true)}>
              Bật HTTPS
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Tùy chỉnh php.ini */}
      <PhpConfigModal
        open={phpConfigOpen}
        onClose={() => setPhpConfigOpen(false)}
        php={php ?? null}
        onSave={savePhpConfig}
      />

      {/* Modal Danh sách Extension PHP */}
      <PhpExtensionsModal
        open={phpExtOpen}
        onClose={() => setPhpExtOpen(false)}
        extensions={php?.extensions ?? []}
      />
    </>
  );
}

function SettingRow({ icon: Icon, title, description, children }: { icon: typeof Lock; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
      <Icon className="size-5 shrink-0 text-zen-blue" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      {children}
    </div>
  );
}
