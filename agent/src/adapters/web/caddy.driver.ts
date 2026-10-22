// ZenPanel - Driver Caddy (đa nền tảng, tự động HTTPS). Cấu hình nằm trong ~/.zenpanel/caddy
import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter } from '../base.adapter.js';
import { resolveTool } from '../../core/download.js';
import { dataPath, ensureDir } from '../../core/store.js';
import type { SiteConfig, WebServerDriver } from './types.js';

const caddyDir = () => dataPath('caddy');
const caddyfile = () => path.join(caddyDir(), 'Caddyfile');
const sitesDir = () => path.join(caddyDir(), 'sites');

async function findPhpFpmSocket(): Promise<string | null> {
  try {
    const entries = await readdir('/run/php');
    const sock = entries.find((name) => name.endsWith('.sock'));
    return sock ? `unix//run/php/${sock}` : null;
  } catch {
    return null;
  }
}

export class CaddyDriver implements WebServerDriver {
  readonly kind = 'caddy';
  readonly label = 'Caddy';
  readonly supports = { php: true, proxy: true, ssl: true };

  constructor(private readonly adapter: OSAdapter) {}

  detect(): Promise<string | null> {
    return resolveTool(this.adapter, 'caddy');
  }

  private async binary(): Promise<string> {
    const bin = await this.detect();
    if (!bin) throw new Error('Chưa cài Caddy. Vào Websites → "Cài web server" để tự tải về.');
    return bin;
  }

  private async writeMainConfig(): Promise<void> {
    ensureDir(sitesDir());
    await writeFile(
      caddyfile(),
      ['# Managed by ZenPanel', '{', '\tadmin localhost:2019', '}', '', 'import sites/*.caddy', ''].join('\n'),
    );
    // File rỗng để lệnh import luôn khớp ít nhất 1 file
    await writeFile(path.join(sitesDir(), '_zenpanel.caddy'), '# placeholder\n');
  }

  private async siteBlock(site: SiteConfig): Promise<string> {
    const hosts = [site.domain, ...site.aliases].map((host) => (site.ssl ? host : `http://${host}`)).join(', ');
    const lines = [`# Managed by ZenPanel - ${site.domain}`, `${hosts} {`];
    lines.push(`\tlog {`, `\t\toutput file "${site.accessLog.replace(/\\/g, '/')}" {`, '\t\t\troll_size 20mb', '\t\t}', '\t\tformat json', '\t}');
    lines.push('\tencode gzip');
    if (site.type === 'proxy') {
      lines.push(`\treverse_proxy 127.0.0.1:${site.proxyPort}`);
    } else {
      lines.push(`\troot * "${site.root.replace(/\\/g, '/')}"`);
      if (site.type === 'php') {
        const upstream = this.adapter.family === 'linux' ? ((await findPhpFpmSocket()) ?? '127.0.0.1:9000') : '127.0.0.1:9000';
        lines.push(`\tphp_fastcgi ${upstream}`);
      }
      lines.push('\tfile_server');
    }
    lines.push('}', '');
    return lines.join('\n');
  }

  private siteFile(site: SiteConfig): string {
    return path.join(sitesDir(), `${site.domain}.caddy`);
  }

  private async reload(): Promise<void> {
    const bin = await this.binary();
    const args = ['--config', caddyfile(), '--adapter', 'caddyfile'];
    const reload = await this.adapter.exec(bin, ['reload', ...args], { timeout: 60_000 });
    if (reload.code === 0) return;
    // Caddy chưa chạy -> khởi động nền
    await this.adapter.execOk(bin, ['start', ...args], { timeout: 60_000, cwd: caddyDir() });
  }

  async ensureRunning(): Promise<void> {
    if (!(await this.detect())) return;
    await this.writeMainConfig();
    await this.reload();
  }

  async apply(site: SiteConfig): Promise<void> {
    await this.writeMainConfig();
    if (site.enabled) await writeFile(this.siteFile(site), await this.siteBlock(site));
    else await rm(this.siteFile(site), { force: true });
    await this.reload();
  }

  async remove(site: SiteConfig): Promise<void> {
    await rm(this.siteFile(site), { force: true });
    await this.reload();
  }
}
