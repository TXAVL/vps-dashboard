// ZenPanel - Kho ứng dụng 1-Click (Docker Compose): cài đặt, truy cập (link public / IP:cổng), hướng dẫn, cấu hình lại
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Activity,
  Archive,
  Bot,
  BrainCircuit,
  ChartLine,
  CheckCircle2,
  Clapperboard,
  Cloud,
  Code,
  Container,
  Cpu,
  Database,
  DoorOpen,
  Download,
  ExternalLink,
  FileCode,
  FolderOpen,
  GitBranch,
  Globe,
  HardDrive,
  Keyboard,
  KeyRound,
  Layers,
  LayoutGrid,
  Leaf,
  Link2,
  MessagesSquare,
  Monitor,
  NotebookPen,
  Newspaper,
  Package,
  Play,
  RefreshCw,
  RotateCw,
  ScrollText,
  Settings2,
  Share2,
  Shield,
  Sparkles,
  Square,
  Table,
  Table2,
  Trash2,
  Wand2,
  Waypoints,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, CopyButton, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, SearchInput, Spinner, StatusDot, Tabs, Toggle, cn, type Tone } from '../components/ui';
import { get, post } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel, usePublicHost } from '../lib/panel';
import type { AppView, DockerInfo, Job, TunnelState } from '../lib/types';
import { DockerMissing } from './Docker';

const ICONS: Record<string, LucideIcon> = {
  Globe, Newspaper, Database, Zap, Leaf, Table, Table2, Container, Activity, Workflow, GitBranch, HardDrive, FolderOpen, Code, KeyRound, Cloud,
  Clapperboard, ChartLine, ScrollText, Download, RefreshCw, NotebookPen, Wrench, Waypoints, MessagesSquare, Cpu, Bot, BrainCircuit, Monitor,
  Archive, Keyboard, Share2, Shield, Layers,
};

export type KernelStore = 'all' | 'windows' | 'linux' | 'docker';

export const KERNEL_STORES = [
  { id: 'all', label: 'Tất cả kho', icon: '🌐', desc: 'Toàn bộ ứng dụng từ mọi kho nền tảng' },
  { id: 'windows', label: 'Kho Windows NT', icon: '🪟', desc: 'Ứng dụng & Dịch vụ Native Windows Server / 10 / 11' },
  { id: 'linux', label: 'Kho Linux Kernel', icon: '🐧', desc: 'Gói công cụ & Daemon tối ưu cho Debian / Ubuntu / CentOS / Alpine' },
  { id: 'docker', label: 'Kho Docker Container', icon: '🐳', desc: 'Ứng dụng Container hóa đa nhân hệ điều hành' },
] as const;

const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'compatible', label: '★ Tương thích' },
  { id: 'installed', label: 'Đã cài' },
  { id: 'ai', label: 'AI Agent' },
  { id: 'web', label: 'Web' },
  { id: 'database', label: 'Database' },
  { id: 'native', label: 'App Native' },
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

const webPortOf = (app: AppView) => (app.webPort ? app.installed?.params[app.webPort] : undefined);

function AppIcon({ app, size = 'md' }: { app: AppView; size?: 'md' | 'lg' }) {
  const Icon = ICONS[app.icon] ?? Package;
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl border border-slate-700/50 bg-gradient-to-br from-ink-800 to-ink-950 text-blue-300',
        size === 'lg' ? 'size-14' : 'size-12',
      )}
    >
      <Icon className={size === 'lg' ? 'size-7' : 'size-6'} />
    </div>
  );
}

function ParamFields({ app, values, onChange, editing }: { app: AppView; values: Record<string, string>; onChange: (v: Record<string, string>) => void; editing?: boolean }) {
  return (
    <>
      {app.params.map((param) => (
        <Field
          key={param.key}
          label={param.label}
          hint={
            param.hint ??
            (param.type === 'password' && param.generate
              ? editing
                ? 'Để trống để giữ nguyên'
                : 'Để trống để ZenPanel tự sinh mật khẩu mạnh'
              : param.type === 'port'
                ? 'Cổng trên máy chủ, không được trùng ứng dụng khác'
                : undefined)
          }
        >
          <input
            className="input mono"
            type={param.type === 'port' ? 'number' : 'text'}
            value={values[param.key] ?? ''}
            required={!param.generate && !param.optional}
            onChange={(e) => onChange({ ...values, [param.key]: e.target.value })}
          />
        </Field>
      ))}
    </>
  );
}

