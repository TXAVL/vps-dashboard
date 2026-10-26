// ZenPanel - Nhật ký thao tác trên panel (audit): ai, lúc nào, từ IP nào, làm gì (mọi request ghi dữ liệu)
import type { FastifyInstance } from 'fastify';
import { decodeToken, tokenFromRequest } from '../core/auth.js';
import { readJson, writeJson } from '../core/store.js';

const FILE = 'audit.json';
const MAX = 3000;

export interface AuditEntry {
  at: string;
  user: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  action: string;
  ms: number;
}

/** Tên thao tác dễ đọc cho các đường dẫn hay gặp */
const LABELS: [RegExp, string][] = [
  [/^\/api\/services\/[^/]+\/(\w+)/, 'Dịch vụ: $1'],
  [/^\/api\/firewall\/rules/, 'Tường lửa: luật'],
  [/^\/api\/firewall/, 'Tường lửa'],
  [/^\/api\/processes\/\d+\/kill/, 'Dừng tiến trình'],
  [/^\/api\/files/, 'File Manager'],
  [/^\/api\/apps\/([^/]+)\/(\w+)/, 'App Store: $2 $1'],
  [/^\/api\/docker/, 'Docker'],
  [/^\/api\/databases/, 'Database'],
  [/^\/api\/sites/, 'Website'],
  [/^\/api\/backups/, 'Sao lưu'],
  [/^\/api\/update/, 'Cập nhật panel'],
  [/^\/api\/prefs/, 'Cài đặt panel'],
  [/^\/api\/tasks/, 'Cron job'],
  [/^\/api\/procs/, 'Ứng dụng nền'],
  [/^\/api\/ai/, 'AI Gateway'],
  [/^\/api\/system\/clean|\/api\/system\/memory/, 'Dọn dẹp / RAM'],
  [/^\/api\/access\/ssh/, 'SSH'],
  [/^\/api\/access\/fail2ban/, 'Fail2ban'],
  [/^\/api\/access\/host/, 'Hostname / DNS / múi giờ'],
  [/^\/api\/alerts/, 'Cảnh báo'],
  [/^\/api\/security/, 'Quét mã độc'],
  [/^\/api\/system\/power/, 'Nguồn máy chủ'],
];

function label(method: string, url: string): string {
  const path = url.split('?')[0];
  for (const [re, text] of LABELS) {
    const m = re.exec(path);
    if (m) return text.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
  }
  return `${method} ${path}`;
}

/** Không bao giờ ghi đường dẫn mang bí mật */
const SKIP = /^\/api\/(auth|metrics|jobs|logs|speedtest\/?$)|\/download|\/log$/;

export class AuditService {
  private buffer: AuditEntry[] | null = null;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  private entries(): AuditEntry[] {
    this.buffer ??= readJson<AuditEntry[]>(FILE, []);
    return this.buffer;
  }

  /** Gắn hook ghi nhật ký cho các request thay đổi dữ liệu trong scope đã đăng nhập */
  attach(app: FastifyInstance): void {
    app.addHook('onResponse', async (req, reply) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
      const path = req.url.split('?')[0];
      if (SKIP.test(path) || !path.startsWith('/api/')) return;
      const user = decodeToken(tokenFromRequest(req))?.u ?? 'admin';
      this.entries().unshift({
        at: new Date().toISOString(),
        user,
        ip: req.ip,
        method: req.method,
        path,
        status: reply.statusCode,
        action: label(req.method, req.url),
        ms: Math.round(reply.elapsedTime),
      });
      if (this.entries().length > MAX) this.entries().length = MAX;
      this.dirty = true;
    });
    // Ghi đĩa gộp mỗi 5 giây thay vì mỗi request
    this.timer = setInterval(() => this.flush(), 5000);
  }

  flush(): void {
    if (this.dirty && this.buffer) {
      writeJson(FILE, this.buffer);
      this.dirty = false;
    }
  }

  list(opts: { q?: string; failedOnly?: boolean; limit?: number }): { total: number; items: AuditEntry[] } {
    const q = opts.q?.toLowerCase();
    const items = this.entries().filter((e) => (!opts.failedOnly || e.status >= 400) && (!q || `${e.action} ${e.path} ${e.ip} ${e.user}`.toLowerCase().includes(q)));
    return { total: items.length, items: items.slice(0, Math.min(1000, opts.limit ?? 200)) };
  }

  clear(): void {
    this.buffer = [];
    this.dirty = true;
    this.flush();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
