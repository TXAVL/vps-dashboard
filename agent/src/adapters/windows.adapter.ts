// ZenPanel - Adapter cho Windows Server / Windows 10/11 (PowerShell, WMI/CIM, sc.exe, netsh)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import type { OSAdapter, OSInfo } from './base.adapter.js';

const run = promisify(execFile);

export class WindowsAdapter implements OSAdapter {
  readonly family = 'windows' as const;

  async getInfo(): Promise<OSInfo> {
    let name = `Windows ${os.release()}`;
    try {
      const { stdout } = await run(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_OperatingSystem).Caption'],
        { windowsHide: true, timeout: 10_000 },
      );
      if (stdout.trim()) name = stdout.trim();
    } catch {
      // Giữ tên mặc định nếu không gọi được CIM
    }
    return { family: this.family, name, arch: os.arch(), hostname: os.hostname() };
  }

  async findExecutable(name: string): Promise<string | null> {
    try {
      const { stdout } = await run('where.exe', [name], { windowsHide: true });
      return stdout.split(/\r?\n/).find((line) => line.trim())?.trim() ?? null;
    } catch {
      return null;
    }
  }

  async makeExecutable(): Promise<void> {
    // Windows không cần chmod
  }

  cloudflaredAssetName(): string {
    return os.arch() === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  }

  cloudflaredBinaryName(): string {
    return 'cloudflared.exe';
  }
}
