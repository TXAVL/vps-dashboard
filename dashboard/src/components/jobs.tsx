// ZenPanel - Trung tâm tác vụ nền: xem log realtime khi cài ứng dụng, pull image, cài web server, cập nhật panel...
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ListTodo, Loader2, XCircle } from 'lucide-react';
import { get } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';
import type { Job } from '../lib/types';
import { useFeedback } from './feedback';
import { Badge, Button, EmptyState, Modal, cn } from './ui';

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

function JobLog({ id, onClose }: { id: string; onClose: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
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

  useEffect(() => {
    // Tự cuộn xuống cuối khi có log mới (trừ khi người dùng đang cuộn lên đọc)
    if (box.current && stick.current) box.current.scrollTop = box.current.scrollHeight;
  }, [job?.log]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          {job && statusIcon[job.status]}
          {job?.title ?? 'Đang tải...'}
        </span>
      }
      footer={
        <>
          {job && (
            <span className="mr-auto text-xs text-slate-500">
              Bắt đầu {formatDate(job.startedAt)}
              {job.endedAt && ` · kết thúc ${formatDate(job.endedAt)}`}
            </span>
          )}
          <Button variant={job?.status === 'running' ? 'ghost' : 'primary'} onClick={onClose}>
            {job?.status === 'running' ? 'Chạy nền' : 'Đóng'}
          </Button>
        </>
      }
    >
      <pre
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="mono h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#0a0e17] p-4 text-xs leading-relaxed text-slate-300"
      >
        {job?.log || 'Đang chờ log...'}
      </pre>
      {job?.status === 'error' && <p className="mt-3 text-sm text-red-300">✘ {job.error}</p>}
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
  const running = jobs.filter((j) => j.status === 'running').length;

  useEffect(() => {
    const load = () => get<Job[]>('/api/jobs').then(setJobs).catch(() => undefined);
    void load();
    const timer = setInterval(load, running ? 2000 : 10000);
    return () => clearInterval(timer);
  }, [running]);

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
      <Modal open={open} onClose={() => setOpen(false)} title="Tác vụ nền" size="lg">
        {jobs.length === 0 ? (
          <EmptyState icon={ListTodo} title="Chưa có tác vụ nào" description="Log cài ứng dụng, pull image, cài web server, cập nhật panel sẽ hiện ở đây." />
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => {
                  setOpen(false);
                  openJob(job.id);
                }}
                className={cn('flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-left transition hover:border-zen-blue/50')}
              >
                {statusIcon[job.status]}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{job.title}</span>
                  <span className="block truncate text-xs text-slate-500">{job.error ?? formatRelative(job.startedAt)}</span>
                </span>
                <Badge tone={job.status === 'success' ? 'green' : job.status === 'error' ? 'red' : 'blue'}>
                  {job.status === 'success' ? 'Xong' : job.status === 'error' ? 'Lỗi' : 'Đang chạy'}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
