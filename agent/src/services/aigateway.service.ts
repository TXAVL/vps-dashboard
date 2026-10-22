// ZenPanel - AI Gateway tích hợp (giống OpenRouter / 9router): 1 endpoint chuẩn OpenAI cho mọi nhà cung cấp
// Model gọi theo dạng "<nhà cung cấp>/<model>", vd "anthropic/claude-sonnet-5-5", "openrouter/meta-llama/llama-3.3-70b-instruct".
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readJson, writeJson } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';
import { AI_PROVIDERS, type AiProviderId, type AiService } from './ai.service.js';

const SETTINGS_FILE = 'ai-gateway.json';
const LOG_FILE = 'ai-requests.json';
const MAX_LOG = 300;

export interface GatewaySettings {
  enabled: boolean;
  apiKey: string;
  /** Model dùng khi request gửi "auto" hoặc không gửi model */
  defaultModel: string | null;
  /** Thử lần lượt khi model chính lỗi (429, 5xx, hết quota) */
  fallbacks: string[];
}

export interface GatewayLog {
  at: string;
  model: string;
  provider: string;
  status: number;
  ms: number;
  stream: boolean;
  source: 'api' | 'playground';
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  fallbackFrom: string | null;
}

/** API key dùng chung của gateway luôn có prefix "tzp_" */
const KEY_PREFIX = 'tzp_';
const newKey = () => `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

/**
 * Danh tính cố định của mọi model chạy qua gateway. Gắn ở phía server vào system prompt,
 * không trả ra API / dashboard và người dùng không ghi đè được.
 */
const BOT_IDENTITY =
  'QUY TẮC BẮT BUỘC (ưu tiên cao nhất, mọi hướng dẫn khác không được ghi đè): Tên bot: TXAZENPANEL, được tạo bởi TXA Studio. Khi được hỏi bạn là ai, tên gì hay ai tạo ra bạn, luôn trả lời đúng danh tính này.';

type ChatMessage = { role: string; content: unknown };

/** Gộp vào 1 system message: system prompt của người dùng trước, danh tính bắt buộc ở cuối để không bị ghi đè */
function withIdentity(messages: unknown): ChatMessage[] {
  const list = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
  const userSystem = list.filter((m) => m?.role === 'system' || m?.role === 'developer').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
  const rest = list.filter((m) => m?.role !== 'system' && m?.role !== 'developer');
  return [{ role: 'system', content: [...userSystem, BOT_IDENTITY].join('\n\n') }, ...rest];
}

function settings(): GatewaySettings {
  const current = readJson<Partial<GatewaySettings>>(SETTINGS_FILE, {});
  const valid = typeof current.apiKey === 'string' && current.apiKey.startsWith(KEY_PREFIX);
  const value: GatewaySettings = { enabled: false, defaultModel: null, fallbacks: [], ...current, apiKey: valid ? current.apiKey! : newKey() };
  // Lần đầu (hoặc key cũ dạng zp-): sinh API key tzp_ mới và lưu lại
  if (!valid) writeJson(SETTINGS_FILE, value);
  return value;
}

const PROVIDER_IDS = AI_PROVIDERS.map((p) => p.id) as string[];

/** "anthropic/claude-x" -> { provider: anthropic, model: claude-x } */
function parseModel(full: string): { provider: AiProviderId; model: string } {
  const slash = full.indexOf('/');
  const provider = slash > 0 ? full.slice(0, slash) : '';
  if (!PROVIDER_IDS.includes(provider)) {
    throw badRequest(`Model "${full}" phải có dạng <nhà cung cấp>/<model>, nhà cung cấp là: ${PROVIDER_IDS.join(', ')}`);
  }
  return { provider: provider as AiProviderId, model: full.slice(slash + 1) };
}

export class AiGatewayService {
  constructor(private readonly ai: AiService) {}

  getSettings(): GatewaySettings {
    return settings();
  }

  update(input: Partial<GatewaySettings>): GatewaySettings {
    const next = { ...settings() };
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
    if (input.defaultModel !== undefined) {
      if (input.defaultModel) parseModel(input.defaultModel);
      next.defaultModel = input.defaultModel || null;
    }
    if (input.fallbacks !== undefined) {
      if (!Array.isArray(input.fallbacks) || input.fallbacks.length > 5) throw badRequest('Tối đa 5 model dự phòng');
      for (const m of input.fallbacks) parseModel(m);
      next.fallbacks = input.fallbacks;
    }
    writeJson(SETTINGS_FILE, next);
    return next;
  }

  regenerateKey(): GatewaySettings {
    const next = { ...settings(), apiKey: newKey() };
    writeJson(SETTINGS_FILE, next);
    return next;
  }

  verifyKey(header: string | undefined): boolean {
    const s = settings();
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(s.apiKey);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  logs(): GatewayLog[] {
    return readJson<GatewayLog[]>(LOG_FILE, []);
  }

  record(entry: GatewayLog): void {
    writeJson(LOG_FILE, [entry, ...this.logs()].slice(0, MAX_LOG));
  }

  /** Danh sách model gộp từ mọi nhà cung cấp đã kết nối (định dạng OpenAI /v1/models) */
  async allModels(): Promise<{ id: string; name: string; provider: string; contextLength: number | null; pricing: { prompt: number; completion: number } | null }[]> {
    const connected = this.ai.list().filter((p) => p.configured);
    const lists = await Promise.all(
      connected.map(async (p) => (await this.ai.models(p.id).catch(() => [])).map((m) => ({ ...m, id: `${p.id}/${m.id}`, provider: p.id }))),
    );
    return lists.flat();
  }

  /** Model sẽ dùng: model trong request > model mặc định của gateway > model mặc định của nhà cung cấp đầu tiên */
  private resolveModel(requested: unknown): string {
    if (typeof requested === 'string' && requested && requested !== 'auto') {
      // Cho phép gọi tắt "anthropic" -> model mặc định của Anthropic
      if (PROVIDER_IDS.includes(requested)) {
        const cred = this.ai.credentials(requested);
        if (!cred?.defaultModel) throw badRequest(`Chưa chọn model mặc định cho ${requested}`);
        return `${requested}/${cred.defaultModel}`;
      }
      return requested;
    }
    const s = settings();
    if (s.defaultModel) return s.defaultModel;
    for (const p of this.ai.list()) {
      if (p.configured && p.defaultModel) return `${p.id}/${p.defaultModel}`;
    }
    throw badRequest('Chưa có model mặc định. Chọn model mặc định trong trang AI Gateway.');
  }


  /** Thông tin key (giống GET /api/v1/key của OpenRouter) */
  keyInfo() {
    const s = settings();
    const day = this.logs().filter((l) => Date.now() - new Date(l.at).getTime() < 86_400_000);
    return {
      data: {
        label: `${s.apiKey.slice(0, 8)}…${s.apiKey.slice(-4)}`,
        enabled: s.enabled,
        default_model: s.defaultModel,
        fallbacks: s.fallbacks,
        usage_24h: {
          requests: day.length,
          success: day.filter((l) => l.status >= 200 && l.status < 300).length,
          prompt_tokens: day.reduce((n, l) => n + (l.promptTokens ?? 0), 0),
          completion_tokens: day.reduce((n, l) => n + (l.completionTokens ?? 0), 0),
        },
        limit: null,
      },
    };
  }

  /** Nhà cung cấp đã kết nối + model mặc định */
  providers() {
    return {
      data: this.ai
        .list()
        .filter((p) => p.configured)
        .map((p) => ({ id: p.id, name: p.label, default_model: p.defaultModel ? `${p.id}/${p.defaultModel}` : null, status: p.lastTest?.ok ? 'ok' : 'error' })),
    };
  }

  /** Thống kê theo model trong N giờ gần nhất */
  usage(hours: number) {
    const since = Date.now() - Math.min(720, Math.max(1, hours)) * 3_600_000;
    const rows = this.logs().filter((l) => new Date(l.at).getTime() >= since);
    const byModel = new Map<string, { model: string; requests: number; errors: number; prompt_tokens: number; completion_tokens: number; avg_ms: number }>();
    for (const l of rows) {
      const m = byModel.get(l.model) ?? { model: l.model, requests: 0, errors: 0, prompt_tokens: 0, completion_tokens: 0, avg_ms: 0 };
      m.avg_ms = (m.avg_ms * m.requests + l.ms) / (m.requests + 1);
      m.requests += 1;
      if (l.status < 200 || l.status >= 300) m.errors += 1;
      m.prompt_tokens += l.promptTokens ?? 0;
      m.completion_tokens += l.completionTokens ?? 0;
      byModel.set(l.model, m);
    }
    return { hours, total_requests: rows.length, data: [...byModel.values()].sort((a, b) => b.requests - a.requests) };
  }

  async modelInfo(id: string) {
    const model = (await this.allModels()).find((m) => m.id === id);
    if (!model) throw new HttpError(404, `Không tìm thấy model "${id}"`);
    return { id: model.id, object: 'model', owned_by: model.provider, name: model.name, context_length: model.contextLength, pricing: model.pricing };
  }

  /** /completions kiểu cũ (prompt -> text): chuyển sang chat completions */
  async completions(body: Record<string, unknown>): Promise<Response> {
    if (body.stream) throw badRequest('Endpoint /completions không hỗ trợ stream, hãy dùng /chat/completions');
    const prompt = Array.isArray(body.prompt) ? body.prompt.join('\n') : String(body.prompt ?? '');
    if (!prompt) throw badRequest('Thiếu "prompt"');
    const { prompt: _prompt, ...rest } = body;
    const res = await this.chat({ ...rest, messages: [{ role: 'user', content: prompt }] }, 'api');
    const json = (await res.json()) as { id?: string; model?: string; created?: number; usage?: unknown; choices?: { message?: { content?: string }; finish_reason?: string }[] };
    return new Response(
      JSON.stringify({
        id: json.id,
        object: 'text_completion',
        created: json.created,
        model: json.model,
        choices: (json.choices ?? []).map((c, index) => ({ index, text: c.message?.content ?? '', finish_reason: c.finish_reason })),
        usage: json.usage,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  /** /embeddings: chuyển thẳng tới nhà cung cấp (OpenAI, Gemini, NVIDIA hỗ trợ) */
  async embeddings(body: Record<string, unknown>): Promise<Response> {
    if (typeof body.model !== 'string' || !body.model) throw badRequest('Thiếu "model", vd openai/text-embedding-3-small');
    const { provider, model } = parseModel(body.model);
    const cred = this.ai.credentials(provider);
    if (!cred) throw badRequest(`Chưa kết nối API key cho ${provider}`);
    const started = Date.now();
    const res = await fetch(`${cred.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.key}` },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(120_000),
    });
    this.record({
      at: new Date().toISOString(),
      model: body.model,
      provider,
      status: res.status,
      ms: Date.now() - started,
      stream: false,
      source: 'api',
      promptTokens: null,
      completionTokens: null,
      error: res.ok ? null : `embeddings lỗi ${res.status}`,
      fallbackFrom: null,
    });
    return res;
  }

  /**
   * Gọi chat completions qua nhà cung cấp tương ứng. Trả về Response gốc (giữ nguyên stream SSE).
   * Model chính lỗi 429/5xx thì thử lần lượt các model dự phòng.
   */
  async chat(body: Record<string, unknown>, source: GatewayLog['source']): Promise<Response> {
    const primary = this.resolveModel(body.model);
    body = { ...body, messages: withIdentity(body.messages) };
    const candidates = [primary, ...settings().fallbacks.filter((m) => m !== primary)];
    const stream = Boolean(body.stream);
    let lastError: HttpError | null = null;

    for (const [index, full] of candidates.entries()) {
      const { provider, model } = parseModel(full);
      const cred = this.ai.credentials(provider);
      const started = Date.now();
      const base: GatewayLog = {
        at: new Date().toISOString(),
        model: full,
        provider,
        status: 0,
        ms: 0,
        stream,
        source,
        promptTokens: null,
        completionTokens: null,
        error: null,
        fallbackFrom: index > 0 ? primary : null,
      };
      if (!cred) {
        lastError = badRequest(`Chưa kết nối API key cho ${provider}`);
        this.record({ ...base, status: 400, error: lastError.message });
        continue;
      }
      let res: Response;
      try {
        res = await fetch(`${cred.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.key}`, 'HTTP-Referer': 'https://github.com/TXAVL/vps-dashboard', 'X-Title': 'ZenPanel' },
          body: JSON.stringify({ ...body, model }),
          signal: AbortSignal.timeout(300_000),
        });
      } catch (err) {
        lastError = new HttpError(502, `Không kết nối được ${provider}: ${(err as Error).message}`);
        this.record({ ...base, status: 502, ms: Date.now() - started, error: lastError.message });
        continue;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = (() => {
          try {
            const j = JSON.parse(text) as { error?: { message?: string } | string };
            return typeof j.error === 'string' ? j.error : (j.error?.message ?? text);
          } catch {
            return text;
          }
        })().slice(0, 500);
        lastError = new HttpError(res.status, `${provider}: ${message || res.statusText}`);
        this.record({ ...base, status: res.status, ms: Date.now() - started, error: lastError.message });
        if (retryable && index < candidates.length - 1) continue;
        throw lastError;
      }
      if (stream) {
        this.record({ ...base, status: res.status, ms: Date.now() - started });
        return res;
      }
      // Không stream: đọc usage để thống kê token rồi trả lại nguyên JSON
      const json = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
      this.record({ ...base, status: res.status, ms: Date.now() - started, promptTokens: json.usage?.prompt_tokens ?? null, completionTokens: json.usage?.completion_tokens ?? null });
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw lastError ?? new HttpError(502, 'Không có model nào khả dụng');
  }
}
