// ZenPanel - API của panel: tác vụ nền (jobs), tuỳ chọn, cập nhật & phiên bản, tác vụ định kỳ, nguồn, mạng
import dns from 'node:dns/promises';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { PowerAction } from '../adapters/base.adapter.js';
import type { AppContext } from '../core/context.js';
import { clearCompletedJobs, deleteJob, getJob, listJobs } from '../core/jobs.js';
import { getPrefs, updatePrefs, type PanelPrefs } from '../core/prefs.js';
import { badRequest, HttpError } from '../core/validate.js';
import type { AiService } from '../services/ai.service.js';
import type { SpeedtestService } from '../services/speedtest.service.js';
import type { TaskService } from '../services/task.service.js';
import { listShellAliases, saveShellAlias } from '../services/terminal.service.js';
import type { UpdateService } from '../services/update.service.js';
import { nodeService } from '../services/nodejs.service.js';
import { systemToolsService } from '../services/system-tools.service.js';
import { serverNotesService } from '../services/notes.service.js';

let publicIpCache: { at: number; ipv4: string | null; ipv6: string | null; reverseDns: string | null } | null = null;

async function lookup(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? (await res.text()).trim() || null : null;
  } catch {
    return null;
  }
}

export async function panelRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: { updates: UpdateService; tasks: TaskService; ai: AiService; speedtest: SpeedtestService },
): Promise<void> {
  const { updates, tasks, ai, speedtest } = deps;

  // ------------------------------------------------------------ AI providers
  app.get('/api/ai/providers', async () => ai.list());
  app.put('/api/ai/providers/:id', async (req) => {
    await ai.save((req.params as { id: string }).id, (req.body as { key?: string } | undefined)?.key);
    return ai.list();
  });
  app.post('/api/ai/providers/:id/test', async (req) => ai.test((req.params as { id: string }).id));
  app.delete('/api/ai/providers/:id', async (req) => {
    ai.remove((req.params as { id: string }).id);
    return ai.list();
  });

  // ------------------------------------------------------------ Speedtest
  app.get('/api/speedtest', async () => ({ state: speedtest.getState(), history: speedtest.history() }));
  app.post('/api/speedtest', async () => speedtest.start());

  // ------------------------------------------------------------ Jobs
  app.get('/api/jobs', async () => listJobs());
  app.get('/api/jobs/:id', async (req) => {
    const job = getJob((req.params as { id: string }).id);
    if (!job) throw new HttpError(404, 'Không tìm thấy tác vụ (log chỉ giữ cho 40 tác vụ gần nhất)');
    return job;
  });
  app.delete('/api/jobs', async () => {
    clearCompletedJobs();
    return listJobs();
  });
  app.delete('/api/jobs/:id', async (req) => {
    const ok = deleteJob((req.params as { id: string }).id);
    if (!ok) throw badRequest('Không thể xóa tác vụ (tác vụ không tồn tại hoặc đang chạy)');
    return { ok: true };
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
  app.get('/api/update/status', async () => {
    let tunnel = ctx.tunnel?.getState() ?? null;
    // Nếu tunnel đang khởi động và chưa có URL, đợi nhanh tối đa 3.5 giây để bắt kịp URL mới
    if (ctx.tunnel && (!tunnel?.url) && (tunnel?.status === 'idle' || tunnel?.status === 'starting')) {
      for (let w = 0; w < 7; w++) {
        await new Promise((r) => setTimeout(r, 500));
        tunnel = ctx.tunnel.getState();
        if (tunnel.url) break;
      }
    }
    return {
      version: updates.getState().current,
      tunnelUrl: tunnel?.url ?? null,
      tunnelStatus: tunnel?.status ?? 'disabled',
      startedAt: ctx.startedAt,
    };
  });

  // ------------------------------------------------------------ Node.js Runtime & Bảo mật
  app.get('/api/system/node', async (req) => {
    const force = Boolean((req.query as { refresh?: string })?.refresh);
    return nodeService.getStatus(force);
  });
  app.post('/api/system/node/check', async () => nodeService.getStatus(true));
  app.post('/api/system/node/upgrade', async (req) => {
    const target = (req.body as { version?: string } | undefined)?.version;
    return nodeService.upgrade(target);
  });

  // ------------------------------------------------------------ Công cụ hệ thống (Node, npm, Git, Cloudflared, Docker)
  app.get('/api/system/tools', async (req) => {
    const force = Boolean((req.query as { refresh?: string })?.refresh);
    return systemToolsService.getStatus(force);
  });
  app.post('/api/system/tools/check', async () => systemToolsService.getStatus(true));
  app.post('/api/system/tools/:id/upgrade', async (req) => {
    const id = (req.params as { id: string }).id;
    return systemToolsService.upgradeTool(id);
  });

  // ------------------------------------------------------------ Ghi chú máy chủ (Server Sticky Notepad)
  app.get('/api/system/notes', async () => serverNotesService.get());
  app.put('/api/system/notes', async (req) => {
    const body = (req.body ?? {}) as { content?: string };
    return serverNotesService.save(body.content ?? '');
  });

  // ------------------------------------------------------------ Tác vụ định kỳ
  app.get('/api/tasks', async () => tasks.list());
  app.post('/api/tasks', async (req) => tasks.save((req.body ?? {}) as Record<string, never>));
  app.put('/api/tasks/:id', async (req) => tasks.save({ ...((req.body ?? {}) as Record<string, never>), id: (req.params as { id: string }).id }));
  app.post('/api/tasks/:id/toggle', async (req) =>
    tasks.setEnabled((req.params as { id: string }).id, Boolean((req.body as { enabled?: boolean } | undefined)?.enabled)),
  );
  app.post('/api/tasks/:id/run', async (req) => tasks.runNow((req.params as { id: string }).id));
  app.get('/api/tasks/:id/log', async (req) => ({ log: await tasks.log((req.params as { id: string }).id) }));
  app.delete('/api/tasks/:id/log', async (req) => {
    await tasks.clearLog((req.params as { id: string }).id);
    return { ok: true };
  });
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
      // Reverse DNS: nhiều nhà cung cấp VPS gán sẵn hostname (vd vps123.provider.net) cho IP
      const reverseDns = ipv4 ? ((await dns.reverse(ipv4).catch(() => []))[0] ?? null) : null;
      publicIpCache = { at: Date.now(), ipv4, ipv6: ipv6 && ipv6.includes(':') ? ipv6 : null, reverseDns };
    }
    const interfaces = Object.entries(os.networkInterfaces()).map(([name, addrs]) => ({
      name,
      mac: addrs?.find((a) => a.mac && a.mac !== '00:00:00:00:00:00')?.mac ?? null,
      internal: Boolean(addrs?.every((a) => a.internal)),
      addresses: (addrs ?? []).map((a) => ({ address: a.address, family: a.family, cidr: a.cidr })),
    }));
    return { publicIpv4: publicIpCache.ipv4, publicIpv6: publicIpCache.ipv6, reverseDns: publicIpCache.reverseDns, hostname: os.hostname(), interfaces };
  });

  // ------------------------------------------------------------ Shell Aliases (.bashrc / Profile)
  app.get('/api/terminal/aliases', async () => ({ aliases: await listShellAliases() }));
  app.post('/api/terminal/aliases', async (req) => {
    const body = (req.body ?? {}) as { name?: string; command?: string };
    return saveShellAlias(String(body.name ?? ''), String(body.command ?? ''));
  });
}
