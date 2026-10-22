// ZenPanel - Xác thực: mật khẩu băm scrypt + token ký HMAC (không cần database)
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { readJson, writeJson } from './store.js';

const SETTINGS_FILE = 'settings.json';
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
}

/** Vô hiệu hoá mọi token đang dùng (đăng xuất tất cả thiết bị) */
export function revokeAllSessions(): void {
  const settings = getSettings();
  if (settings) saveSettings({ ...settings, passwordVersion: settings.passwordVersion + 1 });
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

export function issueToken(): { token: string; expiresAt: number } {
  const settings = getSettings()!;
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ u: settings.username, v: settings.passwordVersion, exp: expiresAt }),
  ).toString('base64url');
  return { token: `${payload}.${sign(payload, settings.secret)}`, expiresAt };
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const settings = getSettings();
  if (!settings) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload, settings.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: string; v: number; exp: number };
    return data.u === settings.username && data.v === settings.passwordVersion && data.exp > Date.now();
  } catch {
    return false;
  }
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

/** IP thật của client: request đi qua Cloudflare Tunnel sẽ tới từ 127.0.0.1 kèm header CF-Connecting-IP */
export function clientIp(req: FastifyRequest): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if ((req.ip === '127.0.0.1' || req.ip === '::1') && typeof cfIp === 'string') return cfIp;
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
  if (!verifyToken(tokenFromRequest(req))) {
    await reply.code(401).send({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
}
