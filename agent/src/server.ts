// ZenPanel Agent - API Server (Fastify) + phục vụ Dashboard
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config.js';
import { ensureAdminAccount, requireAuth } from './core/auth.js';
import { printBanner, printTunnelChanged, printTunnelWarning } from './core/banner.js';
import type { AppContext } from './core/context.js';
import { detectAdapter } from './core/detector.js';
import { CommandError } from './core/exec.js';
import { MetricsCollector } from './core/metrics.js';
import { HttpError } from './core/validate.js';
import { authRoutes } from './routes/auth.routes.js';
import { dockerRoutes } from './routes/docker.routes.js';
import { fileDownloadRoute, fileRoutes } from './routes/files.routes.js';
import { panelRoutes } from './routes/panel.routes.js';
import { siteRoutes } from './routes/sites.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { AppStoreService } from './services/appstore.service.js';
import { CloudflareService } from './services/cloudflare.service.js';
import { DatabaseService } from './services/database.service.js';
import { DockerService } from './services/docker.service.js';
import { SiteService } from './services/site.service.js';
import { TaskService } from './services/task.service.js';
import { UpdateService } from './services/update.service.js';
import { TunnelService } from './services/tunnel.service.js';
import { realtimeRoutes } from './ws/realtime.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

async function main() {
  const credentials = ensureAdminAccount();
  const adapter = detectAdapter();
  const osInfo = await adapter.getInfo();
  const metrics = new MetricsCollector(adapter);
  metrics.start();

  const tunnel = config.tunnelEnabled ? new TunnelService(adapter, `http://127.0.0.1:${config.port}`, config.cloudflaredPath) : null;
  const ctx: AppContext = { adapter, osInfo, metrics, tunnel, port: config.port, startedAt: Date.now(), version: pkg.version };

  const docker = new DockerService(adapter);
  const apps = new AppStoreService(docker);
  const databases = new DatabaseService(docker, apps);
  const sites = new SiteService(adapter);
  const tasks = new TaskService(adapter);
  const updates = new UpdateService(adapter, pkg.version);
  const cloudflare = new CloudflareService();

  const app = Fastify({ logger: { level: process.env.ZENPANEL_LOG_LEVEL ?? 'warn' }, bodyLimit: 10 * 1024 * 1024 });
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, { limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

  app.setErrorHandler((err: Error, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof CommandError) return reply.code(500).send({ error: err.message });
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return reply.code(404).send({ error: 'Không tìm thấy file hoặc thư mục' });
    if (code === 'EACCES' || code === 'EPERM') return reply.code(403).send({ error: 'Không đủ quyền. Hãy chạy ZenPanel Agent với quyền root/Administrator.' });
    if (code === 'EEXIST') return reply.code(409).send({ error: 'File hoặc thư mục đã tồn tại' });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: err.message });
  });

  app.get('/api/health', async () => ({ status: 'ok', name: 'ZenPanel', version: pkg.version }));
  await app.register(authRoutes);
  await app.register(fileDownloadRoute);

  // Mọi API còn lại bắt buộc đăng nhập
  await app.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);
    await systemRoutes(secured, ctx);
    await fileRoutes(secured, ctx);
    await dockerRoutes(secured, ctx, { docker, apps, databases });
    await siteRoutes(secured, ctx, { sites, cloudflare });
    await panelRoutes(secured, ctx, { updates, tasks });
  });
  // WebSocket tự xác thực bằng ?token= (trình duyệt không gửi được header Authorization)
  await app.register(async (wsScope) => realtimeRoutes(wsScope, ctx));

  if (existsSync(path.join(config.dashboardDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: config.dashboardDir,
      // File trong assets/ có hash trong tên nên cache lâu dài; index.html luôn lấy bản mới
      setHeaders: (res, filePath) => {
        res.header('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    // SPA: mọi đường dẫn không phải API trả về index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({ name: 'ZenPanel Agent', note: 'Chưa build dashboard. Chạy: cd dashboard && npm run build' }));
  }

  await app.listen({ host: config.host, port: config.port });
  void sites.bootstrap();
  updates.startAuto();

  let publicUrl: string | null = null;
  let tunnelNote: string | undefined;
  if (tunnel) {
    tunnel.on('download', (url: string) => console.log(`Đang tải cloudflared từ ${url} ...`));
    console.log('Đang mở Cloudflare Tunnel (trycloudflare.com) ...');
    try {
      publicUrl = await tunnel.start();
    } catch (err) {
      tunnelNote = `Lỗi: ${(err as Error).message}`;
    }

    // Báo lại trên console nếu tunnel rớt và được cấp domain mới
    tunnel.on('state', (state) => {
      if (state.status === 'online' && state.url && state.url !== publicUrl) {
        publicUrl = state.url;
        printTunnelChanged(state.url);
      } else if (state.status === 'error' && state.error) {
        printTunnelWarning(`${state.error}, đang thử kết nối lại...`);
      }
    });
  }

  printBanner({ osInfo, host: config.host, port: config.port, publicUrl, tunnelNote, credentials });

  const shutdown = async () => {
    tunnel?.stop();
    metrics.stop();
    updates.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('ZenPanel Agent không khởi động được:', err);
  process.exit(1);
});
