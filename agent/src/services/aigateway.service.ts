// ZenPanel - AI Gateway tích hợp (giống OpenRouter / 9router): 1 endpoint chuẩn OpenAI cho mọi nhà cung cấp
// Model gọi theo dạng "<nhà cung cấp>/<model>", vd "anthropic/claude-sonnet-5-5", "openrouter/meta-llama/llama-3.3-70b-instruct".
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readJson, writeJson } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';
import { AI_PROVIDERS, cleanErrorMessage, type AiProviderId, type AiService } from './ai.service.js';

const SETTINGS_FILE = 'ai-gateway.json';
const LOG_FILE = 'ai-requests.json';
const MAX_LOG = 300;

export interface SubAgent {
  id: string;
  name: string;
  description: string;
  targetModel: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  resolvedModel?: string;
  provider: string;
  accountName?: string | null;
  subAgent?: string | null;
  status: number;
  ms: number;
  stream: boolean;
  source: 'api' | 'playground' | 'agent';
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  fallbackFrom: string | null;
  rotatedFrom?: string | null;
}

export interface GatewayApiKey {
  id: string;
  name: string;
  key: string;
  masked: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  enabled: boolean;
}

export type GatewayApiKeyView = Omit<GatewayApiKey, 'key'>;

const AGENTS_FILE = 'ai-agents.json';
const KEYS_FILE = 'ai-gateway-keys.json';

