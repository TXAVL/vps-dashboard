// ZenPanel - API Token dài hạn để điều khiển panel qua REST / MCP (không phải phiên đăng nhập của người dùng).
// Token chỉ lưu dạng băm SHA-256; giá trị gốc hiển thị đúng 1 lần lúc tạo.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readJson, writeJson } from './store.js';
import { badRequest, HttpError } from './validate.js';

const FILE = 'api-tokens.json';
export const API_TOKEN_PREFIX = 'zpt_';

export type TokenScope = 'read' | 'full';

export interface ApiTokenRecord {
  id: string;
  name: string;
  hash: string;
  /** vài ký tự đầu để nhận diện trong danh sách */
  hint: string;
  scope: TokenScope;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastIp: string | null;
  uses: number;
}

export type ApiTokenView = Omit<ApiTokenRecord, 'hash'>;

const sha = (token: string) => createHash('sha256').update(token).digest('hex');

/** Token API không được dùng để quản trị chính nó, đổi mật khẩu / phiên, hoặc tắt máy */
const FORBIDDEN_FOR_TOKENS = /^\/api\/(auth|tokens)(\/|$)|^\/api\/system\/power/;

export function isApiToken(token: string | undefined): token is string {
  return Boolean(token?.startsWith(API_TOKEN_PREFIX));
}

function all(): ApiTokenRecord[] {
  return readJson<ApiTokenRecord[]>(FILE, []);
}

export function listApiTokens(): ApiTokenView[] {
  return all().map(({ hash: _h, ...rest }) => rest);
}

export function createApiToken(input: { name?: string; scope?: string; expiresInDays?: number | null }): { token: string; info: ApiTokenView } {
  const name = String(input.name ?? '').trim().slice(0, 60);
  if (!name) throw badRequest('Đặt tên cho token (vd "Claude Code", "n8n")');
  const scope: TokenScope = input.scope === 'full' ? 'full' : 'read';
  const days = Number(input.expiresInDays);
  const token = `${API_TOKEN_PREFIX}${randomBytes(30).toString('base64url')}`;
  const record: ApiTokenRecord = {
    id: `tok_${randomBytes(6).toString('hex')}`,
    name,
    hash: sha(token),
    hint: `${token.slice(0, 8)}…${token.slice(-4)}`,
    scope,
    createdAt: new Date().toISOString(),
    expiresAt: Number.isFinite(days) && days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86_400_000).toISOString() : null,
    lastUsedAt: null,
    lastIp: null,
    uses: 0,
  };
  writeJson(FILE, [record, ...all()]);
  const { hash: _h, ...info } = record;
  return { token, info };
}

export function revokeApiToken(id: string): void {
  const list = all();
  if (!list.some((t) => t.id === id)) throw new HttpError(404, 'Không tìm thấy token');
  writeJson(FILE, list.filter((t) => t.id !== id));
}

export type TokenCheck =
  | { ok: true; id: string; name: string; scope: TokenScope }
  | { ok: false; status: 401 | 403; message: string; /** tên token (nếu nhận ra) để nhật ký ghi đúng người */ name?: string };

const lastTouch = new Map<string, number>();

/** Kiểm tra token + quyền cho request: path/method để áp quyền chỉ đọc và danh sách cấm */
export function checkApiToken(token: string, method: string, path: string, ip: string): TokenCheck {
  const digest = Buffer.from(sha(token));
  const list = all();
  const record = list.find((t) => {
    const candidate = Buffer.from(t.hash);
    return candidate.length === digest.length && timingSafeEqual(candidate, digest);
  });
  if (!record) return { ok: false, status: 401, message: 'API token không hợp lệ hoặc đã bị thu hồi' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) return { ok: false, status: 401, message: 'API token đã hết hạn' };
  if (FORBIDDEN_FOR_TOKENS.test(path)) return { ok: false, status: 403, message: 'API token không được dùng cho chức năng này (đăng nhập, quản lý token, nguồn máy chủ)', name: record.name };
  if (record.scope === 'read' && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return { ok: false, status: 403, message: `Token "${record.name}" chỉ có quyền đọc. Tạo token quyền "Đầy đủ" để thực hiện thao tác thay đổi.`, name: record.name };
  }
  // Ghi lastUsed tối đa 1 lần / phút để không ghi đĩa mỗi request
  const now = Date.now();
  if (now - (lastTouch.get(record.id) ?? 0) > 60_000) {
    lastTouch.set(record.id, now);
    writeJson(FILE, list.map((t) => (t.id === record.id ? { ...t, lastUsedAt: new Date().toISOString(), lastIp: ip, uses: t.uses + 1 } : t)));
  }
  return { ok: true, id: record.id, name: record.name, scope: record.scope };
}

/** Dùng cho MCP (không đi qua requireAuth): trả token hợp lệ hoặc null */
export function verifyApiTokenForMcp(token: string | undefined, ip: string): { id: string; name: string; scope: TokenScope } | { error: string } {
  if (!isApiToken(token)) return { error: 'Thiếu API token (header "Authorization: Bearer zpt_...")' };
  // MCP luôn là POST nên kiểm tra như yêu cầu đọc; quyền ghi được kiểm tra ở từng công cụ (write: true)
  const res = checkApiToken(token, 'GET', '/mcp', ip);
  return res.ok ? { id: res.id, name: res.name, scope: res.scope } : { error: res.message };
}
