// ZenPanel - Quản lý Website / Domain với Website Isolation (mỗi site 1 thư mục, cấu hình, log riêng)
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import type { SiteConfig, SiteType, WebServerDriver } from '../adapters/web/types.js';
import { getSettings, saveSettings } from '../core/auth.js';
import { dataPath, JsonCollection } from '../core/store.js';
import { badRequest, HttpError, isDomain, isPort } from '../core/validate.js';
import { directoryUsage } from './file.service.js';

const sites = new JsonCollection<SiteConfig>('sites.json');
const LOG_TAIL_BYTES = 20 * 1024 * 1024;

export interface SiteStats {
  diskBytes: number;
  files: number;
  bandwidthBytes: number;
  requests: number;
}

export interface SiteInput {
  domain?: string;
  aliases?: string[];
  type?: SiteType;
  proxyPort?: number | null;
  root?: string;
  webServer?: string;
  quotaMB?: number;
  forceHttps?: boolean;
}

function welcomePage(domain: string): string {
  return `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${domain}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0F19;color:#F8FAFC;font-family:system-ui,sans-serif}
.card{padding:48px;border-radius:24px;background:#111827;border:1px solid #334155;text-align:center}
h1{margin:0 0 8px;font-size:28px}p{color:#94A3B8;margin:0}b{color:#10B981}</style></head>
<body><div class="card"><h1>🧘 ${domain}</h1><p>Website đã được tạo bởi <b>ZenPanel</b>. Tải mã nguồn của bạn lên để thay trang này.</p></div></body>
</html>
`;
}

/** Đọc phần cuối file log để tính băng thông (Nginx combined hoặc Caddy JSON) */
async function logTraffic(file: string): Promise<{ bytes: number; requests: number }> {
  if (!existsSync(file)) return { bytes: 0, requests: 0 };
  const info = await stat(file);
  const start = Math.max(0, info.size - LOG_TAIL_BYTES);
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(info.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    let bytes = 0;
    let requests = 0;
    for (const line of buffer.toString('utf8').split('\n')) {
      if (!line) continue;
      const nginx = /" \d{3} (\d+) /.exec(line);
      const caddy = nginx ? null : /"size":(\d+)/.exec(line);
      const size = Number(nginx?.[1] ?? caddy?.[1] ?? NaN);
      if (!Number.isNaN(size)) {
        bytes += size;
        requests += 1;
      }
    }
    return { bytes, requests };
  } finally {
    await handle.close();
  }
}

export class SiteService {
  constructor(private readonly adapter: OSAdapter) {}

  list(): SiteConfig[] {
    return sites.all().sort((a, b) => a.domain.localeCompare(b.domain));
  }

  get(id: string): SiteConfig {
    const site = sites.get(id);
    if (!site) throw new HttpError(404, 'Không tìm thấy website');
    return site;
  }

  private driver(kind: string): WebServerDriver {
    const driver = this.adapter.webServers().find((d) => d.kind === kind);
    if (!driver) throw badRequest(`Web server "${kind}" không khả dụng trên hệ điều hành này`);
    return driver;
  }

  /** Web server mặc định: cái đầu tiên đã được cài */
  async defaultWebServer(): Promise<string | null> {
    for (const driver of this.adapter.webServers()) if (await driver.detect()) return driver.kind;
    return null;
  }

