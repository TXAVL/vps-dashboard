// ZenPanel - Tích hợp Cloudflare API: WAF (mức bảo mật, Under Attack, quy tắc chặn IP/quốc gia), SSL, DNS, cache
import { getSettings, saveSettings } from '../core/auth.js';
import { badRequest, HttpError } from '../core/validate.js';

const API = 'https://api.cloudflare.com/client/v4';
/** Các thiết lập zone ZenPanel cho phép đọc / sửa */
const ZONE_SETTINGS = [
  'security_level',
  'browser_check',
  'challenge_ttl',
  'ssl',
  'always_use_https',
  'automatic_https_rewrites',
  'min_tls_version',
  'tls_1_3',
  'development_mode',
  'email_obfuscation',
  'hotlink_protection',
  'ipv6',
] as const;
const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'CAA', 'SRV'];
const ACCESS_MODES = ['block', 'challenge', 'js_challenge', 'managed_challenge', 'whitelist'];
const ACCESS_TARGETS = ['ip', 'ip_range', 'country', 'asn'];

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

function token(): string {
  const value = getSettings()?.cloudflareToken;
  if (!value) throw badRequest('Chưa kết nối Cloudflare API Token');
  return value;
}

async function cf<T>(pathname: string, init: RequestInit = {}, apiToken = token()): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as CfResponse<T> | null;
  if (!res.ok || !body?.success) {
    const message = body?.errors?.map((e) => e.message).join(', ') || res.statusText;
    if (res.status === 403 || /authentication|permission|not authorized/i.test(message)) {
      throw new HttpError(400, `Cloudflare: token thiếu quyền cho thao tác này (${message}). Xem hướng dẫn tạo token trong trang Bảo mật.`);
    }
    throw new HttpError(res.status === 401 ? 400 : 502, `Cloudflare: ${message}`);
  }
  return body.result;
}

const zoneId = (id: string) => {
  if (!/^[a-f0-9]{32}$/.test(id)) throw badRequest('Zone ID không hợp lệ');
  return id;
};

export interface PermissionCheck {
  id: string;
  label: string;
  required: string;
  ok: boolean;
  message: string;
}

export class CloudflareService {
  status(): { configured: boolean } {
    return { configured: Boolean(getSettings()?.cloudflareToken) };
  }

  async saveToken(apiToken: string): Promise<{ status: string }> {
    const settings = getSettings()!;
    if (!apiToken.trim()) {
      const { cloudflareToken: _removed, ...rest } = settings;
      saveSettings(rest);
      return { status: 'removed' };
    }
    const verify = await cf<{ status: string }>('/user/tokens/verify', {}, apiToken.trim()).catch((err: Error) => {
      throw badRequest(`Token không hợp lệ: ${err.message}. Lưu ý dùng "API Token" (không phải Global API Key / Origin CA Key).`);
    });
    if (verify.status !== 'active') throw badRequest(`Token đang ở trạng thái "${verify.status}", hãy kích hoạt lại trong Cloudflare`);
    saveSettings({ ...settings, cloudflareToken: apiToken.trim() });
    return verify;
  }

  /** Kiểm tra từng quyền cần thiết để chỉ ra chính xác token thiếu gì */
  async permissions(): Promise<{ zones: number; checks: PermissionCheck[] }> {
    const zones = await cf<{ id: string }[]>('/zones?per_page=1').catch(() => null);
    const zone = zones?.[0]?.id;
    const probe = async (id: string, label: string, required: string, run: () => Promise<unknown>): Promise<PermissionCheck> => {
      if (!zone && id !== 'zone') return { id, label, required, ok: false, message: 'Chưa có domain nào để kiểm tra' };
      try {
        await run();
        return { id, label, required, ok: true, message: 'OK' };
      } catch (err) {
        return { id, label, required, ok: false, message: (err as Error).message.replace(/^Cloudflare: /, '') };
      }
    };
    const checks = await Promise.all([
      probe('zone', 'Xem danh sách domain', 'Zone → Zone → Read', async () => {
        if (!zones) throw new Error('Không đọc được danh sách zone');
        if (!zones.length) throw new Error('Token chưa được gán domain nào (mục Zone Resources)');
      }),
      probe('settings', 'Đọc / sửa thiết lập bảo mật, SSL', 'Zone → Zone Settings → Edit', () => cf(`/zones/${zone}/settings/security_level`)),
      probe('dns', 'Quản lý bản ghi DNS', 'Zone → DNS → Edit', () => cf(`/zones/${zone}/dns_records?per_page=1`)),
      probe('firewall', 'Quy tắc chặn IP / quốc gia', 'Zone → Firewall Services → Edit', () => cf(`/zones/${zone}/firewall/access_rules/rules?per_page=1`)),
      probe('analytics', 'Thống kê truy cập (tuỳ chọn)', 'Zone → Analytics → Read', () => cf(`/zones/${zone}/settings/development_mode`)),
    ]);
    return { zones: zones?.length ?? 0, checks };
  }

