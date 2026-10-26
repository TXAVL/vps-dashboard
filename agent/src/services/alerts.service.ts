// ZenPanel - Cảnh báo chủ động: theo dõi CPU / RAM / ổ đĩa / dịch vụ, gửi Telegram, Discord hoặc webhook bất kỳ.
// Có cooldown để không spam và gửi thông báo "đã phục hồi" khi hết sự cố.
import type { OSAdapter } from '../adapters/base.adapter.js';
import type { MetricsCollector } from '../core/metrics.js';
import { getPrefs } from '../core/prefs.js';
import { readJson, writeJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';

const FILE = 'alerts.json';
const HISTORY_FILE = 'alerts-history.json';

export interface AlertConfig {
  telegram: { enabled: boolean; botToken: string; chatId: string };
  discord: { enabled: boolean; webhookUrl: string };
  webhook: { enabled: boolean; url: string };
  rules: {
    cpu: { enabled: boolean; threshold: number; minutes: number };
    ram: { enabled: boolean; threshold: number; minutes: number };
    disk: { enabled: boolean; threshold: number };
    services: { enabled: boolean; names: string[] };
    vpsExpiry: { enabled: boolean };
  };
  cooldownMinutes: number;
}

export interface AlertEvent {
  at: string;
  rule: string;
  level: 'warn' | 'recovered' | 'test';
  message: string;
  sent: string[];
  errors: string[];
}

export const DEFAULT_ALERTS: AlertConfig = {
  telegram: { enabled: false, botToken: '', chatId: '' },
  discord: { enabled: false, webhookUrl: '' },
  webhook: { enabled: false, url: '' },
  rules: {
    cpu: { enabled: true, threshold: 90, minutes: 5 },
    ram: { enabled: true, threshold: 90, minutes: 5 },
    disk: { enabled: true, threshold: 90 },
    services: { enabled: false, names: [] },
    vpsExpiry: { enabled: true },
  },
  cooldownMinutes: 30,
};

const mask = (v: string) => (v.length > 10 ? `${v.slice(0, 4)}••••••${v.slice(-4)}` : v ? '••••••' : '');

export class AlertService {
  private timer: NodeJS.Timeout | null = null;
  /** Số mẫu liên tiếp vượt ngưỡng */
  private streak = new Map<string, number>();
  private lastSent = new Map<string, number>();
  private active = new Set<string>();
  private hostname = '';

  constructor(
    private readonly adapter: OSAdapter,
    private readonly metrics: MetricsCollector,
  ) {}

  private load(): AlertConfig {
    const saved = readJson<Partial<AlertConfig>>(FILE, {});
    return {
      ...DEFAULT_ALERTS,
      ...saved,
      telegram: { ...DEFAULT_ALERTS.telegram, ...saved.telegram },
      discord: { ...DEFAULT_ALERTS.discord, ...saved.discord },
      webhook: { ...DEFAULT_ALERTS.webhook, ...saved.webhook },
      rules: {
        cpu: { ...DEFAULT_ALERTS.rules.cpu, ...saved.rules?.cpu },
        ram: { ...DEFAULT_ALERTS.rules.ram, ...saved.rules?.ram },
        disk: { ...DEFAULT_ALERTS.rules.disk, ...saved.rules?.disk },
        services: { ...DEFAULT_ALERTS.rules.services, ...saved.rules?.services },
        vpsExpiry: { ...DEFAULT_ALERTS.rules.vpsExpiry, ...saved.rules?.vpsExpiry },
      },
    };
  }

  /** Cấu hình trả về dashboard: che token / webhook */
  view() {
    const c = this.load();
    return {
      ...c,
      telegram: { ...c.telegram, botToken: mask(c.telegram.botToken), hasToken: Boolean(c.telegram.botToken) },
      discord: { ...c.discord, webhookUrl: mask(c.discord.webhookUrl), hasUrl: Boolean(c.discord.webhookUrl) },
      webhook: { ...c.webhook, url: mask(c.webhook.url), hasUrl: Boolean(c.webhook.url) },
    };
  }

  save(input: Partial<AlertConfig> & { telegram?: Partial<AlertConfig['telegram']>; discord?: Partial<AlertConfig['discord']>; webhook?: Partial<AlertConfig['webhook']> }): ReturnType<AlertService['view']> {
    const cur = this.load();
    const keepSecret = (incoming: string | undefined, old: string) => (incoming === undefined || incoming.includes('••') ? old : incoming.trim());
    const next: AlertConfig = {
      ...cur,
      telegram: {
        enabled: input.telegram?.enabled ?? cur.telegram.enabled,
        botToken: keepSecret(input.telegram?.botToken, cur.telegram.botToken),
        chatId: input.telegram?.chatId?.trim() ?? cur.telegram.chatId,
      },
      discord: { enabled: input.discord?.enabled ?? cur.discord.enabled, webhookUrl: keepSecret(input.discord?.webhookUrl, cur.discord.webhookUrl) },
      webhook: { enabled: input.webhook?.enabled ?? cur.webhook.enabled, url: keepSecret(input.webhook?.url, cur.webhook.url) },
      rules: { ...cur.rules, ...(input.rules ?? {}) } as AlertConfig['rules'],
      cooldownMinutes: Math.min(1440, Math.max(1, Math.round(Number(input.cooldownMinutes ?? cur.cooldownMinutes) || 30))),
    };
    for (const url of [next.discord.webhookUrl, next.webhook.url]) {
      if (url && !/^https:\/\//i.test(url)) throw badRequest('URL webhook phải bắt đầu bằng https://');
    }
    for (const key of ['cpu', 'ram'] as const) {
      next.rules[key].threshold = Math.min(100, Math.max(10, Math.round(Number(next.rules[key].threshold) || 90)));
      next.rules[key].minutes = Math.min(120, Math.max(1, Math.round(Number(next.rules[key].minutes) || 5)));
    }
    next.rules.disk.threshold = Math.min(99, Math.max(50, Math.round(Number(next.rules.disk.threshold) || 90)));
    next.rules.services.names = (next.rules.services.names ?? []).map(String).filter((n) => /^[\w@.\- ]{1,100}$/.test(n)).slice(0, 30);
    writeJson(FILE, next);
    return this.view();
  }

  history(): AlertEvent[] {
    return readJson<AlertEvent[]>(HISTORY_FILE, []);
  }

  clearHistory(): void {
    writeJson(HISTORY_FILE, []);
  }

  private record(event: AlertEvent): void {
    writeJson(HISTORY_FILE, [event, ...this.history()].slice(0, 200));
  }

  /** Gửi tới mọi kênh đang bật; trả về kênh gửi được và lỗi từng kênh */
  async dispatch(text: string, only?: 'telegram' | 'discord' | 'webhook'): Promise<{ sent: string[]; errors: string[] }> {
    const c = this.load();
    const sent: string[] = [];
    const errors: string[] = [];
    const post = async (name: string, url: string, body: unknown) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
      sent.push(name);
    };
    const jobs: [string, () => Promise<void>][] = [];
    if ((!only || only === 'telegram') && (c.telegram.enabled || only === 'telegram') && c.telegram.botToken && c.telegram.chatId) {
      jobs.push(['Telegram', () => post('Telegram', `https://api.telegram.org/bot${c.telegram.botToken}/sendMessage`, { chat_id: c.telegram.chatId, text, disable_web_page_preview: true })]);
    }
    if ((!only || only === 'discord') && (c.discord.enabled || only === 'discord') && c.discord.webhookUrl) {
      jobs.push(['Discord', () => post('Discord', c.discord.webhookUrl, { content: text.slice(0, 1900) })]);
    }
    if ((!only || only === 'webhook') && (c.webhook.enabled || only === 'webhook') && c.webhook.url) {
      jobs.push(['Webhook', () => post('Webhook', c.webhook.url, { text, source: 'zenpanel', host: this.hostname, at: new Date().toISOString() })]);
    }
    if (!only && !jobs.length) return { sent, errors: ['Chưa bật kênh thông báo nào'] };
    for (const [name, fn] of jobs) await fn().catch((err: Error) => errors.push(`${name}: ${err.message.replace(c.telegram.botToken, '***')}`));
    return { sent, errors };
  }

  async test(channel: 'telegram' | 'discord' | 'webhook'): Promise<AlertEvent> {
    const message = `✅ ZenPanel · ${this.hostname || 'máy chủ'}: tin nhắn thử kênh ${channel}. Cảnh báo sẽ gửi về đây.`;
    const { sent, errors } = await this.dispatch(message, channel);
    const event: AlertEvent = { at: new Date().toISOString(), rule: 'test', level: 'test', message, sent, errors };
    this.record(event);
    if (!sent.length) throw badRequest(errors[0] ?? 'Kênh chưa được cấu hình đủ thông tin');
    return event;
  }

  private async fire(rule: string, level: 'warn' | 'recovered', message: string): Promise<void> {
    const c = this.load();
    const now = Date.now();
    if (level === 'warn') {
      if (now - (this.lastSent.get(rule) ?? 0) < c.cooldownMinutes * 60_000) return;
      this.lastSent.set(rule, now);
      this.active.add(rule);
    } else {
      if (!this.active.delete(rule)) return;
      this.lastSent.delete(rule);
    }
    const text = `${level === 'warn' ? '⚠️' : '✅'} ZenPanel · ${this.hostname}\n${message}`;
    const { sent, errors } = await this.dispatch(text);
    this.record({ at: new Date().toISOString(), rule, level, message, sent, errors });
  }

  /** Trạng thái vượt ngưỡng phải kéo dài đủ số phút mới báo (tránh đỉnh CPU thoáng qua) */
  private async check(): Promise<void> {
    const c = this.load();
    const snap = this.metrics.latest();
    if (!snap) return;
    this.hostname ||= (await this.adapter.getInfo().catch(() => null))?.hostname ?? '';

    const sustained = (key: string, over: boolean, minutes: number) => {
      const n = over ? (this.streak.get(key) ?? 0) + 1 : 0;
      this.streak.set(key, n);
      return n * 30 >= minutes * 60;
    };

    if (c.rules.cpu.enabled) {
      const over = snap.cpu.usage >= c.rules.cpu.threshold;
      if (sustained('cpu', over, c.rules.cpu.minutes)) await this.fire('cpu', 'warn', `CPU ${snap.cpu.usage.toFixed(0)}% (ngưỡng ${c.rules.cpu.threshold}%) kéo dài ≥ ${c.rules.cpu.minutes} phút.`);
      else if (!over) await this.fire('cpu', 'recovered', `CPU đã về ${snap.cpu.usage.toFixed(0)}%.`);
    }
    if (c.rules.ram.enabled) {
      const pct = (snap.memory.used / snap.memory.total) * 100;
      const over = pct >= c.rules.ram.threshold;
      if (sustained('ram', over, c.rules.ram.minutes)) await this.fire('ram', 'warn', `RAM ${pct.toFixed(0)}% (ngưỡng ${c.rules.ram.threshold}%) kéo dài ≥ ${c.rules.ram.minutes} phút. Vào "Dọn dẹp & RAM" để tối ưu.`);
      else if (!over) await this.fire('ram', 'recovered', `RAM đã về ${pct.toFixed(0)}%.`);
    }
    if (c.rules.disk.enabled) {
      for (const d of snap.disks) {
        const pct = d.total ? (d.used / d.total) * 100 : 0;
        const key = `disk:${d.mount}`;
        if (pct >= c.rules.disk.threshold) await this.fire(key, 'warn', `Ổ đĩa ${d.mount} đầy ${pct.toFixed(0)}% (còn ${((d.total - d.used) / 1073741824).toFixed(1)} GB).`);
        else await this.fire(key, 'recovered', `Ổ đĩa ${d.mount} đã còn ${pct.toFixed(0)}%.`);
      }
    }
    if (c.rules.services.enabled) {
      for (const name of c.rules.services.names) {
        const svc = await this.adapter.getService(name).catch(() => null);
        const key = `service:${name}`;
        if (!svc || svc.state === 'running') {
          if (svc) await this.fire(key, 'recovered', `Dịch vụ ${svc.displayName} đã chạy lại.`);
        } else if (sustained(key, true, 1)) await this.fire(key, 'warn', `Dịch vụ ${svc.displayName} (${name}) đang ${svc.state === 'failed' ? 'LỖI' : 'DỪNG'}.`);
      }
    }
    if (c.rules.vpsExpiry.enabled) {
      const prefs = getPrefs();
      if (prefs.vpsExpiry) {
        const days = Math.ceil((new Date(`${prefs.vpsExpiry}T23:59:59`).getTime() - now()) / 86_400_000);
        if (days <= prefs.expiryWarnDays) await this.fire('vps-expiry', 'warn', days < 0 ? `VPS đã hết hạn ${-days} ngày.` : `VPS hết hạn sau ${days} ngày${prefs.vpsRenewUrl ? ` — gia hạn: ${prefs.vpsRenewUrl}` : ''}.`);
      }
    }
  }

  start(): void {
    this.timer = setInterval(() => void this.check().catch(() => undefined), 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

const now = () => Date.now();
