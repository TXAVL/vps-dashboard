// ZenPanel - Mảnh ghép dùng cho các modal chuyên biệt (cài app, cập nhật panel, nâng cấp công cụ):
// theo dõi job, danh sách bước thật, bảng điều khiển log thu gọn, tiến độ tải layer Docker
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Download, Loader2, Terminal, X } from 'lucide-react';
import { get } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import type { Job, JobStep } from '../../lib/types';
import { cn } from '../ui';

/** Poll 1 job tới khi kết thúc; trả về job mới nhất và số giây đã chạy (tăng mỗi giây) */
export function useJobWatch(id: string | null, onFinish?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(Date.now());
  const finished = useRef(onFinish);
  finished.current = onFinish;

  useEffect(() => {
    setJob(null);
    if (!id) return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await get<Job>(`/api/jobs/${id}`);
        if (stop) return;
        setJob(next);
        if (next.status === 'running') setTimeout(() => void tick(), 900);
        else finished.current?.(next);
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
    if (job?.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job?.status]);

  const start = job ? new Date(job.startedAt).getTime() : now;
  const end = job?.endedAt ? new Date(job.endedAt).getTime() : now;
  const elapsed = Math.max(0, Math.floor(((job?.status === 'running' ? now : end) - start) / 1000));
  return { job, elapsed };
}

export interface DockerLayer {
  id: string;
  status: 'waiting' | 'downloading' | 'extracting' | 'done';
}

/** Đọc trạng thái từng layer từ log "docker compose pull" */
export function parseDockerLayers(log: string): DockerLayer[] {
  const map = new Map<string, DockerLayer['status']>();
  for (const line of log.split('\n')) {
    const m = /([a-f0-9]{12})\s+(Pulling fs layer|Waiting|Already exists|Downloading|Verifying Checksum|Download complete|Extracting|Pull complete)/i.exec(line);
    if (!m) continue;
    const word = m[2].toLowerCase();
    map.set(
      m[1],
      word === 'pull complete' || word === 'already exists'
        ? 'done'
        : word === 'extracting' || word === 'download complete' || word === 'verifying checksum'
          ? 'extracting'
          : word === 'downloading'
            ? 'downloading'
            : 'waiting',
    );
  }
  return [...map].map(([id, status]) => ({ id, status }));
}

export function layerPercent(layers: DockerLayer[]): number | null {
  if (!layers.length) return null;
  const weight = { waiting: 0.05, downloading: 0.4, extracting: 0.8, done: 1 };
  return Math.round((layers.reduce((n, l) => n + weight[l.status], 0) / layers.length) * 100);
}

/** Vài dòng log trông giống lỗi, để hiện ngay trong thẻ báo lỗi */
export function errorLines(log: string, max = 4): string[] {
  return log
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && /(error|lỗi|failed|denied|cannot|không thể|✘|refused|no space|timeout)/i.test(l))
    .slice(-max);
}

const lineTone = (line: string) =>
  /(✘|error|lỗi|failed|denied|fatal)/i.test(line)
    ? 'text-rose-300'
    : /(warn|cảnh báo|⚠)/i.test(line)
      ? 'text-amber-300'
      : /(✔|✓|hoàn tất|success|done|complete)/i.test(line)
        ? 'text-emerald-300'
        : /^(\$|▶|➜|==>)/.test(line.trim())
          ? 'text-sky-300'
          : 'text-slate-400';

/** Danh sách bước dọc với thời lượng từng bước */
export function StepList({ steps, now, planned = [] }: { steps: JobStep[]; now: number; planned?: string[] }) {
  // Bước dự kiến chưa tới hiển thị mờ để người dùng biết còn gì phía sau
  const pending = planned.filter((p) => !steps.some((s) => s.label === p));
  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => {
        const startedAt = new Date(step.startedAt).getTime();
        const endedAt = step.endedAt ? new Date(step.endedAt).getTime() : now;
        const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
        return (
          <li key={`${step.label}-${i}`} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full ring-1',
                step.status === 'done' && 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
                step.status === 'running' && 'bg-sky-500/15 text-sky-300 ring-sky-400/60',
                step.status === 'error' && 'bg-rose-500/15 text-rose-300 ring-rose-500/50',
              )}
            >
              {step.status === 'done' ? <Check className="size-3.5" /> : step.status === 'error' ? <X className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
            </span>
            <span className={cn('min-w-0 flex-1 truncate', step.status === 'running' ? 'font-semibold text-white' : step.status === 'error' ? 'text-rose-200' : 'text-slate-300')}>{step.label}</span>
            <span className="mono shrink-0 text-[11px] text-slate-500">{formatDuration(seconds)}</span>
          </li>
        );
      })}
      {pending.map((label) => (
        <li key={label} className="flex items-center gap-3 text-sm text-slate-600">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-slate-700/60">
            <span className="size-1.5 rounded-full bg-slate-600" />
          </span>
          <span className="truncate">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Log thu gọn: mặc định chỉ hiện dòng cuối, bấm để mở toàn bộ (tô màu theo loại dòng) */
export function LogConsole({ log, defaultOpen = false, fileName = 'zenpanel.log' }: { log: string; defaultOpen?: boolean; fileName?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lines = useMemo(() => log.split('\n').filter((l) => l.trim()), [log]);
  const last = lines.at(-1) ?? 'Đang chờ dữ liệu...';

  useEffect(() => {
    if (open && box.current && stick.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log, open]);

  const copy = async () => {
    await navigator.clipboard.writeText(log).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([log], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#070a12]">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Terminal className="size-3.5 shrink-0 text-slate-500" />
          {open ? (
            <span className="text-xs font-semibold text-slate-300">Nhật ký chi tiết · {lines.length} dòng</span>
          ) : (
            <span className={cn('mono truncate text-[11px]', lineTone(last))}>{last}</span>
          )}
          <ChevronDown className={cn('size-3.5 shrink-0 text-slate-500 transition', open && 'rotate-180')} />
        </button>
        <button type="button" onClick={() => void copy()} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Sao chép log">
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        </button>
        <button type="button" onClick={save} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Tải file log">
          <Download className="size-3.5" />
        </button>
      </div>
      {open && (
        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="mono max-h-64 overflow-auto border-t border-slate-800 px-3 py-2 text-[11px] leading-relaxed"
        >
          {lines.map((line, i) => (
            <div key={i} className={cn('whitespace-pre-wrap break-words', lineTone(line))}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Thanh tiến độ: có % thật thì vẽ theo %, không có thì chạy dải sáng (không bịa số) */
export function ProgressTrack({ percent, status, className }: { percent: number | null; status: 'running' | 'success' | 'error'; className?: string }) {
  const indeterminate = status === 'running' && percent === null;
  return (
    <div className={cn('relative h-2 overflow-hidden rounded-full bg-slate-800/90', className)}>
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-[zp-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-sky-400 to-transparent" />
      ) : (
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            status === 'error' ? 'bg-rose-500' : status === 'success' ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-indigo-400',
          )}
          style={{ width: `${status === 'success' ? 100 : Math.max(3, percent ?? 0)}%` }}
        />
      )}
    </div>
  );
}
