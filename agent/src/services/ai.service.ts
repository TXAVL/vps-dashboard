// ZenPanel - Quản lý API key AI (ChatGPT, Claude, Gemini, OpenRouter, NVIDIA) dùng chung cho các app AI
import { readJson, writeJson } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';
import type { ComposeContext } from './appstore.catalog.js';

export type AiProviderId = keyof ComposeContext['ai'];

interface ProviderDef {
  id: AiProviderId;
  label: string;
  /** Endpoint tương thích OpenAI (dùng cho Open WebUI, n8n, Flowise...) */
  baseUrl: string;
  keyUrl: string;
  keyHint: string;
  test(key: string): Promise<Response>;
}

const timeout = () => AbortSignal.timeout(15_000);

export const AI_PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...',
    test: (key) => fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: timeout() }),
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-...',
    test: (key) => fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: timeout() }),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza...',
    test: (key) => fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: timeout() }),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyHint: 'sk-or-...',
    test: (key) => fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: timeout() }),
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyUrl: 'https://build.nvidia.com/settings/api-keys',
    keyHint: 'nvapi-...',
    test: (key) => fetch('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: timeout() }),
  },
];

export interface AiAccountKey {
  id: string;
  name: string;
  key: string;
  masked: string;
  status: 'active' | 'rate_limited' | 'error';
  lastUsedAt?: string;
  rateLimitedUntil?: number;
  errorMsg?: string;
}

interface StoredKey {
  key: string;
  keys?: AiAccountKey[];
  rotationStrategy?: 'round-robin' | 'fallback-only';
  savedAt: string;
  lastTest: { ok: boolean; at: string; message: string } | null;
  /** Model mặc định khi gọi nhà cung cấp này (chọn trong danh sách model đã tải) */
  defaultModel?: string | null;
}

export interface AiModel {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD / 1 triệu token (chỉ OpenRouter công khai giá qua API) */
  pricing: { prompt: number; completion: number } | null;
  description: string;
}

const modelCache = new Map<AiProviderId, { at: number; models: AiModel[] }>();
// Con trỏ Round-Robin theo từng provider
const roundRobinIndex = new Map<string, number>();

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

