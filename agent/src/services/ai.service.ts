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

interface StoredKey {
  key: string;
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
const mask = (key: string) => (key.length <= 10 ? '••••' : `${key.slice(0, 6)}••••${key.slice(-4)}`);

export class AiService {
  list() {
    const stored = load();
    return AI_PROVIDERS.map(({ test: _test, ...def }) => {
      const item = stored[def.id];
      return {
        ...def,
        configured: Boolean(item),
        masked: item ? mask(item.key) : null,
        savedAt: item?.savedAt ?? null,
        lastTest: item?.lastTest ?? null,
        defaultModel: item?.defaultModel ?? null,
      };
    });
  }

  async save(id: string, key: unknown): Promise<void> {
    const def = provider(id);
    const value = typeof key === 'string' ? key.trim() : '';
    if (value.length < 10 || /\s/.test(value)) throw badRequest('API key không hợp lệ');
    const stored = load();
    stored[def.id] = { key: value, savedAt: new Date().toISOString(), lastTest: null, defaultModel: stored[def.id]?.defaultModel ?? null };
    modelCache.delete(def.id);
    writeJson(FILE, stored);
    await this.test(id).catch(() => undefined);
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
    let result: { ok: boolean; message: string };
    try {
      const res = await def.test(item.key);
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
    const item = load()[def.id];
    if (!item) throw badRequest('Chưa kết nối API key cho nhà cung cấp này');
    const cached = modelCache.get(def.id);
    if (cached && !refresh && Date.now() - cached.at < 30 * 60_000) return cached.models;
    const models = await fetchModels(def.id, item.key);
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

  /** Key + model mặc định của 1 nhà cung cấp (dùng cho AI Gateway) */
  credentials(id: string): { key: string; baseUrl: string; defaultModel: string | null } | null {
    const def = AI_PROVIDERS.find((p) => p.id === id);
    const item = def ? load()[def.id] : undefined;
    return def && item ? { key: item.key, baseUrl: def.baseUrl, defaultModel: item.defaultModel ?? null } : null;
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
