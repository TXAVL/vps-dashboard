// ZenPanel - Xác thực: mật khẩu băm scrypt + token ký HMAC (không cần database)
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { checkApiToken, isApiToken } from './apitokens.js';
import { readJson, writeJson } from './store.js';

const SETTINGS_FILE = 'settings.json';
const SESSIONS_FILE = 'sessions.json';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export interface PanelSettings {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  /** Tăng mỗi lần đổi mật khẩu để vô hiệu hóa mọi token cũ */
  passwordVersion: number;
  secret: string;
  cloudflareToken?: string;
  acmeEmail?: string;
  createdAt: string;
}

export interface ParsedClientInfo {
  browser: string;
  os: string;
  device: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other';
}

export interface UserSession {
  id: string; // sid
  username: string;
  ip: string;
  country?: string;
  browser: string;
  os: string;
  device: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other';
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: number;
  revoked: boolean;
}

export interface TokenPayload {
  u: string;
  v: number;
  exp: number;
  sid?: string;
}

/** Phân tích chi tiết User-Agent để nhận diện thiết bị, hệ điều hành và trình duyệt */
export function parseUserAgent(uaString: string | undefined): ParsedClientInfo {
  const ua = uaString ?? '';
  if (!ua) {
    return {
      browser: 'Không xác định',
      os: 'Không xác định',
      device: 'Không rõ',
      deviceType: 'other',
    };
  }

  // Phân tích OS & Thiết bị
  let os = 'Khác';
  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other' = 'desktop';
  let device = 'Máy tính';

  if (/bot|crawler|spider|curl|wget|postman/i.test(ua)) {
    deviceType = 'bot';
    device = 'Công cụ tự động / API';
    if (/curl/i.test(ua)) os = 'cURL CLI';
    else if (/postman/i.test(ua)) os = 'Postman';
    else os = 'Automated Bot';
  } else if (/iPad/i.test(ua)) {
    os = 'iPadOS';
    deviceType = 'tablet';
    device = 'Apple iPad';
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS';
    const match = ua.match(/OS (\d+[._]\d+)/);
    if (match) os = `iOS ${match[1].replace('_', '.')}`;
    deviceType = 'mobile';
    device = 'Apple iPhone';
  } else if (/Android/i.test(ua)) {
    const verMatch = ua.match(/Android (\d+(\.\d+)?)/);
    os = verMatch ? `Android ${verMatch[1]}` : 'Android';
    if (/Mobile/i.test(ua)) {
      deviceType = 'mobile';
      const modelMatch = ua.match(/;\s*([^;)]+)\s+Build/);
      device = modelMatch ? modelMatch[1].trim() : 'Điện thoại Android';
    } else {
      deviceType = 'tablet';
      device = 'Máy tính bảng Android';
    }
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    const verMatch = ua.match(/Mac OS X (\d+[._]\d+([._]\d+)?)/);
    os = verMatch ? `macOS ${verMatch[1].replace(/_/g, '.')}` : 'macOS';
    deviceType = 'desktop';
    device = 'Apple Mac';
  } else if (/Windows NT/i.test(ua)) {
    deviceType = 'desktop';
    device = 'Máy tính Windows';
    if (/Windows NT 10\.0/i.test(ua)) {
      os = 'Windows 10/11';
    } else if (/Windows NT 6\.3/i.test(ua)) {
      os = 'Windows 8.1';
    } else if (/Windows NT 6\.2/i.test(ua)) {
      os = 'Windows 8';
    } else if (/Windows NT 6\.1/i.test(ua)) {
      os = 'Windows 7';
    } else {
      os = 'Windows';
    }
  } else if (/Linux/i.test(ua)) {
    deviceType = 'desktop';
    device = 'Máy tính Linux';
    if (/Ubuntu/i.test(ua)) os = 'Ubuntu Linux';
    else if (/Debian/i.test(ua)) os = 'Debian Linux';
    else if (/Fedora/i.test(ua)) os = 'Fedora Linux';
    else if (/Arch/i.test(ua)) os = 'Arch Linux';
    else os = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
    deviceType = 'desktop';
    device = 'Chromebook';
  }

  // Phân tích Trình duyệt
  let browser = 'Trình duyệt khác';
  if (/Edg\/(\d+)/i.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/i);
    browser = `Microsoft Edge ${m ? m[1] : ''}`.trim();
  } else if (/OPR\/(\d+)|Opera\/(\d+)/i.test(ua)) {
    const m = ua.match(/(?:OPR|Opera)\/(\d+)/i);
    browser = `Opera ${m ? m[1] : ''}`.trim();
  } else if (/CocCoc\/(\d+)/i.test(ua)) {
    const m = ua.match(/CocCoc\/(\d+)/i);
    browser = `Cốc Cốc ${m ? m[1] : ''}`.trim();
  } else if (/Brave/i.test(ua)) {
    browser = 'Brave';
  } else if (/Vivaldi\/(\d+)/i.test(ua)) {
    const m = ua.match(/Vivaldi\/(\d+)/i);
    browser = `Vivaldi ${m ? m[1] : ''}`.trim();
  } else if (/Chrome\/(\d+)/i.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/i);
    browser = `Google Chrome ${m ? m[1] : ''}`.trim();
  } else if (/Firefox\/(\d+)/i.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/i);
    browser = `Mozilla Firefox ${m ? m[1] : ''}`.trim();
  } else if (/Version\/(\d+).*Safari/i.test(ua)) {
    const m = ua.match(/Version\/(\d+)/i);
    browser = `Safari ${m ? m[1] : ''}`.trim();
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/curl\/(\S+)/i.test(ua)) {
    const m = ua.match(/curl\/(\S+)/i);
    browser = `cURL ${m ? m[1] : ''}`.trim();
  } else if (/PostmanRuntime\/(\S+)/i.test(ua)) {
    browser = 'Postman';
  }

  return { browser, os, device, deviceType };
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

