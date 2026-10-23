// ZenPanel - API vận hành: sao lưu & khôi phục, nhật ký hệ thống, tối ưu RAM, truy cập database từ xa
import type { FastifyInstance } from 'fastify';
import type { RamOptimizeOptions } from '../adapters/base.adapter.js';
import { issueTicket } from '../core/auth.js';
import { badRequest } from '../core/validate.js';
import type { BackupSchedule, BackupService, BackupTarget } from '../services/backup.service.js';
import type { CleanService } from '../services/clean.service.js';
import type { DatabaseService } from '../services/database.service.js';
import type { LogService } from '../services/logs.service.js';

/** Link tải file qua vé ngắn hạn (dùng chung route /api/files/download) */
function downloadLink(file: string): { url: string } {
  const ttlMs = 5 * 60_000;
  const expires = Date.now() + ttlMs;
  const params = new URLSearchParams({ path: file, ticket: issueTicket(`download:${file}`, ttlMs), expires: String(expires) });
  return { url: `/api/files/download?${params}` };
}

export async function opsRoutes(app: FastifyInstance, deps: { backups: BackupService; logs: LogService; clean: CleanService; databases: DatabaseService }): Promise<void> {
  const { backups, logs, clean, databases } = deps;
  type Params = { id: string };

  // ------------------------------------------------------------ Sao lưu
  app.get('/api/backups', async () => ({ items: backups.list(), schedules: backups.listSchedules(), sources: await backups.sources() }));
  app.post('/api/backups', async (req) => backups.create((req.body ?? {}) as BackupTarget & { note?: string }));
  app.delete('/api/backups/:id', async (req) => {
    await backups.remove((req.params as Params).id);
    return { ok: true };
  });
  app.post('/api/backups/:id/restore', async (req) => backups.restore((req.params as Params).id, (req.body ?? {}) as { destination?: string }));
  app.post('/api/backups/:id/download', async (req) => {
    const item = backups.list().find((b) => b.id === (req.params as Params).id);
    if (!item?.exists) throw badRequest('Bản sao lưu không còn trên đĩa');
    return downloadLink(item.file);
  });
  app.post('/api/backups/schedules', async (req) => backups.saveSchedule((req.body ?? {}) as Partial<BackupSchedule> & { target: BackupTarget }));
  app.put('/api/backups/schedules/:id', async (req) => backups.saveSchedule({ ...((req.body ?? {}) as Partial<BackupSchedule> & { target: BackupTarget }), id: (req.params as Params).id }));
  app.post('/api/backups/schedules/:id/run', async (req) => backups.runSchedule((req.params as Params).id));
  app.delete('/api/backups/schedules/:id', async (req) => {
    backups.removeSchedule((req.params as Params).id);
    return { ok: true };
  });

  // ------------------------------------------------------------ Nhật ký
  app.get('/api/logs/sources', async () => logs.sources());
  app.get('/api/logs/read', async (req) => {
    const q = req.query as { id?: string; lines?: string; q?: string };
    if (!q.id) throw badRequest('Thiếu nguồn log');
    return logs.read(q.id, Number(q.lines) || 300, String(q.q ?? '').slice(0, 200));
  });
  app.post('/api/logs/download', async (req) => downloadLink(await logs.filePath(String((req.body as { id?: string } | undefined)?.id ?? ''))));

  // ------------------------------------------------------------ Tối ưu RAM
  app.get('/api/system/memory', async () => clean.memory());
  app.post('/api/system/memory/optimize', async (req) => clean.optimizeRam((req.body ?? {}) as RamOptimizeOptions));
  app.post('/api/system/memory/trim/:pid', async (req) => {
    const pid = Number((req.params as { pid: string }).pid);
    if (!Number.isInteger(pid) || pid <= 4) throw badRequest('PID không hợp lệ');
    return clean.trimProcess(pid);
  });
  app.post('/api/system/memory/tunable', async (req) => {
    const body = (req.body ?? {}) as { key?: string; value?: number };
    if (body.key !== 'vm.swappiness' && body.key !== 'vm.vfs_cache_pressure') throw badRequest('Tham số không hợp lệ');
    await clean.setTunable(body.key, Number(body.value));
    return { ok: true };
  });

  // ------------------------------------------------------------ Database: truy cập từ xa
  app.get('/api/databases/:id/remote', async (req) => databases.remoteStatus((req.params as Params).id, (req.query as { internet?: string }).internet !== '0'));
  app.post('/api/databases/:id/remote', async (req) => {
    const body = (req.body ?? {}) as { enabled?: boolean; source?: string | null };
    return databases.setRemoteAccess((req.params as Params).id, { enabled: body.enabled !== false, source: body.source ?? null });
  });
}
