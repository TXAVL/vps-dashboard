import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { resolveTool } from '../core/download.js';
import { dataPath } from '../core/store.js';

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 45_000;
const MAX_RESTART_DELAY_MS = 60_000;

export type TunnelStatus = 'idle' | 'starting' | 'online' | 'error' | 'stopped';

export interface TunnelState {
  status: TunnelStatus;
  url: string | null;
  error: string | null;
}

export class TunnelService extends EventEmitter {
  private child: ChildProcess | null = null;
  private existingPid: number | null = null;
  private pidCheckTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private restartDelay = 2_000;
  private state: TunnelState = { status: 'idle', url: null, error: null };

  constructor(
    private readonly adapter: OSAdapter,
    private readonly localUrl: string,
    private readonly customBinary?: string,
    /** Thêm tham số cho cloudflared, vd --no-tls-verify khi app dùng HTTPS tự ký */
    private readonly extraArgs: string[] = [],
  ) {
    super();
  }

  getState(): TunnelState {
    return { ...this.state };
  }

  /** Khởi động tunnel, resolve khi nhận được URL công khai. Tái sử dụng tiến trình cũ nếu có */
  async start(): Promise<string> {
    this.stopping = false;
    const existing = this.checkExistingTunnel();
    if (existing) {
      return existing;
    }
    const binary = await this.resolveBinary();
    return this.spawnTunnel(binary);
  }

  /** Kiểm tra xem có tiến trình cloudflared cũ nào còn đang chạy (sau khi restart agent hoặc update) */
  private checkExistingTunnel(): string | null {
    try {
      const pidFile = dataPath('tunnel.pid');
      const urlFile = dataPath('tunnel.url');
      if (!existsSync(pidFile) || !existsSync(urlFile)) return null;

      const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
      if (!pid || isNaN(pid)) return null;

      // Signal 0 kiểm tra sự tồn tại của tiến trình
      try {
        process.kill(pid, 0);
      } catch {
        try { unlinkSync(pidFile); } catch {}
        return null;
      }

      const rawUrl = readFileSync(urlFile, 'utf8').trim();
      const match = rawUrl.match(URL_PATTERN);
      if (!match) return null;

      this.existingPid = pid;
      this.setState({ status: 'online', url: match[0], error: null });

      // Định kỳ kiểm tra tiến trình nền còn chạy không
      if (this.pidCheckTimer) clearInterval(this.pidCheckTimer);
      this.pidCheckTimer = setInterval(() => {
        if (!this.existingPid || this.stopping) return;
        try {
          process.kill(this.existingPid, 0);
        } catch {
          this.existingPid = null;
          if (this.pidCheckTimer) clearInterval(this.pidCheckTimer);
          if (!this.stopping) {
            void this.resolveBinary().then((bin) => this.spawnTunnel(bin)).catch(() => undefined);
          }
        }
      }, 3000);

      return match[0];
    } catch {
      return null;
    }
  }

  stop(): void {
    this.stopping = true;
    if (this.pidCheckTimer) clearInterval(this.pidCheckTimer);
    if (this.existingPid) {
      try {
        process.kill(this.existingPid, 'SIGTERM');
      } catch {}
      this.existingPid = null;
    }
    this.child?.kill();
    this.child = null;
    try { unlinkSync(dataPath('tunnel.pid')); } catch {}
    try { unlinkSync(dataPath('tunnel.url')); } catch {}
    this.setState({ status: 'stopped', url: null, error: null });
  }

  private setState(next: TunnelState): void {
    this.state = next;
    this.emit('state', this.getState());
  }

  private spawnTunnel(binary: string): Promise<string> {
    this.setState({ status: 'starting', url: null, error: null });

    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['tunnel', '--no-autoupdate', ...this.extraArgs, '--url', this.localUrl], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
      this.child = child;
      if (child.pid) {
        try {
          writeFileSync(dataPath('tunnel.pid'), String(child.pid), 'utf8');
        } catch {}
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        try { unlinkSync(dataPath('tunnel.pid')); } catch {}
        try { unlinkSync(dataPath('tunnel.url')); } catch {}
        this.setState({ status: 'error', url: null, error: 'Hết thời gian chờ Cloudflare cấp domain' });
        reject(new Error('Hết thời gian chờ Cloudflare cấp domain trycloudflare.com'));
      }, START_TIMEOUT_MS);

      // cloudflared ghi log (kể cả URL) ra stderr
      const onData = (chunk: Buffer) => {
        if (this.state.status === 'online') return;
        const match = chunk.toString().match(URL_PATTERN);
        if (!match) return;
        this.restartDelay = 2_000;
        this.setState({ status: 'online', url: match[0], error: null });
        try {
          writeFileSync(dataPath('tunnel.url'), match[0], 'utf8');
        } catch {}
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(match[0]);
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { unlinkSync(dataPath('tunnel.pid')); } catch {}
        try { unlinkSync(dataPath('tunnel.url')); } catch {}
        this.setState({ status: 'error', url: null, error: err.message });
        reject(err);
      });

      child.on('exit', (code) => {
        if (this.child === child) this.child = null;
        try { unlinkSync(dataPath('tunnel.pid')); } catch {}
        try { unlinkSync(dataPath('tunnel.url')); } catch {}
        if (this.stopping) return;
        const message = `cloudflared đã thoát (code ${code ?? 'null'})`;
        this.setState({ status: 'error', url: null, error: message });
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(message));
          return;
        }
        // Tunnel đang chạy thì rớt: tự khởi động lại (domain mới sẽ được báo qua event 'state')
        const delay = this.restartDelay;
        this.restartDelay = Math.min(this.restartDelay * 2, MAX_RESTART_DELAY_MS);
        setTimeout(() => {
          if (!this.stopping) this.spawnTunnel(binary).catch(() => undefined);
        }, delay);
      });
    });
  }

  /** Thứ tự ưu tiên: đường dẫn cấu hình -> cloudflared trong PATH -> bản đã tải -> tự tải từ GitHub */
  private async resolveBinary(): Promise<string> {
    if (this.customBinary) return this.customBinary;
    const binary = await resolveTool(this.adapter, 'cloudflared', {
      url: `${RELEASE_BASE}/${this.adapter.cloudflaredAssetName()}`,
      onDownload: (url) => this.emit('download', url),
    });
    return binary!;
  }
}
