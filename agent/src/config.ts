// ZenPanel Agent - cấu hình đọc từ biến môi trường
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(raw.toLowerCase());
}

// agent/src/config.ts hoặc agent/dist/config.js -> thư mục gốc repo là ../..
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const config = {
  host: process.env.ZENPANEL_HOST ?? '0.0.0.0',
  port: Number(process.env.ZENPANEL_PORT ?? 2083),
  // Mỗi lần chạy tự mở Cloudflare Quick Tunnel để có domain *.trycloudflare.com
  tunnelEnabled: envFlag('ZENPANEL_TUNNEL', true),
  // Đường dẫn cloudflared tùy chỉnh (bỏ trống = tự tìm trong PATH hoặc tự tải về)
  cloudflaredPath: process.env.ZENPANEL_CLOUDFLARED || undefined,
  // Nơi lưu cấu hình, mật khẩu, website, ứng dụng...
  dataDir: process.env.ZENPANEL_DATA_DIR || path.join(os.homedir(), '.zenpanel'),
  // Thư mục build của dashboard (Vite) được agent phục vụ trực tiếp
  dashboardDir: process.env.ZENPANEL_DASHBOARD_DIR || path.join(repoRoot, 'dashboard', 'dist'),
  // Đặt sẵn mật khẩu admin (chỉ áp dụng khi khởi tạo lần đầu)
  initialPassword: process.env.ZENPANEL_PASSWORD || undefined,
};
