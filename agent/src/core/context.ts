// ZenPanel - Ngữ cảnh dùng chung cho mọi route (adapter, thông tin OS, metrics, tunnel)
import type { OSAdapter, OSInfo } from '../adapters/base.adapter.js';
import type { MetricsCollector } from './metrics.js';
import type { TunnelService } from '../services/tunnel.service.js';

export interface AppContext {
  adapter: OSAdapter;
  osInfo: OSInfo;
  metrics: MetricsCollector;
  tunnel: TunnelService | null;
  port: number;
  startedAt: number;
  version: string;
}
