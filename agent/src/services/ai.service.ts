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
      return { ...def, configured: Boolean(item), masked: item ? mask(item.key) : null, savedAt: item?.savedAt ?? null, lastTest: item?.lastTest ?? null };
    });
  }

  async save(id: string, key: unknown): Promise<void> {
    const def = provider(id);
    const value = typeof key === 'string' ? key.trim() : '';
    if (value.length < 10 || /\s/.test(value)) throw badRequest('API key không hợp lệ');
    const stored = load();
    stored[def.id] = { key: value, savedAt: new Date().toISOString(), lastTest: null };
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
