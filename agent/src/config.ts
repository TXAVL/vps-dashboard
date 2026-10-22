// ZenPanel Agent - cấu hình đọc từ biến môi trường
function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(raw.toLowerCase());
}

export const config = {
  host: process.env.ZENPANEL_HOST ?? '0.0.0.0',
  port: Number(process.env.ZENPANEL_PORT ?? 2083),
  // Mỗi lần chạy tự mở Cloudflare Quick Tunnel để có domain *.trycloudflare.com
  tunnelEnabled: envFlag('ZENPANEL_TUNNEL', true),
  // Đường dẫn cloudflared tùy chỉnh (bỏ trống = tự tìm trong PATH hoặc tự tải về)
  cloudflaredPath: process.env.ZENPANEL_CLOUDFLARED || undefined,
};
