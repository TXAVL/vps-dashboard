// ZenPanel - Sao lưu & khôi phục: website, thư mục bất kỳ, database (container App Store), cấu hình ZenPanel.
// Có lịch tự động (hằng ngày / hằng tuần / mỗi N giờ) và tự xoá bản cũ theo số lượng giữ lại.
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { config } from '../config.js';
import { jobLog, jobResult, jobStep, startJob, type JobView } from '../core/jobs.js';
import { dataPath, JsonCollection } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';
import type { DatabaseServer, DatabaseService } from './database.service.js';
import type { DockerService } from './docker.service.js';
import { compress, extract } from './file.service.js';
import type { SiteService } from './site.service.js';

export type BackupKind = 'site' | 'directory' | 'database' | 'panel';

export interface BackupTarget {
  kind: BackupKind;
  /** site: domain · directory: đường dẫn · database: appId · panel: bỏ trống */
  ref?: string;
  /** database: tên database (trống = toàn bộ server) */
  database?: string;
  /** Định dạng file nén: tar.gz hoặc zip (mặc định theo OS) */
  format?: 'tar.gz' | 'zip';
}

export interface BackupRecord {
  id: string;
  name: string;
  target: BackupTarget;
  file: string;
  size: number;
  createdAt: string;
  durationSec: number;
  scheduleId: string | null;
  note: string;
}

export interface BackupSchedule {
  id: string;
  name: string;
  target: BackupTarget;
  every: 'hours' | 'daily' | 'weekly';
  /** every=hours: chu kỳ giờ */
  hours: number;
  /** HH:MM cho daily/weekly */
  time: string;
  /** 0 = Chủ nhật */
  day: number;
  /** Số bản giữ lại cho lịch này */
  keep: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: 'success' | 'error' | null;
  lastError: string | null;
}

const records = new JsonCollection<BackupRecord>('backups.json');
const schedules = new JsonCollection<BackupSchedule>('backup-schedules.json');
const backupDir = () => dataPath('backups');
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const safe = (v: string) => v.replace(/[^\w.-]+/g, '_').slice(0, 60);

export class BackupService {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();

  constructor(
    private readonly adapter: OSAdapter,
    private readonly sites: SiteService,
    private readonly databases: DatabaseService,
    private readonly docker: DockerService,
  ) {}

