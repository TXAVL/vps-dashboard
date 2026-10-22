// ZenPanel - Tích hợp Cloudflare API: Anti-DDoS (Under Attack Mode), DNS, cache, SSL
import { getSettings, saveSettings } from '../core/auth.js';
import { badRequest, HttpError } from '../core/validate.js';

const API = 'https://api.cloudflare.com/client/v4';
const ZONE_SETTINGS = ['security_level', 'ssl', 'always_use_https', 'development_mode', 'min_tls_version'] as const;
const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'CAA', 'SRV'];

interface CfResponse<T> {
  success: boolean;
  errors: { message: string }[];
  result: T;
}

function token(): string {
  const value = getSettings()?.cloudflareToken;
  if (!value) throw badRequest('Chưa cấu hình Cloudflare API Token');
  return value;
}

async function cf<T>(pathname: string, init: RequestInit = {}, apiToken = token()): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = (await res.json().catch(() => null)) as CfResponse<T> | null;
  if (!res.ok || !body?.success) {
    throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, `Cloudflare: ${body?.errors?.map((e) => e.message).join(', ') || res.statusText}`);
  }
  return body.result;
}

const zoneId = (id: string) => {
  if (!/^[a-f0-9]{32}$/.test(id)) throw badRequest('Zone ID không hợp lệ');
  return id;
};

export class CloudflareService {
  status(): { configured: boolean } {
    return { configured: Boolean(getSettings()?.cloudflareToken) };
  }

  async saveToken(apiToken: string): Promise<void> {
    if (!apiToken.trim()) {
      const { cloudflareToken: _removed, ...rest } = getSettings()!;
      saveSettings(rest);
      return;
    }
    await cf('/user/tokens/verify', {}, apiToken.trim());
    saveSettings({ ...getSettings()!, cloudflareToken: apiToken.trim() });
  }

  async zones(): Promise<{ id: string; name: string; status: string; plan: string; settings: Record<string, string> }[]> {
    const zones = await cf<{ id: string; name: string; status: string; plan: { name: string } }[]>('/zones?per_page=50');
    return Promise.all(
      zones.map(async (zone) => {
        const all = await cf<{ id: string; value: unknown }[]>(`/zones/${zone.id}/settings`).catch(() => []);
        const settings = Object.fromEntries(
          all.filter((s) => (ZONE_SETTINGS as readonly string[]).includes(s.id)).map((s) => [s.id, String(s.value)]),
        );
        return { id: zone.id, name: zone.name, status: zone.status, plan: zone.plan.name, settings };
      }),
    );
  }

  async updateSetting(id: string, setting: string, value: string): Promise<void> {
    if (!(ZONE_SETTINGS as readonly string[]).includes(setting)) throw badRequest('Thiết lập không được hỗ trợ');
    await cf(`/zones/${zoneId(id)}/settings/${setting}`, { method: 'PATCH', body: JSON.stringify({ value }) });
  }

  async purgeCache(id: string): Promise<void> {
    await cf(`/zones/${zoneId(id)}/purge_cache`, { method: 'POST', body: JSON.stringify({ purge_everything: true }) });
  }

  async dnsRecords(id: string) {
    const records = await cf<{ id: string; type: string; name: string; content: string; proxied: boolean; ttl: number }[]>(
      `/zones/${zoneId(id)}/dns_records?per_page=200`,
    );
    return records.map(({ id: recordId, type, name, content, proxied, ttl }) => ({ id: recordId, type, name, content, proxied, ttl }));
  }

  async createDns(id: string, input: { type?: string; name?: string; content?: string; proxied?: boolean }): Promise<void> {
    if (!input.type || !DNS_TYPES.includes(input.type)) throw badRequest('Loại bản ghi không hợp lệ');
    if (!input.name?.trim() || !input.content?.trim()) throw badRequest('Thiếu tên hoặc nội dung bản ghi');
    await cf(`/zones/${zoneId(id)}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({ type: input.type, name: input.name.trim(), content: input.content.trim(), proxied: Boolean(input.proxied), ttl: 1 }),
    });
  }

  async deleteDns(id: string, recordId: string): Promise<void> {
    if (!/^[a-f0-9]{32}$/.test(recordId)) throw badRequest('Record ID không hợp lệ');
    await cf(`/zones/${zoneId(id)}/dns_records/${recordId}`, { method: 'DELETE' });
  }
}
