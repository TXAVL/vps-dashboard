// ZenPanel - Thu thập chỉ số CPU, RAM, Disk, Network theo chu kỳ và giữ lịch sử ngắn hạn
import { EventEmitter } from 'node:events';
import os from 'node:os';
import type { DiskUsage, OSAdapter } from '../adapters/base.adapter.js';

const INTERVAL_MS = 2_000;
const HISTORY_SIZE = 90;
const DISK_REFRESH_MS = 15_000;

export interface MetricsSnapshot {
  time: number;
  cpu: { usage: number; perCore: number[] };
  memory: { total: number; used: number };
  disks: DiskUsage[];
  network: { rxRate: number; txRate: number; rxTotal: number; txTotal: number };
  load: number[] | null;
  uptime: number;
}

type CpuTimes = { idle: number; total: number }[];

function readCpuTimes(): CpuTimes {
  return os.cpus().map(({ times }) => ({
    idle: times.idle,
    total: times.user + times.nice + times.sys + times.idle + times.irq,
  }));
}

export class MetricsCollector extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private lastCpu = readCpuTimes();
  private lastNet: { rx: number; tx: number; at: number } | null = null;
  private disks: { at: number; value: DiskUsage[] } = { at: 0, value: [] };
  private history: MetricsSnapshot[] = [];

  constructor(private readonly adapter: OSAdapter) {
    super();
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getHistory(): MetricsSnapshot[] {
    return [...this.history];
  }

  latest(): MetricsSnapshot | null {
    return this.history[this.history.length - 1] ?? null;
  }

  private async tick(): Promise<void> {
    try {
      const snapshot = await this.sample();
      this.history.push(snapshot);
      if (this.history.length > HISTORY_SIZE) this.history.shift();
      this.emit('snapshot', snapshot);
    } catch (err) {
      this.emit('error', err);
    }
  }

  private sampleCpu(): { usage: number; perCore: number[] } {
    const now = readCpuTimes();
    const perCore = now.map((core, i) => {
      const prev = this.lastCpu[i] ?? core;
      const total = core.total - prev.total;
      return total > 0 ? Math.max(0, Math.min(100, (1 - (core.idle - prev.idle) / total) * 100)) : 0;
    });
    this.lastCpu = now;
    const usage = perCore.length ? perCore.reduce((a, b) => a + b, 0) / perCore.length : 0;
    return { usage, perCore };
  }

  private async sample(): Promise<MetricsSnapshot> {
    const now = Date.now();
    if (now - this.disks.at > DISK_REFRESH_MS) {
      this.disks = { at: now, value: await this.adapter.getDisks().catch(() => this.disks.value) };
    }

    const net = await this.adapter.getNetworkTotals().catch(() => ({ rx: 0, tx: 0 }));
    let rxRate = 0;
    let txRate = 0;
    if (this.lastNet) {
      const seconds = (now - this.lastNet.at) / 1000;
      // Bộ đếm có thể reset (đổi card mạng) -> bỏ qua giá trị âm
      rxRate = Math.max(0, (net.rx - this.lastNet.rx) / seconds);
      txRate = Math.max(0, (net.tx - this.lastNet.tx) / seconds);
    }
    this.lastNet = { ...net, at: now };

    const total = os.totalmem();
    return {
      time: now,
      cpu: this.sampleCpu(),
      memory: { total, used: total - os.freemem() },
      disks: this.disks.value,
      network: { rxRate, txRate, rxTotal: net.rx, txTotal: net.tx },
      load: this.adapter.getLoadAverage(),
      uptime: os.uptime(),
    };
  }
}
