// ZenPanel - Context toàn cục: thông tin máy chủ, metrics realtime (WebSocket), tuỳ chọn panel, trạng thái cập nhật
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { get, put, wsUrl } from './api';
import type { MetricsSnapshot, PanelPrefs, SystemInfo, TunnelState, UpdateState } from './types';

interface PanelContextValue {
  info: SystemInfo | null;
  latest: MetricsSnapshot | null;
  history: MetricsSnapshot[];
  connected: boolean;
  tunnel: TunnelState | null;
  prefs: PanelPrefs;
  update: UpdateState | null;
  refreshInfo: () => Promise<void>;
  savePrefs: (patch: Partial<PanelPrefs>) => Promise<void>;
  refreshUpdate: () => Promise<void>;
}

const PanelContext = createContext<PanelContextValue | null>(null);
const HISTORY_SIZE = 90;
const THEME_CACHE = 'zenpanel.theme';

export const DEFAULT_PREFS: PanelPrefs = {
  networkUnit: 'bytes',
  theme: 'zen',
  base: 'slate',
  vpsExpiry: null,
  vpsProvider: '',
  vpsRenewUrl: '',
  vpsPrice: '',
  expiryWarnDays: 7,
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
  publicHost: '',
};

/** Áp dụng giao diện lên <html data-theme data-base> (CSS biến màu nằm trong index.css) */
export function applyTheme(theme: string, base: string): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.base = base;
  try {
    localStorage.setItem(THEME_CACHE, JSON.stringify({ theme, base }));
  } catch {
    // storage bị chặn: chỉ mất phần nhớ giao diện trước khi tải xong
  }
}

/** Gọi sớm trong main.tsx để không bị nháy màu mặc định trước khi tải tuỳ chọn */
export function applyCachedTheme(): void {
  try {
    const cached = JSON.parse(localStorage.getItem(THEME_CACHE) ?? 'null') as { theme: string; base: string } | null;
    if (cached) applyTheme(cached.theme, cached.base);
  } catch {
    // bỏ qua
  }
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelState | null>(null);
  const [prefs, setPrefs] = useState<PanelPrefs>(DEFAULT_PREFS);
  const [update, setUpdate] = useState<UpdateState | null>(null);

  const refreshInfo = useCallback(async () => {
    const next = await get<SystemInfo>('/api/system/info');
    setInfo(next);
    setTunnel(next.tunnel);
  }, []);

  const refreshUpdate = useCallback(async () => {
    setUpdate(await get<UpdateState>('/api/update'));
  }, []);

  const savePrefs = useCallback(async (patch: Partial<PanelPrefs>) => {
    const next = await put<PanelPrefs>('/api/prefs', patch);
    setPrefs(next);
    applyTheme(next.theme, next.base);
  }, []);

  useEffect(() => {
    void refreshInfo().catch(() => undefined);
    get<PanelPrefs>('/api/prefs')
      .then((p) => {
        setPrefs(p);
        applyTheme(p.theme, p.base);
      })
      .catch(() => undefined);
    void refreshUpdate().catch(() => undefined);
    // Trạng thái cập nhật đổi khi agent tự kiểm tra định kỳ
    const timer = setInterval(() => void refreshUpdate().catch(() => undefined), 5 * 60_000);
    return () => clearInterval(timer);
  }, [refreshInfo, refreshUpdate]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(wsUrl('/ws/metrics'));
      socket.onopen = () => setConnected(true);
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as
          | { type: 'history'; data: MetricsSnapshot[] }
          | { type: 'snapshot'; data: MetricsSnapshot }
          | { type: 'tunnel'; data: TunnelState };
        if (msg.type === 'history') setHistory(msg.data.slice(-HISTORY_SIZE));
        else if (msg.type === 'snapshot') setHistory((prev) => [...prev.slice(-(HISTORY_SIZE - 1)), msg.data]);
        else if (msg.type === 'tunnel') setTunnel(msg.data);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return (
    <PanelContext.Provider
      value={{ info, latest: history[history.length - 1] ?? null, history, connected, tunnel, prefs, update, refreshInfo, savePrefs, refreshUpdate }}
    >
      {children}
    </PanelContext.Provider>
  );
}

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext);
  if (!value) throw new Error('usePanel phải nằm trong PanelProvider');
  return value;
}

/** Đồng hồ tick mỗi giây (dùng cho uptime chạy realtime, đếm ngược hạn VPS) */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Uptime chính xác tới giây: lấy từ snapshot gần nhất + thời gian đã trôi qua */
export function useLiveUptime(): number | null {
  const { latest } = usePanel();
  const now = useNow();
  if (!latest) return null;
  return latest.uptime + Math.max(0, (now - latest.time) / 1000);
}

/** Host public để hiển thị địa chỉ truy cập: domain admin tự đặt > IP public > hostname trình duyệt */
export function usePublicHost(): { host: string; source: 'custom' | 'ip' | 'browser' } {
  const { prefs } = usePanel();
  const [ip, setIp] = useState<string | null>(null);
  useEffect(() => {
    if (prefs.publicHost) return;
    get<{ publicIpv4: string | null }>('/api/system/network')
      .then((n) => setIp(n.publicIpv4))
      .catch(() => undefined);
  }, [prefs.publicHost]);
  if (prefs.publicHost) return { host: prefs.publicHost, source: 'custom' };
  if (ip) return { host: ip, source: 'ip' };
  return { host: window.location.hostname, source: 'browser' };
}
