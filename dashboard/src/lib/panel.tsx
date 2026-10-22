// ZenPanel - Context toàn cục: thông tin máy chủ + metrics realtime qua WebSocket
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { get, wsUrl } from './api';
import type { MetricsSnapshot, SystemInfo, TunnelState } from './types';

interface PanelContextValue {
  info: SystemInfo | null;
  latest: MetricsSnapshot | null;
  history: MetricsSnapshot[];
  connected: boolean;
  tunnel: TunnelState | null;
  refreshInfo: () => Promise<void>;
}

const PanelContext = createContext<PanelContextValue | null>(null);
const HISTORY_SIZE = 90;

export function PanelProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelState | null>(null);

  const refreshInfo = async () => {
    const next = await get<SystemInfo>('/api/system/info');
    setInfo(next);
    setTunnel(next.tunnel);
  };

  useEffect(() => {
    void refreshInfo().catch(() => undefined);
  }, []);

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
    <PanelContext.Provider value={{ info, latest: history[history.length - 1] ?? null, history, connected, tunnel, refreshInfo }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext);
  if (!value) throw new Error('usePanel phải nằm trong PanelProvider');
  return value;
}
