// ZenPanel - API Docker, App Store và Databases
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/context.js';
import { startJob } from '../core/jobs.js';
import { badRequest } from '../core/validate.js';
import type { AppStoreService } from '../services/appstore.service.js';
import type { DatabaseService } from '../services/database.service.js';
import type { ContainerAction, DockerService } from '../services/docker.service.js';
import type { StackService } from '../services/stack.service.js';
import type { DockerHubService } from '../services/dockerhub.service.js';

export interface DockerDeps {
  docker: DockerService;
  stacks: StackService;
  hub: DockerHubService;
  apps: AppStoreService;
  databases: DatabaseService;
}

export async function dockerRoutes(app: FastifyInstance, ctx: AppContext, deps: DockerDeps): Promise<void> {
  const { docker, apps, databases, stacks, hub } = deps;

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

  // ------------------------------------------------------------ Kho image Docker Hub
  app.get('/api/docker/hub/featured', async () => hub.featured());
  app.get('/api/docker/hub/search', async (req) => {
    const q = req.query as { q?: string; page?: string };
    return hub.search(String(q.q ?? ''), Number(q.page) || 1);
  });
  app.get('/api/docker/hub/tags', async (req) => hub.tags(String((req.query as { name?: string }).name ?? '')));

  // ------------------------------------------------------------ App Store
  app.get('/api/apps', async () => apps.list());

  // Cài / cập nhật / gỡ chạy dưới dạng job để dashboard xem log realtime
  app.post('/api/apps/:id/install', async (req) => {
    const id = (req.params as { id: string }).id;
    const params = await apps.prepareInstall(id, (req.body ?? {}) as Record<string, unknown>);
    return startJob(`Cài đặt ${id}`, 'app', () => apps.install(id, params));
  });

  app.post('/api/apps/:id/:action', async (req) => {
    const { id, action } = req.params as { id: string; action: string };
    if (action === 'uninstall') {
      const removeData = Boolean((req.body as { removeData?: boolean } | undefined)?.removeData);
      return startJob(`Gỡ cài đặt ${id}`, 'app', () => apps.uninstall(id, removeData));
    }
    if (!['start', 'stop', 'restart', 'update'].includes(action)) throw badRequest('Thao tác không hợp lệ');
    if (action === 'update' || action === 'start' || action === 'restart') {
      const actionName = action === 'start' ? 'Khởi động' : action === 'restart' ? 'Khởi động lại' : 'Cập nhật';
      return startJob(`${actionName} ${id}`, 'app', () => apps.action(id, action as any));
    }
    await apps.action(id, action as 'start' | 'stop' | 'restart');
    return { ok: true };
  });

  app.get('/api/apps/:id/compose', async (req) => ({ path: await apps.composeFile((req.params as { id: string }).id) }));
  app.get('/api/apps/:id/config', async (req) => apps.config((req.params as { id: string }).id));
  app.post('/api/apps/:id/reconfigure', async (req) => {
    const id = (req.params as { id: string }).id;
    const params = apps.prepareReconfigure(id, (req.body ?? {}) as Record<string, unknown>);
    return startJob(`Cấu hình lại ${id}`, 'app', () => apps.reconfigure(id, params));
  });
  app.post('/api/apps/:id/public-link', async (req) =>
    apps.setPublicLink((req.params as { id: string }).id, Boolean((req.body as { enabled?: boolean } | undefined)?.enabled)),
  );

  // ------------------------------------------------------------ Custom Apps Studio
  app.get('/api/apps/custom', async () => apps.getCustomApps());
  app.post('/api/apps/custom', async (req) => apps.createCustomApp((req.body ?? {}) as any));
  app.put('/api/apps/custom/:id', async (req) => apps.updateCustomApp((req.params as { id: string }).id, (req.body ?? {}) as any));
  app.delete('/api/apps/custom/:id', async (req) => apps.deleteCustomApp((req.params as { id: string }).id));

  // ------------------------------------------------------------ Kho Repos Sản Phẩm (App Store Repositories)
  app.get('/api/apps/repos', async () => apps.getRepos());
  app.post('/api/apps/repos', async (req) => apps.addRepo((req.body ?? {}) as any));
  app.post('/api/apps/repos/:id/sync', async (req) => apps.syncRepo((req.params as { id: string }).id));
  app.delete('/api/apps/repos/:id', async (req) => {
    apps.deleteRepo((req.params as { id: string }).id);
    return { ok: true };
  });

  // ------------------------------------------------------------ Docker Compose stacks
  app.get('/api/docker/stacks', async () => stacks.list());
  app.get('/api/docker/stacks/:name', async (req) => stacks.read((req.params as { name: string }).name));
  app.post('/api/docker/stacks', async (req) => {
    const body = (req.body ?? {}) as { name?: string; yaml?: string };
    const name = String(body.name ?? '').trim();
    await stacks.save(name, body.yaml, true);
    return startJob(`Tạo stack ${name}`, 'docker', () => stacks.action(name, 'up'));
  });
  app.put('/api/docker/stacks/:name', async (req) => {
    const name = (req.params as { name: string }).name;
    await stacks.save(name, (req.body as { yaml?: string } | undefined)?.yaml, false);
    return { ok: true };
  });
  app.post('/api/docker/stacks/:name/:action', async (req) => {
    const { name, action } = req.params as { name: string; action: string };
    if (!['up', 'down', 'restart', 'pull'].includes(action)) throw badRequest('Thao tác không hợp lệ');
    return startJob(`Stack ${name}: ${action}`, 'docker', () => stacks.action(name, action as 'up' | 'down' | 'restart' | 'pull'));
  });
  app.delete('/api/docker/stacks/:name', async (req) => {
    const name = (req.params as { name: string }).name;
    const removeVolumes = (req.query as { volumes?: string }).volumes === 'true';
    return startJob(`Xoá stack ${name}`, 'docker', () => stacks.remove(name, removeVolumes));
  });

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
