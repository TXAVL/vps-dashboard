// ZenPanel - Tác vụ định kỳ (cron trên Linux, Task Scheduler trên Windows). Dữ liệu gốc lưu trong tasks.json
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
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

export class TaskService {
  constructor(private readonly adapter: OSAdapter) {}

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
    const previous = tasks.all();
    tasks.upsert(task);
    try {
      await this.sync();
    } catch (err) {
      // Không áp dụng được vào hệ thống -> khôi phục danh sách cũ
      for (const t of tasks.all()) tasks.remove(t.id);
      for (const t of previous) tasks.upsert(t);
      throw err;
    }
    return task;
  }

  async setEnabled(id: string, enabled: boolean): Promise<ScheduledTask> {
    const task = tasks.upsert({ ...this.get(id), enabled });
    await this.sync();
    return task;
  }

  async remove(id: string): Promise<void> {
    this.get(id);
    tasks.remove(id);
    await this.sync();
    await rm(dataPath('logs', 'tasks', `${id}.log`), { force: true });
  }

  /** Chạy ngay trong 1 job để xem log trực tiếp trên panel */
  runNow(id: string): JobView {
    const task = this.get(id);
    return startJob(`Chạy tác vụ "${task.name}"`, 'task', async () => {
      const result = await this.adapter.runShell(task.command, { timeout: 30 * 60_000 });
      jobLog(`\nMã thoát: ${result.code}`);
      tasks.upsert({ ...this.get(id), lastRunAt: new Date().toISOString(), lastExitCode: result.code });
      if (result.code !== 0) throw new Error(`Lệnh thoát với mã ${result.code}`);
    });
  }

  /** Log của các lần chạy theo lịch (do cron / Task Scheduler ghi) */
  async log(id: string): Promise<string> {
    this.get(id);
    const file = dataPath('logs', 'tasks', `${id}.log`);
    if (!existsSync(file)) return '';
    return (await readFile(file, 'utf8')).slice(-100_000);
  }
}
