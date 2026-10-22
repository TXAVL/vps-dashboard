// ZenPanel - In thông tin truy cập (URL công khai, URL nội bộ) ra console
import os from 'node:os';
import type { OSInfo } from '../adapters/base.adapter.js';

const color = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  amber: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const visibleLength = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').length;

function box(lines: string[]): string {
  const width = Math.max(...lines.map(visibleLength)) + 2;
  const top = `${color.blue}╭${'─'.repeat(width)}╮${color.reset}`;
  const bottom = `${color.blue}╰${'─'.repeat(width)}╯${color.reset}`;
  const body = lines.map(
    (line) => `${color.blue}│${color.reset} ${line}${' '.repeat(width - visibleLength(line) - 1)}${color.blue}│${color.reset}`,
  );
  return [top, ...body, bottom].join('\n');
}

export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface!.address);
}

export interface BannerInfo {
  osInfo: OSInfo;
  host: string;
  port: number;
  publicUrl: string | null;
  tunnelNote?: string;
  /** Chỉ có ở lần chạy đầu tiên khi tài khoản admin vừa được tạo */
  credentials?: { username: string; password: string } | null;
}

export function printBanner({ osInfo, host, port, publicUrl, tunnelNote, credentials }: BannerInfo): void {
  const label = (text: string) => `${color.dim}${text.padEnd(13)}${color.reset}`;
  const lines = [
    `${color.bold}🧘 ZenPanel Agent${color.reset} ${color.dim}— Quản trị VPS an nhàn${color.reset}`,
    '',
    `${label('Hệ điều hành')} ${osInfo.name} (${osInfo.arch})`,
    `${label('Hostname')} ${osInfo.hostname}`,
    '',
  ];

  if (publicUrl) {
    lines.push(`${label('Public URL')} ${color.bold}${color.green}${publicUrl}${color.reset}`);
  } else {
    lines.push(`${label('Public URL')} ${color.amber}${tunnelNote ?? 'Không bật Cloudflare Tunnel'}${color.reset}`);
  }

  lines.push(`${label('Local')} ${color.cyan}http://localhost:${port}${color.reset}`);
  if (host === '0.0.0.0') {
    for (const ip of lanAddresses()) lines.push(`${label('Network')} ${color.cyan}http://${ip}:${port}${color.reset}`);
  }

  if (publicUrl) {
    lines.push('', `${color.dim}Domain trycloudflare.com đổi mỗi lần khởi động lại agent.${color.reset}`);
  }

  if (credentials) {
    lines.push(
      '',
      `${color.bold}${color.amber}Tài khoản quản trị (chỉ hiển thị 1 lần — hãy lưu lại):${color.reset}`,
      `${label('Username')} ${color.bold}${credentials.username}${color.reset}`,
      `${label('Password')} ${color.bold}${credentials.password}${color.reset}`,
    );
  }

  console.log(`\n${box(lines)}\n`);
}

export function printTunnelChanged(url: string): void {
  console.log(`${color.green}●${color.reset} Cloudflare Tunnel đã kết nối lại, domain mới: ${color.bold}${color.green}${url}${color.reset}`);
}

export function printTunnelWarning(message: string): void {
  console.warn(`${color.amber}▲${color.reset} Cloudflare Tunnel: ${message}`);
}