function InstallModal({ app, onClose, onInstalled }: { app: AppView; onClose: () => void; onInstalled: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(app.params.map((p) => [p.key, p.default !== undefined ? String(p.default) : ''])));
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { runJob } = useJobs();
  const { latest } = usePanel();

  const mainDisk = latest?.disks?.[0];
  const freeBytes = mainDisk ? mainDisk.total - mainDisk.used : 0;
  const freeGb = freeBytes > 0 ? (freeBytes / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const requiredBytes = (app.appType === 'native' ? 0.5 : app.category === 'ai' ? 4.0 : 2.5) * 1024 * 1024 * 1024;
  const requiredGb = (requiredBytes / (1024 * 1024 * 1024)).toFixed(1);
  const isInsufficient = freeBytes > 0 && freeBytes < requiredBytes;
  const isCritical = freeBytes > 0 && freeBytes < 1.5 * 1024 * 1024 * 1024;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setInstalling(true);
    setError(null);
    try {
      // Lỗi nhập liệu và kiểm tra ổ đĩa trả về ngay; cài đặt thật chạy nền và mở cửa sổ log
      const job = await post<Job>(`/api/apps/${app.id}/install`, values);
      onClose();
      void runJob(() => Promise.resolve(job), (done) => done.status === 'success' && onInstalled());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Modal open onClose={installing ? () => undefined : onClose} title={`Cài đặt ${app.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-3">
          <AppIcon app={app} />
          <div>
            <p className="text-sm text-slate-300">{app.description}</p>
            {app.isCompatible === false && (
              <p className="mt-1 text-xs text-amber-300">
                ⚠️ Chú ý: Ứng dụng này yêu cầu {app.platform === 'windows' ? 'Windows' : 'Linux'}{app.requiresGui ? ' có giao diện Desktop (GUI)' : ''}.
              </p>
            )}
          </div>
        </div>

        {/* Cảnh báo kiểm tra dung lượng ổ đĩa tránh full disk */}
        {mainDisk && (
          <div
            className={cn(
              'flex flex-col gap-1.5 rounded-xl border p-3 text-xs',
              isCritical
                ? 'border-zen-red/50 bg-zen-red/10 text-red-200'
                : isInsufficient
                  ? 'border-zen-amber/50 bg-zen-amber/10 text-amber-200'
                  : 'border-slate-700/50 bg-ink-950/40 text-slate-300',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold">
                <HardDrive className="size-3.5" />
                Ổ đĩa {mainDisk.mount}
              </span>
              <span className="mono font-bold">
                {formatBytes(freeBytes)} còn trống / {formatBytes(mainDisk.total)}
              </span>
            </div>
            {isInsufficient && (
              <p className="mt-1 leading-relaxed">
                ⚠️ {app.name} yêu cầu an toàn tối thiểu <b className="text-white">{requiredGb} GB</b> trống để tránh làm đầy ổ đĩa (full disk) gây treo máy chủ. Hiện chỉ còn {freeGb} GB.{' '}
                <Link to="/cleanup" className="font-bold underline text-blue-300 hover:text-white" onClick={onClose}>
                  Vào tab Dọn dẹp để giải phóng ngay →
                </Link>
              </p>
            )}
          </div>
        )}

        {app.usesAiKeys && (
          <Notice icon={Sparkles}>
            App này dùng các API key AI đã lưu trong{' '}
            <Link to="/ai" className="font-semibold text-blue-300 underline">
              AI Gateway
            </Link>
            . Thêm key trước khi cài, hoặc thêm sau rồi bấm "Cấu hình lại".
          </Notice>
        )}
        <ParamFields app={app} values={values} onChange={setValues} />
        {error && <ErrorBox message={error} />}
        <Notice>Sau khi bấm cài đặt, cửa sổ log sẽ hiện tiến trình tải image và khởi động container. Cài xong, ZenPanel mở hướng dẫn truy cập app.</Notice>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={installing}>
            Huỷ
          </Button>
          <Button type="submit" variant="primary" icon={Download} loading={installing} disabled={isCritical}>
            {isCritical ? 'Ổ đĩa quá đầy (hãy dọn dẹp)' : 'Cài đặt'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Cửa sổ "Truy cập": link public (tunnel riêng), IP:cổng + mở tường lửa, hướng dẫn sau cài */
function AccessModal({ app, onClose, onChanged, onWizard }: { app: AppView; onClose: () => void; onChanged: () => void; onWizard: () => void }) {
  const [link, setLink] = useState<(TunnelState & { enabled: boolean }) | null>(app.publicLink);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const { host, source } = usePublicHost();
  const { run, toast } = useFeedback();
  const port = webPortOf(app);
  const direct = port ? `${app.webScheme ?? 'http'}://${host.includes(':') ? `[${host}]` : host}:${port}` : null;

  const toggleLink = async (enabled: boolean) => {
    setBusy(true);
    const state = await run(() => post<TunnelState & { enabled: boolean }>(`/api/apps/${app.id}/public-link`, { enabled }));
    setBusy(false);
    if (state) {
      setLink(state);
      if (enabled && state.url) toast(`Link public: ${state.url}`);
      if (enabled && !state.url) toast(state.error ?? 'Chưa lấy được link, thử lại sau ít giây', 'error');
      onChanged();
    }
  };

  const openFirewall = async () => {
    if (!port) return;
    setOpening(true);
    await run(() => post('/api/firewall/rules', { action: 'allow', port, protocol: 'tcp', description: `ZenPanel - ${app.name}` }), `Đã mở cổng ${port} trên tường lửa`);
    setOpening(false);
  };

  return (
    <Modal open onClose={onClose} title={`Truy cập ${app.name}`} size="lg">
      <div className="space-y-5">
        {port ? (
          <>
            <section className="space-y-3 rounded-2xl border border-zen-blue/30 bg-zen-blue/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Link2 className="size-4 text-blue-300" /> Link public (khuyên dùng)
                  </div>
                  <p className="text-xs text-slate-400">Tunnel Cloudflare riêng cho app, có HTTPS, mở được từ mọi nơi, không cần mở cổng.</p>
                </div>
                <Toggle checked={Boolean(link?.enabled)} onChange={(v) => void toggleLink(v)} disabled={busy} label="Bật link public" />
              </div>
              {busy && <Spinner label="Đang xin domain từ Cloudflare (5-20 giây)..." />}
              {!busy && link?.enabled && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/50 bg-ink-950/70 px-3 py-2">
                  <StatusDot tone={link.status === 'online' ? 'green' : link.status === 'starting' ? 'amber' : 'red'} pulse={link.status === 'online'} />
                  {link.url ? (
                    <>
                      <a href={link.url} target="_blank" rel="noreferrer" className="mono min-w-0 flex-1 truncate text-blue-300 hover:underline">
                        {link.url}
                      </a>
                      <CopyButton value={link.url} />
                      <a href={link.url} target="_blank" rel="noreferrer">
                        <Button size="xs" variant="primary" icon={ExternalLink}>
                          Mở
                        </Button>
                      </a>
                    </>
                  ) : (
                    <span className="text-sm text-slate-400">{link.error ?? 'Đang kết nối...'}</span>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">Domain trycloudflare đổi mỗi lần agent khởi động lại. Cần domain cố định: cài app "Cloudflare Tunnel" và trỏ Public Hostname tới cổng {port}.</p>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
              <div className="flex items-center gap-2 font-bold text-white">
                <Globe className="size-4 text-slate-400" /> Truy cập trực tiếp bằng IP / domain
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/50 bg-ink-950/70 px-3 py-2">
                <a href={direct!} target="_blank" rel="noreferrer" className="mono min-w-0 flex-1 truncate text-slate-200 hover:underline">
                  {direct}
                </a>
                <CopyButton value={direct!} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" icon={DoorOpen} loading={opening} onClick={() => void openFirewall()}>
                  Mở cổng {port} trên tường lửa
                </Button>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
                <li>
                  {source === 'custom' ? 'Đang dùng domain/IP bạn đặt' : source === 'ip' ? 'Đang dùng IP public tự phát hiện' : 'Không lấy được IP public, đang dùng host của trình duyệt'} — đổi trong{' '}
                  <Link to="/settings?tab=system" className="text-blue-300 underline">
                    Cài đặt → Hệ thống
                  </Link>
                  .
                </li>
                <li>Nếu vẫn không vào được: mở cổng {port} trong firewall/security group của nhà cung cấp VPS (AWS, GCP, Azure, Vultr...).</li>
              </ul>
            </section>
          </>
        ) : (
          <Notice>Ứng dụng này không có giao diện web. Xem cách kết nối trong hướng dẫn bên dưới.</Notice>
        )}

        {app.guide && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-white">
              <CheckCircle2 className="size-4 text-zen-green" /> Hướng dẫn sử dụng
            </div>
            {app.guide.credentials && (
              <Notice tone="amber" icon={KeyRound}>
                {app.guide.credentials}
              </Notice>
            )}
            <ol className="space-y-2">
              {app.guide.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-300">
                  <span className="mono flex size-6 shrink-0 items-center justify-center rounded-full bg-zen-blue/15 text-xs font-bold text-blue-300">{i + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {app.id === 'n8n' && (
            <Button variant="success" icon={Wand2} onClick={onWizard}>
              Thiết lập n8n
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReconfigureModal({ app, onClose, onDone }: { app: AppView; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { runJob } = useJobs();

  useEffect(() => {
    get<{ params: Record<string, string> }>(`/api/apps/${app.id}/config`)
      .then((c) => setValues(c.params))
      .catch((err: Error) => setError(err.message));
  }, [app.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;
    setSaving(true);
    setError(null);
    try {
      const job = await post<Job>(`/api/apps/${app.id}/reconfigure`, values);
      onClose();
      void runJob(() => Promise.resolve(job), onDone);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Cấu hình lại ${app.name}`}>
      {!values ? (
        error ? <ErrorBox message={error} /> : <Spinner />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Notice>Container được tạo lại với tham số mới{app.usesAiKeys ? ' và API key AI mới nhất' : ''}. Dữ liệu trong volume được giữ nguyên.</Notice>
          <ParamFields app={app} values={values} onChange={setValues} editing />
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" variant="primary" icon={Settings2} loading={saving}>
              Áp dụng
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Wizard thiết lập n8n: link public → Webhook URL → tạo Owner → kết nối AI */
function N8nWizard({ app, onClose, onDone }: { app: AppView; onClose: () => void; onDone: () => void }) {
  const [link, setLink] = useState<(TunnelState & { enabled: boolean }) | null>(app.publicLink);
  const [webhook, setWebhook] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const { run } = useFeedback();
  const { runJob } = useJobs();

  useEffect(() => {
    get<{ params: Record<string, string> }>(`/api/apps/${app.id}/config`)
      .then((c) => setWebhook(c.params.webhookUrl ?? ''))
      .catch(() => setWebhook(''));
  }, [app.id]);

  const enableLink = async () => {
    setBusy(true);
    const state = await run(() => post<TunnelState & { enabled: boolean }>(`/api/apps/${app.id}/public-link`, { enabled: true }));
    setBusy(false);
    if (state) setLink(state);
    if (state?.url) setStep(1);
  };

  const applyWebhook = async () => {
    if (!link?.url) return;
    const config = await run(() => get<{ params: Record<string, string> }>(`/api/apps/${app.id}/config`));
    if (!config) return;
    setBusy(true);
    const ok = await runJob(() => post<Job>(`/api/apps/${app.id}/reconfigure`, { ...config.params, webhookUrl: link.url }));
    setBusy(false);
    if (ok) {
      setWebhook(link.url);
      setStep(2);
      onDone();
    }
  };

  const steps = [
    {
      title: 'Bật link public cho n8n',
      body: (
        <>
          <p>n8n cần địa chỉ public để webhook, form trigger và đăng nhập OAuth (Google, Slack...) hoạt động từ bên ngoài.</p>
          {link?.url ? (
            <div className="mono flex items-center gap-2 rounded-xl border border-slate-700/50 bg-ink-950/70 px-3 py-2 text-blue-300">
              <span className="min-w-0 flex-1 truncate">{link.url}</span>
              <CopyButton value={link.url} />
            </div>
          ) : busy ? (
            <Spinner label="Đang xin domain từ Cloudflare..." />
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" icon={Link2} loading={busy} onClick={() => void enableLink()}>
              {link?.url ? 'Lấy lại link' : 'Bật link public'}
            </Button>
            {link?.url && (
              <Button onClick={() => setStep(1)} variant="soft">
                Tiếp tục
              </Button>
            )}
          </div>
        </>
      ),
    },
    {
      title: 'Đặt Webhook URL',
      body: (
        <>
          <p>
            ZenPanel đặt <code className="mono">WEBHOOK_URL</code> và <code className="mono">N8N_EDITOR_BASE_URL</code> = link public rồi tạo lại container (workflow, credential giữ nguyên).
          </p>
          <p className="text-xs text-slate-500">Webhook URL hiện tại: {webhook ? <span className="mono">{webhook}</span> : 'chưa đặt'}</p>
          <div className="flex gap-2">
            <Button variant="primary" icon={Settings2} loading={busy} disabled={!link?.url} onClick={() => void applyWebhook()}>
              Áp dụng {link?.url ? 'link public' : ''}
            </Button>
            <Button variant="ghost" onClick={() => setStep(2)}>
              Bỏ qua
            </Button>
          </div>
        </>
      ),
    },
    {
      title: 'Tạo tài khoản Owner',
      body: (
        <>
          <p>Mở n8n, lần đầu sẽ có form tạo tài khoản Owner (email + mật khẩu). Tài khoản này quản lý toàn bộ workflow.</p>
          <div className="flex gap-2">
            {link?.url && (
              <a href={link.url} target="_blank" rel="noreferrer">
                <Button variant="primary" icon={ExternalLink}>
                  Mở n8n
                </Button>
              </a>
            )}
            <Button variant="soft" onClick={() => setStep(3)}>
              Đã tạo xong
            </Button>
          </div>
        </>
      ),
    },
    {
      title: 'Kết nối AI cho workflow',
      body: (
        <>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Lưu API key ChatGPT / Claude / Gemini / OpenRouter / NVIDIA trong{' '}
              <Link to="/ai" className="text-blue-300 underline">
                AI Gateway
              </Link>
              .
            </li>
            <li>Cài "AI Gateway (LiteLLM)" trong App Store để có 1 endpoint chung cho mọi model.</li>
            <li>
              Trong n8n: Credentials → New → <b>OpenAI</b> → Base URL <code className="mono">http://host.docker.internal:4000/v1</code>, API key = <code className="mono">sk-&lt;master key&gt;</code> của gateway.
            </li>
            <li>Dùng node "AI Agent" với model như anthropic/claude-sonnet-5-5, gemini/gemini-2.5-flash, openai/gpt-4o.</li>
          </ol>
          <Button variant="success" icon={CheckCircle2} onClick={onClose}>
            Hoàn tất
          </Button>
        </>
      ),
    },
  ];

  return (
    <Modal open onClose={onClose} title="Thiết lập n8n" size="lg">
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={s.title} className={cn('rounded-2xl border p-4 transition', i === step ? 'border-zen-blue/60 bg-zen-blue/5' : 'border-slate-700/50 bg-ink-950/40 opacity-70')}>
            <button className="flex w-full items-center gap-3 text-left" onClick={() => setStep(i)}>
              <span
                className={cn(
                  'mono flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  i < step ? 'bg-zen-green text-white' : i === step ? 'bg-zen-blue text-white' : 'bg-slate-800 text-slate-400',
                )}
              >
                {i < step ? '✓' : i + 1}
              </span>
              <span className="font-semibold text-white">{s.title}</span>
            </button>
            {i === step && <div className="mt-3 space-y-3 pl-10 text-sm text-slate-300">{s.body}</div>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function AppStore() {
  const docker = useApi<DockerInfo>('/api/docker/info');
  const apps = useApi<AppView[]>('/api/apps');
  const { info } = usePanel();
  const [kernelStore, setKernelStore] = useState<KernelStore>('all');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('all');
  const [query, setQuery] = useState('');
  const [installing, setInstalling] = useState<AppView | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [reconfig, setReconfig] = useState<AppView | null>(null);
  const [wizard, setWizard] = useState<AppView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uninstall, setUninstall] = useState<{ app: AppView; removeData: boolean } | null>(null);
  const { run } = useFeedback();
  const { runJob } = useJobs();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isWindowsHost = info?.os.family === 'windows';
  const isLinuxHost = info?.os.family === 'linux';

  useEffect(() => {
    const toInstall = searchParams.get('install');
    if (!toInstall || !apps.data) return;
    const target = apps.data.find((a) => a.id === toInstall);
    if (target && !target.installed) {
      setInstalling(target);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, apps.data, setSearchParams]);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return (apps.data ?? [])
      .filter((a) => {
        // 1. Lọc theo Kho nhân hệ điều hành (Kernel Storefront)
        if (kernelStore === 'windows') {
          if (a.platform !== 'windows') return false;
        } else if (kernelStore === 'linux') {
          if (a.platform !== 'linux') return false;
        } else if (kernelStore === 'docker') {
          if (a.appType === 'native') return false;
        }

        // 2. Lọc theo Danh mục chức năng (Category)
        if (category === 'compatible') return a.isCompatible !== false;
        if (category === 'installed') return Boolean(a.installed);
        if (category === 'native') return a.appType === 'native';
        if (category !== 'all') return a.category === category;
        return true;
      })
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      .sort((a, b) => Number(Boolean(b.installed)) - Number(Boolean(a.installed)) || a.name.localeCompare(b.name));
  }, [apps.data, kernelStore, category, query]);

  const accessApp = apps.data?.find((a) => a.id === access) ?? null;
  const installedCount = (apps.data ?? []).filter((a) => a.installed).length;

  const act = async (app: AppView, action: string, label: string) => {
    setBusy(app.id);
    if (action === 'update') await runJob(() => post<Job>(`/api/apps/${app.id}/update`));
    else await run(() => post(`/api/apps/${app.id}/${action}`), `${label}: ${app.name}`);
    setBusy(null);
    await apps.reload();
  };

  const doUninstall = async () => {
    if (!uninstall) return;
    const { app, removeData } = uninstall;
    setUninstall(null);
    setBusy(app.id);
    await runJob(() => post<Job>(`/api/apps/${app.id}/uninstall`, { removeData }));
    setBusy(null);
    await apps.reload();
  };

  const composePath = async (app: AppView) => {
    const result = await run(() => get<{ path: string }>(`/api/apps/${app.id}/compose`));
    if (result) navigate(`/files?open=${encodeURIComponent(result.path)}`);
  };

  return (
    <>
      <PageHeader
        title="App Store"
        description={`Cài ứng dụng 1-Click (Docker Compose & Native System Apps) · đã cài ${installedCount}`}
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
          {/* BỘ KHO ỨNG DỤNG THEO TỪNG NHÂN HỆ ĐIỀU HÀNH */}
          <div className="mb-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Layers className="size-4 text-blue-400" />
                <span>Kho ứng dụng theo nhân hệ điều hành:</span>
              </span>
              {info && (
                <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
                  Máy chủ hiện tại: <b className="text-slate-200">{info.os.name}</b> ({info.os.family === 'windows' ? '🪟 Windows NT' : '🐧 Linux Kernel'})
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {KERNEL_STORES.map((ks) => {
                const isSelected = kernelStore === ks.id;
                const isCurrentHostKernel =
                  (ks.id === 'windows' && isWindowsHost) || (ks.id === 'linux' && isLinuxHost);
                const count =
                  ks.id === 'all'
                    ? (apps.data ?? []).length
                    : ks.id === 'windows'
                      ? (apps.data ?? []).filter((a) => a.platform === 'windows').length
                      : ks.id === 'linux'
                        ? (apps.data ?? []).filter((a) => a.platform === 'linux').length
                        : (apps.data ?? []).filter((a) => a.appType !== 'native').length;

                return (
                  <button
                    key={ks.id}
                    type="button"
                    onClick={() => setKernelStore(ks.id)}
                    className={cn(
                      'group relative flex flex-col justify-between rounded-2xl border p-3 text-left transition cursor-pointer',
                      isSelected
                        ? 'border-zen-blue bg-zen-blue/15 shadow-lg shadow-zen-blue/10 ring-2 ring-zen-blue/30'
                        : 'border-slate-800 bg-ink-950/60 hover:border-slate-700 hover:bg-slate-900/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ks.icon}</span>
                        <span className={cn('text-xs sm:text-sm font-bold truncate', isSelected ? 'text-white' : 'text-slate-200')}>
                          {ks.label}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'mono rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-bold shrink-0',
                          isSelected ? 'bg-zen-blue text-white' : 'bg-slate-800 text-slate-400',
                        )}
                      >
                        {count}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">{ks.desc}</p>
                    {isCurrentHostKernel && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Khớp nhân VPS của bạn</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={category} onChange={setCategory} tabs={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} />
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm ứng dụng..." className="w-full sm:w-64" />
          </div>
          {category === 'ai' && (
            <div className="mb-4">
              <Notice icon={Sparkles}>
                Lưu API key của NVIDIA, OpenRouter, ChatGPT, Gemini, Claude một lần trong{' '}
                <Link to="/ai" className="font-semibold text-blue-300 underline">
                  AI Gateway
                </Link>
                , các app AI sẽ tự dùng chung. Cài <b>AI Gateway</b> để có 1 endpoint chuẩn OpenAI cho mọi model, giống OpenRouter nhưng tự host.
              </Notice>
            </div>
          )}
          {category === 'compatible' && (
            <div className="mb-4">
              <Notice icon={CheckCircle2}>
                Danh sách hiển thị các ứng dụng <b>hoàn toàn tương thích</b> với hệ điều hành và môi trường hiện tại của máy chủ.
              </Notice>
            </div>
          )}
          {apps.error && <ErrorBox message={apps.error} onRetry={apps.reload} />}
          {!apps.data ? (
            <Spinner />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {list.map((app) => {
                const status = statusInfo[app.status];
                return (
                  <div key={app.id} className={cn('glass flex min-w-0 flex-col p-5 transition hover:border-zen-blue/40', busy === app.id && 'opacity-60')}>
                    <div className="flex items-start gap-4">
                      <AppIcon app={app} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate font-bold text-white">{app.name}</h3>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{app.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {app.appType === 'native' ? (
                            <span className={cn(
                              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border',
                              app.platform === 'windows'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            )}>
                              {app.platform === 'windows' ? '🪟 Windows Native' : '🐧 Linux Native'}
                              {app.requiresGui ? ' (GUI)' : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                              🐳 Docker Multi-Arch
                            </span>
                          )}
                          {app.isCompatible === false ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
                              ⚠️ Không khớp OS
                            </span>
                          ) : (
                            (app.platform === info?.os.family || (app.platform === 'windows' && isWindowsHost) || (app.platform === 'linux' && isLinuxHost)) && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/20">
                                ✔ Khớp nhân VPS
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    {app.installed && (
                      <div className="mono mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                        {Object.entries(app.installed.params)
                          .filter(([, value]) => value)
                          .map(([key, value]) => (
                            <span key={key} className="max-w-full truncate rounded-md bg-ink-950/70 px-1.5 py-0.5">
                              {key}: {value}
                            </span>
                          ))}
                        {app.publicLink?.url && (
                          <a href={app.publicLink.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-md bg-zen-green/10 px-1.5 py-0.5 text-emerald-300 hover:underline">
                            🔗 {app.publicLink.url.replace('https://', '')}
                          </a>
                        )}
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
                      {!app.installed ? (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={Download}
                          onClick={() => setInstalling(app)}
                          className="w-full"
                          disabled={app.isCompatible === false}
                          title={app.isCompatible === false ? 'Ứng dụng không tương thích với máy này' : undefined}
                        >
                          {app.isCompatible === false ? 'Không tương thích' : 'Cài đặt'}
                        </Button>
                      ) : (
                        <>
                          {app.webPort ? (
                            <Button size="sm" variant="primary" icon={ExternalLink} onClick={() => setAccess(app.id)}>
                              Truy cập
                            </Button>
                          ) : (
                            <Button size="sm" variant="primary" icon={Play} onClick={() => void act(app, 'start', 'Khởi chạy')}>
                              Khởi chạy
                            </Button>
                          )}
                          {app.id === 'n8n' && (
                            <Button size="sm" variant="soft" icon={Wand2} onClick={() => setWizard(app)}>
                              Thiết lập
                            </Button>
                          )}
                          {app.category === 'database' && (
                            <Link to="/databases">
                              <Button size="sm" variant="soft" icon={Database}>
                                Quản lý
                              </Button>
                            </Link>
                          )}
                          <div className="ml-auto flex">
                            {app.appType !== 'native' && (app.status === 'running' || app.status === 'partial') ? (
                              <>
                                <IconButton icon={RotateCw} title="Khởi động lại" onClick={() => void act(app, 'restart', 'Khởi động lại')} />
                                <IconButton icon={Square} title="Dừng" onClick={() => void act(app, 'stop', 'Dừng')} />
                              </>
                            ) : app.appType !== 'native' ? (
                              <IconButton icon={Play} title="Khởi động" onClick={() => void act(app, 'start', 'Khởi động')} />
                            ) : (
                              <IconButton icon={Square} title="Dừng ứng dụng" onClick={() => void act(app, 'stop', 'Dừng')} />
                            )}
                            {app.appType !== 'native' && (
                              <>
                                <IconButton icon={Settings2} title="Cấu hình lại (đổi cổng, mật khẩu, API key)" onClick={() => setReconfig(app)} />
                                <IconButton icon={Download} title="Cập nhật image lên bản mới nhất" onClick={() => void act(app, 'update', 'Cập nhật')} />
                                <IconButton icon={FileCode} title="Xem docker-compose.yml" onClick={() => void composePath(app)} />
                              </>
                            )}
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

      {installing && (
        <InstallModal
          app={installing}
          onClose={() => setInstalling(null)}
          onInstalled={() => {
            const id = installing.id;
            void apps.reload().then(() => setAccess(id));
          }}
        />
      )}
      {accessApp && (
        <AccessModal
          app={accessApp}
          onClose={() => setAccess(null)}
          onChanged={() => void apps.reload()}
          onWizard={() => {
            setAccess(null);
            setWizard(accessApp);
          }}
        />
      )}
      {reconfig && <ReconfigureModal app={reconfig} onClose={() => setReconfig(null)} onDone={() => void apps.reload()} />}
      {wizard && <N8nWizard app={wizard} onClose={() => setWizard(null)} onDone={() => void apps.reload()} />}

      <Modal open={Boolean(uninstall)} onClose={() => setUninstall(null)} title={`Gỡ ${uninstall?.app.name ?? ''}`} size="sm">
        {uninstall && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Container và link public của ứng dụng sẽ bị dừng và xoá.</p>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-zen-red/30 bg-zen-red/10 px-4 py-3 text-sm">
              <span className="text-red-200">Xoá luôn dữ liệu (volumes) — không thể khôi phục</span>
              <Toggle checked={uninstall.removeData} onChange={(removeData) => setUninstall({ ...uninstall, removeData })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setUninstall(null)}>
                Huỷ
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
