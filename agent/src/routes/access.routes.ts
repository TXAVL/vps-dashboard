// ZenPanel - API bảo mật truy cập (SSH, Fail2ban, hostname/DNS/múi giờ), cảnh báo, nhật ký thao tác, quét mã độc
import type { FastifyInstance } from 'fastify';
import { createApiToken, listApiTokens, revokeApiToken } from '../core/apitokens.js';
import { badRequest } from '../core/validate.js';
import type { AccessService } from '../services/access.service.js';
import type { AlertService } from '../services/alerts.service.js';
import type { AuditService } from '../services/audit.service.js';
import type { MalwareService } from '../services/malware.service.js';
import type { SecureFolderService } from '../services/securefolder.service.js';

export async function accessRoutes(app: FastifyInstance, deps: { access: AccessService; alerts: AlertService; audit: AuditService; malware: MalwareService; secure: SecureFolderService }): Promise<void> {
  const { access, alerts, audit, malware, secure } = deps;
  const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;

  // ---- SSH
  app.get('/api/access/ssh', async () => access.ssh());
  app.put('/api/access/ssh', async (req) => access.updateSsh(body(req) as Parameters<AccessService['updateSsh']>[0]));
  app.get('/api/access/ssh/keys', async () => access.keys());
  app.post('/api/access/ssh/keys', async (req) => {
    await access.addKey(String(body(req).publicKey ?? ''));
    return { ok: true };
  });
  app.post('/api/access/ssh/keys/generate', async (req) => access.generateKey(String(body(req).comment ?? '')));
  app.delete('/api/access/ssh/keys', async (req) => {
    const fingerprint = String((req.query as { fingerprint?: string }).fingerprint ?? '');
    if (!fingerprint) throw badRequest('Thiếu fingerprint');
    await access.removeKey(fingerprint);
    return { ok: true };
  });
  app.get('/api/access/logins', async () => access.logins());

  // ---- Fail2ban
  app.get('/api/access/fail2ban', async () => access.fail2ban());
  app.post('/api/access/fail2ban/:action', async (req) => {
    const { action } = req.params as { action: string };
    if (action !== 'ban' && action !== 'unban') throw badRequest('Thao tác không hợp lệ');
    await access.fail2banAction(action, String(body(req).jail ?? ''), String(body(req).ip ?? ''));
    return { ok: true };
  });

  // ---- Hostname / múi giờ / DNS
  app.get('/api/access/host', async () => access.host());
  app.get('/api/access/host/timezones', async () => access.timezones());
  app.put('/api/access/host/hostname', async (req) => access.setHostname(String(body(req).hostname ?? '')));
  app.put('/api/access/host/timezone', async (req) => {
    await access.setTimezone(String(body(req).timezone ?? ''));
    return access.host();
  });
  app.put('/api/access/host/dns', async (req) => {
    await access.setDns(Array.isArray(body(req).servers) ? (body(req).servers as unknown[]).map(String) : []);
    return access.host();
  });
  app.post('/api/access/host/sync-time', async () => ({ output: await access.syncTime() }));

  // ---- Cảnh báo
  app.get('/api/alerts', async () => ({ config: alerts.view(), history: alerts.history() }));
  app.put('/api/alerts', async (req) => alerts.save(body(req)));
  app.post('/api/alerts/test/:channel', async (req) => {
    const { channel } = req.params as { channel: string };
    if (channel !== 'telegram' && channel !== 'discord' && channel !== 'webhook') throw badRequest('Kênh không hợp lệ');
    return alerts.test(channel);
  });
  app.get('/api/alerts/connectivity', async () => alerts.connectivity());
  app.post('/api/alerts/telegram/verify', async (req) => alerts.telegramVerify(String(body(req).botToken ?? '')));
  app.post('/api/alerts/telegram/chats', async (req) => alerts.telegramDetectChats(String(body(req).botToken ?? '')));
  app.delete('/api/alerts/history', async () => {
    alerts.clearHistory();
    return { ok: true };
  });

  // ---- API token (token API không tự quản lý được: bị chặn ở requireAuth)
  app.get('/api/tokens', async () => listApiTokens());
  app.post('/api/tokens', async (req) => createApiToken(body(req) as { name?: string; scope?: string; expiresInDays?: number | null }));
  app.delete('/api/tokens/:id', async (req) => {
    revokeApiToken((req.params as { id: string }).id);
    return { ok: true };
  });

  // ---- Nhật ký thao tác
  app.get('/api/audit', async (req) => {
    const q = req.query as { q?: string; failed?: string; limit?: string };
    return audit.list({ q: q.q, failedOnly: q.failed === '1', limit: Number(q.limit) || 200 });
  });
  app.delete('/api/audit', async () => {
    audit.clear();
    return { ok: true };
  });

  // ---- SecureFolder (khoá chống sửa)
  app.get('/api/security/secure-folders', async () => secure.list());
  app.post('/api/security/secure-folders', async (req) => secure.add(body(req) as { path: string; note?: string }));
  app.post('/api/security/secure-folders/:id/:action', async (req) => {
    const { id, action } = req.params as { id: string; action: string };
    if (action !== 'lock' && action !== 'unlock') throw badRequest('Thao tác không hợp lệ');
    await secure.setLocked(id, action === 'lock');
    return { ok: true };
  });
  app.delete('/api/security/secure-folders/:id', async (req) => {
    await secure.remove((req.params as { id: string }).id);
    return { ok: true };
  });

  // ---- Quét mã độc
  app.get('/api/security/malware', async () => ({ last: malware.last(), quarantine: malware.quarantined(), roots: malware.roots() }));
  app.post('/api/security/malware/scan', async (req) => malware.scan(body(req) as { paths?: string[] }));
  app.post('/api/security/malware/preview', async (req) => malware.preview(String(body(req).file ?? '')));
  app.post('/api/security/malware/quarantine', async (req) => ({ count: await malware.quarantine(((body(req).files as string[]) ?? []).map(String)) }));
  app.post('/api/security/malware/delete', async (req) => ({ count: await malware.remove(((body(req).files as string[]) ?? []).map(String)) }));
  app.post('/api/security/malware/restore/:id', async (req) => {
    await malware.restore((req.params as { id: string }).id);
    return { ok: true };
  });
  app.delete('/api/security/malware/quarantine/:id', async (req) => {
    await malware.deleteQuarantined((req.params as { id: string }).id);
    return { ok: true };
  });
}
