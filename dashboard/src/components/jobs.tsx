import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Copy, ListTodo, Loader2, Sparkles, Terminal, Trash2, XCircle } from 'lucide-react';
import { del, get } from '../lib/api';
import { formatDate, formatDuration, formatRelative } from '../lib/format';
import type { Job } from '../lib/types';
import { useFeedback } from './feedback';
import { Badge, Button, EmptyState, Modal, cn } from './ui';
import { txaformat } from '../lib/txaformat';

/** Phân tích log Docker Compose Pull để tính tỷ lệ % layers hoàn tất */
function parseDockerProgress(log: string): { percent: number; stage: string } | null {
  if (!log || (!log.includes('Pulling') && !log.includes('Downloaded') && !log.includes('Extracting'))) return null;

  const layerStatus = new Map<string, string>();
  const lines = log.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Bắt dòng dạng: 28c972c1431b Downloading 2.097MB hoặc 0fa0803f038c Pull complete 0B
    const m = trimmed.match(/^([a-f0-9]{12})\s+(Pulling fs layer|Already exists|Download complete|Pull complete|Downloading|Extracting)/i);
    if (m) {
      layerStatus.set(m[1].toLowerCase(), m[2].toLowerCase());
    }
  }

  const total = layerStatus.size;
  if (total === 0) return null;

  let completed = 0;
  for (const status of layerStatus.values()) {
    if (status === 'pull complete' || status === 'already exists') {
      completed += 1;
    } else if (status === 'download complete' || status === 'extracting') {
      completed += 0.7;
    } else if (status === 'downloading') {
      completed += 0.35;
    } else {
      completed += 0.1;
    }
  }

  // Tải layers chiếm từ 15% -> 88% của cả job
  const ratio = Math.min(1, Math.max(0, completed / total));
  const percent = Math.round(15 + ratio * 72);
  const doneCount = Math.floor(completed);
  const stage = `Đang tải Docker images (${doneCount}/${total} layers - ${txaformat.percent(percent, 0)})...`;
  return { percent, stage };
}

