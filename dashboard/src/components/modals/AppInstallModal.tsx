// ZenPanel - Modal riêng cho cài đặt / cập nhật ứng dụng App Store:
// bước 1 cấu hình (kiểm tra tài nguyên, cổng trùng, mật khẩu) → bước 2 tiến trình thật (layer Docker, các bước) → kết quả
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, Cpu, Dices, Download, ExternalLink, Eye, EyeOff, HardDrive, KeyRound, Layers, MemoryStick, Plug, RefreshCw, RotateCw, Sparkles, XCircle } from 'lucide-react';
import { get, post } from '../../lib/api';
import { formatBytes, formatDuration } from '../../lib/format';
import { usePanel, usePublicHost } from '../../lib/panel';
import type { AppView, Job } from '../../lib/types';
import { useJobs } from '../jobs';
import { Badge, Button, CopyButton, Modal, Notice, cn } from '../ui';
import { errorLines, layerPercent, LogConsole, parseDockerLayers, ProgressTrack, StepList, useJobWatch } from './jobkit';

type Mode = 'install' | 'update';

const PLANNED: Record<Mode, string[]> = {
  install: ['Kiểm tra máy chủ', 'Tạo cấu hình docker-compose', 'Tải image từ Docker Hub', 'Khởi động container', 'Chờ ứng dụng sẵn sàng'],
  update: ['Tải image mới nhất', 'Tạo lại container'],
};

