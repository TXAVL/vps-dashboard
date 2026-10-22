// ZenPanel - API Docker, App Store và Databases
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/context.js';
import { startJob } from '../core/jobs.js';
import { badRequest } from '../core/validate.js';
import type { AppStoreService } from '../services/appstore.service.js';
import type { DatabaseService } from '../services/database.service.js';
import type { ContainerAction, DockerService } from '../services/docker.service.js';

export interface DockerDeps {
  docker: DockerService;
  apps: AppStoreService;
  databases: DatabaseService;
}

export async function dockerRoutes(app: FastifyInstance, ctx: AppContext, deps: DockerDeps): Promise<void> {
  const { docker, apps, databases } = deps;

  // ------------------------------------------------------------ Docker
  app.get('/api/docker/info', async () => docker.info());
  app.get('/api/docker/containers', async () => docker.containers());
  app.get('/api/docker/stats', async () => docker.stats());
  app.get('/api/docker/images', async () => docker.images());
  app.get('/api/docker/volumes', async () => docker.volumes());
  app.get('/api/docker/networks', async () => docker.networks());

  app.post('/api/docker/containers/:id/:action', async (req) => {
    const { id, action } = req.params as { id: string; action: ContainerAction };
    await docker.containerAction(id, action);
    return { ok: true };
  });

  app.get('/api/docker/containers/:id/logs', async (req) => ({ logs: await docker.logs((req.params as { id: string }).id) }));

  app.post('/api/docker/containers', async (req) => {
    const body = (req.body ?? {}) as { image?: string; name?: string; ports?: string[]; env?: string[]; volumes?: string[]; restart?: string };
    if (!body.image) throw badRequest('Thiếu tên image');
    return { id: await docker.run({ ...body, image: body.image }) };
  });

  app.post('/api/docker/images/pull', async (req) => {
    const image = (req.body as { image?: string } | undefined)?.image?.trim();
    if (!image) throw badRequest('Thiếu tên image');
    return startJob(`Pull image ${image}`, 'docker', () => docker.pull(image));
  });

  app.delete('/api/docker/images/:id', async (req) => {
    await docker.removeImage(decodeURIComponent((req.params as { id: string }).id));
    return { ok: true };
  });

  // ------------------------------------------------------------ App Store
  app.get('/api/apps', async () => apps.list());

  // Cài / cập nhật / gỡ chạy dưới dạng job để dashboard xem log realtime
  app.post('/api/apps/:id/install', async (req) => {
    const id = (req.params as { id: string }).id;
    const params = apps.prepareInstall(id, (req.body ?? {}) as Record<string, unknown>);
    return startJob(`Cài đặt ${id}`, 'app', () => apps.install(id, params));
  });

  app.post('/api/apps/:id/:action', async (req) => {
    const { id, action } = req.params as { id: string; action: string };
    if (action === 'uninstall') {
      const removeData = Boolean((req.body as { removeData?: boolean } | undefined)?.removeData);
      return startJob(`Gỡ cài đặt ${id}`, 'app', () => apps.uninstall(id, removeData));
    }
    if (!['start', 'stop', 'restart', 'update'].includes(action)) throw badRequest('Thao tác không hợp lệ');
    if (action === 'update') return startJob(`Cập nhật ${id}`, 'app', () => apps.action(id, 'update'));
    await apps.action(id, action as 'start' | 'stop' | 'restart');
    return { ok: true };
  });

  app.get('/api/apps/:id/compose', async (req) => ({ path: await apps.composeFile((req.params as { id: string }).id) }));

  // ------------------------------------------------------------ Databases
  app.get('/api/databases', async () => {
    const [servers, services] = await Promise.all([databases.servers(), ctx.adapter.listServices().catch(() => [])]);
    return { servers, native: databases.detectNative(services) };
  });

  app.get('/api/databases/:appId', async (req) => databases.listDatabases((req.params as { appId: string }).appId));

  app.post('/api/databases/:appId', async (req) =>
    databases.createDatabase((req.params as { appId: string }).appId, (req.body ?? {}) as { name?: string; username?: string; password?: string }),
  );

  app.delete('/api/databases/:appId/:name', async (req) => {
    const { appId, name } = req.params as { appId: string; name: string };
    await databases.dropDatabase(appId, name);
    return { ok: true };
  });
}
