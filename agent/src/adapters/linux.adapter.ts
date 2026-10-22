// ZenPanel - Adapter cho Linux (Ubuntu, Debian, CentOS, Alpine...): systemctl, procfs, ufw/iptables
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, readFile } from 'node:fs/promises';
import os from 'node:os';
import type { OSAdapter, OSInfo } from './base.adapter.js';

const run = promisify(execFile);

const CLOUDFLARED_ARCH: Record<string, string> = {
  x64: 'amd64',
  arm64: 'arm64',
  arm: 'arm',
  ia32: '386',
};

export class LinuxAdapter implements OSAdapter {
  readonly family = 'linux' as const;

  async getInfo(): Promise<OSInfo> {
    let name = `Linux ${os.release()}`;
    try {
      const release = await readFile('/etc/os-release', 'utf8');
      const pretty = release.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (pretty) name = pretty[1];
    } catch {
      // Một số distro tối giản không có /etc/os-release
    }
    return { family: this.family, name, arch: os.arch(), hostname: os.hostname() };
  }

  async findExecutable(name: string): Promise<string | null> {
    try {
      const { stdout } = await run('sh', ['-c', 'command -v "$1"', 'sh', name]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async makeExecutable(filePath: string): Promise<void> {
    await chmod(filePath, 0o755);
  }

  cloudflaredAssetName(): string {
    const arch = CLOUDFLARED_ARCH[os.arch()];
    if (!arch) throw new Error(`Kiến trúc CPU "${os.arch()}" chưa được cloudflared hỗ trợ`);
    return `cloudflared-linux-${arch}`;
  }

  cloudflaredBinaryName(): string {
    return 'cloudflared';
  }
}
