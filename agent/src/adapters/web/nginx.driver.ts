// ZenPanel - Driver Nginx (Linux). Mỗi site 1 file /etc/nginx/conf.d/zenpanel-<domain>.conf
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter } from '../base.adapter.js';
import type { SiteConfig, WebServerDriver } from './types.js';

function confDir(): string {
  return existsSync('/etc/nginx/conf.d') ? '/etc/nginx/conf.d' : '/etc/nginx/sites-enabled';
}

async function findPhpFpmSocket(): Promise<string> {
  try {
    const sock = (await readdir('/run/php')).find((name) => name.endsWith('.sock'));
    if (sock) return `unix:/run/php/${sock}`;
  } catch {
    // php-fpm chưa cài hoặc dùng TCP
  }
  return '127.0.0.1:9000';
}

const certDir = (domain: string) => `/etc/letsencrypt/live/${domain}`;

export class NginxDriver implements WebServerDriver {
  readonly kind = 'nginx';
  readonly label = 'Nginx';
  readonly supports = { php: true, proxy: true, ssl: true };

  constructor(private readonly adapter: OSAdapter) {}

  detect(): Promise<string | null> {
    return this.adapter.findExecutable('nginx');
  }

  private confFile(site: SiteConfig): string {
    return path.join(confDir(), `zenpanel-${site.domain}.conf`);
  }

  private async locations(site: SiteConfig): Promise<string[]> {
    const acme = ['    location ^~ /.well-known/acme-challenge/ {', `        root "${site.root}";`, '    }'];
    if (site.type === 'proxy') {
      return [
        ...acme,
        '    location / {',
        `        proxy_pass http://127.0.0.1:${site.proxyPort};`,
        '        proxy_http_version 1.1;',
        '        proxy_set_header Upgrade $http_upgrade;',
        '        proxy_set_header Connection "upgrade";',
        '        proxy_set_header Host $host;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        '        proxy_set_header X-Forwarded-Proto $scheme;',
        '        proxy_buffering off;',
        '        proxy_read_timeout 600s;',
        '        proxy_connect_timeout 60s;',
        '        proxy_send_timeout 600s;',
        '    }',
      ];
    }
    const lines = [
      `    root "${site.root}";`,
      '    index index.html index.htm index.php;',
      '    location / {',
      site.type === 'php' ? '        try_files $uri $uri/ /index.php?$args;' : '        try_files $uri $uri/ =404;',
      '    }',
    ];
    if (site.type === 'php') {
      lines.push(
        '    location ~ \\.php$ {',
        '        include fastcgi_params;',
        '        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;',
        `        fastcgi_pass ${await findPhpFpmSocket()};`,
        '    }',
      );
    }
    lines.push('    location ~ /\\.(?!well-known) {', '        deny all;', '    }');
    return lines;
  }

  private async render(site: SiteConfig): Promise<string> {
    const names = [site.domain, ...site.aliases].join(' ');
    const common = [
      `    server_name ${names};`,
      `    access_log ${site.accessLog};`,
      `    error_log ${site.errorLog};`,
      '    client_max_body_size 256m;',
      ...(await this.locations(site)),
    ];
    const hasCert = site.ssl && existsSync(path.join(certDir(site.domain), 'fullchain.pem'));
    const out = [`# Managed by ZenPanel - ${site.domain}. Sửa trong ZenPanel, không sửa tay.`];

    if (hasCert && site.forceHttps) {
      out.push(
        'server {',
        '    listen 80;',
        '    listen [::]:80;',
        `    server_name ${names};`,
        '    location ^~ /.well-known/acme-challenge/ {',
        `        root "${site.root}";`,
        '    }',
        '    location / {',
        '        return 301 https://$host$request_uri;',
        '    }',
        '}',
      );
    } else {
      out.push('server {', '    listen 80;', '    listen [::]:80;', ...common, '}');
    }
    if (hasCert) {
      out.push(
        'server {',
        '    listen 443 ssl http2;',
        '    listen [::]:443 ssl http2;',
        `    ssl_certificate ${certDir(site.domain)}/fullchain.pem;`,
        `    ssl_certificate_key ${certDir(site.domain)}/privkey.pem;`,
        ...common,
        '}',
      );
    }
    return `${out.join('\n')}\n`;
  }

  private async testAndReload(file: string, previous: string | null): Promise<void> {
    const test = await this.adapter.exec('nginx', ['-t']);
    if (test.code !== 0) {
      // Khôi phục cấu hình cũ để không làm sập các site khác
      if (previous === null) await rm(file, { force: true });
      else await writeFile(file, previous);
      throw new Error(`Cấu hình Nginx lỗi: ${(test.stderr || test.stdout).trim()}`);
    }
    const reload = await this.adapter.exec('systemctl', ['reload-or-restart', 'nginx']).catch(() => null);
    if (!reload || reload.code !== 0) await this.adapter.execOk('nginx', ['-s', 'reload']);
  }

  async apply(site: SiteConfig): Promise<void> {
    const file = this.confFile(site);
    const previous = existsSync(file) ? await readFile(file, 'utf8') : null;
    if (!site.enabled) {
      await rm(file, { force: true });
      await this.testAndReload(file, previous);
      return;
    }
    await writeFile(file, await this.render(site));
    await this.testAndReload(file, previous);
  }

  async remove(site: SiteConfig): Promise<void> {
    await rm(this.confFile(site), { force: true });
    await this.testAndReload(this.confFile(site), null);
  }

  async issueSSL(site: SiteConfig, email: string): Promise<void> {
    const certbot = await this.adapter.findExecutable('certbot');
    if (!certbot) throw new Error('Chưa cài certbot. Chạy: apt install certbot (hoặc dnf install certbot)');
    const domains = [site.domain, ...site.aliases].flatMap((d) => ['-d', d]);
    await this.adapter.execOk(
      certbot,
      ['certonly', '--webroot', '-w', site.root, ...domains, '--non-interactive', '--agree-tos', '-m', email, '--keep-until-expiring'],
      { timeout: 180_000 },
    );
  }
}
