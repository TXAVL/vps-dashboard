// ZenPanel - Cảnh báo chủ động: theo dõi CPU / RAM / ổ đĩa / dịch vụ, gửi Telegram, Discord hoặc webhook bất kỳ.
// Có cooldown để không spam và gửi thông báo "đã phục hồi" khi hết sự cố.
import type { OSAdapter } from '../adapters/base.adapter.js';
import type { MetricsCollector } from '../core/metrics.js';
import { getPrefs } from '../core/prefs.js';
import { readJson, writeJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';

const FILE = 'alerts.json';
const HISTORY_FILE = 'alerts-history.json';
const STATE_FILE = 'alerts-state.json';
const DAY_MS = 86_400_000;

interface RuleState {
  /** Đang trong sự cố */
  active: boolean;
  lastSent: number;
  /** Số tin đã gửi cho sự cố này (lần đầu + các lần nhắc) */
  sent: number;
  since: number;
}

export interface AlertConfig {
  telegram: { enabled: boolean; botToken: string; chatId: string; /** Địa chỉ API (để trống = https://api.telegram.org), dùng relay khi VPS bị chặn Telegram */ apiBase: string };
  discord: { enabled: boolean; webhookUrl: string };
  webhook: { enabled: boolean; url: string };
  rules: {
    cpu: { enabled: boolean; threshold: number; minutes: number };
    ram: { enabled: boolean; threshold: number; minutes: number };
    disk: { enabled: boolean; threshold: number };
    services: { enabled: boolean; names: string[] };
    vpsExpiry: { enabled: boolean };
  };
  /** Nhắc lại nếu sự cố chưa hết: khoảng cách giữa 2 lần nhắc đầu tiên (phút), sau đó tăng gấp đôi, tối đa 24 giờ. 0 = chỉ báo 1 lần */
  cooldownMinutes: number;
  cooldownSchema?: number;
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
  telegram: { enabled: false, botToken: '', chatId: '', apiBase: '' },
  discord: { enabled: false, webhookUrl: '' },
  webhook: { enabled: false, url: '' },
  rules: {
    cpu: { enabled: true, threshold: 90, minutes: 5 },
    ram: { enabled: true, threshold: 90, minutes: 5 },
    disk: { enabled: true, threshold: 90 },
    services: { enabled: false, names: [] },
    vpsExpiry: { enabled: true },
  },
  cooldownMinutes: 360,
  cooldownSchema: 2,
};

const TELEGRAM_TOKEN = /^\d{6,14}:[\w-]{30,60}$/;
const DISCORD_WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export interface ChannelCheck {
  channel: 'telegram' | 'discord';
  host: string;
  reachable: boolean;
  ms: number | null;
  detail: string;
}

/** Biến lỗi API của Telegram / Discord thành hướng dẫn tiếng Việt cụ thể */
function friendlyTelegram(status: number, description: string): string {
  const d = description.toLowerCase();
  if (status === 401 || d.includes('unauthorized')) return 'Bot token sai hoặc đã bị thu hồi. Lấy token mới từ @BotFather (lệnh /token).';
  if (d.includes('chat not found')) return 'Không tìm thấy Chat ID. Hãy mở bot, bấm Start / gửi 1 tin nhắn cho bot trước (với nhóm: thêm bot vào nhóm rồi nhắn trong nhóm), hoặc dùng nút "Tự lấy Chat ID".';
  if (d.includes('bot was blocked')) return 'Bạn đã chặn bot. Mở bot trên Telegram và bấm Unblock / Restart.';
  if (d.includes('kicked') || d.includes('not a member')) return 'Bot đã bị xoá khỏi nhóm / kênh. Thêm lại bot (với kênh: đặt bot làm quản trị viên có quyền đăng bài).';
  if (d.includes('have no rights')) return 'Bot không có quyền gửi tin ở đây. Với kênh hoặc nhóm: cấp quyền "Đăng tin nhắn" cho bot.';
  if (status === 429) return 'Telegram đang giới hạn tốc độ, thử lại sau ít giây.';
  if (status === 404) return 'Token không đúng định dạng (phải dạng 123456789:AAxxxx...).';
  return `Telegram trả lỗi ${status}: ${description}`;
}

function friendlyDiscord(status: number, body: string): string {
  if (status === 404) return 'Webhook không tồn tại (đã bị xoá hoặc URL sai). Tạo lại webhook ở Cài đặt kênh → Tích hợp → Webhook.';
  if (status === 401) return 'Webhook không hợp lệ (sai token trong URL).';
  if (status === 429) return 'Discord đang giới hạn tốc độ, thử lại sau ít giây.';
  if (status === 400) return `Discord từ chối nội dung: ${body.slice(0, 120)}`;
  return `Discord trả lỗi ${status}: ${body.slice(0, 120)}`;
}

const mask = (v: string) => (v.length > 10 ? `${v.slice(0, 4)}••••••${v.slice(-4)}` : v ? '••••••' : '');

export class AlertService {
  private timer: NodeJS.Timeout | null = null;
  /** Số mẫu liên tiếp vượt ngưỡng */
  private streak = new Map<string, number>();
  /** Trạng thái từng cảnh báo, lưu ra đĩa để khởi động lại (vd khi cập nhật) KHÔNG báo lại từ đầu */
  private state = new Map<string, RuleState>(Object.entries(readJson<Record<string, RuleState>>(STATE_FILE, {})));
  private hostname = '';

  constructor(
    private readonly adapter: OSAdapter,
    private readonly metrics: MetricsCollector,
  ) {}

  private load(): AlertConfig {
    const saved = readJson<Partial<AlertConfig>>(FILE, {});
    // Mặc định cũ (30 phút) gây spam: nâng lên 6 giờ cho cấu hình đã lưu bằng bản cũ
    const migrated = saved.cooldownSchema === 2 ? saved.cooldownMinutes : saved.cooldownMinutes === undefined || saved.cooldownMinutes === 30 ? DEFAULT_ALERTS.cooldownMinutes : saved.cooldownMinutes;
    return {
      ...DEFAULT_ALERTS,
      ...saved,
      cooldownMinutes: migrated ?? DEFAULT_ALERTS.cooldownMinutes,
      cooldownSchema: 2,
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
        apiBase: (input.telegram?.apiBase ?? cur.telegram.apiBase ?? '').trim().replace(/\/+$/, ''),
      },
      discord: { enabled: input.discord?.enabled ?? cur.discord.enabled, webhookUrl: keepSecret(input.discord?.webhookUrl, cur.discord.webhookUrl) },
      webhook: { enabled: input.webhook?.enabled ?? cur.webhook.enabled, url: keepSecret(input.webhook?.url, cur.webhook.url) },
      rules: { ...cur.rules, ...(input.rules ?? {}) } as AlertConfig['rules'],
      cooldownMinutes: Math.min(1440, Math.max(0, Math.round(Number(input.cooldownMinutes ?? cur.cooldownMinutes)))) || 0,
      cooldownSchema: 2,
    };
    for (const url of [next.discord.webhookUrl, next.webhook.url, next.telegram.apiBase]) {
      if (url && !/^https:\/\//i.test(url)) throw badRequest('URL phải bắt đầu bằng https://');
    }
    if (next.telegram.botToken && !TELEGRAM_TOKEN.test(next.telegram.botToken)) throw badRequest('Bot token Telegram không đúng định dạng. Token có dạng 123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (lấy từ @BotFather).');
    if (next.telegram.chatId && !/^(-?\d{4,20}|@[A-Za-z][\w]{4,31})$/.test(next.telegram.chatId)) throw badRequest('Chat ID là một số (nhóm thường bắt đầu bằng -100...) hoặc @tên_kênh công khai.');
    if (next.discord.webhookUrl && !DISCORD_WEBHOOK.test(next.discord.webhookUrl)) throw badRequest('URL webhook Discord phải có dạng https://discord.com/api/webhooks/<số>/<mã>.');
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
    const post = async (name: string, url: string, body: unknown, friendly?: (status: number, text: string) => string) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let description = text;
        try {
          description = (JSON.parse(text) as { description?: string; message?: string }).description ?? (JSON.parse(text) as { message?: string }).message ?? text;
        } catch {
          // giữ nguyên text
        }
        throw new Error(friendly ? friendly(res.status, description) : `HTTP ${res.status} ${description.slice(0, 120)}`);
      }
      sent.push(name);
    };
    const jobs: [string, () => Promise<void>][] = [];
    if ((!only || only === 'telegram') && (c.telegram.enabled || only === 'telegram') && c.telegram.botToken && c.telegram.chatId) {
      const base = c.telegram.apiBase || 'https://api.telegram.org';
      jobs.push(['Telegram', () => post('Telegram', `${base}/bot${c.telegram.botToken}/sendMessage`, { chat_id: c.telegram.chatId, text: text.slice(0, 4000), disable_web_page_preview: true }, (st, d) => friendlyTelegram(st, d))]);
    }
    if ((!only || only === 'discord') && (c.discord.enabled || only === 'discord') && c.discord.webhookUrl) {
      jobs.push(['Discord', () => post('Discord', c.discord.webhookUrl, { content: text.slice(0, 1900) }, (st, d) => friendlyDiscord(st, d))]);
    }
    if ((!only || only === 'webhook') && (c.webhook.enabled || only === 'webhook') && c.webhook.url) {
      jobs.push(['Webhook', () => post('Webhook', c.webhook.url, { text, source: 'zenpanel', host: this.hostname, at: new Date().toISOString() })]);
    }
    if (!only && !jobs.length) return { sent, errors: ['Chưa bật kênh thông báo nào'] };
    if (only && !jobs.length) return { sent, errors: [only === 'telegram' ? 'Thiếu Bot token hoặc Chat ID' : only === 'discord' ? 'Thiếu URL webhook Discord' : 'Thiếu URL webhook'] };
    for (const [name, fn] of jobs) await fn().catch((err: Error) => errors.push(`${name}: ${this.redact(err.message, c)}`));
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

  /** Che token / webhook nếu lỡ nằm trong thông báo lỗi mạng (vd URL trong ECONNREFUSED) */
  private redact(text: string, c: AlertConfig): string {
    let out = text;
    for (const secret of [c.telegram.botToken, c.discord.webhookUrl, c.webhook.url]) if (secret) out = out.split(secret).join('***');
    return out.replace(/bot\d+:[\w-]+/g, 'bot***');
  }

  /** Thử từ chính VPS: DNS + HTTPS tới Telegram và Discord (nhiều VPS / nhà mạng chặn Telegram) */
  async connectivity(): Promise<ChannelCheck[]> {
    const c = this.load();
    const targets: [ChannelCheck['channel'], string][] = [
      ['telegram', c.telegram.apiBase || 'https://api.telegram.org'],
      ['discord', 'https://discord.com/api/v10/gateway'],
    ];
    return Promise.all(
      targets.map(async ([channel, url]): Promise<ChannelCheck> => {
        const host = new URL(url).host;
        const started = Date.now();
        try {
          const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
          // Mọi phản hồi HTTP (kể cả 302/404) nghĩa là đường mạng thông
          return { channel, host, reachable: true, ms: Date.now() - started, detail: `Kết nối được ${host} (HTTP ${res.status}, ${Date.now() - started} ms)` };
        } catch (err) {
          const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
          const hint =
            code === 'ENOTFOUND' || code === 'EAI_AGAIN'
              ? 'Không phân giải được tên miền: kiểm tra DNS của VPS (Truy cập SSH → Hostname & DNS).'
              : code === 'TimeoutError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT'
                ? `Hết thời gian chờ: ${channel === 'telegram' ? 'Telegram hay bị chặn ở một số nhà mạng / quốc gia. Dùng "Địa chỉ API relay" bên dưới hoặc chuyển sang Discord / Webhook.' : 'tường lửa chặn kết nối ra ngoài (cổng 443)?'}`
                : `Lỗi ${code}`;
          return { channel, host, reachable: false, ms: null, detail: hint };
        }
      }),
    );
  }

  /** Xác thực token qua getMe, trả tên bot để người dùng biết đã đúng bot */
  async telegramVerify(token?: string): Promise<{ id: number; username: string; name: string }> {
    const c = this.load();
    const t = !token || token.includes('••') ? c.telegram.botToken : token.trim();
    if (!TELEGRAM_TOKEN.test(t)) throw badRequest('Chưa nhập Bot token đúng định dạng (123456789:AAF...)');
    const base = c.telegram.apiBase || 'https://api.telegram.org';
    const res = await fetch(`${base}/bot${t}/getMe`, { signal: AbortSignal.timeout(15_000) }).catch((err: Error) => {
      throw badRequest(`Không kết nối được Telegram: ${this.redact(err.message, c)}. Kiểm tra mục "Kiểm tra kết nối từ VPS".`);
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { id: number; username: string; first_name: string }; error_code?: number; description?: string };
    if (!json.ok || !json.result) throw badRequest(friendlyTelegram(json.error_code ?? res.status, json.description ?? ''));
    return { id: json.result.id, username: json.result.username, name: json.result.first_name };
  }

  /** Đọc getUpdates để tìm Chat ID: người dùng nhắn bot (hoặc thêm bot vào nhóm rồi nhắn) rồi bấm nút */
  async telegramDetectChats(token?: string): Promise<{ id: string; type: string; title: string }[]> {
    const c = this.load();
    const t = !token || token.includes('••') ? c.telegram.botToken : token.trim();
    const bot = await this.telegramVerify(t);
    const base = c.telegram.apiBase || 'https://api.telegram.org';
    const res = await fetch(`${base}/bot${t}/getUpdates?limit=100&allowed_updates=${encodeURIComponent('["message","channel_post","my_chat_member"]')}`, { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; error_code?: number; result?: { message?: { chat: Chat }; channel_post?: { chat: Chat }; my_chat_member?: { chat: Chat } }[] };
    if (!json.ok) {
      if (json.error_code === 409) throw badRequest('Bot đang có webhook nên không đọc được tin. Xoá webhook của bot hoặc nhập Chat ID thủ công.');
      throw badRequest(friendlyTelegram(json.error_code ?? res.status, json.description ?? ''));
    }
    const chats = new Map<string, { id: string; type: string; title: string }>();
    for (const u of json.result ?? []) {
      const chat = (u.message ?? u.channel_post ?? u.my_chat_member)?.chat;
      if (chat) chats.set(String(chat.id), { id: String(chat.id), type: chat.type, title: chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id)) });
    }
    if (!chats.size) throw badRequest(`Chưa thấy cuộc trò chuyện nào. Mở Telegram, tìm @${bot.username}, bấm Start (hoặc thêm bot vào nhóm rồi nhắn 1 tin), sau đó bấm lại nút này.`);
    return [...chats.values()];
  }

  private saveState(): void {
    writeJson(STATE_FILE, Object.fromEntries(this.state));
  }

  private static duration(ms: number): string {
    const m = Math.round(ms / 60_000);
    return m < 60 ? `${m} phút` : m < 2880 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} giờ` : `${Math.round(m / 1440)} ngày`;
  }

  /**
   * Gửi cảnh báo có kiểm soát spam:
   * - Lần đầu: gửi ngay. Các lần sau chỉ NHẮC LẠI khi sự cố chưa hết, thưa dần: N, 2N, 4N... tối đa 24 giờ (N = cấu hình "nhắc lại", 0 = không nhắc)
   * - Phục hồi: chỉ gửi nếu trước đó đã báo sự cố
   * - Trạng thái được lưu ra đĩa nên khởi động lại không báo lại từ đầu
   */
  private async fire(rule: string, level: 'warn' | 'recovered', message: string, opts: { minRepeatMin?: number } = {}): Promise<void> {
    const c = this.load();
    const now = Date.now();
    const st = this.state.get(rule);
    let text = message;
    if (level === 'warn') {
      if (st?.active) {
        if (c.cooldownMinutes === 0) return;
        const interval = Math.min(DAY_MS, Math.max(c.cooldownMinutes * 60_000 * 2 ** (st.sent - 1), (opts.minRepeatMin ?? 0) * 60_000));
        if (now - st.lastSent < interval) return;
        text = `🔁 Nhắc lại (lần ${st.sent}, sự cố đã kéo dài ${AlertService.duration(now - st.since)}): ${message}`;
        this.state.set(rule, { ...st, lastSent: now, sent: st.sent + 1 });
      } else {
        this.state.set(rule, { active: true, lastSent: now, sent: 1, since: now });
      }
    } else {
      if (!st?.active) return;
      text = `${message} (sự cố kéo dài ${AlertService.duration(now - st.since)})`;
      this.state.delete(rule);
    }
    this.saveState();
    const { sent, errors } = await this.dispatch(`${level === 'warn' ? '⚠️' : '✅'} ZenPanel · ${this.hostname}\n${text}`);
    this.record({ at: new Date().toISOString(), rule, level, message: text, sent, errors });
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

    /** Đang trong sự cố thì chỉ coi là hết khi xuống dưới (ngưỡng - biên), tránh báo ra/vào liên tục khi số liệu dao động quanh ngưỡng */
    const bad = (key: string, value: number, threshold: number, margin: number) => (this.state.get(key)?.active ? value >= threshold - margin : value >= threshold);

    if (c.rules.cpu.enabled) {
      const r = c.rules.cpu;
      const isBad = bad('cpu', snap.cpu.usage, r.threshold, 5);
      if (this.state.get('cpu')?.active) {
        await this.fire('cpu', isBad ? 'warn' : 'recovered', isBad ? `CPU vẫn ${snap.cpu.usage.toFixed(0)}% (ngưỡng ${r.threshold}%).` : `CPU đã về ${snap.cpu.usage.toFixed(0)}%.`);
      } else if (sustained('cpu', isBad, r.minutes)) {
        await this.fire('cpu', 'warn', `CPU ${snap.cpu.usage.toFixed(0)}% (ngưỡng ${r.threshold}%) kéo dài ≥ ${r.minutes} phút.`);
      }
    }
    if (c.rules.ram.enabled) {
      const r = c.rules.ram;
      const pct = (snap.memory.used / snap.memory.total) * 100;
      const isBad = bad('ram', pct, r.threshold, 5);
      if (this.state.get('ram')?.active) {
        await this.fire('ram', isBad ? 'warn' : 'recovered', isBad ? `RAM vẫn ${pct.toFixed(0)}% (ngưỡng ${r.threshold}%).` : `RAM đã về ${pct.toFixed(0)}%.`);
      } else if (sustained('ram', isBad, r.minutes)) {
        await this.fire('ram', 'warn', `RAM ${pct.toFixed(0)}% (ngưỡng ${r.threshold}%) kéo dài ≥ ${r.minutes} phút. Vào "Dọn dẹp & RAM" để tối ưu.`);
      }
    }
    if (c.rules.disk.enabled) {
      // Gộp mọi ổ đầy vào MỘT tin (trước đây mỗi ổ một tin riêng nên ổ nào đầy cũng spam)
      const full = snap.disks.filter((d) => d.total && bad('disk', (d.used / d.total) * 100, c.rules.disk.threshold, 3));
      const detail = full.map((d) => `${d.mount} ${((d.used / d.total) * 100).toFixed(0)}% (còn ${((d.total - d.used) / 1073741824).toFixed(1)} GB)`).join(', ');
      if (full.length) await this.fire('disk', 'warn', `Ổ đĩa gần đầy (ngưỡng ${c.rules.disk.threshold}%): ${detail}. Vào "Dọn dẹp & RAM" để giải phóng dung lượng.`);
      else await this.fire('disk', 'recovered', 'Ổ đĩa đã xuống dưới ngưỡng cảnh báo.');
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
        if (days <= prefs.expiryWarnDays) {
          // Hạn VPS nhắc tối đa 1 lần / ngày, không theo khoảng nhắc ngắn của sự cố kỹ thuật
          await this.fire('vps-expiry', 'warn', days < 0 ? `VPS đã hết hạn ${-days} ngày.` : `VPS hết hạn sau ${days} ngày${prefs.vpsRenewUrl ? ` — gia hạn: ${prefs.vpsRenewUrl}` : ''}.`, { minRepeatMin: 1440 });
        } else if (this.state.delete('vps-expiry')) this.saveState();
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

interface Chat {
  id: number;
  type: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}