/** Sinh mật khẩu ngẫu nhiên luôn có đủ chữ hoa, chữ thường, số và ký tự đặc biệt */
export function generatePassword(length = 16, symbols = true): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', ...(symbols ? ['!@#%^*-_=+'] : [])];
  const all = groups.join('');
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];
  const chars = [...groups.map(pick), ...Array.from({ length: Math.max(0, length - groups.length) }, () => pick(all))];
  // Xáo trộn Fisher-Yates để nhóm bắt buộc không luôn đứng đầu
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function getSettings(): PanelSettings | null {
  return readJson<PanelSettings | null>(SETTINGS_FILE, null);
}

export function saveSettings(settings: PanelSettings): void {
  writeJson(SETTINGS_FILE, settings);
}

/**
 * Khởi tạo tài khoản admin lần đầu. Trả về mật khẩu dạng rõ (chỉ 1 lần, để in ra console),
 * hoặc null nếu đã có tài khoản.
 */
export function ensureAdminAccount(): { username: string; password: string } | null {
  if (getSettings()) return null;
  const password = config.initialPassword ?? generatePassword();
  const salt = randomBytes(16).toString('hex');
  saveSettings({
    username: 'admin',
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    passwordVersion: 1,
    secret: randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
  });
  return { username: 'admin', password };
}

export function setPassword(newPassword: string): void {
  const settings = getSettings();
  if (!settings) throw new Error('Chưa khởi tạo tài khoản admin');
  const salt = randomBytes(16).toString('hex');
  saveSettings({
    ...settings,
    passwordSalt: salt,
    passwordHash: hashPassword(newPassword, salt),
    passwordVersion: settings.passwordVersion + 1,
  });
  // Khi đổi mật khẩu, đồng thời đánh dấu revoke tất cả session cũ
  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  if (sessions.length) {
    for (const s of sessions) s.revoked = true;
    writeJson(SESSIONS_FILE, sessions);
  }
}

/** Vô hiệu hoá mọi token đang dùng (đăng xuất tất cả thiết bị) */
export function revokeAllSessions(): void {
  const settings = getSettings();
  if (settings) saveSettings({ ...settings, passwordVersion: settings.passwordVersion + 1 });
  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  if (sessions.length) {
    for (const s of sessions) s.revoked = true;
    writeJson(SESSIONS_FILE, sessions);
  }
}

/** Thu hồi 1 phiên cụ thể (bấm logout là logout thật) */
export function revokeSession(sessionId: string): boolean {
  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  let found = false;
  for (const s of sessions) {
    if (s.id === sessionId) {
      s.revoked = true;
      found = true;
    }
  }
  if (found) {
    writeJson(SESSIONS_FILE, sessions);
  }
  return found;
}

/** Thu hồi mọi phiên khác, giữ lại phiên hiện tại */
export function revokeOtherSessions(currentSid: string): number {
  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  let count = 0;
  for (const s of sessions) {
    if (s.id !== currentSid && !s.revoked) {
      s.revoked = true;
      count++;
    }
  }
  if (count > 0) {
    writeJson(SESSIONS_FILE, sessions);
  }
  return count;
}

