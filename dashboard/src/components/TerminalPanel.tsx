// ZenPanel - Web Terminal (xterm.js) nối tới shell của máy chủ qua WebSocket
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { RotateCcw } from 'lucide-react';
import { wsUrl } from '../lib/api';
import { Button, StatusDot } from './ui';

const theme = {
  background: '#0a0e17',
  foreground: '#E2E8F0',
  cursor: '#10B981',
  cursorAccent: '#0a0e17',
  selectionBackground: '#3B82F655',
  black: '#1E293B',
  red: '#EF4444',
  green: '#10B981',
  yellow: '#F59E0B',
  blue: '#3B82F6',
  magenta: '#A855F7',
  cyan: '#06B6D4',
  white: '#E2E8F0',
  brightBlack: '#475569',
  brightRed: '#F87171',
  brightGreen: '#34D399',
  brightYellow: '#FBBF24',
  brightBlue: '#60A5FA',
  brightMagenta: '#C084FC',
  brightCyan: '#22D3EE',
  brightWhite: '#F8FAFC',
};

/** className phải tạo positioning context (relative/absolute) vì xterm được đặt absolute bên trong */
export function TerminalPanel({ className, initialCommand }: { className?: string; initialCommand?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'online' | 'closed'>('connecting');
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      theme,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();

    const socket = new WebSocket(wsUrl('/ws/terminal', { cols: term.cols, rows: term.rows }));
    setStatus('connecting');
    socket.onopen = () => {
      setStatus('online');
      term.focus();
      if (initialCommand) socket.send(JSON.stringify({ type: 'input', data: `${initialCommand}\r` }));
    };
    socket.onmessage = (event) => term.write(typeof event.data === 'string' ? event.data : '');
    socket.onclose = (event) => {
      setStatus('closed');
      term.write(`\r\n\x1b[90m[Mất kết nối${event.code === 4401 ? ' - phiên đăng nhập hết hạn' : ''}]\x1b[0m\r\n`);
    };

    const input = term.onData((data) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'input', data })));
    const resize = term.onResize(({ cols, rows }) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'resize', cols, rows })));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // phần tử đang bị ẩn
      }
    });
    observer.observe(host.current);

    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket.close();
      term.dispose();
    };
  }, [session, initialCommand]);

  return (
    <div className={className ?? 'relative h-full'}>
      <div ref={host} className="absolute inset-0" />
      <div className="absolute right-3 top-2 z-10 flex items-center gap-2 rounded-lg bg-ink-900/80 px-2 py-1 text-xs text-slate-400 backdrop-blur">
        <StatusDot tone={status === 'online' ? 'green' : status === 'connecting' ? 'amber' : 'red'} pulse={status === 'online'} />
        {status === 'online' ? 'Đã kết nối' : status === 'connecting' ? 'Đang kết nối' : 'Đã ngắt'}
        {status === 'closed' && (
          <Button size="xs" variant="soft" icon={RotateCcw} onClick={() => setSession((s) => s + 1)}>
            Kết nối lại
          </Button>
        )}
      </div>
    </div>
  );
}