  list(): (BackupRecord & { exists: boolean })[] {
    return records
      .all()
      .map((r) => ({ ...r, exists: existsSync(r.file) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Những gì có thể sao lưu: website, database server, cấu hình panel */
  async sources(): Promise<{ sites: { domain: string; root: string }[]; databases: Pick<DatabaseServer, 'appId' | 'name' | 'engine' | 'running'>[]; dataDir: string; backupDir: string }> {
    const dbs = await this.databases.servers().catch(() => []);
    return {
      sites: this.sites.list().map((s) => ({ domain: s.domain, root: s.root })),
      databases: dbs.map(({ appId, name, engine, running }) => ({ appId, name, engine, running })),
      dataDir: config.dataDir,
      backupDir: backupDir(),
    };
  }

  private describe(target: BackupTarget): string {
    switch (target.kind) {
      case 'site':
        return `Website ${target.ref}`;
      case 'directory':
        return `Thư mục ${target.ref}`;
      case 'database':
        return `Database ${target.database ? `${target.database} @ ` : ''}${target.ref}`;
      case 'panel':
        return 'Cấu hình ZenPanel';
    }
  }

  private validate(input: BackupTarget): BackupTarget {
    const kind = input?.kind;
    const format = input?.format === 'zip' || input?.format === 'tar.gz' ? input.format : undefined;
    if (kind === 'panel') return { kind, format };
    if (kind === 'site') {
      const site = this.sites.list().find((s) => s.domain === input.ref);
      if (!site) throw badRequest('Không tìm thấy website');
      return { kind, ref: site.domain, format };
    }
    if (kind === 'directory') {
      const dir = String(input.ref ?? '').trim();
      if (!dir || !path.isAbsolute(dir)) throw badRequest('Nhập đường dẫn tuyệt đối của thư mục cần sao lưu');
      if (path.parse(dir).root === path.resolve(dir)) throw badRequest('Không sao lưu cả ổ đĩa gốc, hãy chọn thư mục cụ thể');
      return { kind, ref: path.resolve(dir), format };
    }
    if (kind === 'database') {
      if (!input.ref) throw badRequest('Chọn database server');
      const db = input.database ? String(input.database) : undefined;
      if (db && !/^[A-Za-z_][\w$]{0,63}$/.test(db)) throw badRequest('Tên database không hợp lệ');
      return { kind, ref: String(input.ref), database: db };
    }
    throw badRequest('Loại sao lưu không hợp lệ');
  }

  create(input: BackupTarget & { note?: string }): JobView {
    const target = this.validate(input);
    return startJob(`Sao lưu ${this.describe(target)}`, 'backup', async () => {
      const record = await this.run(target, null, String(input.note ?? '').slice(0, 200));
      jobResult(record);
    });
  }

  /** Thực hiện sao lưu (gọi trong job hoặc từ lịch) */
  private async run(target: BackupTarget, scheduleId: string | null, note = ''): Promise<BackupRecord> {
    const started = Date.now();
    await mkdir(backupDir(), { recursive: true });
    const format = (target.kind !== 'database' && target.format) ? target.format : this.adapter.archiveFormat();
    let file: string;

    if (target.kind === 'database') {
      file = await this.dumpDatabase(target);
    } else {
      const source =
        target.kind === 'panel'
          ? config.dataDir
          : target.kind === 'site'
            ? this.sites.list().find((s) => s.domain === target.ref)?.root
            : target.ref;
      if (!source || !existsSync(source)) throw new HttpError(404, `Không tìm thấy ${source ?? 'thư mục nguồn'}`);
      jobStep('Nén dữ liệu');
      file = path.join(backupDir(), `${target.kind}-${safe(target.ref ?? 'zenpanel')}-${stamp()}.${format}`);
      jobLog(`Nguồn: ${source}`);
      if (target.kind === 'panel') {
        // Bỏ các thư mục nặng / tự sinh: gói phiên bản, bản sao lưu, log
        const skip = new Set(['versions', 'backups', 'logs', 'updates', 'bin']);
        const entries = (await readdir(source)).filter((n) => !skip.has(n)).map((n) => path.join(source, n));
        jobLog(`Gồm ${entries.length} mục (bỏ qua versions, backups, logs)`);
        await compress(entries, file, format);
      } else {
        await compress([source], file, format);
      }
    }

    const size = (await stat(file)).size;
    const record: BackupRecord = {
      id: randomUUID().slice(0, 12),
      name: this.describe(target),
      target,
      file,
      size,
      createdAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - started) / 1000),
      scheduleId,
      note,
    };
    records.upsert(record);
    jobLog(`✔ Đã lưu ${file} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    return record;
  }

  private async server(appId: string): Promise<DatabaseServer> {
    const server = (await this.databases.servers()).find((s) => s.appId === appId);
    if (!server) throw new HttpError(404, 'Không tìm thấy database server');
    if (!server.running) throw badRequest(`${server.name} đang dừng, hãy khởi động trước khi sao lưu`);
    return server;
  }

  private async dumpDatabase(target: BackupTarget): Promise<string> {
    const server = await this.server(target.ref!);
    const db = target.database;
    const base = path.join(backupDir(), `db-${server.appId}${db ? `-${db}` : ''}-${stamp()}`);
    const tmp = '/tmp/zenpanel-backup';
    jobStep(`Xuất dữ liệu ${server.name}`);
    let inner: string;
    let out: string;
    let env: Record<string, string> = {};
    switch (server.engine) {
      case 'mysql':
      case 'mariadb':
        env = { MYSQL_PWD: server.password };
        inner = `${tmp}.sql`;
        await this.docker.execShell(
          server.container,
          `DUMP=$(command -v mysqldump || command -v mariadb-dump); $DUMP -uroot --single-transaction --routines --triggers ${db ? `--databases ${db}` : '--all-databases'} > ${inner}`,
          env,
        );
        out = `${base}.sql.gz`;
        break;
      case 'postgres':
        env = { PGPASSWORD: server.password };
        inner = `${tmp}.sql`;
        await this.docker.execShell(server.container, db ? `pg_dump -U postgres --clean --if-exists --create ${db} > ${inner}` : `pg_dumpall -U postgres --clean --if-exists > ${inner}`, env);
        out = `${base}.sql.gz`;
        break;
      case 'mongodb':
        inner = `${tmp}.archive`;
        await this.docker.execShell(server.container, `mongodump --quiet --archive=${inner} --gzip -u root -p "$ZP_PASS" --authenticationDatabase admin ${db ? `--db ${db}` : ''}`, { ZP_PASS: server.password });
        out = `${base}.mongo.gz`;
        break;
      case 'redis':
        await this.docker.execShell(server.container, 'redis-cli --no-auth-warning -a "$ZP_PASS" SAVE', { ZP_PASS: server.password });
        inner = '/data/dump.rdb';
        out = `${base}.rdb`;
        break;
    }
    jobStep('Chép bản dump ra máy chủ');
    const raw = out.endsWith('.sql.gz') ? out.slice(0, -3) : out;
    await this.docker.copyFrom(server.container, inner, raw);
    if (inner.startsWith(tmp)) await this.docker.execShell(server.container, `rm -f ${inner}`).catch(() => undefined);
    if (raw !== out) {
      jobStep('Nén file SQL');
      await pipeline(createReadStream(raw), createGzip({ level: 6 }), createWriteStream(out));
      await rm(raw, { force: true });
    }
    return out;
  }

  /** Khôi phục: giải nén về đúng chỗ cũ (hoặc thư mục chỉ định), hoặc nạp lại database */
  restore(id: string, input: { destination?: string }): JobView {
    const record = records.get(id);
    if (!record || !existsSync(record.file)) throw new HttpError(404, 'Bản sao lưu không còn trên đĩa');
    return startJob(`Khôi phục ${record.name}`, 'backup', async () => {
      const { target } = record;
      if (target.kind === 'database') {
        await this.restoreDatabase(record);
      } else {
        const original = target.kind === 'panel' ? config.dataDir : target.kind === 'site' ? this.sites.list().find((s) => s.domain === target.ref)?.root : target.ref;
        const dest = input.destination?.trim() ? path.resolve(input.destination.trim()) : target.kind === 'panel' ? config.dataDir : path.dirname(original ?? '');
        if (!dest || !path.isAbsolute(dest)) throw badRequest('Không xác định được thư mục khôi phục');
        jobStep('Giải nén bản sao lưu');
        jobLog(`Giải nén ${record.file} → ${dest}`);
        await extract(record.file, dest);
        if (target.kind === 'panel') jobLog('⚠ Đã khôi phục cấu hình. Hãy khởi động lại ZenPanel để nạp lại toàn bộ.');
      }
      jobLog('✔ Khôi phục hoàn tất');
    });
  }

  private async restoreDatabase(record: BackupRecord): Promise<void> {
    const server = await this.server(record.target.ref!);
    const tmp = '/tmp/zenpanel-restore';
    if (server.engine === 'redis') throw badRequest('Redis: hãy dừng app, chép file .rdb vào volume /data rồi khởi động lại (không khôi phục nóng được)');
    let file = record.file;
    if (file.endsWith('.sql.gz')) {
      jobStep('Giải nén file SQL');
      file = record.file.slice(0, -3);
      await pipeline(createReadStream(record.file), createGunzip(), createWriteStream(file));
    }
    jobStep(`Nạp dữ liệu vào ${server.name}`);
    const inner = server.engine === 'mongodb' ? `${tmp}.archive` : `${tmp}.sql`;
    await this.docker.copyTo(file, server.container, inner);
    if (file !== record.file) await rm(file, { force: true });
    try {
      if (server.engine === 'mysql' || server.engine === 'mariadb') {
        await this.docker.execShell(server.container, `CLI=$(command -v mysql || command -v mariadb); $CLI -uroot < ${inner}`, { MYSQL_PWD: server.password });
      } else if (server.engine === 'postgres') {
        await this.docker.execShell(server.container, `psql -U postgres -v ON_ERROR_STOP=0 -f ${inner} postgres`, { PGPASSWORD: server.password });
      } else {
        await this.docker.execShell(server.container, `mongorestore --quiet --drop --gzip --archive=${inner} -u root -p "$ZP_PASS" --authenticationDatabase admin`, { ZP_PASS: server.password });
      }
    } finally {
      await this.docker.execShell(server.container, `rm -f ${inner}`).catch(() => undefined);
    }
  }

  async remove(id: string): Promise<void> {
    const record = records.get(id);
    if (!record) throw new HttpError(404, 'Không tìm thấy bản sao lưu');
    await rm(record.file, { force: true });
    records.remove(id);
  }

  // ------------------------------------------------------------------ Lịch sao lưu tự động
  listSchedules(): BackupSchedule[] {
    return schedules.all().sort((a, b) => a.name.localeCompare(b.name));
  }

  saveSchedule(input: Partial<BackupSchedule> & { target: BackupTarget }): BackupSchedule {
    const target = this.validate(input.target);
    const current = input.id ? schedules.get(input.id) : null;
    const every = input.every === 'hours' || input.every === 'weekly' ? input.every : 'daily';
    const time = typeof input.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : '02:00';
    const schedule: BackupSchedule = {
      id: current?.id ?? randomUUID().slice(0, 8),
      name: String(input.name ?? '').trim().slice(0, 80) || this.describe(target),
      target,
      every,
      hours: Math.min(168, Math.max(1, Math.round(Number(input.hours) || 6))),
      time,
      day: Math.min(6, Math.max(0, Math.round(Number(input.day) || 0))),
      keep: Math.min(100, Math.max(1, Math.round(Number(input.keep) || 7))),
      enabled: input.enabled ?? current?.enabled ?? true,
      lastRunAt: current?.lastRunAt ?? null,
      lastStatus: current?.lastStatus ?? null,
      lastError: current?.lastError ?? null,
    };
    return schedules.upsert(schedule);
  }

  removeSchedule(id: string): void {
    if (!schedules.get(id)) throw new HttpError(404, 'Không tìm thấy lịch sao lưu');
    schedules.remove(id);
  }

  runSchedule(id: string): JobView {
    const schedule = schedules.get(id);
    if (!schedule) throw new HttpError(404, 'Không tìm thấy lịch sao lưu');
    return startJob(`Sao lưu theo lịch: ${schedule.name}`, 'backup', () => this.executeSchedule(schedule));
  }

  private due(s: BackupSchedule, now: Date): boolean {
    const last = s.lastRunAt ? new Date(s.lastRunAt).getTime() : 0;
    if (s.every === 'hours') return now.getTime() - last >= s.hours * 3_600_000;
    const [h, m] = s.time.split(':').map(Number);
    if (now.getHours() !== h || now.getMinutes() !== m) return false;
    if (s.every === 'weekly' && now.getDay() !== s.day) return false;
    return now.getTime() - last > 120_000;
  }

  private async executeSchedule(schedule: BackupSchedule): Promise<void> {
    if (this.running.has(schedule.id)) return;
    this.running.add(schedule.id);
    try {
      await this.run(schedule.target, schedule.id, 'Tự động theo lịch');
      // Giữ lại `keep` bản mới nhất của lịch này
      const own = records
        .all()
        .filter((r) => r.scheduleId === schedule.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const old of own.slice(schedule.keep)) {
        await rm(old.file, { force: true }).catch(() => undefined);
        records.remove(old.id);
        jobLog(`Xoá bản cũ ${path.basename(old.file)}`);
      }
      schedules.upsert({ ...schedule, lastRunAt: new Date().toISOString(), lastStatus: 'success', lastError: null });
    } catch (err) {
      schedules.upsert({ ...schedule, lastRunAt: new Date().toISOString(), lastStatus: 'error', lastError: (err as Error).message });
      throw err;
    } finally {
      this.running.delete(schedule.id);
    }
  }

  startScheduler(): void {
    this.timer = setInterval(() => {
      const now = new Date();
      for (const s of schedules.all()) {
        if (s.enabled && this.due(s, now)) startJob(`Sao lưu theo lịch: ${s.name}`, 'backup', () => this.executeSchedule(s));
      }
    }, 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
