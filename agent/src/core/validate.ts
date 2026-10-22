// ZenPanel - Kiểm tra dữ liệu đầu vào trước khi đưa vào lệnh hệ thống
import { isIP } from 'node:net';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);

export function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** "80" hoặc dải "8000-8100" */
export function isPortSpec(value: string): boolean {
  const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(value);
  if (!match) return false;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return isPort(start) && isPort(end) && start <= end;
}

/** IPv4/IPv6, có thể kèm CIDR */
export function isIpOrCidr(value: string): boolean {
  const [ip, prefix, ...rest] = value.split('/');
  if (rest.length || !isIP(ip)) return false;
  if (prefix === undefined) return true;
  const max = isIP(ip) === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= max;
}

export function isServiceName(value: string): boolean {
  return /^[\w@.\-:]{1,200}$/.test(value);
}

export function isDomain(value: string): boolean {
  return /^(?=.{1,253}$)(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(value) || value === 'localhost';
}

/** Tên database / user: chữ, số, gạch dưới */
export function isSqlIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value);
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`Thiếu trường "${field}"`);
  return value.trim();
}