  /** Áp dụng cấu hình, lưu lỗi vào site thay vì throw để site vẫn được tạo */
  private async applyConfig(site: SiteConfig): Promise<SiteConfig> {
    const driver = this.driver(site.webServer);
    let lastError: string | null = null;
    if (!(await driver.detect())) lastError = `Chưa cài ${driver.label}. Bấm "Cài web server" để cài đặt.`;
    else {
      try {
        if (site.type === 'php' && !driver.supports.php) throw new Error(`${driver.label} chưa hỗ trợ PHP trong ZenPanel`);
        if (site.type === 'proxy' && !driver.supports.proxy) throw new Error(`${driver.label} chưa hỗ trợ Reverse Proxy trong ZenPanel`);
        await driver.apply(site);
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    return sites.upsert({ ...site, lastError });
  }

  private validate(input: SiteInput, current?: SiteConfig): Pick<SiteConfig, 'aliases' | 'type' | 'proxyPort' | 'quotaMB' | 'forceHttps'> {
    const aliases = (input.aliases ?? current?.aliases ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
    for (const alias of aliases) if (!isDomain(alias)) throw badRequest(`Tên miền phụ "${alias}" không hợp lệ`);
    const type = input.type ?? current?.type ?? 'static';
    if (!['static', 'php', 'proxy'].includes(type)) throw badRequest('Loại website không hợp lệ');
    const proxyPort = type === 'proxy' ? Number(input.proxyPort ?? current?.proxyPort) : null;
    if (type === 'proxy' && !isPort(proxyPort)) throw badRequest('Cổng ứng dụng (reverse proxy) không hợp lệ');
    const quotaMB = Math.max(0, Number(input.quotaMB ?? current?.quotaMB ?? 0) || 0);
    return { aliases, type, proxyPort, quotaMB, forceHttps: input.forceHttps ?? current?.forceHttps ?? true };
  }

  async create(input: SiteInput): Promise<SiteConfig> {
    const domain = String(input.domain ?? '').trim().toLowerCase();
    if (!isDomain(domain)) throw badRequest('Tên miền không hợp lệ');
    if (sites.all().some((s) => s.domain === domain || s.aliases.includes(domain))) throw badRequest('Tên miền đã tồn tại');

    const webServer = input.webServer || (await this.defaultWebServer()) || this.adapter.webServers()[0].kind;
    this.driver(webServer);
    const root = input.root?.trim() ? path.resolve(input.root.trim()) : path.join(this.adapter.defaultWebRoot(), domain);
    const logDir = dataPath('logs', 'sites');
    await mkdir(logDir, { recursive: true });
    await mkdir(root, { recursive: true });
    if (!existsSync(path.join(root, 'index.html')) && !existsSync(path.join(root, 'index.php'))) {
      await writeFile(path.join(root, 'index.html'), welcomePage(domain));
    }

    const site: SiteConfig = {
      id: randomUUID(),
      domain,
      root,
      webServer,
      ssl: false,
      enabled: true,
      accessLog: path.join(logDir, `${domain}.access.log`),
      errorLog: path.join(logDir, `${domain}.error.log`),
      createdAt: new Date().toISOString(),
      lastError: null,
      ...this.validate(input),
    };
    return this.applyConfig(site);
  }

  async update(id: string, input: SiteInput & { enabled?: boolean }): Promise<SiteConfig> {
    const current = this.get(id);
    const next: SiteConfig = { ...current, ...this.validate(input, current), enabled: input.enabled ?? current.enabled };
    if (input.webServer && input.webServer !== current.webServer) {
      // Chuyển web server: gỡ cấu hình cũ trước
      await this.driver(current.webServer).remove(current).catch(() => undefined);
      next.webServer = this.driver(input.webServer).kind;
    }
    return this.applyConfig(next);
  }

  async remove(id: string, deleteFiles: boolean): Promise<void> {
    const site = this.get(id);
    await this.driver(site.webServer)
      .remove(site)
      .catch(() => undefined);
    sites.remove(id);
    if (deleteFiles && path.parse(site.root).root !== site.root) await rm(site.root, { recursive: true, force: true });
  }

  async enableSSL(id: string, email?: string): Promise<SiteConfig> {
    const site = this.get(id);
    const driver = this.driver(site.webServer);
    if (!driver.supports.ssl) throw badRequest(`${driver.label} chưa hỗ trợ SSL tự động. Chuyển site sang Caddy để có HTTPS miễn phí.`);
    if (driver.issueSSL) {
      const settings = getSettings()!;
      const acmeEmail = email?.trim() || settings.acmeEmail;
      if (!acmeEmail || !/^\S+@\S+\.\S+$/.test(acmeEmail)) throw badRequest('Cần email hợp lệ để đăng ký Let\'s Encrypt');
      if (acmeEmail !== settings.acmeEmail) saveSettings({ ...settings, acmeEmail });
      await driver.issueSSL(site, acmeEmail);
    }
    // Caddy tự xin chứng chỉ khi site.ssl = true
    return this.applyConfig({ ...site, ssl: true });
  }

  async disableSSL(id: string): Promise<SiteConfig> {
    return this.applyConfig({ ...this.get(id), ssl: false });
  }

  async stats(id: string): Promise<SiteStats> {
    const site = this.get(id);
    const [usage, traffic] = await Promise.all([directoryUsage(site.root), logTraffic(site.accessLog)]);
    return { diskBytes: usage.bytes, files: usage.files, bandwidthBytes: traffic.bytes, requests: traffic.requests };
  }

  async installWebServer(kind: string): Promise<void> {
    this.driver(kind);
    await this.adapter.installWebServer(kind);
    // Áp dụng lại các site đang chờ web server này
    for (const site of sites.all().filter((s) => s.webServer === kind)) await this.applyConfig(site);
  }

  /** Khi agent khởi động: bật lại các web server cần thiết (vd Caddy chạy nền) */
  async bootstrap(): Promise<void> {
    const kinds = new Set(sites.all().map((s) => s.webServer));
    for (const driver of this.adapter.webServers()) {
      if (kinds.has(driver.kind) && driver.ensureRunning) await driver.ensureRunning().catch(() => undefined);
    }
  }
}
