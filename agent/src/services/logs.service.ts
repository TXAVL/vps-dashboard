// ZenPanel - Trình xem nhật ký: log hệ điều hành (journal / Event Log qua adapter), file log web server,
// log website do ZenPanel tạo, log của ZenPanel (cập nhật, ứng dụng nền, cron)
import { existsSync } from 'node:fs';
import { open, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LogSource, OSAdapter } from '../adapters/base.adapter.js';
import { dataPath, readJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';
import type { SiteService } from './site.service.js';

const TAIL_BYTES = 2 * 1024 * 1024;

/** Đọc N dòng cuối của file mà không nạp cả file */
async function tailFile(file: string, lines: number): Promise<string> {
  const info = await stat(file);
  const start = Math.max(0, info.size - TAIL_BYTES);
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(info.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const all = buffer.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
    if (start > 0) all.shift();
    return all.slice(-lines).join('\n');
  } finally {
    await handle.close();
  }
}

export class LogService {
  private cache: { at: number; list: LogSource[] } | null = null;

  constructor(
    private readonly adapter: OSAdapter,
    private readonly sites: SiteService,
  ) {}

  async sources(): Promise<LogSource[]> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.list;
    const list = await this.adapter.logSources().catch(() => [] as LogSource[]);

    for (const site of this.sites.list()) {
      for (const [file, label] of [
        [site.accessLog, 'access'],
        [site.errorLog, 'error'],
      ] as const) {
        if (file && existsSync(file)) list.push({ id: `file:${file}`, label: `${site.domain} · ${label}`, group: 'Website', kind: 'file', path: file });
      }
    }

    const panelFiles: [string, string][] = [[dataPath('logs', 'update.log'), 'Cập nhật panel']];
    for (const [file, label] of panelFiles) if (existsSync(file)) list.push({ id: `file:${file}`, label, group: 'ZenPanel', kind: 'file', path: file });

    const procs = readJson<{ id: string; name: string }[]>('procs.json', []);
    for (const p of procs) {
      const file = dataPath('logs', 'procs', `${p.id}.log`);
      if (existsSync(file)) list.push({ id: `file:${file}`, label: `Ứng dụng nền · ${p.name}`, group: 'ZenPanel', kind: 'file', path: file });
    }
    const tasks = readJson<{ id: string; name: string }[]>('tasks.json', []);
    for (const t of tasks) {
      const file = dataPath('logs', 'tasks', `${t.id}.log`);
      if (existsSync(file)) list.push({ id: `file:${file}`, label: `Cron · ${t.name}`, group: 'ZenPanel', kind: 'file', path: file });
    }
    // Log khác trong thư mục logs của panel (nếu có)
    const extra = await readdir(dataPath('logs')).catch(() => [] as string[]);
    for (const name of extra) {
      const file = dataPath('logs', name);
      if (name.endsWith('.log') && !list.some((s) => s.path === file)) list.push({ id: `file:${file}`, label: name, group: 'ZenPanel', kind: 'file', path: file });
    }

    this.cache = { at: Date.now(), list };
    return list;
  }

  /** Chỉ đọc nguồn có trong danh sách (không cho đọc file tuỳ ý qua id) */
  async read(id: string, lines: number, query = ''): Promise<{ source: LogSource; content: string; size: number | null; matched: number | null }> {
    const source = (await this.sources()).find((s) => s.id === id) ?? ((this.cache = null), (await this.sources()).find((s) => s.id === id));
    if (!source) throw badRequest('Nguồn log không tồn tại');
    const n = Math.min(5000, Math.max(20, Math.trunc(lines) || 300));
    let content: string;
    let size: number | null = null;
    if (source.kind === 'file' && source.path) {
      size = (await stat(source.path)).size;
      // Lọc thì đọc nhiều dòng hơn để còn đủ kết quả
      content = await tailFile(source.path, query ? n * 10 : n);
    } else {
      content = await this.adapter.readSystemLog(source.id, query ? n * 4 : n);
    }
    let matched: number | null = null;
    if (query) {
      const q = query.toLowerCase();
      const hits = content.split('\n').filter((l) => l.toLowerCase().includes(q));
      matched = hits.length;
      content = hits.slice(-n).join('\n');
    }
    return { source, content, size, matched };
  }

  /** Đường dẫn file để tải về (chỉ nguồn kiểu file) */
  async filePath(id: string): Promise<string> {
    const source = (await this.sources()).find((s) => s.id === id);
    if (!source?.path) throw badRequest('Nguồn này không phải file, không tải về được');
    return path.resolve(source.path);
  }

  /** Xóa hoặc làm rỗng nội dung log */
  async clear(id: string): Promise<{ success: boolean; message: string }> {
    const source = (await this.sources()).find((s) => s.id === id);
    if (!source) throw badRequest('Nguồn log không tồn tại');

    if (source.kind === 'file' && source.path) {
      if (existsSync(source.path)) {
        await writeFile(source.path, '', 'utf8');
        return { success: true, message: `Đã xóa sạch nội dung log: ${source.label}` };
      }
      throw badRequest('File log không tồn tại');
    }

    if (this.adapter.clearSystemLog) {
      await this.adapter.clearSystemLog(source.id);
      return { success: true, message: `Đã làm sạch nhật ký: ${source.label}` };
    }

    return { success: true, message: `Đã xóa log: ${source.label}` };
  }
}
