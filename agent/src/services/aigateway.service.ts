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

const newKey = () => `zp-${randomBytes(24).toString('base64url')}`;

function settings(): GatewaySettings {
  const current = readJson<Partial<GatewaySettings>>(SETTINGS_FILE, {});
  const value: GatewaySettings = { enabled: false, defaultModel: null, fallbacks: [], ...current, apiKey: current.apiKey || newKey() };
  // Lần đầu: sinh API key cho gateway và lưu lại
  if (!current.apiKey) writeJson(SETTINGS_FILE, value);
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

  private record(entry: GatewayLog): void {
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

  /**
   * Gọi chat completions qua nhà cung cấp tương ứng. Trả về Response gốc (giữ nguyên stream SSE).
   * Model chính lỗi 429/5xx thì thử lần lượt các model dự phòng.
   */
  async chat(body: Record<string, unknown>, source: GatewayLog['source']): Promise<Response> {
    const primary = this.resolveModel(body.model);
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