function randomPassword(length = 20): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function Meter({ icon: Icon, label, used, total, need }: { icon: typeof HardDrive; label: string; used: number; total: number; need: number }) {
  const free = Math.max(0, total - used);
  const pct = total ? (used / total) * 100 : 0;
  const short = free < need;
  return (
    <div className={cn('rounded-xl border p-3', short ? 'border-amber-500/40 bg-amber-950/20' : 'border-slate-700/50 bg-ink-950/50')}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-300">
          <Icon className="size-3.5 text-slate-400" /> {label}
        </span>
        <span className={cn('mono font-bold', short ? 'text-amber-300' : 'text-emerald-300')}>{formatBytes(free)} trống</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={cn('h-full rounded-full', pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-slate-500">Khuyến nghị ≥ {formatBytes(need, 1)}</div>
    </div>
  );
}

export function AppInstallModal({
  app,
  mode = 'install',
  icon,
  onClose,
  onDone,
  onOpenAccess,
}: {
  app: AppView;
  mode?: Mode;
  icon: ReactNode;
  onClose: () => void;
  onDone: () => void;
  onOpenAccess?: () => void;
}) {
  const { latest } = usePanel();
  const host = usePublicHost();
  const { trackJob } = useJobs();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(app.params.map((p) => [p.key, p.default !== undefined ? String(p.default) : p.type === 'password' && p.generate ? randomPassword() : ''])),
  );
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busyPorts, setBusyPorts] = useState<Set<number>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const { job, elapsed } = useJobWatch(jobId, (done) => {
    if (done.status === 'success') onDone();
  });

  useEffect(() => {
    if (mode !== 'install') return;
    void get<{ port: number }[]>('/api/ports')
      .then((list) => setBusyPorts(new Set(list.map((p) => p.port))))
      .catch(() => undefined);
  }, [mode]);

  // Bản cập nhật không cần form: chạy ngay khi mở
  useEffect(() => {
    if (mode !== 'update') return;
    void post<Job>(`/api/apps/${app.id}/update`)
      .then((j) => setJobId(j.id))
      .catch((err: Error) => setFormError(err.message));
  }, [mode, app.id]);

  const disk = latest?.disks?.[0];
  const needDisk = (app.appType === 'native' ? 0.5 : app.category === 'ai' ? 4 : 2.5) * 1024 ** 3;
  const needRam = (app.category === 'ai' ? 2 : app.category === 'database' ? 0.5 : 0.25) * 1024 ** 3;
  const diskCritical = disk ? disk.total - disk.used < 1.5 * 1024 ** 3 : false;

  const portConflicts = useMemo(
    () => app.params.filter((p) => p.type === 'port' && busyPorts.has(Number(values[p.key]))).map((p) => p.key),
    [app.params, values, busyPorts],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const started = await post<Job>(`/api/apps/${app.id}/install`, values);
      setStartedAt(Date.now());
      setJobId(started.id);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const layers = useMemo(() => parseDockerLayers(job?.log ?? ''), [job?.log]);
  const pullPct = layerPercent(layers);
  const running = job?.status === 'running' || (Boolean(jobId) && !job);
  const status = job?.status ?? 'running';
  const pulling = job?.stage?.startsWith('Tải image');
  const webPort = app.webPort ? Number(values[app.webPort] || app.installed?.params[app.webPort!]) : null;
  const secrets = app.params.filter((p) => p.type === 'password' && values[p.key]);

  // Đóng khi đang chạy = chạy nền; vẫn báo kết quả bằng toast
  const close = () => {
    if (jobId && running) trackJob(jobId, onDone);
    onClose();
  };

  const phase: 'form' | 'run' | 'done' | 'error' = !jobId ? (mode === 'update' && !formError ? 'run' : 'form') : job?.status === 'success' ? 'done' : job?.status === 'error' ? 'error' : 'run';

  const title = (
    <div className="flex items-center gap-3">
      <div className="scale-75 origin-left">{icon}</div>
      <div className="-ml-2 min-w-0">
        <div className="truncate text-base font-bold text-white">
          {mode === 'update' ? 'Cập nhật' : 'Cài đặt'} {app.name}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-slate-400">
          <Badge tone={app.appType === 'native' ? 'amber' : 'blue'}>{app.appType === 'native' ? 'Ứng dụng native' : 'Docker Compose'}</Badge>
          <span className="capitalize">{app.category}</span>
        </div>
      </div>
    </div>
  );

  return (
    <Modal open onClose={close} title={title} size="lg">
      {phase === 'form' && mode === 'install' && (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm leading-relaxed text-slate-300">{app.description}</p>

          {app.isCompatible === false && (
            <Notice tone="amber" icon={AlertTriangle}>
              Ứng dụng này cần {app.platform === 'windows' ? 'Windows' : 'Linux'}
              {app.requiresGui ? ' có giao diện Desktop' : ''}. Có thể không chạy được trên máy chủ hiện tại.
            </Notice>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {disk && <Meter icon={HardDrive} label={`Ổ đĩa ${disk.mount}`} used={disk.used} total={disk.total} need={needDisk} />}
            {latest && <Meter icon={MemoryStick} label="RAM" used={latest.memory.used} total={latest.memory.total} need={needRam} />}
          </div>
          {diskCritical && (
            <Notice tone="red" icon={AlertTriangle}>
              Ổ đĩa gần đầy, cài thêm có thể làm treo máy chủ.{' '}
              <Link to="/cleanup" onClick={onClose} className="font-semibold underline">
                Dọn dẹp trước →
              </Link>
            </Notice>
          )}

          {app.params.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-slate-700/50 bg-ink-950/40 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Thông số</div>
              {app.params.map((param) => {
                const isPort = param.type === 'port';
                const isPass = param.type === 'password';
                const conflict = portConflicts.includes(param.key);
                return (
                  <label key={param.key} className="block">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                      {isPort ? <Plug className="size-3.5 text-sky-400" /> : isPass ? <KeyRound className="size-3.5 text-amber-400" /> : <Cpu className="size-3.5 text-slate-500" />}
                      {param.label}
                      {param.optional && <span className="font-normal text-slate-500">(tuỳ chọn)</span>}
                    </span>
                    <div className="flex gap-2">
                      <input
                        className={cn('input mono flex-1', conflict && 'border-amber-500/70')}
                        type={isPort ? 'number' : isPass && !reveal[param.key] ? 'password' : 'text'}
                        value={values[param.key] ?? ''}
                        required={!param.generate && !param.optional}
                        onChange={(e) => setValues({ ...values, [param.key]: e.target.value })}
                      />
                      {isPass && (
                        <>
                          <button type="button" className="rounded-xl border border-slate-700/60 px-2.5 text-slate-400 hover:text-white" onClick={() => setReveal({ ...reveal, [param.key]: !reveal[param.key] })} data-tip={reveal[param.key] ? 'Ẩn' : 'Hiện'}>
                            {reveal[param.key] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                          <button type="button" className="rounded-xl border border-slate-700/60 px-2.5 text-slate-400 hover:text-white" onClick={() => setValues({ ...values, [param.key]: randomPassword() })} data-tip="Sinh mật khẩu mới">
                            <Dices className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                    <span className={cn('mt-1 block text-[11px]', conflict ? 'text-amber-300' : 'text-slate-500')}>
                      {conflict ? `Cổng ${values[param.key]} đang có chương trình khác dùng — hãy đổi sang cổng khác.` : (param.hint ?? (isPort ? 'Cổng trên máy chủ, không được trùng ứng dụng khác' : isPass ? 'Đã sinh sẵn mật khẩu mạnh, lưu lại sau khi cài' : ''))}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {app.usesAiKeys && (
            <Notice icon={Sparkles}>
              App dùng API key AI lưu trong{' '}
              <Link to="/ai" onClick={onClose} className="font-semibold underline">
                AI Gateway
              </Link>
              . Thêm key sau cũng được, rồi bấm "Cấu hình lại".
            </Notice>
          )}
          {formError && <Notice tone="red" icon={XCircle}>{formError}</Notice>}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" variant="primary" icon={Download} loading={submitting} disabled={diskCritical || portConflicts.length > 0}>
              Cài đặt ngay
            </Button>
          </div>
        </form>
      )}

      {phase === 'form' && mode === 'update' && formError && <Notice tone="red" icon={XCircle}>{formError}</Notice>}

      {phase === 'run' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-950/40 via-ink-950 to-indigo-950/30 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">{mode === 'update' ? 'Đang cập nhật' : 'Đang cài đặt'}</div>
                <div className="mt-1 truncate text-lg font-bold text-white">{job?.stage ?? 'Đang khởi tạo...'}</div>
              </div>
              <div className="text-right">
                <div className="mono text-2xl font-black text-white">{pulling && pullPct !== null ? `${pullPct}%` : formatDuration(elapsed || Math.floor((Date.now() - startedAt) / 1000))}</div>
                <div className="text-[11px] text-slate-500">{pulling && pullPct !== null ? 'layer đã tải' : 'đã chạy'}</div>
              </div>
            </div>
            <ProgressTrack className="mt-4" percent={pulling ? pullPct : null} status={status} />
            {pulling && layers.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Layers className="size-3.5" /> {layers.filter((l) => l.status === 'done').length}/{layers.length} layer image
                </div>
                <div className="flex flex-wrap gap-1">
                  {layers.map((l) => (
                    <span
                      key={l.id}
                      data-tip={`${l.id} · ${l.status}`}
                      className={cn(
                        'h-2.5 w-5 rounded-sm',
                        l.status === 'done' ? 'bg-emerald-500' : l.status === 'extracting' ? 'bg-indigo-400' : l.status === 'downloading' ? 'animate-pulse bg-sky-500' : 'bg-slate-700',
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <StepList steps={job?.steps ?? []} now={Date.now()} planned={PLANNED[mode]} />
          <LogConsole log={job?.log ?? ''} fileName={`${app.id}-${mode}.log`} />
          <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-500">
            <span>Có thể đóng cửa sổ, tác vụ vẫn chạy nền và báo khi xong.</span>
            <Button variant="ghost" onClick={close}>
              Chạy nền
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-5">
            <CheckCircle2 className="size-10 shrink-0 text-emerald-400" />
            <div>
              <div className="text-lg font-bold text-white">
                {app.name} đã {mode === 'update' ? 'được cập nhật' : 'sẵn sàng'}
              </div>
              <div className="text-sm text-slate-400">Hoàn tất trong {formatDuration(elapsed)}.</div>
            </div>
          </div>
          {mode === 'install' && webPort ? (
            <div className="space-y-2 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Địa chỉ truy cập</div>
              {[`http://${host}:${webPort}`, `http://127.0.0.1:${webPort}`].map((url) => (
                <div key={url} className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
                  <code className="mono flex-1 truncate text-sm text-emerald-300">{url}</code>
                  <CopyButton value={url} />
                  <a href={url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white" data-tip="Mở">
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Truy cập bằng IP cần mở cổng {webPort} trên tường lửa. Hoặc dùng link public Cloudflare trong "Truy cập".</p>
            </div>
          ) : null}
          {mode === 'install' && secrets.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300/80">Lưu lại thông tin đăng nhập</div>
              {secrets.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 truncate text-slate-400">{p.label}</span>
                  <code className="mono flex-1 truncate text-slate-100">{values[p.key]}</code>
                  <CopyButton value={values[p.key]} />
                </div>
              ))}
            </div>
          )}
          <LogConsole log={job?.log ?? ''} fileName={`${app.id}-${mode}.log`} />
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
            <Button variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            {onOpenAccess && app.webPort && (
              <Button variant="primary" icon={ExternalLink} onClick={onOpenAccess}>
                Truy cập & link public
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-5">
            <div className="flex items-center gap-3">
              <XCircle className="size-8 shrink-0 text-rose-400" />
              <div className="min-w-0">
                <div className="text-base font-bold text-white">{mode === 'update' ? 'Cập nhật' : 'Cài đặt'} thất bại</div>
                <div className="text-sm text-rose-200/90">{job?.error}</div>
              </div>
            </div>
            {errorLines(job?.log ?? '').length > 0 && (
              <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-rose-200">{errorLines(job?.log ?? '').join('\n')}</pre>
            )}
          </div>
          <StepList steps={job?.steps ?? []} now={Date.now()} />
          <LogConsole log={job?.log ?? ''} defaultOpen fileName={`${app.id}-${mode}.log`} />
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
            <Button variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            {mode === 'install' ? (
              <Button variant="primary" icon={RotateCw} onClick={() => setJobId(null)}>
                Sửa thông số & thử lại
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={RefreshCw}
                onClick={() => {
                  setJobId(null);
                  void post<Job>(`/api/apps/${app.id}/update`).then((j) => setJobId(j.id));
                }}
              >
                Thử lại
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
