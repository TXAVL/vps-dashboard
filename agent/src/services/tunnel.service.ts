// ZenPanel - Cloudflare Quick Tunnel: mỗi lần agent chạy sẽ cấp 1 domain *.trycloudflare.com
// trỏ về cổng panel, không cần tài khoản Cloudflare hay mở port tường lửa.
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';

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
  private stopping = false;
  private restartDelay = 2_000;
  private state: TunnelState = { status: 'idle', url: null, error: null };

  constructor(
    private readonly adapter: OSAdapter,
    private readonly localUrl: string,
    private readonly customBinary?: string,
  ) {
    super();
  }

  getState(): TunnelState {
    return { ...this.state };
  }

  /** Khởi động tunnel, resolve khi nhận được URL công khai */
  async start(): Promise<string> {
    this.stopping = false;
    const binary = await this.resolveBinary();
    return this.spawnTunnel(binary);
  }

  stop(): void {
    this.stopping = true;
    this.child?.kill();
    this.child = null;
    this.setState({ status: 'stopped', url: null, error: null });
  }

  private setState(next: TunnelState): void {
    this.state = next;
    this.emit('state', this.getState());
  }

  private spawnTunnel(binary: string): Promise<string> {
    this.setState({ status: 'starting', url: null, error: null });

    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', this.localUrl], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
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
        this.setState({ status: 'error', url: null, error: err.message });
        reject(err);
      });

      child.on('exit', (code) => {
        if (this.child === child) this.child = null;
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

    const fromPath = await this.adapter.findExecutable('cloudflared');
    if (fromPath) return fromPath;

    const binDir = path.join(os.homedir(), '.zenpanel', 'bin');
    const target = path.join(binDir, this.adapter.cloudflaredBinaryName());
    try {
      await access(target);
      return target;
    } catch {
      // Chưa có, tải về bên dưới
    }

    await mkdir(binDir, { recursive: true });
    const asset = this.adapter.cloudflaredAssetName();
    this.emit('download', `${RELEASE_BASE}/${asset}`);
    const res = await fetch(`${RELEASE_BASE}/${asset}`);
    if (!res.ok || !res.body) throw new Error(`Không tải được cloudflared (HTTP ${res.status})`);

    const tmp = `${target}.download`;
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(tmp));
    await rename(tmp, target);
    await this.adapter.makeExecutable(target);
    return target;
  }
}