interface JobsContextValue {
  /** Gọi API trả về job, mở cửa sổ log và resolve khi job kết thúc (true = thành công) */
  runJob: (start: () => Promise<Job>, onDone?: (job: Job) => void) => Promise<boolean>;
  openJob: (id: string) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

const statusIcon = {
  running: <Loader2 className="size-4 animate-spin text-zen-blue" />,
  success: <CheckCircle2 className="size-4 text-zen-green" />,
  error: <XCircle className="size-4 text-zen-red" />,
};

const statusBadge = {
  running: <Badge tone="blue">Đang thực hiện</Badge>,
  success: <Badge tone="green">Hoàn thành</Badge>,
  error: <Badge tone="red">Thất bại</Badge>,
};

function JobLog({ id, onClose }: { id: string; onClose: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const next = await get<Job>(`/api/jobs/${id}`);
        if (stop) return;
        setJob(next);
        if (next.status === 'running') setTimeout(() => void tick(), 1000);
      } catch {
        if (!stop) setTimeout(() => void tick(), 2000);
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [id]);

  // Bộ đếm thời gian realtime khi job đang chạy để hiển thị ETA mượt mà
  useEffect(() => {
    if (job?.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job?.status]);

  useEffect(() => {
    if (box.current && stick.current) box.current.scrollTop = box.current.scrollHeight;
  }, [job?.log, expanded]);

  // Tính toán thời lượng & ETA
  const startedTime = job ? new Date(job.startedAt).getTime() : now;
  const endedTime = job?.endedAt ? new Date(job.endedAt).getTime() : now;
  const elapsedSec = Math.max(0, Math.floor(((job?.status === 'running' ? now : endedTime) - startedTime) / 1000));

  // Ước lượng thời gian hoàn thành theo loại tác vụ
  const expectedSec =
    job?.kind === 'clean' ? 12 : job?.kind === 'docker' || job?.kind === 'image' ? 25 : job?.kind === 'php' || job?.kind === 'webserver' ? 35 : job?.kind === 'app' ? 45 : 30;

  // Phân tích tiến độ Docker layer từ log realtime
  const dockerProgress = useMemo(() => parseDockerProgress(job?.log || ''), [job?.log]);

  // Tính phần trăm tiến độ
  let percent = 0;
  if (job?.status === 'success') {
    percent = 100;
  } else if (job?.status === 'error') {
    percent = Math.min(90, Math.max(15, Math.round((elapsedSec / expectedSec) * 100)));
  } else {
    // Đang chạy: kết hợp backend progress, docker layer progress, và simulated progress
    const simulated = Math.min(92, Math.max(10, Math.round((1 - Math.exp(-elapsedSec / (expectedSec * 0.45))) * 100)));
    const backendProgress = job?.progress !== null && job?.progress !== undefined ? job.progress : 0;
    const dockerPct = dockerProgress?.percent ?? 0;
    percent = Math.min(95, Math.max(backendProgress, dockerPct, simulated));
  }

  // Tính ETA
  const etaSec =
    job?.etaSeconds !== undefined && job.etaSeconds !== null
      ? job.etaSeconds
      : job?.status === 'running'
        ? Math.max(0, expectedSec - elapsedSec)
        : 0;

  // Giai đoạn hiện tại: ưu tiên dockerProgress -> backend stage -> stage suy luận
  const currentStage =
    (job?.status === 'success'
      ? 'Tác vụ đã hoàn tất thành công'
      : job?.status === 'error'
        ? `Lỗi: ${job.error || 'Đã xảy ra sự cố'}`
        : dockerProgress?.stage ||
          job?.stage ||
          (percent < 30
            ? 'Đang chuẩn bị môi trường và kiểm tra tài nguyên...'
            : percent < 65
              ? 'Đang tải xuống các gói cài đặt và tài nguyên...'
              : percent < 90
                ? 'Đang giải nén, tối ưu cấu hình và thiết lập dịch vụ...'
                : 'Đang kiểm tra kết nối và khởi động hoàn tất...'));

  // 4 cột mốc trực quan
  const milestones = [
    { label: 'Khởi tạo', threshold: 10 },
    { label: 'Tải tài nguyên', threshold: 40 },
    { label: 'Cấu hình', threshold: 75 },
    { label: 'Sẵn sàng', threshold: 100 },
  ];

  const copyLog = async () => {
    if (!job?.log) return;
    try {
      await navigator.clipboard.writeText(job.log);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <div className="flex flex-wrap items-center justify-between gap-2 pr-2">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex size-7 items-center justify-center rounded-lg ring-1",
              job?.status === 'running' ? "bg-zen-blue/20 text-zen-blue ring-zen-blue/30" :
              job?.status === 'success' ? "bg-zen-green/20 text-zen-green ring-zen-green/30" :
              "bg-zen-red/20 text-zen-red ring-zen-red/30"
            )}>
              {job?.status === 'running' && <Loader2 className="size-4 animate-spin" />}
              {job?.status === 'success' && <CheckCircle2 className="size-4" />}
              {job?.status === 'error' && <XCircle className="size-4" />}
            </div>
            <div>
              <div className="text-sm font-bold text-white">{job?.title ?? 'Đang tải tác vụ...'}</div>
              <div className="text-[11px] text-slate-400">
                Mã tác vụ: <code className="mono text-slate-300">{id.slice(0, 8)}</code>
              </div>
            </div>
          </div>
          {job?.status && statusBadge[job.status]}
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-slate-500">
            Bắt đầu {formatDate(job?.startedAt)}
            {job?.endedAt && ` · Xong ${formatDate(job.endedAt)}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant={job?.status === 'running' ? 'ghost' : 'primary'} onClick={onClose}>
              {job?.status === 'running' ? 'Chạy nền' : 'Đóng'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Khối Hero: Thanh tiến trình & ETA trực quan */}
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-[#111624] to-[#0b0e17] p-4 shadow-lg shadow-black/30">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              {job?.status === 'running' && <Sparkles className="size-3.5 text-cyan-400 animate-pulse" />}
              <span>{currentStage}</span>
            </span>
            <span className={cn(
              "mono text-sm font-black tracking-tight",
              job?.status === 'success' ? "text-zen-green" : job?.status === 'error' ? "text-zen-red" : "text-cyan-400"
            )}>
              {percent}%
            </span>
          </div>

          {/* Thanh phần trăm tiến độ */}
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                job?.status === 'error'
                  ? "bg-gradient-to-r from-red-600 to-rose-400"
                  : job?.status === 'success'
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400"
              )}
              style={{ width: `${percent}%` }}
            />
            {job?.status === 'running' && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            )}
          </div>

          {/* Dòng trạng thái Thời gian & ETA */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3 text-slate-500" />
              <span>Đã chạy: <b className="text-slate-200">{formatDuration(elapsedSec)}</b></span>
            </div>
            <div>
              {job?.status === 'running' ? (
                <span>
                  {etaSec > 0 ? (
                    <>Dự kiến còn: <b className="text-cyan-300">~{formatDuration(etaSec)}</b></>
                  ) : (
                    <span className="text-amber-300 font-medium">Đang hoàn tất bước cuối...</span>
                  )}
                </span>
              ) : job?.status === 'success' ? (
                <span className="text-emerald-400 font-medium">✔ Hoàn tất trong {formatDuration(elapsedSec)}</span>
              ) : (
                <span className="text-rose-400 font-medium">✘ Dừng sau {formatDuration(elapsedSec)}</span>
              )}
            </div>
          </div>

          {/* 4 Cột mốc trực quan */}
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-slate-800/60 pt-3">
            {milestones.map((m, idx) => {
              const isDone = percent >= m.threshold;
              const isCurrent = !isDone && (idx === 0 || percent >= milestones[idx - 1].threshold);
              return (
                <div key={m.label} className="text-center">
                  <div className="flex items-center justify-center">
                    <div className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition",
                      isDone
                        ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                        : isCurrent
                        ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400 animate-pulse"
                        : "bg-slate-800 text-slate-500 ring-1 ring-white/5"
                    )}>
                      {isDone ? '✓' : idx + 1}
                    </div>
                  </div>
                  <div className={cn(
                    "mt-1 truncate text-[10px]",
                    isDone ? "text-slate-300 font-medium" : isCurrent ? "text-cyan-300 font-bold" : "text-slate-500"
                  )}>
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Khung nhỏ bên dưới hiển thị log terminal */}
        <div className="rounded-xl border border-slate-800/80 bg-[#070a12] shadow-inner">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2 bg-[#0c101c]/80 rounded-t-xl">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">Nhật ký thực thi (Live Terminal Logs)</span>
              <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                {(job?.log || '').split('\n').filter(Boolean).length} dòng
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={copyLog}
                disabled={!job?.log}
                title="Sao chép toàn bộ log"
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-40"
              >
                {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
              </button>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                <span>{expanded ? 'Thu nhỏ' : 'Mở rộng'}</span>
              </button>
            </div>
          </div>

          <pre
            ref={box}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className={cn(
              "mono overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed text-slate-300 transition-all duration-200 select-text",
              expanded ? "h-64 sm:h-80" : "h-28 sm:h-32"
            )}
          >
            {job?.log || 'Đang chờ luồng dữ liệu...'}
          </pre>
        </div>

        {job?.status === 'error' && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-start gap-2">
            <XCircle className="size-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-rose-200">Tác vụ thất bại</div>
              <div className="mt-0.5 opacity-90">{job.error || 'Vui lòng kiểm tra log chi tiết ở trên.'}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { toast } = useFeedback();

  const runJob = useCallback(
    async (start: () => Promise<Job>, onDone?: (job: Job) => void) => {
      let job: Job;
      try {
        job = await start();
      } catch (err) {
        toast((err as Error).message, 'error');
        return false;
      }
      setOpenId(job.id);
      // Theo dõi tới khi xong để báo kết quả kể cả khi người dùng đã đóng cửa sổ log
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const current = await get<Job>(`/api/jobs/${job.id}`).catch(() => null);
        if (!current || current.status === 'running') continue;
        toast(current.status === 'success' ? `${current.title}: hoàn tất` : `${current.title}: ${current.error}`, current.status === 'success' ? 'success' : 'error');
        onDone?.(current);
        return current.status === 'success';
      }
    },
    [toast],
  );

  return (
    <JobsContext.Provider value={{ runJob, openJob: setOpenId }}>
      {children}
      {openId && <JobLog id={openId} onClose={() => setOpenId(null)} />}
    </JobsContext.Provider>
  );
}

export function useJobs(): JobsContextValue {
  const value = useContext(JobsContext);
  if (!value) throw new Error('useJobs phải nằm trong JobsProvider');
  return value;
}

/** Nút trên header: danh sách tác vụ gần đây, nhấp để xem log */
export function JobsButton() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const { openJob } = useJobs();
  const { toast, confirm } = useFeedback();
  const running = jobs.filter((j) => j.status === 'running').length;
  const finishedCount = jobs.filter((j) => j.status !== 'running').length;

  const reloadJobs = useCallback(() => {
    get<Job[]>('/api/jobs').then(setJobs).catch(() => undefined);
  }, []);

  useEffect(() => {
    reloadJobs();
    const timer = setInterval(reloadJobs, running ? 2000 : 10000);
    return () => clearInterval(timer);
  }, [reloadJobs, running]);

  const clearFinished = async () => {
    if (finishedCount === 0) return;
    const ok = await confirm({
      title: 'Xóa tác vụ đã hoàn tất',
      message: `Bạn có muốn xóa ${finishedCount} tác vụ nền đã hoàn tất khỏi danh sách?`,
      confirmLabel: 'Xóa tác vụ',
      danger: false,
    });
    if (!ok) return;
    try {
      const next = await del<Job[]>('/api/jobs');
      setJobs(next);
      toast(`Đã xóa ${finishedCount} tác vụ nền đã hoàn tất`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const deleteSingleJob = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    try {
      await del(`/api/jobs/${id}`);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      toast(`Đã xóa tác vụ "${title}"`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tip="Tác vụ nền & log cài đặt"
        aria-label="Tác vụ nền"
        className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
      >
        {running ? <Loader2 className="size-5 animate-spin text-zen-blue" /> : <ListTodo className="size-5" />}
        {running > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-zen-blue text-[10px] font-bold text-white">{running}</span>}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-zen-blue" />
            <span>Tác vụ nền & Log</span>
            {running > 0 && (
              <span className="rounded-full bg-zen-blue/20 px-2 py-0.5 text-xs font-semibold text-blue-300">
                {running} đang chạy
              </span>
            )}
          </div>
        }
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{jobs.length} tác vụ ({finishedCount} đã hoàn tất)</span>
              {finishedCount > 0 && (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={Trash2}
                  onClick={clearFinished}
                  className="text-slate-400 hover:text-red-400"
                >
                  Xóa các tác vụ đã hoàn thành
                </Button>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </div>
        }
      >
        {jobs.length === 0 ? (
          <EmptyState icon={ListTodo} title="Chưa có tác vụ nào" description="Log cài ứng dụng, pull image, cài web server, cập nhật panel sẽ hiện ở đây." />
        ) : (
          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
            {finishedCount > 0 && (
              <div className="flex justify-end pb-1">
                <button
                  type="button"
                  onClick={clearFinished}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition font-medium px-2 py-1 rounded-lg hover:bg-red-950/20"
                >
                  <Trash2 className="size-3.5" />
                  <span>Xóa {finishedCount} tác vụ đã hoàn thành</span>
                </button>
              </div>
            )}
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => {
                  setOpen(false);
                  openJob(job.id);
                }}
                className={cn(
                  'group flex w-full items-start sm:items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/60 p-3 sm:px-4 sm:py-3 text-left transition hover:border-zen-blue/60 hover:bg-ink-900/90 cursor-pointer',
                )}
              >
                <div className="mt-0.5 sm:mt-0 shrink-0">{statusIcon[job.status]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-semibold text-slate-100 group-hover:text-blue-300 transition">
                      {job.title}
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      · {formatRelative(job.startedAt)}
                    </span>
                  </div>
                  {job.error ? (
                    <span className="mt-1 block line-clamp-2 text-xs font-mono text-red-400">
                      {job.error}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Bấm để xem log chi tiết
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  <Badge tone={job.status === 'success' ? 'green' : job.status === 'error' ? 'red' : 'blue'}>
                    {job.status === 'success' ? 'Xong' : job.status === 'error' ? 'Lỗi' : 'Đang chạy'}
                  </Badge>
                  {job.status !== 'running' && (
                    <button
                      type="button"
                      title="Xóa tác vụ này"
                      onClick={(e) => deleteSingleJob(e, job.id, job.title)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition opacity-60 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
