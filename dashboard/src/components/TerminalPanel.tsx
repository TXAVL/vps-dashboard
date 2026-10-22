// ZenPanel - Web Terminal (xterm.js) nối tới shell của máy chủ qua WebSocket
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { CornerDownLeft, RotateCcw } from 'lucide-react';
import { wsUrl } from '../lib/api';
import { usePanel } from '../lib/panel';
import { pushHistory, suggest } from '../lib/shellSuggest';
import { Button, StatusDot, cn } from './ui';

interface SuggestState {
  items: string[];
  index: number;
  typed: string;
  x: number;
  y: number;
  above: boolean;
}

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
  const [hint, setHint] = useState<SuggestState | null>(null);
  const hintRef = useRef<SuggestState | null>(null);
  const { info } = usePanel();
  const windows = info?.os.family === 'windows';
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

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

    const send = (data: string) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'input', data }));

    // ---- Gợi ý lệnh: theo dõi dòng đang gõ ở phía trình duyệt (null = không chắc nội dung dòng, vd sau khi shell tự hoàn thành)
    let line: string | null = '';
    const setSuggest = (next: SuggestState | null) => {
      hintRef.current = next;
      setHint(next);
    };
    const refresh = () => {
      if (line === null || !line) return setSuggest(null);
      const items = suggest(line, Boolean(windowsRef.current));
      if (!items.length) return setSuggest(null);
      // Đặt hộp gợi ý ngay dưới (hoặc trên) con trỏ
      const el = host.current!;
      const cellW = el.clientWidth / term.cols;
      const cellH = el.clientHeight / term.rows;
      const cursorY = term.buffer.active.cursorY;
      const above = cursorY > term.rows - 8;
      setSuggest({ items, index: 0, typed: line, x: Math.min(term.buffer.active.cursorX * cellW + 10, el.clientWidth - 260), y: (above ? cursorY : cursorY + 1) * cellH + 10, above });
    };
    const accept = (item: string) => {
      if (line === null) return;
      const rest = item.slice(line.length);
      if (rest) send(rest);
      line = item;
      setSuggest(null);
    };

    // Tab / ↑ / ↓ / Esc dành cho hộp gợi ý khi đang hiện; không có gợi ý thì để shell xử lý như bình thường
    term.attachCustomKeyEventHandler((e) => {
      const current = hintRef.current;
      if (e.type !== 'keydown' || !current) return true;
      if (e.key === 'Tab') {
        e.preventDefault();
        accept(current.items[current.index]);
        return false;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest({ ...current, index: (current.index + delta + current.items.length) % current.items.length });
        return false;
      }
      if (e.key === 'Escape') {
        setSuggest(null);
        return false;
      }
      return true;
    });

    const input = term.onData((data) => {
      send(data);
      if (data === '\r') {
        if (line) pushHistory(line);
        line = '';
        setSuggest(null);
        return;
      }
      if (data === '\x03' || data === '\x15') {
        // Ctrl+C / Ctrl+U: xoá dòng
        line = '';
        setSuggest(null);
        return;
      }
      if (data === '\x7f' || data === '\b') {
        if (line !== null) line = line.slice(0, -1);
      } else if (data === '\t' || data.startsWith('\x1b')) {
        // Shell tự hoàn thành / phím mũi tên: không còn biết chính xác nội dung dòng
        line = data === '\t' ? null : data === '\x1b[A' || data === '\x1b[B' ? null : line;
      } else if (!/[\x00-\x1f]/.test(data)) {
        if (line !== null) line += data;
      } else if (data.includes('\r')) {
        line = '';
      }
      refresh();
    });
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
      {hint && (
        <div
          className="pointer-events-none absolute z-20 w-[min(420px,calc(100%-20px))] overflow-hidden rounded-xl border border-slate-600/60 bg-ink-900/95 text-xs shadow-2xl shadow-black/50 backdrop-blur"
          style={{ left: Math.max(10, hint.x), top: hint.above ? undefined : hint.y, bottom: hint.above ? `calc(100% - ${hint.y}px)` : undefined }}
        >
          {hint.items.map((item, i) => (
            <div key={item} className={cn('mono flex items-center gap-2 truncate px-3 py-1.5', i === hint.index ? 'bg-zen-blue/25 text-white' : 'text-slate-400')}>
              <span className="truncate">
                <span className="text-emerald-300">{item.slice(0, hint.typed.length)}</span>
                {item.slice(hint.typed.length)}
              </span>
              {i === hint.index && <CornerDownLeft className="ml-auto size-3 shrink-0 text-slate-500" />}
            </div>
          ))}
          <div className="border-t border-slate-700/50 px-3 py-1 text-[10px] text-slate-500">Tab điền · ↑↓ chọn · Esc ẩn</div>
        </div>
      )}
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
