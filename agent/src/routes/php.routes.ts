// ZenPanel - API Quản trị máy chủ PHP & PHP-FPM
import type { FastifyInstance } from 'fastify';
import { startJob } from '../core/jobs.js';
import type { PhpConfigUpdate, PhpService } from '../services/php.service.js';

export async function phpRoutes(app: FastifyInstance, deps: { php: PhpService }): Promise<void> {
  const { php } = deps;

  // Lấy trạng thái PHP & PHP-FPM
  app.get('/api/php/status', async () => php.getStatus());

  // Cài đặt PHP & PHP-FPM (Chạy nền dưới dạng Job)
  app.post('/api/php/install', async (req) => {
    const body = (req.body ?? {}) as { version?: string };
    const title = body.version ? `Cài đặt PHP ${body.version} & PHP-FPM` : 'Cài đặt PHP & PHP-FPM';
    return startJob(title, 'php', () => php.installPhp(body.version));
  });

  // Khởi động lại dịch vụ PHP-FPM
  app.post('/api/php/restart', async () => php.restartFpm());

  // Cập nhật thông số php.ini
  app.put('/api/php/config', async (req) => {
    const body = (req.body ?? {}) as PhpConfigUpdate;
    return php.updateConfig(body);
  });
}
