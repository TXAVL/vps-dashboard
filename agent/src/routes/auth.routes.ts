// ZenPanel - API đăng nhập / đổi mật khẩu
import type { FastifyInstance } from 'fastify';
import {
  clearLoginFailures,
  clientIp,
  getSettings,
  issueToken,
  loginLockedFor,
  recordLoginFailure,
  requireAuth,
  setPassword,
  verifyCredentials,
} from '../core/auth.js';
import { badRequest, HttpError, requireString } from '../core/validate.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req) => {
    const ip = clientIp(req);
    const locked = loginLockedFor(ip);
    if (locked > 0) throw new HttpError(429, `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(locked / 60000)} phút.`);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = requireString(body.username, 'username');
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
    const next = requireString(body.newPassword, 'newPassword');
    const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim() : undefined;
    if (!verifyCredentials(getSettings()!.username, current)) throw badRequest('Mật khẩu hiện tại không đúng');
    if (next.length < 8) throw badRequest('Mật khẩu mới phải có ít nhất 8 ký tự');
    if (username && !/^[\w.-]{3,32}$/.test(username)) throw badRequest('Tên đăng nhập chỉ gồm chữ, số, . _ - (3-32 ký tự)');
    setPassword(next, username);
    // Mật khẩu đổi -> token cũ hết hiệu lực, cấp token mới cho phiên hiện tại
    return issueToken();
  });
}