export function verifyCredentials(username: string, password: string): boolean {
  const settings = getSettings();
  if (!settings || username !== settings.username) return false;
  const expected = Buffer.from(settings.passwordHash, 'hex');
  const actual = Buffer.from(hashPassword(password, settings.passwordSalt), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Tạo session mới khi đăng nhập. Không có request (CLI) thì gắn nhãn "Link đăng nhập nhanh" để vẫn hiện trong danh sách phiên */
export function createSession(req: FastifyRequest | null, username: string, expiresAt: number, label = 'Link đăng nhập nhanh (CLI)'): UserSession {
  const ip = req ? clientIp(req) : 'máy chủ';
  const country = req ? clientCountry(req) : undefined;
  const ua = req ? ((req.headers['user-agent'] as string) || '') : 'zenpanel-cli';
  const parsed: ParsedClientInfo = req ? parseUserAgent(ua) : { browser: 'ZenPanel CLI', os: 'Dòng lệnh', device: label, deviceType: 'other' };
  const sid = `sid_${randomBytes(12).toString('hex')}`;
  const now = new Date().toISOString();

  const newSession: UserSession = {
    id: sid,
    username,
    ip,
    country,
    ...parsed,
    userAgent: ua.slice(0, 300),
    createdAt: now,
    lastActiveAt: now,
    expiresAt,
    revoked: false,
  };

  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  // Lọc bớt session cũ đã revoked hoặc hết hạn quá 14 ngày
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const filtered = sessions.filter((s) => !s.revoked && s.expiresAt > twoWeeksAgo);
  filtered.unshift(newSession);
  writeJson(SESSIONS_FILE, filtered.slice(0, 100));

  return newSession;
}

export function issueToken(session?: UserSession): { token: string; expiresAt: number; sessionId?: string } {
  const settings = getSettings()!;
  const expiresAt = session ? session.expiresAt : Date.now() + TOKEN_TTL_MS;
  const sid = session?.id;
  const payload = Buffer.from(
    JSON.stringify({ u: settings.username, v: settings.passwordVersion, exp: expiresAt, sid } satisfies TokenPayload),
  ).toString('base64url');
  return { token: `${payload}.${sign(payload, settings.secret)}`, expiresAt, sessionId: sid };
}

/** Giải mã và kiểm tra tính hợp lệ của token + session */
export function decodeToken(token: string | undefined): (TokenPayload & { session?: UserSession }) | null {
  if (!token) return null;
  const settings = getSettings();
  if (!settings) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, settings.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenPayload;
    if (data.u !== settings.username || data.v !== settings.passwordVersion || data.exp <= Date.now()) {
      return null;
    }
    // Nếu token có sid -> kiểm tra session xem có bị thu hồi (revoke/logout) không
    if (data.sid) {
      const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
      const session = sessions.find((s) => s.id === data.sid);
      if (!session || session.revoked || session.expiresAt <= Date.now()) {
        return null; // Đã đăng xuất / bị vô hiệu hóa thật
      }
      return { ...data, session };
    }
    return data;
  } catch {
    return null;
  }
}

export function verifyToken(token: string | undefined): boolean {
  return decodeToken(token) !== null;
}

const lastTouched = new Map<string, number>();

/** Cập nhật thời gian hoạt động gần nhất của session (debounce 1 phút để tránh ghi đĩa liên tục) */
export function touchSession(sessionId: string): void {
  const now = Date.now();
  const last = lastTouched.get(sessionId) ?? 0;
  if (now - last < 60_000) return;
  lastTouched.set(sessionId, now);

  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  const target = sessions.find((s) => s.id === sessionId);
  if (target && !target.revoked) {
    target.lastActiveAt = new Date().toISOString();
    writeJson(SESSIONS_FILE, sessions);
  }
}

/** Lấy danh sách session đang hoạt động, phiên hiện tại được đánh dấu isCurrent và xếp đầu tiên */
export function listActiveSessions(currentSid?: string): (UserSession & { isCurrent: boolean })[] {
  const sessions = readJson<UserSession[]>(SESSIONS_FILE, []);
  const now = Date.now();
  const active = sessions
    .filter((s) => !s.revoked && s.expiresAt > now)
    .map((s) => ({
      ...s,
      isCurrent: Boolean(currentSid && s.id === currentSid),
    }));

  return active.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return new Date(b.lastActiveAt || b.createdAt).getTime() - new Date(a.lastActiveAt || a.createdAt).getTime();
  });
}

/**
 * Vé ngắn hạn cho 1 tài nguyên cụ thể (vd link tải file), để không phải đặt token đăng nhập vào URL.
 * Vé gắn với scope và hết hạn sau ttlMs.
 */
