// ZenPanel - Trình quản lý tiến trình nền (thay PM2): chạy bot / worker 24/24, tự khởi động lại, log, CPU/RAM
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, type WriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OSAdapter, ProcessInfo } from '../adapters/base.adapter.js';
import { dataPath, JsonCollection, readJson, writeJson } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const RUNTIME_FILE = 'procs-runtime.json';
/** Chết liên tục trong khoảng này thì coi là crash loop và tăng thời gian chờ */
const CRASH_WINDOW_MS = 60_000;

export interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  /** Tự chạy khi agent / máy chủ khởi động */
  autostart: boolean;
  restart: 'always' | 'on-failure' | 'never';
  restartDelaySec: number;
  /** Tự khởi động lại khi RAM vượt ngưỡng (MB), 0 = tắt */
  maxMemoryMB: number;
  createdAt: string;
}

export type ProcStatus = 'running' | 'stopped' | 'errored' | 'restarting';

interface Runtime {
  child: ChildProcess | null;
  status: ProcStatus;
  pid: number | null;
  startedAt: number | null;
  restarts: number;
  lastExit: { code: number | null; signal: string | null; at: string } | null;
  log: WriteStream | null;
  stopping: boolean;
  timer: NodeJS.Timeout | null;
  recentCrashes: number[];
}

export interface ProcView extends ManagedProcess {
  status: ProcStatus;
  pid: number | null;
  uptimeSec: number;
  restarts: number;
  lastExit: Runtime['lastExit'];
  cpu: number | null;
  memory: number | null;
}

const procs = new JsonCollection<ManagedProcess>('procs.json');
const logFile = (id: string) => dataPath('logs', 'procs', `${id}.log`);

export class ProcessManager {
  private runtime = new Map<string, Runtime>();
  private usage: { at: number; list: ProcessInfo[] } = { at: 0, list: [] };
  private monitor: NodeJS.Timeout | null = null;

  constructor(private readonly adapter: OSAdapter) {}

  private rt(id: string): Runtime {
    let r = this.runtime.get(id);
    if (!r) {
      r = { child: null, status: 'stopped', pid: null, startedAt: null, restarts: 0, lastExit: null, log: null, stopping: false, timer: null, recentCrashes: [] };
      this.runtime.set(id, r);
    }
    return r;
  }

  private get(id: string): ManagedProcess {
    const p = procs.get(id);
    if (!p) throw new HttpError(404, 'Không tìm thấy tiến trình');
    return p;
  }

  /** CPU/RAM cộng dồn cả cây tiến trình (shell → node/python bot) */
  private async treeUsage(): Promise<ProcessInfo[]> {
    if (Date.now() - this.usage.at > 5000) {
      this.usage = { at: Date.now(), list: await this.adapter.listProcesses().catch(() => this.usage.list) };
    }
    return this.usage.list;
  }

