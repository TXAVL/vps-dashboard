// ZenPanel - API client: gắn token đăng nhập, chuẩn hóa lỗi, tự đăng xuất khi token hết hạn
const TOKEN_KEY = 'zenpanel.token';

let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

const listeners = new Set<(authed: boolean) => void>();

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // trình duyệt chặn storage: vẫn giữ token trong bộ nhớ
  }
  listeners.forEach((fn) => fn(Boolean(value)));
}

export function onAuthChange(fn: (authed: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/api/auth/login')) setToken(null);
    const message = typeof data === 'object' && data && 'error' in data ? String(data.error) : `Lỗi ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json: json ?? {} });
export const patch = <T>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json: json ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** URL WebSocket kèm token (trình duyệt không gửi được header Authorization cho WS) */
export function wsUrl(path: string, params: Record<string, string | number> = {}): string {
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) url.searchParams.set('token', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

/** Tải file: xin vé ngắn hạn rồi để trình duyệt tự tải (không đặt token đăng nhập vào URL) */
export async function downloadFile(filePath: string): Promise<void> {
  const { url } = await post<{ url: string }>('/api/files/download-ticket', { path: filePath });
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
