// ZenPanel Agent - API Server (Fastify)
import Fastify from 'fastify';
import { config } from './config.js';
import { detectAdapter } from './core/detector.js';
import { printBanner, printTunnelChanged, printTunnelWarning } from './core/banner.js';
import { TunnelService } from './services/tunnel.service.js';

async function main() {
  const adapter = detectAdapter();
  const osInfo = await adapter.getInfo();
  const app = Fastify({ logger: { level: 'warn' } });

  const tunnel = config.tunnelEnabled
    ? new TunnelService(adapter, `http://127.0.0.1:${config.port}`, config.cloudflaredPath)
    : null;

  app.get('/api/health', async () => ({ status: 'ok', name: 'ZenPanel' }));
  app.get('/api/system/info', async () => ({
    os: osInfo,
    tunnel: tunnel?.getState() ?? { status: 'stopped', url: null, error: null },
  }));

  await app.listen({ host: config.host, port: config.port });

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

  printBanner({ osInfo, host: config.host, port: config.port, publicUrl, tunnelNote });

  const shutdown = async () => {
    tunnel?.stop();
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
