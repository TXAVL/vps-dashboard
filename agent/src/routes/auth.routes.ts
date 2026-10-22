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
  revokeAllSessions,
  setPassword,
  verifyCredentials,
} from '../core/auth.js';
import { failedRules, RANDOM_DEFAULT_LENGTH, RANDOM_MAX_LENGTH, RANDOM_MIN_LENGTH } from '../core/password.js';
import { readJson, writeJson } from '../core/store.js';
import { badRequest, HttpError, requireString } from '../core/validate.js';

const HISTORY_FILE = 'login-history.json';

interface LoginRecord {
  at: string;
  ip: string;
  ok: boolean;
  userAgent: string;
}

function recordLogin(ip: string, ok: boolean, userAgent: string | undefined): void {
  const history = readJson<LoginRecord[]>(HISTORY_FILE, []);
  history.unshift({ at: new Date().toISOString(), ip, ok, userAgent: (userAgent ?? '').slice(0, 200) });
  writeJson(HISTORY_FILE, history.slice(0, 100));
}

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
      recordLogin(ip, false, req.headers['user-agent']);
      req.log.warn({ ip, username }, 'ZenPanel: đăng nhập thất bại');
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    clearLoginFailures(ip);
    recordLogin(ip, true, req.headers['user-agent']);
    return { ...issueToken(), username };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async () => ({ username: getSettings()?.username }));

  app.get('/api/auth/history', { preHandler: requireAuth }, async () => readJson<LoginRecord[]>(HISTORY_FILE, []));

  // Đăng xuất mọi thiết bị: tăng passwordVersion để mọi token cũ hết hiệu lực
  app.post('/api/auth/logout-all', { preHandler: requireAuth }, async () => {
    revokeAllSessions();
    return issueToken();
  });

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = requireString(body.currentPassword, 'currentPassword');
    if (!verifyCredentials(getSettings()!.username, current)) throw badRequest('Mật khẩu hiện tại không đúng');

    // mode "random": ZenPanel sinh mật khẩu theo độ dài người dùng chọn và trả về đúng 1 lần
    const random = body.mode === 'random';
    let next: string;
    if (random) {
      const length = Number(body.length ?? RANDOM_DEFAULT_LENGTH);
      if (!Number.isInteger(length) || length < RANDOM_MIN_LENGTH || length > RANDOM_MAX_LENGTH) {
        throw badRequest(`Độ dài mật khẩu ngẫu nhiên phải từ ${RANDOM_MIN_LENGTH} đến ${RANDOM_MAX_LENGTH} ký tự`);
      }
      // Sinh lại tới khi đạt mọi quy tắc trừ độ dài tối thiểu (độ dài do người dùng chọn)
      do next = generatePassword(length);
      while (failedRules(next).some((rule) => rule.id !== 'length'));
    } else {
      next = requireString(body.newPassword, 'newPassword');
      const failed = failedRules(next);
      if (failed.length) throw badRequest(`Mật khẩu chưa đủ mạnh: ${failed.map((r) => r.label).join(', ')}`);
    }
    if (next === current) throw badRequest('Mật khẩu mới phải khác mật khẩu hiện tại');
    setPassword(next);
    // Mật khẩu đổi -> token cũ hết hiệu lực, cấp token mới cho phiên hiện tại
    return { ...issueToken(), password: random ? next : undefined };
  });
}
