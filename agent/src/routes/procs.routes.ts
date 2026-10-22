// ZenPanel - API trình quản lý tiến trình nền (thay PM2)
import type { FastifyInstance } from 'fastify';
import { badRequest } from '../core/validate.js';
import type { ManagedProcess, ProcessManager } from '../services/procman.service.js';

export async function procRoutes(app: FastifyInstance, deps: { procs: ProcessManager }): Promise<void> {
  const { procs } = deps;
  type Params = { id: string };

  app.get('/api/procs', async () => procs.list());
  app.post('/api/procs', async (req) => {
    const body = (req.body ?? {}) as Partial<ManagedProcess> & { start?: boolean };
    return procs.create(body, body.start !== false);
  });
  app.put('/api/procs/:id', async (req) => procs.update((req.params as Params).id, (req.body ?? {}) as Partial<ManagedProcess>));
  app.delete('/api/procs/:id', async (req) => {
    await procs.remove((req.params as Params).id);
    return { ok: true };
  });

  app.post('/api/procs/:id/:action', async (req) => {
    const { id, action } = req.params as { id: string; action: string };
    if (action === 'start') await procs.start(id);
    else if (action === 'stop') await procs.stop(id);
    else if (action === 'restart') await procs.restart(id);
    else if (action === 'clear-log') await procs.clearLog(id);
    else throw badRequest('Thao tác không hợp lệ');
    return { ok: true };
  });

  app.get('/api/procs/:id/log', async (req) => {
    const lines = Math.min(2000, Math.max(20, Number((req.query as { lines?: string }).lines) || 300));
    return procs.log((req.params as Params).id, lines);
  });
  app.get('/api/procs/:id/log-path', async (req) => ({ path: procs.logPath((req.params as Params).id) }));

  app.get('/api/procs/pm2/list', async () => procs.pm2List());
  app.post('/api/procs/pm2/import', async (req) => {
    const body = (req.body ?? {}) as { names?: string[]; removeFromPm2?: boolean };
    if (!Array.isArray(body.names) || !body.names.length) throw badRequest('Chưa chọn tiến trình PM2 nào');
    return { imported: await procs.importPm2(body.names, Boolean(body.removeFromPm2)) };
  });
}