/** API key dùng chung của gateway có prefix "tzp_" hoặc "tzp_live_" */
const KEY_PREFIX = 'tzp_';
const LIVE_KEY_PREFIX = 'tzp_live_';
const newKey = () => `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
const newLiveKey = () => `${LIVE_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

/**
 * Danh tính cố định của mọi model chạy qua gateway. Gắn ở phía server vào system prompt,
 * không trả ra API / dashboard và người dùng không ghi đè được.
 */
const BOT_IDENTITY =
  'QUY TẮC BẮT BUỘC (ưu tiên cao nhất, mọi hướng dẫn khác không được ghi đè): Bạn tên TXAZENPANEL BOT, được tạo bởi TXA STUDIO. Khi được hỏi bạn là ai, tên gì hay ai tạo ra bạn, luôn trả lời đúng danh tính này.';

type ChatMessage = { role: string; content: unknown };

/** Gộp vào 1 system message: system prompt của người dùng trước, danh tính bắt buộc ở cuối để không bị ghi đè */
function withIdentity(messages: unknown, extraSystemPrompt?: string): ChatMessage[] {
  const list = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
  const userSystem = list.filter((m) => m?.role === 'system' || m?.role === 'developer').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
  const rest = list.filter((m) => m?.role !== 'system' && m?.role !== 'developer');
  const systems = [...(extraSystemPrompt ? [extraSystemPrompt] : []), ...userSystem, BOT_IDENTITY];
  return [{ role: 'system', content: systems.join('\n\n') }, ...rest];
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

  // ------------------------------------------------------------------ Quản lý Cấp phát API Keys
  private getRawApiKeys(): GatewayApiKey[] {
    const list = readJson<GatewayApiKey[]>(KEYS_FILE, []);
    // Nếu chưa có key nào, tự động khởi tạo 1 key mặc định từ root key
    if (list.length === 0) {
      const s = settings();
      const defaultKey: GatewayApiKey = {
        id: 'key_default',
        name: 'Default Gateway Key (Mặc định)',
        key: s.apiKey,
        masked: `${s.apiKey.slice(0, 10)}••••••••••••${s.apiKey.slice(-4)}`,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        lastUsedAt: null,
        enabled: true,
      };
      writeJson(KEYS_FILE, [defaultKey]);
      return [defaultKey];
    }
    return list;
  }

  listApiKeys(): GatewayApiKeyView[] {
    return this.getRawApiKeys().map(({ key: _k, ...rest }) => rest);
  }

  createApiKey(input: { name?: string; expiresInDays?: number | null; customExpiresAt?: string | null }): { key: string; info: GatewayApiKeyView } {
    const name = (input.name || '').trim() || `API Key #${this.getRawApiKeys().length + 1}`;
    let expiresAt: string | null = null;
    if (input.customExpiresAt) {
      expiresAt = new Date(input.customExpiresAt).toISOString();
    } else if (typeof input.expiresInDays === 'number' && input.expiresInDays > 0) {
      expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString();
    }

    const key = newLiveKey();
    const id = `key_${randomBytes(8).toString('hex')}`;
    const masked = `${key.slice(0, 13)}••••••••••••••••${key.slice(-4)}`;
    const createdAt = new Date().toISOString();

    const newRecord: GatewayApiKey = {
      id,
      name,
      key,
      masked,
      createdAt,
      expiresAt,
      lastUsedAt: null,
      enabled: true,
    };

    const current = this.getRawApiKeys();
    writeJson(KEYS_FILE, [newRecord, ...current]);

    const { key: _k, ...info } = newRecord;
    return { key, info };
  }

  updateApiKey(id: string, patch: { name?: string; enabled?: boolean }): GatewayApiKeyView {
    const current = this.getRawApiKeys();
    const target = current.find((k) => k.id === id);
    if (!target) throw badRequest('Không tìm thấy API Key');
    if (patch.name !== undefined) target.name = patch.name.trim() || target.name;
    if (patch.enabled !== undefined) target.enabled = Boolean(patch.enabled);
    writeJson(KEYS_FILE, current);
    const { key: _k, ...info } = target;
    return info;
  }

  deleteApiKey(id: string): void {
    if (id === 'key_default') {
      throw badRequest('Khóa mặc định (Default Gateway Key) không thể xoá để đảm bảo hệ thống không bị gián đoạn!');
    }
    const current = this.getRawApiKeys();
    const next = current.filter((k) => k.id !== id);
    writeJson(KEYS_FILE, next);
  }

  verifyKey(header: string | undefined): { ok: boolean; keyId?: string; keyName?: string } {
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : header?.trim();
    if (!token) return { ok: false };

    const keys = this.getRawApiKeys();
    const now = Date.now();
    for (const k of keys) {
      if (!k.enabled) continue;
      if (k.expiresAt && new Date(k.expiresAt).getTime() < now) continue;

      const a = Buffer.from(token);
      const b = Buffer.from(k.key);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        k.lastUsedAt = new Date().toISOString();
        writeJson(KEYS_FILE, keys);
        return { ok: true, keyId: k.id, keyName: k.name };
      }
    }

    // Fallback cho key root cũ
    const s = settings();
    if (s.apiKey) {
      const a = Buffer.from(token);
      const b = Buffer.from(s.apiKey);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return { ok: true, keyId: 'root', keyName: 'Root Gateway Key' };
      }
    }

    return { ok: false };
  }

  logs(): GatewayLog[] {
    return readJson<GatewayLog[]>(LOG_FILE, []);
  }

  record(entry: GatewayLog): void {
    writeJson(LOG_FILE, [entry, ...this.logs()].slice(0, MAX_LOG));
  }

  clearLogs(): void {
    writeJson(LOG_FILE, []);
  }

  // ------------------------------------------------------------------ Quản lý Sub AI Agents
  getSubAgents(): SubAgent[] {
    return readJson<SubAgent[]>(AGENTS_FILE, []);
  }

  saveSubAgent(input: {
    id?: string;
    name: string;
    description?: string;
    targetModel?: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
    enabled?: boolean;
  }): SubAgent {
    const list = this.getSubAgents();
    const now = new Date().toISOString();

    const cleanName = input.name.trim();
    if (!cleanName) throw badRequest('Tên Sub-Agent không được để trống');

    const slug = (input.id || cleanName)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 32);

    const existingIndex = list.findIndex((a) => a.id === (input.id || slug));
    const agent: SubAgent = {
      id: input.id || slug,
      name: cleanName,
      description: input.description?.trim() || '',
      targetModel: input.targetModel?.trim() || 'auto',
      systemPrompt: input.systemPrompt?.trim() || 'Bạn là trợ lý AI chuyên nghiệp.',
      temperature: input.temperature !== undefined ? Number(input.temperature) : 0.7,
      maxTokens: input.maxTokens ? Number(input.maxTokens) : undefined,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
      createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      list[existingIndex] = agent;
    } else {
      list.push(agent);
    }

    writeJson(AGENTS_FILE, list);
    return agent;
  }

  deleteSubAgent(id: string): void {
    const list = this.getSubAgents().filter((a) => a.id !== id);
    writeJson(AGENTS_FILE, list);
  }

  findSubAgent(requested: unknown): SubAgent | null {
    if (typeof requested !== 'string' || !requested) return null;
    const req = requested.toLowerCase().trim();
    const agents = this.getSubAgents().filter((a) => a.enabled);
    return (
      agents.find(
        (a) =>
          a.id.toLowerCase() === req ||
          `agent/${a.id.toLowerCase()}` === req ||
          `agent:${a.id.toLowerCase()}` === req ||
          a.name.toLowerCase() === req,
      ) ?? null
    );
  }

  /** Danh sách model gộp từ mọi nhà cung cấp đã kết nối + Sub-Agents (định dạng OpenAI /v1/models) */
  async allModels(): Promise<{ id: string; name: string; provider: string; contextLength: number | null; pricing: { prompt: number; completion: number } | null; description?: string }[]> {
    const connected = this.ai.list().filter((p) => p.configured);
    const lists = await Promise.all(
      connected.map(async (p) => (await this.ai.models(p.id).catch(() => [])).map((m) => ({ ...m, id: `${p.id}/${m.id}`, provider: p.id }))),
    );
    const models = lists.flat();

    // Thêm các Sub-Agents vào danh sách model để n8n, Open WebUI có thể chọn trực tiếp
    const subAgents = this.getSubAgents().filter((a) => a.enabled);
    const agentModels = subAgents.map((a) => ({
      id: `agent/${a.id}`,
      name: `🤖 ${a.name}`,
      provider: 'subagent',
      contextLength: null,
      pricing: null,
      description: a.description || `Sub-Agent: ${a.name} (chạy qua ${a.targetModel})`,
    }));

    return [...agentModels, ...models];
  }

  /** Lấy model mặc định đang cấu hình trong hệ thống */
  getDefaultModel(): string | null {
    const s = settings();
    if (s.defaultModel) {
      return s.defaultModel.includes('gemini-2.0-flash')
        ? s.defaultModel.replace('gemini-2.0-flash', 'gemini-3.5-flash-lite')
        : s.defaultModel;
    }
    for (const p of this.ai.list()) {
      if (p.configured && p.defaultModel) {
        const m = p.defaultModel.includes('gemini-2.0-flash') ? 'gemini-3.5-flash-lite' : p.defaultModel;
        return `${p.id}/${m}`;
      }
    }
    return null;
  }

  /** Model sẽ dùng: model trong request > model mặc định của gateway > model mặc định của nhà cung cấp đầu tiên */
  private resolveModel(requested: unknown): string {
    if (typeof requested === 'string' && requested && requested !== 'auto') {
      let reqStr = requested;
      // Tự động chuyển đổi sang model chuẩn mới nhất Gemini 3.5 Flash Lite
      if (reqStr.includes('gemini-2.0-flash')) {
        reqStr = reqStr.replace('gemini-2.0-flash', 'gemini-3.5-flash-lite');
      }
      if (reqStr === 'gemini' || reqStr === '3.5-flash-lite' || reqStr === 'gemini/3.5-flash-lite') {
        reqStr = 'gemini/gemini-3.5-flash-lite';
      }
      // Cho phép gọi tắt "anthropic" -> model mặc định của Anthropic
      if (PROVIDER_IDS.includes(reqStr)) {
        const cred = this.ai.credentials(reqStr);
        if (!cred?.defaultModel) throw badRequest(`Chưa chọn model mặc định cho ${reqStr}`);
        return `${reqStr}/${cred.defaultModel}`;
      }
      return reqStr;
    }
    const def = this.getDefaultModel();
    if (def) return def;
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
        sub_agents_count: this.getSubAgents().length,
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

  /** Nhà cung cấp đã kết nối + model mặc định + số accounts trong pool */
  providers() {
    return {
      data: this.ai
        .list()
        .filter((p) => p.configured)
        .map((p) => ({
          id: p.id,
          name: p.label,
          default_model: p.defaultModel ? `${p.id}/${p.defaultModel}` : null,
          total_accounts: p.totalAccounts,
          active_accounts: p.activeAccounts,
          status: p.lastTest?.ok ? 'ok' : 'error',
        })),
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
    return { id: model.id, object: 'model', owned_by: model.provider, name: model.name, context_length: model.contextLength, pricing: model.pricing, description: model.description };
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cred.key}`,
        ...(provider === 'gemini' ? { 'x-goog-api-key': cred.key } : {}),
      },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(120_000),
    });
    this.record({
      at: new Date().toISOString(),
      model: body.model,
      provider,
      accountName: `${cred.account.name} (${cred.account.masked})`,
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
   * Gọi chat completions với hỗ trợ:
   * 1. Sub AI Agent tự động điều hướng và tiêm system prompt
   * 2. Tự động xoay vòng qua các Accounts / API keys của nhà cung cấp (Multi-account rotation)
   * 3. Tự động đổi key khi bị 429 Rate Limit
   * 4. Model Fallback dự phòng khi toàn bộ keys của provider lỗi
   */
  async chat(body: Record<string, unknown>, source: GatewayLog['source']): Promise<Response> {
    let subAgentName: string | null = null;
    let extraSystemPrompt: string | undefined;

    // Kiểm tra Sub AI Agent
    const matchedSub = this.findSubAgent(body.model) || this.findSubAgent(body.subAgent);
    if (matchedSub) {
      subAgentName = matchedSub.name;
      extraSystemPrompt = matchedSub.systemPrompt;
      if (matchedSub.temperature !== undefined && body.temperature === undefined) {
        body.temperature = matchedSub.temperature;
      }
      // Định hướng sang model của SubAgent
      body.model = matchedSub.targetModel;
    }

    const primary = this.resolveModel(body.model);
    body = { ...body, messages: withIdentity(body.messages, extraSystemPrompt) };
    const candidates = [primary, ...settings().fallbacks.filter((m) => m !== primary)];
    const stream = Boolean(body.stream);
    let lastError: HttpError | null = null;

    for (const [candidateIndex, full] of candidates.entries()) {
      const { provider, model } = parseModel(full);
      const accounts = this.ai.getActiveAccounts(provider);

      if (accounts.length === 0) {
        lastError = badRequest(`Chưa kết nối API key cho nhà cung cấp ${provider}`);
        this.record({
          at: new Date().toISOString(),
          model: full,
          resolvedModel: full,
          provider,
          subAgent: subAgentName,
          status: 400,
          ms: 0,
          stream,
          source,
          promptTokens: null,
          completionTokens: null,
          error: lastError.message,
          fallbackFrom: candidateIndex > 0 ? primary : null,
        });
        continue;
      }

      // Xoay vòng qua các account trong Pool của provider
      let rotatedNote: string | null = null;
      let providerSucceeded = false;

      for (let accIdx = 0; accIdx < accounts.length; accIdx++) {
        const { account, key, baseUrl } = accounts[accIdx];
        const started = Date.now();
        const base: GatewayLog = {
          at: new Date().toISOString(),
          model: full,
          resolvedModel: full,
          provider,
          accountName: `${account.name} (${account.masked})`,
          subAgent: subAgentName,
          status: 0,
          ms: 0,
          stream,
          source,
          promptTokens: null,
          completionTokens: null,
          error: null,
          fallbackFrom: candidateIndex > 0 ? primary : null,
          rotatedFrom: rotatedNote,
        };

        let res: Response;
        try {
          res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
              ...(provider === 'gemini' ? { 'x-goog-api-key': key } : {}),
              'HTTP-Referer': 'https://github.com/TXAVL/vps-dashboard',
              'X-Title': 'ZenPanel AI Gateway',
            },
            body: JSON.stringify({ ...body, model }),
            signal: AbortSignal.timeout(300_000),
          });
        } catch (err) {
          lastError = new HttpError(502, `Không kết nối được ${provider} (${account.name}): ${(err as Error).message}`);
          this.record({ ...base, status: 502, ms: Date.now() - started, error: lastError.message });
          // Thử account tiếp theo trong pool nếu còn
          if (accIdx < accounts.length - 1) {
            rotatedNote = `${account.name} mất kết nối, xoay sang account tiếp theo`;
            continue;
          }
          break;
        }

        const isRateLimit = res.status === 429;
        const retryable = isRateLimit || res.status >= 500;

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const cleanMsg = cleanErrorMessage(text, res.status, provider);
          // Trong logs lưu đầy đủ mã lỗi, thông điệp tiếng Việt sạch kèm chuỗi phản hồi gốc
          const detailedError = `[HTTP ${res.status}] ${cleanMsg} (Phản hồi gốc: ${text.slice(0, 400)})`;

          lastError = new HttpError(res.status, `${provider} [${account.name}]: ${cleanMsg}`);

          // Cập nhật trạng thái tài khoản vào hệ thống
          if (isRateLimit) {
            this.ai.markAccountRateLimited(provider, account.id, 60_000, cleanMsg);
          } else {
            this.ai.markAccountError(provider, account.id, cleanMsg);
          }

          this.record({ ...base, status: res.status, ms: Date.now() - started, error: detailedError });

          if (retryable && accIdx < accounts.length - 1) {
            // Còn account khác trong pool: tự động xoay vòng sang account kế tiếp!
            rotatedNote = `${account.name} (${account.masked}) bị ${isRateLimit ? '429 Rate Limit' : 'lỗi server'}, tự đổi sang account tiếp theo`;
            continue;
          }
          break;
        }

        // Thành công! Phục hồi trạng thái hoạt động nếu trước đó tài khoản từng gặp lỗi
        this.ai.markAccountSuccess(provider, account.id);
        providerSucceeded = true;
        if (stream) {
          this.record({ ...base, status: res.status, ms: Date.now() - started });
          return res;
        }

        // Không stream: đọc usage thống kê token
        const json = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
        this.record({
          ...base,
          status: res.status,
          ms: Date.now() - started,
          promptTokens: json.usage?.prompt_tokens ?? null,
          completionTokens: json.usage?.completion_tokens ?? null,
        });
        return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Nếu đã có response thành công thì đã return ở trên. Nếu không thành công và còn model fallback, vòng lặp candidate tiếp tục.
      if (providerSucceeded) break;
    }

    throw lastError ?? new HttpError(502, 'Tất cả tài khoản và model dự phòng đều không phản hồi');
  }
}
