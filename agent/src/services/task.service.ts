// ZenPanel - Tác vụ định kỳ (cron trên Linux, Task Scheduler trên Windows). Dữ liệu gốc lưu trong tasks.json
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter, ScheduledTask, TaskSchedule } from '../adapters/base.adapter.js';
import { jobLog, startJob, type JobView } from '../core/jobs.js';
import { dataPath, JsonCollection } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';

const tasks = new JsonCollection<ScheduledTask>('tasks.json');
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateSchedule(input: unknown): TaskSchedule {
  const s = (input ?? {}) as Record<string, unknown>;
  switch (s.type) {
    case 'minutes': {
      const every = Number(s.every);
      if (!Number.isInteger(every) || every < 1 || every > 59) throw badRequest('Chu kỳ phút phải từ 1 đến 59');
      return { type: 'minutes', every };
    }
    case 'hourly': {
      const minute = Number(s.minute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw badRequest('Phút phải từ 0 đến 59');
      return { type: 'hourly', minute };
    }
    case 'daily':
      if (typeof s.time !== 'string' || !TIME.test(s.time)) throw badRequest('Giờ chạy phải có dạng HH:MM');
      return { type: 'daily', time: s.time };
    case 'weekly': {
      const day = Number(s.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) throw badRequest('Ngày trong tuần không hợp lệ');
      if (typeof s.time !== 'string' || !TIME.test(s.time)) throw badRequest('Giờ chạy phải có dạng HH:MM');
      return { type: 'weekly', day, time: s.time };
    }
    case 'startup':
      return { type: 'startup' };
    default:
      throw badRequest('Kiểu lịch chạy không hợp lệ');
  }
}

function isTaskDue(task: ScheduledTask, now: Date): boolean {
  if (!task.enabled) return false;

  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0: Chủ nhật, 1: Thứ 2, ... 6: Thứ 7
  const currentHM = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

  // Kiểm tra lần chạy gần nhất: nếu vừa chạy trong vòng 50 giây qua thì không chạy lại trong cùng phút
  if (task.lastRunAt) {
    const lastRunTime = new Date(task.lastRunAt).getTime();
    if (now.getTime() - lastRunTime < 50_000) {
      return false;
    }
  }

  const s = task.schedule;
  switch (s.type) {
    case 'minutes':
      return currentMinute % s.every === 0;
    case 'hourly':
      return currentMinute === s.minute;
    case 'daily':
      return currentHM === s.time;
    case 'weekly':
      return currentDay === s.day && currentHM === s.time;
    case 'startup':
      return false;
    default:
      return false;
  }
}

export class TaskService {
  private readonly runningTasks = new Set<string>();
  private schedulerTimer: NodeJS.Timeout | null = null;

  constructor(private readonly adapter: OSAdapter) {}

  /** Khởi động tiến trình kiểm tra & chạy tác vụ nền liên tục */
  startScheduler(): void {
    if (this.schedulerTimer) return;

    // Chạy tác vụ startup sau 5s khởi động panel
    setTimeout(() => {
      const startups = tasks.all().filter((t) => t.enabled && t.schedule.type === 'startup');
      for (const t of startups) {
        void this.executeTask(t, 'KHỞI ĐỘNG HỆ THỐNG');
      }
    }, 5000);

    // Đồng bộ crontab/Task Scheduler trên hệ điều hành khi agent bật
    void this.sync().catch(() => null);

    // Vòng lặp kiểm tra mỗi 20 giây để không bao giờ bị lỡ mốc phút
    this.schedulerTimer = setInterval(() => {
      const now = new Date();
      const allTasks = tasks.all();
      for (const t of allTasks) {
        if (isTaskDue(t, now)) {
          void this.executeTask(t, 'LỊCH TỰ ĐỘNG');
        }
      }
    }, 20_000);
  }

  stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  list(): ScheduledTask[] {
    return tasks.all().sort((a, b) => a.name.localeCompare(b.name));
  }

  private get(id: string): ScheduledTask {
    const task = tasks.get(id);
    if (!task) throw new HttpError(404, 'Không tìm thấy tác vụ');
    return task;
  }

  private async sync(): Promise<void> {
    await this.adapter.syncScheduledTasks(tasks.all());
  }

  async save(input: { id?: string; name?: string; command?: string; schedule?: unknown; enabled?: boolean }): Promise<ScheduledTask> {
    const name = String(input.name ?? '').trim();
    const command = String(input.command ?? '').trim();
    if (!name || name.length > 80) throw badRequest('Tên tác vụ phải từ 1 đến 80 ký tự');
    if (!command || command.length > 4000) throw badRequest('Lệnh không được để trống (tối đa 4000 ký tự)');
    const current = input.id ? this.get(input.id) : null;
    const task: ScheduledTask = {
      id: current?.id ?? randomUUID().slice(0, 8),
      name,
      command,
      schedule: validateSchedule(input.schedule),
      enabled: input.enabled ?? current?.enabled ?? true,
      createdAt: current?.createdAt ?? new Date().toISOString(),
      lastRunAt: current?.lastRunAt ?? null,
      lastExitCode: current?.lastExitCode ?? null,
    };
    tasks.upsert(task);
    try {
      await this.sync();
    } catch {
      // Bỏ qua lỗi sync với OS (ví dụ chưa có lệnh crontab) vì daemon scheduler nội bộ sẽ tự động kích hoạt tác vụ
    }
    return task;
  }

  async setEnabled(id: string, enabled: boolean): Promise<ScheduledTask> {
    const task = tasks.upsert({ ...this.get(id), enabled });
    try {
      await this.sync();
    } catch {}
    return task;
  }

  async remove(id: string): Promise<void> {
    this.get(id);
    tasks.remove(id);
    try {
      await this.sync();
    } catch {}
    await rm(dataPath('logs', 'tasks', `${id}.log`), { force: true });
  }

  /** Thực thi tác vụ tự động theo lịch ngầm và ghi nhận kết quả */
  async executeTask(task: ScheduledTask, triggerLabel = 'LỊCH TỰ ĐỘNG'): Promise<void> {
    if (this.runningTasks.has(task.id)) return;
    this.runningTasks.add(task.id);

    const startTime = new Date();
    try {
      const result = await this.adapter.runShell(task.command, { timeout: 30 * 60_000 });
      const endTime = new Date();
      const durationSec = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);

      const latest = tasks.get(task.id);
      if (latest) {
        tasks.upsert({ ...latest, lastRunAt: endTime.toISOString(), lastExitCode: result.code });
      }

      try {
        const logDir = dataPath('logs', 'tasks');
        await mkdir(logDir, { recursive: true });
        const logFile = path.join(logDir, `${task.id}.log`);
        const outputText = [
          result.stdout?.trim(),
          result.stderr?.trim() ? `[STDERR]\n${result.stderr.trim()}` : '',
        ].filter(Boolean).join('\n') || '[Lệnh thực thi hoàn tất, không sinh output ở stdout/stderr]';

        const entry = [
          `================================================================================`,
          `[${endTime.toISOString().replace('T', ' ').slice(0, 19)}] ${triggerLabel} (${durationSec}s)`,
          `Tác vụ: ${task.name}`,
          `Lệnh:   ${task.command}`,
          `--------------------------------------------------------------------------------`,
          outputText,
          `--------------------------------------------------------------------------------`,
          `Mã thoát: ${result.code} - ${result.code === 0 ? 'THÀNH CÔNG' : 'THẤT BẠI'}`,
          `================================================================================\n\n`,
        ].join('\n');

        await appendFile(logFile, entry, 'utf8');
      } catch {}
    } catch (err) {
      const endTime = new Date();
      const latest = tasks.get(task.id);
      if (latest) {
        tasks.upsert({ ...latest, lastRunAt: endTime.toISOString(), lastExitCode: 1 });
      }
      try {
        const logDir = dataPath('logs', 'tasks');
        await mkdir(logDir, { recursive: true });
        const logFile = path.join(logDir, `${task.id}.log`);
        const entry = [
          `================================================================================`,
          `[${endTime.toISOString().replace('T', ' ').slice(0, 19)}] ${triggerLabel} (LỖI THỰC THI)`,
          `Tác vụ: ${task.name}`,
          `Lệnh:   ${task.command}`,
          `--------------------------------------------------------------------------------`,
          `Lỗi: ${(err as Error).message}`,
          `--------------------------------------------------------------------------------`,
          `Mã thoát: 1 - THẤT BẠI`,
          `================================================================================\n\n`,
        ].join('\n');
        await appendFile(logFile, entry, 'utf8');
      } catch {}
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /** Chạy ngay trong 1 job để xem log trực tiếp trên panel và lưu vào file log tác vụ */
  runNow(id: string): JobView {
    const task = this.get(id);
    return startJob(`Chạy tác vụ "${task.name}"`, 'task', async () => {
      const startTime = new Date();
      jobLog(`[Bắt đầu thực thi]: ${startTime.toLocaleString('vi-VN')}`);
      jobLog(`[Tác vụ]: ${task.name}`);
      jobLog(`$ ${task.command}\n`);

      const result = await this.adapter.runShell(task.command, { timeout: 30 * 60_000 });
      const endTime = new Date();
      const durationSec = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);

      if (result.stdout?.trim()) jobLog(result.stdout.trim());
      if (result.stderr?.trim()) jobLog(`[STDERR]\n${result.stderr.trim()}`);
      jobLog(`\n[Hoàn tất trong ${durationSec}s] Mã thoát: ${result.code} (${result.code === 0 ? 'Thành công' : 'Thất bại'})`);

      tasks.upsert({ ...this.get(id), lastRunAt: endTime.toISOString(), lastExitCode: result.code });

      // Lưu vĩnh viễn kết quả chạy vào file logs/tasks/<id>.log
      try {
        const logDir = dataPath('logs', 'tasks');
        await mkdir(logDir, { recursive: true });
        const logFile = path.join(logDir, `${task.id}.log`);
        const outputText = [
          result.stdout?.trim(),
          result.stderr?.trim() ? `[STDERR]\n${result.stderr.trim()}` : '',
        ].filter(Boolean).join('\n') || '[Lệnh thực thi hoàn tất, không sinh output ở stdout/stderr]';

        const entry = [
          `================================================================================`,
          `[${endTime.toISOString().replace('T', ' ').slice(0, 19)}] CHẠY TỪ PANEL (${durationSec}s)`,
          `Tác vụ: ${task.name}`,
          `Lệnh:   ${task.command}`,
          `--------------------------------------------------------------------------------`,
          outputText,
          `--------------------------------------------------------------------------------`,
          `Mã thoát: ${result.code} - ${result.code === 0 ? 'THÀNH CÔNG' : 'THẤT BẠI'}`,
          `================================================================================\n\n`,
        ].join('\n');

        await appendFile(logFile, entry, 'utf8');
      } catch {
        // bỏ qua nếu lỗi ghi file phụ
      }

      if (result.code !== 0) throw new Error(`Lệnh thoát với mã ${result.code}`);
    });
  }

  /** Log của các lần chạy (cả cron / Task Scheduler lẫn chạy thủ công từ Panel) */
  async log(id: string): Promise<string> {
    const task = this.get(id);
    const file = dataPath('logs', 'tasks', `${id}.log`);
    if (existsSync(file)) {
      try {
        const content = (await readFile(file, 'utf8')).slice(-100_000);
        if (content.trim()) return content;
      } catch {}
    }
    // Nếu file chưa có nhưng task đã có bản ghi lần chạy gần nhất
    if (task.lastRunAt) {
      return [
        `[Thông tin tác vụ]`,
        `Tên tác vụ: ${task.name}`,
        `Lệnh:       ${task.command}`,
        `Lần chạy:   ${task.lastRunAt}`,
        `Mã thoát:   ${task.lastExitCode ?? 0} (${task.lastExitCode === 0 ? 'Thành công' : 'Thất bại'})`,
        `Ghi chú:    Tác vụ vừa được thực thi. Hãy bấm nút "Chạy ngay" để xem chi tiết output realtime.`,
      ].join('\n');
    }
    return '';
  }

  /** Xoá trắng tệp log của tác vụ */
  async clearLog(id: string): Promise<void> {
    this.get(id);
    await rm(dataPath('logs', 'tasks', `${id}.log`), { force: true });
  }
}