/** Tải danh sách model từ API của từng nhà cung cấp, chuẩn hoá về cùng 1 dạng */
async function fetchModels(id: AiProviderId, key: string): Promise<AiModel[]> {
  const get = async <T,>(url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.status === 401 || res.status === 403) throw badRequest('API key sai hoặc không có quyền liệt kê model');
    if (!res.ok) throw new HttpError(502, `Nhà cung cấp trả về lỗi ${res.status} khi tải danh sách model`);
    return (await res.json()) as T;
  };
  const plain = (ids: string[]) => ids.map((m) => ({ id: m, name: m, contextLength: null, pricing: null, description: '' }));
  switch (id) {
    case 'openai': {
      const data = await get<{ data: { id: string }[] }>('https://api.openai.com/v1/models', bearer(key));
      // Bỏ các model không dùng cho chat (embedding, audio, ảnh, moderation...)
      return plain(data.data.map((m) => m.id).filter((m) => /^(gpt|o\d|chatgpt)/.test(m) && !/(audio|realtime|transcribe|tts|image|search)/.test(m)).sort());
    }
    case 'anthropic': {
      const data = await get<{ data: { id: string; display_name: string }[] }>('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
      return data.data.map((m) => ({ id: m.id, name: m.display_name, contextLength: null, pricing: null, description: '' }));
    }
    case 'gemini': {
      const data = await get<{ models: { name: string; displayName: string; description?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }[] }>(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`,
      );
      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName, contextLength: m.inputTokenLimit ?? null, pricing: null, description: m.description ?? '' }));
    }
    case 'openrouter': {
      const data = await get<{ data: { id: string; name: string; description?: string; context_length?: number; pricing?: { prompt: string; completion: string } }[] }>(
        'https://openrouter.ai/api/v1/models',
        bearer(key),
      );
      return data.data.map((m) => ({
        id: m.id,
        name: m.name,
        contextLength: m.context_length ?? null,
        pricing: m.pricing ? { prompt: Number(m.pricing.prompt) * 1e6, completion: Number(m.pricing.completion) * 1e6 } : null,
        description: m.description ?? '',
      }));
    }
    case 'nvidia': {
      const data = await get<{ data: { id: string }[] }>('https://integrate.api.nvidia.com/v1/models', bearer(key));
      return plain(data.data.map((m) => m.id).sort());
    }
  }
}

const FILE = 'ai-keys.json';
const load = () => readJson<Partial<Record<AiProviderId, StoredKey>>>(FILE, {});

function provider(id: string): ProviderDef {
  const def = AI_PROVIDERS.find((p) => p.id === id);
  if (!def) throw new HttpError(404, 'Nhà cung cấp AI không hợp lệ');
  return def;
}

/** Che key khi trả về dashboard: chỉ hiện 4 ký tự đầu và cuối */
export const maskKey = (key: string) => (key.length <= 10 ? '••••' : `${key.slice(0, 6)}••••${key.slice(-4)}`);

export class AiService {
  list() {
    const stored = load();
    return AI_PROVIDERS.map(({ test: _test, ...def }) => {
      const item = stored[def.id];
      const accounts = this.getAccounts(def.id);
      return {
        ...def,
        configured: Boolean(item && (item.key || (item.keys && item.keys.length > 0))),
        masked: item ? maskKey(item.key) : null,
        savedAt: item?.savedAt ?? null,
        lastTest: item?.lastTest ?? null,
        defaultModel: item?.defaultModel ?? null,
        accounts,
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter((a) => a.status === 'active').length,
      };
    });
  }

  /** Lấy danh sách accounts của 1 provider, tự động phục hồi nếu rate limit đã hết hạn */
  getAccounts(id: string): AiAccountKey[] {
    const def = provider(id);
    const stored = load();
    const item = stored[def.id];
    if (!item) return [];

    let list: AiAccountKey[] = item.keys && item.keys.length > 0 ? item.keys : [];
    // Nếu chưa có keys[] nhưng có key đơn lẻ: tự bọc thành Account #1
    if (list.length === 0 && item.key) {
      list = [
        {
          id: 'acc_default',
          name: 'Tài khoản #1 (Mặc định)',
          key: item.key,
          masked: maskKey(item.key),
          status: 'active',
          lastUsedAt: item.savedAt,
        },
      ];
    }

    const now = Date.now();
    let changed = false;
    list = list.map((acc) => {
      if (acc.status === 'rate_limited' && acc.rateLimitedUntil && now >= acc.rateLimitedUntil) {
        changed = true;
        return { ...acc, status: 'active', rateLimitedUntil: undefined, errorMsg: undefined };
      }
      return acc;
    });

    if (changed) {
      stored[def.id] = { ...item, keys: list };
      writeJson(FILE, stored);
    }

    return list;
  }

  async save(id: string, input: unknown): Promise<void> {
    const def = provider(id);
    const stored = load();
    const existing = stored[def.id];

    // Hỗ trợ nhập chuỗi nhiều dòng hoặc nhiều key
    let lines: string[] = [];
    if (typeof input === 'string') {
      lines = input
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 10);
    } else if (Array.isArray(input)) {
      lines = input.map((s) => String(s).trim()).filter((s) => s.length >= 10);
    }

    if (lines.length === 0) throw badRequest('Vui lòng nhập ít nhất một API key hợp lệ');

    const accounts: AiAccountKey[] = lines.map((k, idx) => ({
      id: `acc_${Date.now()}_${idx + 1}`,
      name: `Tài khoản #${idx + 1}`,
      key: k,
      masked: maskKey(k),
      status: 'active',
      lastUsedAt: new Date().toISOString(),
    }));

    stored[def.id] = {
      key: accounts[0].key,
      keys: accounts,
      savedAt: new Date().toISOString(),
      lastTest: null,
      defaultModel: existing?.defaultModel ?? null,
    };

    modelCache.delete(def.id);
    writeJson(FILE, stored);
    await this.test(id).catch(() => undefined);
  }

  /** Thêm 1 account mới vào pool */
  async addAccount(id: string, key: string, name?: string): Promise<AiAccountKey[]> {
    const def = provider(id);
    const cleanKey = key.trim();
    if (cleanKey.length < 10) throw badRequest('API key không hợp lệ');

    const stored = load();
    const item = stored[def.id] ?? {
      key: cleanKey,
      savedAt: new Date().toISOString(),
      lastTest: null,
      defaultModel: null,
    };

    const currentAccounts = this.getAccounts(def.id);
    const newAcc: AiAccountKey = {
      id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name?.trim() || `Tài khoản #${currentAccounts.length + 1}`,
      key: cleanKey,
      masked: maskKey(cleanKey),
      status: 'active',
      lastUsedAt: new Date().toISOString(),
    };

    const nextAccounts = [...currentAccounts, newAcc];
    stored[def.id] = {
      ...item,
      key: nextAccounts[0].key,
      keys: nextAccounts,
      savedAt: new Date().toISOString(),
    };

    modelCache.delete(def.id);
    writeJson(FILE, stored);
    return nextAccounts;
  }

  /** Xoá 1 account khỏi pool */
  removeAccount(id: string, accountId: string): AiAccountKey[] {
    const def = provider(id);
    const stored = load();
    const item = stored[def.id];
    if (!item) return [];

    const accounts = this.getAccounts(def.id).filter((a) => a.id !== accountId);
    if (accounts.length === 0) {
      delete stored[def.id];
    } else {
      stored[def.id] = {
        ...item,
        key: accounts[0].key,
        keys: accounts,
      };
    }
    writeJson(FILE, stored);
    return accounts;
  }

  /** Đặt lại trạng thái active cho account */
  resetAccountStatus(id: string, accountId: string): void {
    const def = provider(id);
    const stored = load();
    const item = stored[def.id];
    if (!item) return;

    const accounts = this.getAccounts(def.id).map((a) => (a.id === accountId ? { ...a, status: 'active' as const, rateLimitedUntil: undefined, errorMsg: undefined } : a));
    stored[def.id] = { ...item, keys: accounts };
    writeJson(FILE, stored);
  }

  /** Đánh dấu account bị rate limit tạm thời (mặc định 60s) để xoay sang account khác */
  markAccountRateLimited(id: string, accountId: string, durationMs = 60_000, errorMsg?: string): void {
    const def = provider(id);
    const stored = load();
    const item = stored[def.id];
    if (!item) return;

    const accounts = this.getAccounts(def.id).map((a) =>
      a.id === accountId
        ? {
            ...a,
            status: 'rate_limited' as const,
            rateLimitedUntil: Date.now() + durationMs,
            errorMsg: errorMsg || 'Bị quá giới hạn yêu cầu (429 Rate Limit), đang tạm dừng và xoay sang account khác',
          }
        : a,
    );
    stored[def.id] = { ...item, keys: accounts };
    writeJson(FILE, stored);
  }

  remove(id: string): void {
    const def = provider(id);
    const stored = load();
    delete stored[def.id];
    writeJson(FILE, stored);
  }

  async test(id: string): Promise<{ ok: boolean; message: string }> {
    const def = provider(id);
    const stored = load();
    const item = stored[def.id];
    if (!item) throw badRequest('Chưa lưu API key cho nhà cung cấp này');
    const keyToTest = item.key;
    let result: { ok: boolean; message: string };
    try {
      const res = await def.test(keyToTest);
      result = res.ok
        ? { ok: true, message: 'API key hợp lệ' }
        : { ok: false, message: res.status === 401 || res.status === 403 ? 'API key sai hoặc đã bị thu hồi' : `Nhà cung cấp trả về lỗi ${res.status}` };
    } catch (err) {
      result = { ok: false, message: `Không kết nối được: ${(err as Error).message}` };
    }
    stored[def.id] = { ...item, lastTest: { ...result, at: new Date().toISOString() } };
    writeJson(FILE, stored);
    return result;
  }

  /** Danh sách model của nhà cung cấp (cache 30 phút) */
  async models(id: string, refresh = false): Promise<AiModel[]> {
    const def = provider(id);
    const accounts = this.getAccounts(def.id);
    if (accounts.length === 0) throw badRequest('Chưa kết nối API key cho nhà cung cấp này');
    const cached = modelCache.get(def.id);
    if (cached && !refresh && Date.now() - cached.at < 30 * 60_000) return cached.models;
    // Ưu tiên dùng account active đầu tiên để fetch
    const activeAcc = accounts.find((a) => a.status === 'active') ?? accounts[0];
    const models = await fetchModels(def.id, activeAcc.key);
    modelCache.set(def.id, { at: Date.now(), models });
    return models;
  }

  setDefaultModel(id: string, model: string | null): void {
    const def = provider(id);
    const stored = load();
    const item = stored[def.id];
    if (!item) throw badRequest('Chưa kết nối API key cho nhà cung cấp này');
    stored[def.id] = { ...item, defaultModel: model?.trim() || null };
    writeJson(FILE, stored);
  }

  /**
   * Lấy credentials kèm cơ chế xoay vòng Round-Robin qua các Account đang active.
   * Nếu có nhiều account, mỗi lần gọi sẽ luân phiên lấy account tiếp theo.
   */
  credentials(id: string): { account: AiAccountKey; key: string; baseUrl: string; defaultModel: string | null; poolSize: number } | null {
    const def = AI_PROVIDERS.find((p) => p.id === id);
    if (!def) return null;
    const accounts = this.getAccounts(def.id);
    if (accounts.length === 0) return null;

    // Lọc các accounts active hoặc thử lại rate limit
    let activeList = accounts.filter((a) => a.status === 'active');
    if (activeList.length === 0) {
      // Nếu tất cả đều bị rate limit, lấy account có thời gian hết hạn gần nhất để thử lại
      activeList = [...accounts].sort((a, b) => (a.rateLimitedUntil ?? 0) - (b.rateLimitedUntil ?? 0));
    }

    // Round Robin qua activeList
    const currentIdx = roundRobinIndex.get(def.id) ?? 0;
    const selected = activeList[currentIdx % activeList.length];
    roundRobinIndex.set(def.id, (currentIdx + 1) % activeList.length);

    const stored = load();
    const item = stored[def.id];

    return {
      account: selected,
      key: selected.key,
      baseUrl: def.baseUrl,
      defaultModel: item?.defaultModel ?? null,
      poolSize: accounts.length,
    };
  }

  /** Lấy danh sách toàn bộ accounts active của 1 provider để fallback nội bộ khi request lỗi */
  getActiveAccounts(id: string): { account: AiAccountKey; key: string; baseUrl: string }[] {
    const def = AI_PROVIDERS.find((p) => p.id === id);
    if (!def) return [];
    const accounts = this.getAccounts(def.id);
    return accounts.map((account) => ({
      account,
      key: account.key,
      baseUrl: def.baseUrl,
    }));
  }

  /** Key + endpoint để bơm vào docker-compose của các app AI */
  context(): ComposeContext {
    const stored = load();
    const ai: ComposeContext['ai'] = {};
    for (const def of AI_PROVIDERS) {
      const item = stored[def.id];
      if (item) ai[def.id] = { key: item.key, baseUrl: def.baseUrl };
    }
    return { ai };
  }
}
