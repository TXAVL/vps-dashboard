// ZenPanel - API client: gắn token đăng nhập, chuẩn hóa lỗi, tự đăng xuất khi token hết hạn
const TOKEN_KEY = 'zenpanel.token';

let token: string | null = (() => {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const urlParams = new URLSearchParams(window.location.search);
      const paramToken = urlParams.get('token') || urlParams.get('auth_token');
      if (paramToken) {
        localStorage.setItem(TOKEN_KEY, paramToken);
        urlParams.delete('token');
        urlParams.delete('auth_token');
        urlParams.delete('auto_login');
        const cleanSearch = urlParams.toString();
        const newUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
        return paramToken;
      }
    }
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

/** Đăng xuất phiên hiện tại thật sự (vô hiệu hóa token trên server trước khi xóa local storage) */
export async function logout(): Promise<void> {
  const currentToken = token;
  try {
    if (currentToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
      });
    }
  } catch {
    // Bỏ qua lỗi mạng
  } finally {
    setToken(null);
  }
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

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; timeout?: number } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  let signal = init.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (init.timeout && !signal) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), init.timeout);
  }

  try {
    const res = await fetch(path, { ...init, headers, body, signal });
    // Agent nâng cấp token cũ (không gắn phiên) lên token có phiên: thay luôn để thiết bị hiện trong danh sách phiên
    const upgraded = res.headers.get('x-zp-new-token');
    if (upgraded && upgraded !== token) setToken(upgraded);
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      if (res.status === 401 && token && !path.startsWith('/api/auth/login')) setToken(null);
      const message = typeof data === 'object' && data && 'error' in data ? String(data.error) : `Lỗi ${res.status}`;
      throw new ApiError(res.status, message);
    }
    return data as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export const get = <T>(path: string, options?: RequestInit & { timeout?: number }) => api<T>(path, options);
export const post = <T>(path: string, json?: unknown, options?: RequestInit & { timeout?: number }) => api<T>(path, { method: 'POST', json: json ?? {}, ...options });
export const put = <T>(path: string, json?: unknown, options?: RequestInit & { timeout?: number }) => api<T>(path, { method: 'PUT', json: json ?? {}, ...options });
export const patch = <T>(path: string, json?: unknown, options?: RequestInit & { timeout?: number }) => api<T>(path, { method: 'PATCH', json: json ?? {}, ...options });
export const del = <T>(path: string, options?: RequestInit & { timeout?: number }) => api<T>(path, { method: 'DELETE', ...options });

/** URL WebSocket kèm token (trình duyệt không gửi được header Authorization cho WS) */
export function wsUrl(path: string, params: Record<string, string | number> = {}): string {
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) url.searchParams.set('token', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

/** Lấy vé tải file có thời hạn 5 phút (gắn expires vào params URL) */
export async function getDownloadTicket(filePath: string): Promise<{ url: string; fullUrl: string; expires: number; ttl: number }> {
  const data = await post<{ url: string; expires: number; ttl: number }>('/api/files/download-ticket', { path: filePath });
  const fullUrl = new URL(data.url, window.location.origin).toString();
  return { ...data, fullUrl };
}

/** Tải thư mục: VPS tự nén zip tạm (xoá ngay sau khi tải), trình duyệt nhận file .zip */
export async function downloadFolder(dirPath: string): Promise<void> {
  const { url } = await post<{ url: string }>('/api/files/download-folder', { path: dirPath });
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Tải file an toàn: xin vé ngắn hạn 5 phút rồi để trình duyệt tự tải (chặn IDM) */
export async function downloadFile(filePath: string): Promise<void> {
  const { url } = await getDownloadTicket(filePath);
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
