// ZenPanel - API của panel: tác vụ nền (jobs), tuỳ chọn, cập nhật & phiên bản, tác vụ định kỳ, nguồn, mạng
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { PowerAction } from '../adapters/base.adapter.js';
import type { AppContext } from '../core/context.js';
import { getJob, listJobs } from '../core/jobs.js';
import { getPrefs, updatePrefs, type PanelPrefs } from '../core/prefs.js';
import { badRequest, HttpError } from '../core/validate.js';
import type { TaskService } from '../services/task.service.js';
import type { UpdateService } from '../services/update.service.js';

let publicIpCache: { at: number; ipv4: string | null; ipv6: string | null } | null = null;

async function lookup(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? (await res.text()).trim() || null : null;
  } catch {
    return null;
  }
}

export async function panelRoutes(app: FastifyInstance, ctx: AppContext, deps: { updates: UpdateService; tasks: TaskService }): Promise<void> {
  const { updates, tasks } = deps;

  // ------------------------------------------------------------ Jobs
  app.get('/api/jobs', async () => listJobs());
  app.get('/api/jobs/:id', async (req) => {
    const job = getJob((req.params as { id: string }).id);
    if (!job) throw new HttpError(404, 'Không tìm thấy tác vụ (log chỉ giữ cho 40 tác vụ gần nhất)');
    return job;
  });

  // ------------------------------------------------------------ Tuỳ chọn
  app.get('/api/prefs', async () => getPrefs());
  app.put('/api/prefs', async (req) => updatePrefs((req.body ?? {}) as Partial<PanelPrefs>));

  // ------------------------------------------------------------ Cập nhật & phiên bản
  app.get('/api/update', async () => updates.getState());
  app.post('/api/update/check', async () => updates.check());
  app.get('/api/update/remote', async () => updates.remoteVersions());
  app.get('/api/update/packages', async () => updates.listPackages());
  app.post('/api/update/download', async (req) => {
    const ref = String((req.body as { ref?: string } | undefined)?.ref ?? '').trim();
    if (!ref) throw badRequest('Thiếu phiên bản cần tải');
    return updates.download(ref);
  });
  app.delete('/api/update/packages/:id', async (req) => {
    await updates.removePackage((req.params as { id: string }).id);
    return { ok: true };
  });
  app.post('/api/update/packages/:id/install', async (req) => updates.install((req.params as { id: string }).id));
  app.get('/api/update/log', async () => ({ log: await updates.installLog() }));

  // ------------------------------------------------------------ Tác vụ định kỳ
  app.get('/api/tasks', async () => tasks.list());
  app.post('/api/tasks', async (req) => tasks.save((req.body ?? {}) as Record<string, never>));
  app.put('/api/tasks/:id', async (req) => tasks.save({ ...((req.body ?? {}) as Record<string, never>), id: (req.params as { id: string }).id }));
  app.post('/api/tasks/:id/toggle', async (req) =>
    tasks.setEnabled((req.params as { id: string }).id, Boolean((req.body as { enabled?: boolean } | undefined)?.enabled)),
  );
  app.post('/api/tasks/:id/run', async (req) => tasks.runNow((req.params as { id: string }).id));
  app.get('/api/tasks/:id/log', async (req) => ({ log: await tasks.log((req.params as { id: string }).id) }));
  app.delete('/api/tasks/:id', async (req) => {
    await tasks.remove((req.params as { id: string }).id);
    return { ok: true };
  });

  // ------------------------------------------------------------ Nguồn
  app.post('/api/system/power', async (req) => {
    const action = (req.body as { action?: PowerAction } | undefined)?.action;
    if (action !== 'reboot' && action !== 'shutdown') throw badRequest('Thao tác nguồn không hợp lệ');
    await ctx.adapter.power(action);
    return { ok: true };
  });

  // ------------------------------------------------------------ Mạng
  app.get('/api/system/network', async () => {
    if (!publicIpCache || Date.now() - publicIpCache.at > 10 * 60_000) {
      const [ipv4, ipv6] = await Promise.all([lookup('https://api.ipify.org'), lookup('https://api64.ipify.org')]);
      publicIpCache = { at: Date.now(), ipv4, ipv6: ipv6 && ipv6.includes(':') ? ipv6 : null };
    }
    const interfaces = Object.entries(os.networkInterfaces()).map(([name, addrs]) => ({
      name,
      mac: addrs?.find((a) => a.mac && a.mac !== '00:00:00:00:00:00')?.mac ?? null,
      internal: Boolean(addrs?.every((a) => a.internal)),
      addresses: (addrs ?? []).map((a) => ({ address: a.address, family: a.family, cidr: a.cidr })),
    }));
    return { publicIpv4: publicIpCache.ipv4, publicIpv6: publicIpCache.ipv6, hostname: os.hostname(), interfaces };
  });
}
