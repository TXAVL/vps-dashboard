// ZenPanel - Speedtest thật đo từ chính VPS tới mạng Cloudflare (speed.cloudflare.com): ping, jitter, tải xuống, tải lên
import { readJson, writeJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';

const BASE = 'https://speed.cloudflare.com';
const WORKERS = 4;
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
}

const UPLOAD_CHUNK = Buffer.alloc(8 * 1024 * 1024, 'z');

export class SpeedtestService {
  private state: SpeedState = this.idle();

  private idle(): SpeedState {
    return { running: false, phase: 'idle', progress: 0, liveSpeed: 0, pingMs: null, jitterMs: null, download: null, upload: null, error: null, last: this.history()[0] ?? null };
  }

  getState(): SpeedState {
    return { ...this.state };
  }

  history(): SpeedResult[] {
    return readJson<SpeedResult[]>(HISTORY_FILE, []);
  }

  start(): SpeedState {
    if (this.state.running) throw badRequest('Speedtest đang chạy');
    this.state = { ...this.idle(), running: true, phase: 'meta' };
    void this.run();
    return this.getState();
  }

  private async run(): Promise<void> {
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
        await fetch(`${BASE}/__down?bytes=0`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer());
        if (i > 0) samples.push(performance.now() - t0);
        this.state.progress = (i + 1) / 12;
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const ping = sorted[Math.floor(sorted.length / 2)];
      const jitter = samples.slice(1).reduce((sum, v, i) => sum + Math.abs(v - samples[i]), 0) / Math.max(1, samples.length - 1);
      this.state.pingMs = ping;
      this.state.jitterMs = jitter;

      this.state.phase = 'download';
      this.state.download = await this.measure(DOWNLOAD_MS, async (count, signal) => {
        const res = await fetch(`${BASE}/__down?bytes=50000000`, { cache: 'no-store', signal });
        const reader = res.body!.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          count(value.byteLength);
        }
      });

      this.state.phase = 'upload';
      this.state.upload = await this.measure(UPLOAD_MS, async (count, signal) => {
        await fetch(`${BASE}/__up`, { method: 'POST', body: UPLOAD_CHUNK, signal, headers: { 'Content-Type': 'application/octet-stream' } }).then((r) => r.arrayBuffer());
        count(UPLOAD_CHUNK.byteLength);
      });

      const result: SpeedResult = {
        at: new Date().toISOString(),
        pingMs: ping,
        jitterMs: jitter,
        download: this.state.download,
        upload: this.state.upload,
        server: { colo: meta.colo ?? '', city: meta.city ?? '', country: meta.country ?? '' },
        client: { ip: meta.clientIp ?? '', isp: meta.asOrganization ?? '' },
      };
      writeJson(HISTORY_FILE, [result, ...this.history()].slice(0, 20));
      this.state = { ...this.state, running: false, phase: 'done', progress: 1, liveSpeed: this.state.download ?? 0, last: result };
    } catch (err) {
      this.state = { ...this.state, running: false, phase: 'error', error: `Speedtest lỗi: ${(err as Error).message}` };
    }
  }

  /** Chạy nhiều luồng song song trong durationMs, trả về tốc độ trung bình (byte/giây) bỏ 1 giây đầu (TCP slow start) */
  private async measure(durationMs: number, worker: (count: (bytes: number) => void, signal: AbortSignal) => Promise<void>): Promise<number> {
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
    await Promise.all(Array.from({ length: WORKERS }, loop));
    clearInterval(ticker);
    clearTimeout(timer);
    const elapsed = (performance.now() - start) / 1000 - 1;
    return Math.max(0, (total - warm) / Math.max(elapsed, 0.5));
  }
}