  private sumTree(list: ProcessInfo[], root: number): { cpu: number; memory: number } {
    const children = new Map<number, ProcessInfo[]>();
    for (const p of list) if (p.ppid !== null) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p]);
    let cpu = 0;
    let memory = 0;
    const stack = [root];
    const seen = new Set<number>();
    while (stack.length) {
      const pid = stack.pop()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const self = list.find((p) => p.pid === pid);
      if (self) {
        cpu += self.cpu;
        memory += self.memory;
      }
      for (const child of children.get(pid) ?? []) stack.push(child.pid);
    }
    return { cpu, memory };
  }

  async list(): Promise<ProcView[]> {
    const usage = (await this.treeUsage()) ?? [];
    return procs
      .all()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => {
        const r = this.rt(p.id);
        const tree = r.pid && r.status === 'running' ? this.sumTree(usage, r.pid) : null;
        return {
          ...p,
          status: r.status,
          pid: r.pid,
          uptimeSec: r.startedAt && r.status === 'running' ? Math.floor((Date.now() - r.startedAt) / 1000) : 0,
          restarts: r.restarts,
          lastExit: r.lastExit,
          cpu: tree?.cpu ?? null,
          memory: tree?.memory ?? null,
        };
      });
  }

  private validate(input: Partial<ManagedProcess>, current?: ManagedProcess): ManagedProcess {
    const name = String(input.name ?? current?.name ?? '').trim();
    const command = String(input.command ?? current?.command ?? '').trim();
    const cwd = String(input.cwd ?? current?.cwd ?? '').trim() || os.homedir();
    if (!name || name.length > 60) throw badRequest('Tên tiến trình 1-60 ký tự');
    if (procs.all().some((p) => p.name === name && p.id !== current?.id)) throw badRequest('Tên tiến trình đã tồn tại');
    if (!command) throw badRequest('Lệnh chạy không được để trống');
    if (!path.isAbsolute(cwd)) throw badRequest('Thư mục làm việc phải là đường dẫn tuyệt đối');
    if (!existsSync(cwd)) throw badRequest(`Thư mục ${cwd} không tồn tại`);
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.env ?? current?.env ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw badRequest(`Tên biến môi trường "${key}" không hợp lệ`);
      env[key] = String(value);
    }
    const restart = input.restart ?? current?.restart ?? 'always';
    if (!['always', 'on-failure', 'never'].includes(restart)) throw badRequest('Chế độ khởi động lại không hợp lệ');
    return {
      id: current?.id ?? randomUUID().slice(0, 8),
      name,
      command,
      cwd,
      env,
      autostart: input.autostart ?? current?.autostart ?? true,
      restart,
      restartDelaySec: Math.min(300, Math.max(0, Math.round(Number(input.restartDelaySec ?? current?.restartDelaySec ?? 3)))),
      maxMemoryMB: Math.max(0, Math.round(Number(input.maxMemoryMB ?? current?.maxMemoryMB ?? 0))),
      createdAt: current?.createdAt ?? new Date().toISOString(),
    };
  }

  async create(input: Partial<ManagedProcess>, start = true): Promise<ManagedProcess> {
    const proc = procs.upsert(this.validate(input));
    if (start) await this.start(proc.id);
    return proc;
  }

  async update(id: string, input: Partial<ManagedProcess>): Promise<ManagedProcess> {
    const proc = procs.upsert(this.validate(input, this.get(id)));
    // Đang chạy thì khởi động lại để áp dụng lệnh / env mới
    if (this.rt(id).status === 'running') await this.restart(id);
    return proc;
  }

  async remove(id: string): Promise<void> {
    this.get(id);
    await this.stop(id);
    procs.remove(id);
    this.runtime.delete(id);
    await rm(logFile(id), { force: true });
    await rm(`${logFile(id)}.1`, { force: true });
    this.saveRuntime();
  }

  private async openLog(id: string): Promise<WriteStream> {
    const file = logFile(id);
    await mkdir(path.dirname(file), { recursive: true });
    // Xoay vòng log: giữ 1 file cũ khi vượt 10MB
    if (existsSync(file) && (await stat(file)).size > MAX_LOG_BYTES) await rename(file, `${file}.1`);
    return createWriteStream(file, { flags: 'a' });
  }

  private write(r: Runtime, stream: 'out' | 'err' | 'sys', text: string): void {
    if (!r.log) return;
    const stamp = new Date().toISOString();
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
      if (line.length) r.log.write(`${stamp} [${stream}] ${line}\n`);
    }
  }

  async start(id: string): Promise<void> {
    const proc = this.get(id);
    const r = this.rt(id);
    if (r.status === 'running') return;
    if (r.timer) clearTimeout(r.timer);
    r.stopping = false;
    r.log ??= await this.openLog(id);

    const child = this.adapter.spawnShell(proc.command, { cwd: proc.cwd, env: { ...process.env, ...proc.env, ZENPANEL_PROCESS: proc.name } });
    r.child = child;
    r.pid = child.pid ?? null;
    r.status = 'running';
    r.startedAt = Date.now();
    this.write(r, 'sys', `▶ Khởi động "${proc.name}" (pid ${child.pid}): ${proc.command}`);
    child.stdout?.on('data', (b: Buffer) => this.write(r, 'out', b.toString('utf8')));
    child.stderr?.on('data', (b: Buffer) => this.write(r, 'err', b.toString('utf8')));
    child.on('error', (err) => this.write(r, 'sys', `Lỗi khởi chạy: ${err.message}`));
    child.on('exit', (code, signal) => this.onExit(id, child, code, signal));
    this.saveRuntime();
  }

  private onExit(id: string, child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    const r = this.rt(id);
    if (r.child !== child) return;
    r.child = null;
    r.pid = null;
    r.lastExit = { code, signal, at: new Date().toISOString() };
    this.write(r, 'sys', `■ Đã thoát (code ${code ?? '-'}${signal ? `, signal ${signal}` : ''})`);
    const proc = procs.get(id);
    if (!proc || r.stopping) {
      r.status = 'stopped';
      this.saveRuntime();
      return;
    }
    const failed = code !== 0;
    const shouldRestart = proc.restart === 'always' || (proc.restart === 'on-failure' && failed);
    if (!shouldRestart) {
      r.status = failed ? 'errored' : 'stopped';
      this.saveRuntime();
      return;
    }
    // Crash loop: chết nhiều lần trong 1 phút thì chờ lâu dần (tối đa 60 giây)
    const now = Date.now();
    r.recentCrashes = [...r.recentCrashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
    const delay = Math.min(60, proc.restartDelaySec * 2 ** Math.max(0, r.recentCrashes.length - 3)) * 1000;
    r.status = 'restarting';
    this.write(r, 'sys', `↻ Tự khởi động lại sau ${Math.round(delay / 1000)} giây`);
    r.timer = setTimeout(() => {
      r.restarts += 1;
      void this.start(id).catch((err: Error) => {
        r.status = 'errored';
        this.write(r, 'sys', `Không khởi động lại được: ${err.message}`);
      });
    }, delay);
  }

  async stop(id: string): Promise<void> {
    this.get(id);
    const r = this.rt(id);
    r.stopping = true;
    if (r.timer) clearTimeout(r.timer);
    const child = r.child;
    if (!child?.pid) {
      r.status = 'stopped';
      return;
    }
    this.write(r, 'sys', '■ Dừng theo yêu cầu');
    await this.adapter.killTree(child.pid, false);
    // Cho 8 giây để bot tự dọn dẹp rồi mới buộc dừng
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 8000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!exited && child.pid) await this.adapter.killTree(child.pid, true);
    r.status = 'stopped';
    this.saveRuntime();
  }

  async restart(id: string): Promise<void> {
    await this.stop(id);
    this.rt(id).restarts += 1;
    await this.start(id);
  }

  /** N dòng log cuối (đọc từ cuối file, không nạp cả file lớn vào RAM) */
  async log(id: string, lines = 300): Promise<{ lines: string[]; size: number }> {
    this.get(id);
    const file = logFile(id);
    if (!existsSync(file)) return { lines: [], size: 0 };
    const size = (await stat(file)).size;
    const chunk = Math.min(size, Math.max(64 * 1024, lines * 400));
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(chunk);
      await handle.read(buffer, 0, chunk, size - chunk);
      const all = buffer.toString('utf8').split('\n').filter(Boolean);
      return { lines: all.slice(-lines), size };
    } finally {
      await handle.close();
    }
  }

  async clearLog(id: string): Promise<void> {
    this.get(id);
    const r = this.rt(id);
    r.log?.end();
    r.log = null;
    await rm(logFile(id), { force: true });
    await rm(`${logFile(id)}.1`, { force: true });
    if (r.status === 'running') r.log = await this.openLog(id);
  }

  logPath(id: string): string {
    this.get(id);
    return logFile(id);
  }

  /** Lưu pid đang chạy để lần khởi động sau dọn tiến trình mồ côi (Windows không tự kill con khi agent tắt) */
  private saveRuntime(): void {
    const data = Object.fromEntries([...this.runtime.entries()].filter(([, r]) => r.pid).map(([id, r]) => [id, r.pid]));
    writeJson(RUNTIME_FILE, data);
  }

  async bootstrap(): Promise<void> {
    const previous = readJson<Record<string, number>>(RUNTIME_FILE, {});
    if (Object.keys(previous).length) {
      const list = await this.adapter.listProcesses().catch(() => []);
      for (const [id, pid] of Object.entries(previous)) {
        const proc = procs.get(id);
        const alive = list.find((p) => p.pid === pid);
        // Chỉ kill khi đúng là tiến trình cũ (cùng lệnh), tránh nhầm pid đã bị hệ điều hành cấp lại
        if (proc && alive?.command?.includes(proc.command.slice(0, 40))) await this.adapter.killTree(pid, true);
      }
    }
    writeJson(RUNTIME_FILE, {});
    for (const proc of procs.all().filter((p) => p.autostart)) await this.start(proc.id).catch(() => undefined);

    // Giám sát RAM: vượt ngưỡng thì khởi động lại (giống max_memory_restart của PM2)
    this.monitor = setInterval(() => void this.checkMemory(), 15_000);
  }

  private async checkMemory(): Promise<void> {
    const limited = procs.all().filter((p) => p.maxMemoryMB > 0 && this.rt(p.id).status === 'running');
    if (!limited.length) return;
    const usage = await this.treeUsage();
    for (const proc of limited) {
      const r = this.rt(proc.id);
      if (!r.pid) continue;
      const mem = this.sumTree(usage, r.pid).memory / 1024 / 1024;
      if (mem > proc.maxMemoryMB) {
        this.write(r, 'sys', `⚠ RAM ${mem.toFixed(0)}MB vượt ngưỡng ${proc.maxMemoryMB}MB → khởi động lại`);
        await this.restart(proc.id).catch(() => undefined);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.monitor) clearInterval(this.monitor);
    await Promise.all(procs.all().map((p) => this.stop(p.id).catch(() => undefined)));
  }

  // ------------------------------------------------------------ Nhập từ PM2

  async pm2List(): Promise<{ name: string; command: string; cwd: string; status: string; env: Record<string, string> }[]> {
    if (!(await this.adapter.findExecutable('pm2'))) throw badRequest('Không tìm thấy pm2 trên máy chủ (pm2 phải cài cho user mà ZenPanel đang chạy, thường là root)');
    const { stdout, code, stderr } = await this.adapter.runShell('pm2 jlist', { timeout: 30_000 });
    if (code !== 0) throw badRequest(`pm2 jlist lỗi: ${stderr.trim()}`);
    const json = stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1);
    const list = JSON.parse(json || '[]') as {
      name: string;
      pm2_env: { pm_exec_path: string; pm_cwd: string; args?: string[] | string; exec_interpreter?: string; status: string; env?: Record<string, unknown> };
    }[];
    const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
    return list.map((app) => {
      const env = app.pm2_env;
      const args = Array.isArray(env.args) ? env.args : env.args ? [env.args] : [];
      const interpreter = env.exec_interpreter && env.exec_interpreter !== 'none' ? `${env.exec_interpreter} ` : '';
      // Chỉ lấy biến môi trường riêng của app (bỏ biến hệ thống mà pm2 sao chép)
      const own = Object.fromEntries(
        Object.entries(env.env ?? {}).filter(([key, value]) => typeof value === 'string' && !(key in process.env) && !/^(pm_|PM2|NODE_APP_INSTANCE|unique_id)/.test(key)),
      ) as Record<string, string>;
      return { name: app.name, command: `${interpreter}${quote(env.pm_exec_path)} ${args.map(quote).join(' ')}`.trim(), cwd: env.pm_cwd, status: env.status, env: own };
    });
  }

  async importPm2(names: string[], removeFromPm2: boolean): Promise<string[]> {
    const list = await this.pm2List();
    const imported: string[] = [];
    for (const app of list.filter((a) => names.includes(a.name))) {
      // Dừng bên PM2 trước để không chạy 2 bản cùng lúc
      if (removeFromPm2) await this.adapter.runShell(`pm2 delete ${JSON.stringify(app.name)}`, { timeout: 30_000 });
      const name = procs.all().some((p) => p.name === app.name) ? `${app.name}-pm2` : app.name;
      await this.create({ name, command: app.command, cwd: app.cwd, env: app.env, autostart: true, restart: 'always' }, removeFromPm2);
      imported.push(name);
    }
    if (removeFromPm2) await this.adapter.runShell('pm2 save --force', { timeout: 30_000 });
    return imported;
  }
}
