// ZenPanel - Tác vụ nền có log realtime (cài ứng dụng, pull image, cài web server, cập nhật panel...)
// Mọi lệnh chạy qua exec() bên trong 1 job sẽ tự động ghi stdout/stderr vào log của job đó.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const MAX_LOG = 512 * 1024;
const MAX_JOBS = 40;

export type JobStatus = 'running' | 'success' | 'error';

export interface JobView {
  id: string;
  title: string;
  kind: string;
  status: JobStatus;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
  log: string;
  progress?: number;
  stage?: string;
  etaSeconds?: number | null;
}

class Job {
  readonly id = randomUUID();
  readonly startedAt = new Date().toISOString();
  status: JobStatus = 'running';
  endedAt: string | null = null;
  error: string | null = null;
  progress: number | null = null;
  stage: string | null = null;
  etaSeconds: number | null = null;
  private log = '';

  constructor(
    readonly title: string,
    readonly kind: string,
  ) {}

  append(text: string): void {
    // Bỏ mã màu ANSI và ký tự xoá dòng của docker/npm để log dễ đọc trên web
    const clean = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n');
    this.log += clean;
    if (this.log.length > MAX_LOG) this.log = `[...đã cắt bớt log cũ...]\n${this.log.slice(-MAX_LOG)}`;
  }

  setProgress(percent: number, stage?: string, etaSeconds?: number | null): void {
    this.progress = Math.min(100, Math.max(0, Math.round(percent)));
    if (stage !== undefined) this.stage = stage;
    if (etaSeconds !== undefined) this.etaSeconds = etaSeconds;
  }

  view(withLog: boolean): JobView {
    return {
      id: this.id,
      title: this.title,
      kind: this.kind,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      error: this.error,
      progress: this.progress !== null ? this.progress : undefined,
      stage: this.stage !== null ? this.stage : undefined,
      etaSeconds: this.etaSeconds,
      log: withLog ? this.log : '',
    };
  }
}

const storage = new AsyncLocalStorage<Job>();
const jobs: Job[] = [];

/** Cập nhật tiến độ %, giai đoạn hiện tại và ETA dự tính của job */
export function jobProgress(percent: number, stage?: string, etaSeconds?: number | null): void {
  storage.getStore()?.setProgress(percent, stage, etaSeconds);
}

/** Ghi 1 dòng vào log của job hiện tại (nếu đang chạy trong job) */
export function jobLog(line: string): void {
  storage.getStore()?.append(`${line}\n`);
}

/** Ghi output thô (dùng bởi exec) */
export function jobOutput(chunk: string): void {
  storage.getStore()?.append(chunk);
}

export function inJob(): boolean {
  return storage.getStore() !== undefined;
}

/** Chạy fn trong 1 job nền, trả về ngay job id. onDone chạy sau khi thành công. */
export function startJob(title: string, kind: string, fn: () => Promise<void>): JobView {
  const job = new Job(title, kind);
  jobs.unshift(job);
  if (jobs.length > MAX_JOBS) jobs.length = MAX_JOBS;
  void storage.run(job, async () => {
    job.append(`▶ ${title}\n`);
    try {
      await fn();
      job.status = 'success';
      job.progress = 100;
      job.stage = 'Hoàn tất thành công';
      job.etaSeconds = 0;
      job.append('\n✔ Hoàn tất\n');
    } catch (err) {
      job.status = 'error';
      job.error = (err as Error).message;
      job.stage = `Thất bại: ${job.error}`;
      job.append(`\n✘ Lỗi: ${job.error}\n`);
    } finally {
      job.endedAt = new Date().toISOString();
    }
  });
  return job.view(false);
}

export function listJobs(): JobView[] {
  return jobs.map((job) => job.view(false));
}

export function getJob(id: string): JobView | null {
  return jobs.find((job) => job.id === id)?.view(true) ?? null;
}
