// ZenPanel - API đăng nhập / đổi mật khẩu
import type { FastifyInstance } from 'fastify';
import {
  clearLoginFailures,
  clientIp,
  generatePassword,
  getSettings,
  issueToken,
  loginLockedFor,
  recordLoginFailure,
  requireAuth,
  setPassword,
  verifyCredentials,
} from '../core/auth.js';
import { failedRules } from '../core/password.js';
import { badRequest, HttpError, requireString } from '../core/validate.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req) => {
    const ip = clientIp(req);
    const locked = loginLockedFor(ip);
    if (locked > 0) throw new HttpError(429, `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(locked / 60000)} phút.`);

    const body = (req.body ?? {}) as Record<string, unknown>;
    // Tài khoản admin cố định, không nhận username từ client
    const username = getSettings()?.username ?? 'admin';
    const password = requireString(body.password, 'password');
    if (!verifyCredentials(username, password)) {
      recordLoginFailure(ip);
      req.log.warn({ ip, username }, 'ZenPanel: đăng nhập thất bại');
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    clearLoginFailures(ip);
    return { ...issueToken(), username };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async () => ({ username: getSettings()?.username }));

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = requireString(body.currentPassword, 'currentPassword');
    if (!verifyCredentials(getSettings()!.username, current)) throw badRequest('Mật khẩu hiện tại không đúng');

    // mode "random": ZenPanel sinh mật khẩu mạnh và trả về đúng 1 lần
    const random = body.mode === 'random';
    const next = random ? generatePassword(20) : requireString(body.newPassword, 'newPassword');
    const failed = failedRules(next);
    if (failed.length) throw badRequest(`Mật khẩu chưa đủ mạnh: ${failed.map((r) => r.label).join(', ')}`);
    if (next === current) throw badRequest('Mật khẩu mới phải khác mật khẩu hiện tại');
    setPassword(next);
    // Mật khẩu đổi -> token cũ hết hiệu lực, cấp token mới cho phiên hiện tại
    return { ...issueToken(), password: random ? next : undefined };
  });
}
