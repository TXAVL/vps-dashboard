// ZenPanel - API đăng nhập / đổi mật khẩu / quản lý phiên và nhật ký đăng nhập
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  clearLoginFailures,
  clientCountry,
  clientIp,
  createSession,
  decodeToken,
  generatePassword,
  getSettings,
  issueToken,
  listActiveSessions,
  loginLockedFor,
  parseUserAgent,
  recordLoginFailure,
  requireAuth,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  setPassword,
  tokenFromRequest,
  verifyCredentials,
} from '../core/auth.js';
import { failedRules, RANDOM_DEFAULT_LENGTH, RANDOM_MAX_LENGTH, RANDOM_MIN_LENGTH } from '../core/password.js';
import { readJson, writeJson } from '../core/store.js';
import { badRequest, HttpError, requireString } from '../core/validate.js';

const HISTORY_FILE = 'login-history.json';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LoginRecord {
  id: string;
  at: string;
  ip: string;
  country?: string;
  ok: boolean;
  reason?: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other';
}

function recordLogin(req: FastifyRequest, ok: boolean, reason?: string): void {
  const history = readJson<LoginRecord[]>(HISTORY_FILE, []);
  const ip = clientIp(req);
  const country = clientCountry(req);
  const ua = (req.headers['user-agent'] as string) || '';
  const parsed = parseUserAgent(ua);
  const id = `log_${Date.now()}_${randomBytes(4).toString('hex')}`;

  const record: LoginRecord = {
    id,
    at: new Date().toISOString(),
    ip,
    country,
    ok,
    reason: reason || (ok ? 'Đăng nhập thành công' : 'Sai thông tin xác thực'),
    userAgent: ua.slice(0, 300),
    ...parsed,
  };

  history.unshift(record);
  writeJson(HISTORY_FILE, history.slice(0, 100));
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req) => {
    const ip = clientIp(req);
    const locked = loginLockedFor(ip);
    if (locked > 0) {
      const waitMin = Math.ceil(locked / 60000);
      recordLogin(req, false, `Đã bị tạm khóa IP do thử sai quá 5 lần. Thử lại sau ${waitMin} phút.`);
      throw new HttpError(429, `Đăng nhập sai quá nhiều lần. Thử lại sau ${waitMin} phút.`);
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = getSettings()?.username ?? 'admin';
    const password = requireString(body.password, 'password');

    if (!verifyCredentials(username, password)) {
      recordLoginFailure(ip);
      recordLogin(req, false, 'Sai mật khẩu quản trị');
      req.log.warn({ ip, username }, 'ZenPanel: đăng nhập thất bại');
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }

    clearLoginFailures(ip);
    const session = createSession(req, username, Date.now() + TOKEN_TTL_MS);
    recordLogin(req, true, 'Đăng nhập thành công');

    return { ...issueToken(session), username };
  });

  // Đăng xuất phiên hiện tại: vô hiệu hóa session trên server (logout thật)
  app.post('/api/auth/logout', async (req) => {
    const token = tokenFromRequest(req);
    const decoded = decodeToken(token);
    if (decoded?.sid) {
      revokeSession(decoded.sid);
    }
    return { ok: true, message: 'Đã đăng xuất thành công' };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async () => ({ username: getSettings()?.username }));

  // Danh sách các phiên đăng nhập đang hoạt động
  app.get('/api/auth/sessions', { preHandler: requireAuth }, async (req) => {
    const token = tokenFromRequest(req);
    const decoded = decodeToken(token);
    return listActiveSessions(decoded?.sid);
  });

  // Đăng xuất 1 phiên thiết bị cụ thể (chặn không cho thu hồi phiên hiện tại từ danh sách)
  app.post('/api/auth/sessions/:id/revoke', { preHandler: requireAuth }, async (req) => {
    const params = req.params as { id: string };
    const targetSid = params.id;
    const token = tokenFromRequest(req);
    const decoded = decodeToken(token);
    const currentSid = decoded?.sid;

    if (currentSid && targetSid === currentSid) {
      throw badRequest('Không thể đăng xuất phiên hiện tại từ danh sách. Để đăng xuất phiên này, vui lòng dùng nút Đăng xuất trên thanh điều hướng.');
    }

    const ok = revokeSession(targetSid);
    if (!ok) {
      throw new HttpError(404, 'Không tìm thấy phiên đăng nhập này hoặc phiên đã hết hạn');
    }
    return { ok: true, message: 'Đã thu hồi phiên đăng nhập thiết bị thành công' };
  });

  // Lịch sử đăng nhập chi tiết
  app.get('/api/auth/history', { preHandler: requireAuth }, async () => {
    const history = readJson<any[]>(HISTORY_FILE, []);
    return history.map((item, idx) => {
      if (item.browser && item.os) return item;
      const parsed = parseUserAgent(item.userAgent || '');
      return {
        id: item.id || `log_${idx}`,
        at: item.at || new Date().toISOString(),
        ip: item.ip || '127.0.0.1',
        country: item.country,
        ok: Boolean(item.ok),
        reason: item.reason || (item.ok ? 'Đăng nhập thành công' : 'Sai thông tin xác thực'),
        userAgent: item.userAgent || '',
        ...parsed,
      };
    });
  });

  // Đăng xuất mọi thiết bị khác: giữ lại phiên hiện tại
  app.post('/api/auth/logout-all', { preHandler: requireAuth }, async (req) => {
    const token = tokenFromRequest(req);
    const decoded = decodeToken(token);
    if (decoded?.sid) {
      revokeOtherSessions(decoded.sid);
      return { ok: true, message: 'Đã đăng xuất mọi thiết bị khác' };
    }
    revokeAllSessions();
    const next = issueToken();
    return { ok: true, token: next.token };
  });

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = requireString(body.currentPassword, 'currentPassword');
    if (!verifyCredentials(getSettings()!.username, current)) throw badRequest('Mật khẩu hiện tại không đúng');

    const random = body.mode === 'random';
    let next: string;
    if (random) {
      const length = Number(body.length ?? RANDOM_DEFAULT_LENGTH);
      if (!Number.isInteger(length) || length < RANDOM_MIN_LENGTH || length > RANDOM_MAX_LENGTH) {
        throw badRequest(`Độ dài mật khẩu ngẫu nhiên phải từ ${RANDOM_MIN_LENGTH} đến ${RANDOM_MAX_LENGTH} ký tự`);
      }
      do next = generatePassword(length);
      while (failedRules(next).some((rule) => rule.id !== 'length'));
    } else {
      next = requireString(body.newPassword, 'newPassword');
      const failed = failedRules(next);
      if (failed.length) throw badRequest(`Mật khẩu chưa đủ mạnh: ${failed.map((r) => r.label).join(', ')}`);
    }
    if (next === current) throw badRequest('Mật khẩu mới phải khác mật khẩu hiện tại');
    setPassword(next);
    // Cấp session và token mới cho phiên hiện tại
    const session = createSession(req, getSettings()!.username, Date.now() + TOKEN_TTL_MS);
    return { ...issueToken(session), password: random ? next : undefined };
  });
}

