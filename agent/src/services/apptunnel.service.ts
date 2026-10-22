// ZenPanel - Link public cho từng ứng dụng: mỗi app có 1 Cloudflare Quick Tunnel riêng (*.trycloudflare.com)
// Lý do: tunnel của dashboard chỉ trỏ vào cổng panel, nên domain-dashboard:8443 không vào được từ bên ngoài.
import type { OSAdapter } from '../adapters/base.adapter.js';
import { config } from '../config.js';
import { JsonCollection } from '../core/store.js';
import { TunnelService, type TunnelState } from './tunnel.service.js';

interface ExposedApp {
  id: string;
  port: number;
  scheme: 'http' | 'https';
}

const exposed = new JsonCollection<ExposedApp>('app-tunnels.json');

export class AppTunnelService {
  private tunnels = new Map<string, TunnelService>();

  constructor(private readonly adapter: OSAdapter) {}

  state(id: string): TunnelState & { enabled: boolean } {
    const tunnel = this.tunnels.get(id);
    return { ...(tunnel?.getState() ?? { status: 'stopped', url: null, error: null }), enabled: Boolean(exposed.get(id)) };
  }

  /** Bật link public cho app, trả về URL khi Cloudflare cấp xong */
  async enable(id: string, port: number, scheme: 'http' | 'https' = 'http'): Promise<TunnelState> {
    exposed.upsert({ id, port, scheme });
    return this.startTunnel({ id, port, scheme });
  }

  disable(id: string): void {
    exposed.remove(id);
    this.tunnels.get(id)?.stop();
    this.tunnels.delete(id);
  }

  private async startTunnel(app: ExposedApp): Promise<TunnelState> {
    this.tunnels.get(app.id)?.stop();
    const tunnel = new TunnelService(this.adapter, `${app.scheme}://127.0.0.1:${app.port}`, config.cloudflaredPath, app.scheme === 'https' ? ['--no-tls-verify'] : []);
    this.tunnels.set(app.id, tunnel);
    await tunnel.start().catch(() => undefined);
    return tunnel.getState();
  }

  /** Khi agent khởi động: bật lại tunnel cho các app đã bật link public (domain sẽ mới) */
  bootstrap(): void {
    for (const app of exposed.all()) void this.startTunnel(app);
  }

  stopAll(): void {
    for (const tunnel of this.tunnels.values()) tunnel.stop();
  }
}
