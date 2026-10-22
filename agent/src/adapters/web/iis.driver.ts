// ZenPanel - Driver IIS (Windows Server) qua appcmd.exe
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OSAdapter } from '../base.adapter.js';
import type { SiteConfig, WebServerDriver } from './types.js';

const appcmd = path.join(process.env.windir ?? 'C:\\Windows', 'System32', 'inetsrv', 'appcmd.exe');

export class IISDriver implements WebServerDriver {
  readonly kind = 'iis';
  readonly label = 'IIS';
  readonly supports = { php: false, proxy: false, ssl: false };

  constructor(private readonly adapter: OSAdapter) {}

  async detect(): Promise<string | null> {
    return existsSync(appcmd) ? appcmd : null;
  }

  private siteName(site: SiteConfig): string {
    return `zenpanel-${site.domain}`;
  }

  async apply(site: SiteConfig): Promise<void> {
    if (site.type !== 'static') throw new Error('IIS trong ZenPanel chỉ hỗ trợ site tĩnh. Dùng Caddy cho PHP/Reverse Proxy.');
    await this.adapter.exec(appcmd, ['delete', 'site', `/site.name:${this.siteName(site)}`]);
    if (!site.enabled) return;
    const bindings = [site.domain, ...site.aliases].map((host) => `http/*:80:${host}`).join(',');
    await this.adapter.execOk(appcmd, [
      'add',
      'site',
      `/name:${this.siteName(site)}`,
      `/bindings:${bindings}`,
      `/physicalPath:${site.root}`,
    ]);
    await this.adapter.exec(appcmd, ['start', 'site', `/site.name:${this.siteName(site)}`]);
  }

  async remove(site: SiteConfig): Promise<void> {
    await this.adapter.exec(appcmd, ['delete', 'site', `/site.name:${this.siteName(site)}`]);
  }
}
