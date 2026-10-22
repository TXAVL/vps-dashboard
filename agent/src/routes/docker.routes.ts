// ZenPanel - API Docker, App Store và Databases
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/context.js';
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
    const image = (req.body as { image?: string } | undefined)?.image;
    if (!image) throw badRequest('Thiếu tên image');
    await docker.pull(image);
    return { ok: true };
  });

  app.delete('/api/docker/images/:id', async (req) => {
    await docker.removeImage(decodeURIComponent((req.params as { id: string }).id));
    return { ok: true };
  });

  // ------------------------------------------------------------ App Store
  app.get('/api/apps', async () => apps.list());

  app.post('/api/apps/:id/install', async (req) => {
    await apps.install((req.params as { id: string }).id, (req.body ?? {}) as Record<string, unknown>);
    return { ok: true };
  });

  app.post('/api/apps/:id/:action', async (req) => {
    const { id, action } = req.params as { id: string; action: string };
    if (action === 'uninstall') {
      await apps.uninstall(id, Boolean((req.body as { removeData?: boolean } | undefined)?.removeData));
      return { ok: true };
    }
    if (!['start', 'stop', 'restart', 'update'].includes(action)) throw badRequest('Thao tác không hợp lệ');
    await apps.action(id, action as 'start' | 'stop' | 'restart' | 'update');
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