  async zones(): Promise<{ id: string; name: string; status: string; plan: string; nameServers: string[]; settings: Record<string, string> }[]> {
    const zones = await cf<{ id: string; name: string; status: string; plan: { name: string }; name_servers: string[] }[]>('/zones?per_page=50');
    return Promise.all(
      zones.map(async (zone) => {
        const all = await cf<{ id: string; value: unknown }[]>(`/zones/${zone.id}/settings`).catch(() => []);
        const settings = Object.fromEntries(
          all.filter((s) => (ZONE_SETTINGS as readonly string[]).includes(s.id)).map((s) => [s.id, String(s.value)]),
        );
        return { id: zone.id, name: zone.name, status: zone.status, plan: zone.plan.name, nameServers: zone.name_servers ?? [], settings };
      }),
    );
  }

  async updateSetting(id: string, setting: string, value: string): Promise<void> {
    if (!(ZONE_SETTINGS as readonly string[]).includes(setting)) throw badRequest('Thiết lập không được hỗ trợ');
    const parsed = setting === 'challenge_ttl' ? Number(value) : value;
    await cf(`/zones/${zoneId(id)}/settings/${setting}`, { method: 'PATCH', body: JSON.stringify({ value: parsed }) });
  }

  async purgeCache(id: string, urls?: string[]): Promise<void> {
    const body = urls?.length ? { files: urls.slice(0, 30) } : { purge_everything: true };
    await cf(`/zones/${zoneId(id)}/purge_cache`, { method: 'POST', body: JSON.stringify(body) });
  }

  // ------------------------------------------------------------ DNS
  async dnsRecords(id: string) {
    const records = await cf<{ id: string; type: string; name: string; content: string; proxied: boolean; ttl: number }[]>(
      `/zones/${zoneId(id)}/dns_records?per_page=200`,
    );
    return records.map(({ id: recordId, type, name, content, proxied, ttl }) => ({ id: recordId, type, name, content, proxied, ttl }));
  }

  async createDns(id: string, input: { type?: string; name?: string; content?: string; proxied?: boolean }): Promise<void> {
    if (!input.type || !DNS_TYPES.includes(input.type)) throw badRequest('Loại bản ghi không hợp lệ');
    if (!input.name?.trim() || !input.content?.trim()) throw badRequest('Thiếu tên hoặc nội dung bản ghi');
    const proxiable = ['A', 'AAAA', 'CNAME'].includes(input.type);
    await cf(`/zones/${zoneId(id)}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({ type: input.type, name: input.name.trim(), content: input.content.trim(), proxied: proxiable && Boolean(input.proxied), ttl: 1 }),
    });
  }

  async toggleDnsProxy(id: string, recordId: string, proxied: boolean): Promise<void> {
    if (!/^[a-f0-9]{32}$/.test(recordId)) throw badRequest('Record ID không hợp lệ');
    await cf(`/zones/${zoneId(id)}/dns_records/${recordId}`, { method: 'PATCH', body: JSON.stringify({ proxied }) });
  }

  async deleteDns(id: string, recordId: string): Promise<void> {
    if (!/^[a-f0-9]{32}$/.test(recordId)) throw badRequest('Record ID không hợp lệ');
    await cf(`/zones/${zoneId(id)}/dns_records/${recordId}`, { method: 'DELETE' });
  }

  // ------------------------------------------------------------ WAF: IP Access Rules (miễn phí ở mọi gói)
  async accessRules(id: string) {
    const rules = await cf<{ id: string; mode: string; notes: string; created_on: string; configuration: { target: string; value: string } }[]>(
      `/zones/${zoneId(id)}/firewall/access_rules/rules?per_page=100`,
    );
    return rules.map((r) => ({ id: r.id, mode: r.mode, target: r.configuration.target, value: r.configuration.value, notes: r.notes, createdAt: r.created_on }));
  }

  async createAccessRule(id: string, input: { mode?: string; target?: string; value?: string; notes?: string }): Promise<void> {
    if (!input.mode || !ACCESS_MODES.includes(input.mode)) throw badRequest('Hành động không hợp lệ');
    if (!input.target || !ACCESS_TARGETS.includes(input.target)) throw badRequest('Loại đối tượng không hợp lệ');
    const value = String(input.value ?? '').trim();
    if (!value) throw badRequest('Thiếu giá trị (IP, dải IP, mã quốc gia hoặc ASN)');
    if (input.target === 'country' && !/^[A-Z]{2}$/.test(value.toUpperCase())) throw badRequest('Mã quốc gia gồm 2 chữ cái, vd CN, RU, US');
    await cf(`/zones/${zoneId(id)}/firewall/access_rules/rules`, {
      method: 'POST',
      body: JSON.stringify({
        mode: input.mode,
        configuration: { target: input.target, value: input.target === 'country' ? value.toUpperCase() : value },
        notes: String(input.notes ?? 'ZenPanel').slice(0, 200),
      }),
    });
  }

  async deleteAccessRule(id: string, ruleId: string): Promise<void> {
    if (!/^[a-f0-9]{32}$/.test(ruleId)) throw badRequest('Rule ID không hợp lệ');
    await cf(`/zones/${zoneId(id)}/firewall/access_rules/rules/${ruleId}`, { method: 'DELETE' });
  }
}