export function issueTicket(scope: string, ttlMs = 60_000): string {
  const settings = getSettings()!;
  const payload = Buffer.from(JSON.stringify({ s: scope, v: settings.passwordVersion, exp: Date.now() + ttlMs })).toString('base64url');
  return `${payload}.${sign(`ticket:${payload}`, settings.secret)}`;
}

export function verifyTicket(ticket: string | undefined, scope: string): boolean {
  const settings = getSettings();
  if (!ticket || !settings) return false;
  const [payload, signature] = ticket.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(`ticket:${payload}`, settings.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { s: string; v: number; exp: number };
    return data.s === scope && data.v === settings.passwordVersion && data.exp > Date.now();
  } catch {
    return false;
  }
}

/** Mã quốc gia Cloudflare gửi qua header cf-ipcountry (ISO 2 chữ cái như VN, US, SG, ...) */
export function clientCountry(req: FastifyRequest): string | undefined {
  const cfCountry = req.headers['cf-ipcountry'];
  if (typeof cfCountry === 'string' && cfCountry.length === 2 && cfCountry !== 'XX' && cfCountry !== 'T1') {
    return cfCountry.toUpperCase();
  }
  return undefined;
}

/** IP thật của client: hỗ trợ Cloudflare Tunnel, reverse proxy x-forwarded-for, x-real-ip */
export function clientIp(req: FastifyRequest): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }
  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) return xRealIp.trim();
  return req.ip;
}

const failures = new Map<string, { count: number; until: number }>();

export function loginLockedFor(ip: string): number {
  const entry = failures.get(ip);
  if (!entry || entry.until < Date.now()) return 0;
  return entry.count >= MAX_FAILS ? entry.until - Date.now() : 0;
}

export function recordLoginFailure(ip: string): void {
  const entry = failures.get(ip);
  const now = Date.now();
  if (!entry || entry.until < now) failures.set(ip, { count: 1, until: now + LOCK_MS });
  else entry.count += 1;
}

export function clearLoginFailures(ip: string): void {
  failures.delete(ip);
}

/**
 * Lấy token từ header Authorization. Chỉ WebSocket mới được đọc từ query ?token=
 * (trình duyệt không gửi được header khi mở WebSocket).
 */
export function tokenFromRequest(req: FastifyRequest, allowQuery = false): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (!allowQuery) return undefined;
  const query = req.query as Record<string, unknown> | undefined;
  return typeof query?.token === 'string' ? query.token : undefined;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = tokenFromRequest(req);
  // API token dài hạn (zpt_...): có phạm vi quyền riêng, không dùng được cho đăng nhập / quản lý token
  if (isApiToken(token)) {
    const check = checkApiToken(token, req.method, req.url.split('?')[0], req.ip);
    if (!check.ok) {
      if (check.name) (req as unknown as { zpActor: string }).zpActor = `token:${check.name}`;
      await reply.code(check.status).send({ error: check.message });
      return;
    }
    (req as unknown as { zpActor: string }).zpActor = `token:${check.name}`;
    return;
  }
  const decoded = decodeToken(token);
  if (!decoded) {
    await reply.code(401).send({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
    return;
  }
  if (decoded.sid) {
    touchSession(decoded.sid);
    return;
  }
  // Token cũ không gắn phiên (do link đăng nhập nhanh / bản cũ cấp): tự tạo phiên để thiết bị hiện trong danh sách,
  // đăng xuất thu hồi được, rồi báo token mới qua header để dashboard thay token trong localStorage
  if (token && req.method !== 'OPTIONS') {
    let upgraded = legacyUpgrades.get(token);
    if (!upgraded || upgraded.at < Date.now() - 120_000) {
      const session = createSession(req, decoded.u, decoded.exp);
      upgraded = { token: issueToken(session).token, at: Date.now() };
      legacyUpgrades.set(token, upgraded);
      if (legacyUpgrades.size > 50) legacyUpgrades.delete(legacyUpgrades.keys().next().value as string);
    }
    reply.header('x-zp-new-token', upgraded.token);
  }
}

/** Token cũ (không có sid) -> token mới đã tạo phiên; giữ 2 phút để các request song song không tạo nhiều phiên */
const legacyUpgrades = new Map<string, { token: string; at: number }>();

/** Phiên của request hiện tại: sid trong token, hoặc phiên vừa được tạo khi nâng cấp token cũ */
export function resolveSid(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const decoded = decodeToken(token);
  if (decoded?.sid) return decoded.sid;
  const upgraded = legacyUpgrades.get(token);
  return upgraded ? decodeToken(upgraded.token)?.sid : undefined;
}
