// ZenPanel - Speedtest thật đo từ chính VPS tới mạng Cloudflare (speed.cloudflare.com): ping, jitter, tải xuống, tải lên
import { readJson, writeJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';

const BASE = 'https://speed.cloudflare.com';

/** Máy chủ đo: Cloudflare đo được cả 2 chiều; các máy chủ khác chỉ có file tải xuống công khai */
export interface SpeedServer {
  id: string;
  name: string;
  location: string;
  download: string;
  /** null = không đo upload ở máy chủ này (dùng Cloudflare) */
  upload: string | null;
  ping: string;
}

export const SPEED_SERVERS: SpeedServer[] = [
  { id: 'cloudflare', name: 'Cloudflare (gần nhất)', location: 'Tự chọn PoP gần nhất', download: `${BASE}/__down?bytes=50000000`, upload: `${BASE}/__up`, ping: `${BASE}/__down?bytes=0` },
  { id: 'hetzner-sin', name: 'Hetzner', location: 'Singapore', download: 'https://sin-speed.hetzner.com/1GB.bin', upload: null, ping: 'https://sin-speed.hetzner.com/1GB.bin' },
  { id: 'vultr-sg', name: 'Vultr', location: 'Singapore', download: 'https://sgp-ping.vultr.com/vultr.com.1000MB.bin', upload: null, ping: 'https://sgp-ping.vultr.com/vultr.com.1000MB.bin' },
  { id: 'vultr-tokyo', name: 'Vultr', location: 'Tokyo, Nhật Bản', download: 'https://hnd-jp-ping.vultr.com/vultr.com.1000MB.bin', upload: null, ping: 'https://hnd-jp-ping.vultr.com/vultr.com.1000MB.bin' },
  { id: 'hetzner-fsn', name: 'Hetzner', location: 'Falkenstein, Đức', download: 'https://fsn1-speed.hetzner.com/1GB.bin', upload: null, ping: 'https://fsn1-speed.hetzner.com/1GB.bin' },
  { id: 'vultr-fra', name: 'Vultr', location: 'Frankfurt, Đức', download: 'https://fra-de-ping.vultr.com/vultr.com.1000MB.bin', upload: null, ping: 'https://fra-de-ping.vultr.com/vultr.com.1000MB.bin' },
  { id: 'ovh', name: 'OVHcloud', location: 'Roubaix, Pháp', download: 'https://proof.ovh.net/files/1Gb.dat', upload: null, ping: 'https://proof.ovh.net/files/1Gb.dat' },
  { id: 'hetzner-ash', name: 'Hetzner', location: 'Ashburn, Mỹ', download: 'https://ash-speed.hetzner.com/1GB.bin', upload: null, ping: 'https://ash-speed.hetzner.com/1GB.bin' },
  { id: 'vultr-la', name: 'Vultr', location: 'Los Angeles, Mỹ', download: 'https://lax-ca-us-ping.vultr.com/vultr.com.1000MB.bin', upload: null, ping: 'https://lax-ca-us-ping.vultr.com/vultr.com.1000MB.bin' },
];
const DOWNLOAD_MS = 10_000;
const UPLOAD_MS = 8_000;
const HISTORY_FILE = 'speedtest.json';

export interface SpeedResult {
  at: string;
  pingMs: number;
  jitterMs: number;
  /** byte / giây */
  download: number;
  upload: number;
  server: { colo: string; city: string; country: string };
  client: { ip: string; isp: string };
  serverId?: string;
  serverName?: string;
  connections?: 'multi' | 'single';
  /** Độ trễ khi đang tải xuống / tải lên (bufferbloat) */
  loadedPingDown?: number | null;
  loadedPingUp?: number | null;
}

export interface SpeedState {
  running: boolean;
  phase: 'idle' | 'meta' | 'ping' | 'download' | 'upload' | 'done' | 'error';
  progress: number;
  liveSpeed: number;
  pingMs: number | null;
  jitterMs: number | null;
  download: number | null;
  upload: number | null;
  error: string | null;
  last: SpeedResult | null;
  serverId: string;
  connections: 'multi' | 'single';
  loadedPing: number | null;
}

const UPLOAD_CHUNK = Buffer.alloc(8 * 1024 * 1024, 'z');

export class SpeedtestService {
  private state: SpeedState = this.idle();

  private idle(): SpeedState {
    return { running: false, phase: 'idle', progress: 0, liveSpeed: 0, pingMs: null, jitterMs: null, download: null, upload: null, error: null, last: this.history()[0] ?? null, serverId: 'cloudflare', connections: 'multi', loadedPing: null };
  }

  getState(): SpeedState {
    return { ...this.state };
  }

  history(): SpeedResult[] {
    return readJson<SpeedResult[]>(HISTORY_FILE, []);
  }

  servers(): SpeedServer[] {
    return SPEED_SERVERS;
  }

  start(opts: { serverId?: string; connections?: string } = {}): SpeedState {
    if (this.state.running) throw badRequest('Speedtest đang chạy');
    const server = SPEED_SERVERS.find((sv) => sv.id === opts.serverId) ?? SPEED_SERVERS[0];
    const connections = opts.connections === 'single' ? 'single' : 'multi';
    this.state = { ...this.idle(), running: true, phase: 'meta', serverId: server.id, connections };
    void this.run(server, connections);
    return this.getState();
  }

  /** Ping liên tục trong lúc đo băng thông để biết độ trễ khi mạng bị tải (bufferbloat) */
  private loadedPinger(url: string): { stop: () => number | null } {
    const samples: number[] = [];
    let active = true;
    void (async () => {
      while (active) {
        const t0 = performance.now();
        const ok = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal: AbortSignal.timeout(3000) })
          .then((r) => r.arrayBuffer())
          .then(() => true)
          .catch(() => false);
        if (ok && active) {
          samples.push(performance.now() - t0);
          const sorted = [...samples].sort((a, b) => a - b);
          this.state.loadedPing = sorted[Math.floor(sorted.length / 2)];
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    })();
    return {
      stop: () => {
        active = false;
        if (!samples.length) return null;
        const sorted = [...samples].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      },
    };
  }

  private async run(server: SpeedServer, connections: 'multi' | 'single'): Promise<void> {
    const workers = connections === 'single' ? 1 : 4;
    try {
      // /cdn-cgi/trace trả về ip, colo (máy chủ Cloudflare gần nhất), loc (quốc gia) dạng key=value
      const trace = await fetch(`${BASE}/cdn-cgi/trace`, { signal: AbortSignal.timeout(10_000) })
        .then((r) => r.text())
        .catch(() => '');
      const field = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(trace)?.[1]?.trim() ?? '';
      const meta: Record<string, string> = { clientIp: field('ip'), colo: field('colo'), country: field('loc'), city: '', asOrganization: '' };
      if (meta.clientIp) {
        const who = (await fetch(`https://ipwho.is/${meta.clientIp}`, { signal: AbortSignal.timeout(6000) })
          .then((r) => r.json())
          .catch(() => null)) as { city?: string; connection?: { isp?: string; org?: string } } | null;
        meta.city = who?.city ?? '';
        meta.asOrganization = who?.connection?.isp || who?.connection?.org || '';
      }

      // ---- Ping: 12 request rỗng, bỏ lần đầu (bắt tay TLS)
      this.state.phase = 'ping';
      const samples: number[] = [];
      for (let i = 0; i < 12; i++) {
        const t0 = performance.now();
        await fetch(server.ping, { headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer());
        if (i > 0) samples.push(performance.now() - t0);
        this.state.progress = (i + 1) / 12;
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const ping = sorted[Math.floor(sorted.length / 2)];
      const jitter = samples.slice(1).reduce((sum, v, i) => sum + Math.abs(v - samples[i]), 0) / Math.max(1, samples.length - 1);
      this.state.pingMs = ping;
      this.state.jitterMs = jitter;

      this.state.phase = 'download';
      let pinger = this.loadedPinger(server.ping);
      this.state.download = await this.measure(workers, DOWNLOAD_MS, async (count, signal) => {
        const res = await fetch(server.download, { cache: 'no-store', signal });
        const reader = res.body!.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          count(value.byteLength);
        }
      });

      const loadedPingDown = pinger.stop();
      this.state.phase = 'upload';
      this.state.liveSpeed = 0;
      this.state.progress = 0;
      this.state.loadedPing = null;
      const uploadUrl = server.upload ?? `${BASE}/__up`;
      pinger = this.loadedPinger(server.upload ? server.ping : `${BASE}/__down?bytes=0`);
      this.state.upload = await this.measure(workers, UPLOAD_MS, async (count, signal) => {
        await fetch(uploadUrl, { method: 'POST', body: UPLOAD_CHUNK, signal, headers: { 'Content-Type': 'application/octet-stream' } }).then((r) => r.arrayBuffer());
        count(UPLOAD_CHUNK.byteLength);
      });

      const loadedPingUp = pinger.stop();
      const result: SpeedResult = {
        serverId: server.id,
        serverName: `${server.name} · ${server.location}${server.upload ? '' : ' (upload qua Cloudflare)'}`,
        connections,
        loadedPingDown,
        loadedPingUp,
        at: new Date().toISOString(),
        pingMs: ping,
        jitterMs: jitter,
        download: this.state.download,
        upload: this.state.upload,
        server: { colo: meta.colo ?? '', city: meta.city ?? '', country: meta.country ?? '' },
        client: { ip: meta.clientIp ?? '', isp: meta.asOrganization ?? '' },
      };
      writeJson(HISTORY_FILE, [result, ...this.history()].slice(0, 20));
      this.state = { ...this.state, running: false, phase: 'done', progress: 1, liveSpeed: 0, last: result };
    } catch (err) {
      this.state = { ...this.state, running: false, phase: 'error', error: `Speedtest lỗi: ${(err as Error).message}` };
    }
  }

  /** Chạy nhiều luồng song song trong durationMs, trả về tốc độ trung bình (byte/giây) bỏ 1 giây đầu (TCP slow start) */
  private async measure(workers: number, durationMs: number, worker: (count: (bytes: number) => void, signal: AbortSignal) => Promise<void>): Promise<number> {
    const controller = new AbortController();
    const start = performance.now();
    let total = 0;
    let warm = 0;
    let lastBytes = 0;
    let lastTime = start;
    const count = (bytes: number) => {
      total += bytes;
      if (performance.now() - start < 1000) warm = total;
    };
    const ticker = setInterval(() => {
      const now = performance.now();
      const timeDelta = now - lastTime;
      if (timeDelta > 0) {
        const currentDelta = total - lastBytes;
        const instant = (currentDelta / timeDelta) * 1000;
        if (instant > 0) {
          this.state.liveSpeed = this.state.liveSpeed > 0 ? this.state.liveSpeed * 0.35 + instant * 0.65 : instant;
        } else if (this.state.liveSpeed > 0) {
          this.state.liveSpeed = this.state.liveSpeed * 0.88;
        }
      }
      this.state.progress = Math.min(1, (now - start) / durationMs);
      lastBytes = total;
      lastTime = now;
    }, 150);
    const timer = setTimeout(() => controller.abort(), durationMs);
    const loop = async () => {
      while (!controller.signal.aborted) await worker(count, controller.signal).catch(() => undefined);
    };
    await Promise.all(Array.from({ length: workers }, loop));
    clearInterval(ticker);
    clearTimeout(timer);
    const elapsed = (performance.now() - start) / 1000 - 1;
    return Math.max(0, (total - warm) / Math.max(elapsed, 0.5));
  }
}
