// ZenPanel - Driver web server (Nginx / Caddy / IIS) do OS adapter cung cấp

export type SiteType = 'static' | 'php' | 'proxy';

export interface SiteConfig {
  id: string;
  domain: string;
  aliases: string[];
  root: string;
  type: SiteType;
  proxyPort: number | null;
  ssl: boolean;
  forceHttps: boolean;
  enabled: boolean;
  webServer: string;
  accessLog: string;
  errorLog: string;
  /** Giới hạn dung lượng (MB) do ZenPanel theo dõi, 0 = không giới hạn */
  quotaMB: number;
  createdAt: string;
  /** Lỗi gần nhất khi áp dụng cấu hình */
  lastError: string | null;
}

export interface WebServerDriver {
  readonly kind: string;
  readonly label: string;
  readonly supports: { php: boolean; proxy: boolean; ssl: boolean };
  /** Đường dẫn binary nếu đã cài, null nếu chưa */
  detect(): Promise<string | null>;
  /** Ghi cấu hình site và reload web server */
  apply(site: SiteConfig): Promise<void>;
  remove(site: SiteConfig): Promise<void>;
  /** Cấp SSL Let's Encrypt (nếu driver không tự động) */
  issueSSL?(site: SiteConfig, email: string): Promise<void>;
  /** Đảm bảo web server đang chạy (gọi khi agent khởi động) */
  ensureRunning?(): Promise<void>;
}
