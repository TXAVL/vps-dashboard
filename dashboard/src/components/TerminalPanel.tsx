// ZenPanel - Web Terminal (xterm.js) nối tới shell của máy chủ qua WebSocket
// Hỗ trợ dán trực tiếp (Ctrl+V/Menu), bộ công cụ chọn tùy chỉnh, gợi ý thông minh và bảng lệnh mẫu
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Check,
  ClipboardPaste,
  CornerDownLeft,
  Copy,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  SquareTerminal,
  Trash2,
  X,
} from 'lucide-react';
import { wsUrl } from '../lib/api';
import { usePanel } from '../lib/panel';
import {
  SHELL_CATALOG,
  pushHistory,
  suggest,
  type SuggestResult,
} from '../lib/shellSuggest';
import { Badge, Button, Modal, SearchInput, StatusDot, cn } from './ui';

interface SuggestState {
  items: SuggestResult[];
  index: number;
  typed: string;
  x: number;
  y: number;
  above: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  selection?: string;
}

interface SelectionToolbarState {
  x: number;
  y: number;
  text: string;
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

export function TerminalPanel({ className, initialCommand }: { className?: string; initialCommand?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<'connecting' | 'online' | 'closed'>('connecting');
  const [session, setSession] = useState(0);
  const [hint, setHint] = useState<SuggestState | null>(null);
  const hintRef = useRef<SuggestState | null>(null);

  // Bộ menu tùy chỉnh & thanh công cụ khi bôi đen
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const { info } = usePanel();
  const windows = info?.os.family === 'windows';
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  const termRef = useRef<Terminal | null>(null);
  const sendRef = useRef<(data: string) => void>(() => {});
  const appendLineRef = useRef<(text: string) => void>(() => {});

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
    termRef.current = term;

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
    sendRef.current = send;

    // ---- Gợi ý lệnh: theo dõi dòng đang gõ
    let line: string | null = '';
    appendLineRef.current = (txt: string) => {
      if (line !== null) line += txt;
    };

    const setSuggest = (next: SuggestState | null) => {
      hintRef.current = next;
      setHint(next);
    };

    const refresh = () => {
      if (line === null || !line) return setSuggest(null);
      const items = suggest(line, Boolean(windowsRef.current));
      if (!items.length) return setSuggest(null);

      const el = host.current!;
      const cellW = el.clientWidth / term.cols;
      const cellH = el.clientHeight / term.rows;
      const cursorY = term.buffer.active.cursorY;
      const above = cursorY > term.rows - 8;
      setSuggest({
        items,
        index: 0,
        typed: line,
        x: Math.min(term.buffer.active.cursorX * cellW + 10, el.clientWidth - 320),
        y: (above ? cursorY : cursorY + 1) * cellH + 10,
        above,
      });
    };

    const accept = (item: string) => {
      if (line === null) return;
      const rest = item.slice(line.length);
      if (rest) send(rest);
      line = item;
      setSuggest(null);
      term.focus();
    };

    // Phím tắt bàn phím: Tab / ↑ / ↓ / Esc / Ctrl+V / Ctrl+C / Ctrl+Space
    term.attachCustomKeyEventHandler((e) => {
      // 1. Phím tắt Dán (Ctrl + V / Cmd + V)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (e.type === 'keydown') {
          navigator.clipboard.readText().then((clipText) => {
            if (clipText) {
              send(clipText);
              if (line !== null) line += clipText;
              refresh();
            }
          }).catch(() => {});
        }
        return false;
      }

      // 2. Phím tắt Sao chép (Ctrl + C): nếu đang bôi đen thì sao chép vào clipboard, KHÔNG gửi tín hiệu ngắt SIGINT
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (term.hasSelection()) {
          if (e.type === 'keydown') {
            const sel = term.getSelection();
            navigator.clipboard.writeText(sel).then(() => {
              setCopiedNotification(true);
              setTimeout(() => setCopiedNotification(false), 1500);
            });
          }
          return false;
        }
      }

      // 3. Phím tắt mở Bảng lệnh mẫu (Ctrl + Space)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'Space' || e.key === ' ')) {
        if (e.type === 'keydown') {
          setPaletteOpen(true);
        }
        return false;
      }

      // 4. Điều khiển hộp gợi ý khi đang hiển thị
      const current = hintRef.current;
      if (e.type !== 'keydown' || !current) return true;
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        accept(current.items[current.index].cmd);
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
        // Ctrl+C / Ctrl+U
        line = '';
        setSuggest(null);
        return;
      }
      if (data === '\x7f' || data === '\b') {
        if (line !== null) line = line.slice(0, -1);
      } else if (data === '\t' || data.startsWith('\x1b')) {
        line = data === '\t' ? null : data === '\x1b[A' || data === '\x1b[B' ? null : line;
      } else if (!/[\x00-\x1f]/.test(data)) {
        if (line !== null) line += data;
      } else if (data.includes('\r')) {
        line = '';
      }
      refresh();
    });

    // Lắng nghe sự kiện paste từ trình duyệt
    const handleDomPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const clipText = e.clipboardData?.getData('text');
      if (clipText) {
        send(clipText);
        if (line !== null) line += clipText;
        refresh();
      }
    };
    const el = host.current;
    el.addEventListener('paste', handleDomPaste);

    const resize = term.onResize(({ cols, rows }) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'resize', cols, rows })));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore
      }
    });
    observer.observe(host.current);

    return () => {
      el.removeEventListener('paste', handleDomPaste);
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket.close();
      term.dispose();
      termRef.current = null;
    };
  }, [session, initialCommand]);

  // Xử lý dán trực tiếp từ clipboard vào shell
  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        sendRef.current(clipText);
        appendLineRef.current(clipText);
        termRef.current?.focus();
      }
    } catch {
      // Fallback nếu quyền bị chặn
    }
    setContextMenu(null);
    setSelectionToolbar(null);
  };

  // Xử lý sao chép văn bản đã chọn
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 1500);
    });
    setContextMenu(null);
    setSelectionToolbar(null);
  };

  // Xử lý chạy trực tiếp đoạn văn bản như lệnh
  const handleExecuteSelected = (text: string) => {
    const cmd = text.trim();
    if (cmd) {
      sendRef.current(`${cmd}\r`);
      termRef.current?.focus();
    }
    setContextMenu(null);
    setSelectionToolbar(null);
  };

  // Tra cứu Google đoạn text đã chọn
  const handleSearchGoogle = (text: string) => {
    const q = encodeURIComponent(text.trim());
    if (q) window.open(`https://www.google.com/search?q=${q}`, '_blank');
    setContextMenu(null);
    setSelectionToolbar(null);
  };

  // Xóa màn hình
  const handleClearScreen = () => {
    sendRef.current(windows ? 'Clear-Host\r' : 'clear\r');
    termRef.current?.focus();
    setContextMenu(null);
  };

  // Bắt sự kiện chuột phải -> Mở menu tùy chỉnh thay thế hoàn toàn menu của trình duyệt
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = termRef.current?.getSelection()?.trim();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = Math.min(Math.max(10, e.clientX - rect.left), rect.width - 240);
    const y = Math.min(Math.max(10, e.clientY - rect.top), rect.height - 280);

    setSelectionToolbar(null);
    setContextMenu({ x, y, selection: sel || undefined });
  };

  // Bắt sự kiện nhả chuột để hiển thị thanh công cụ chọn nhanh (Floating Selection Toolbar)
  const handleMouseUp = (e: React.MouseEvent) => {
    // Nếu đang mở context menu thì không ghi đè
    if (contextMenu) return;

    setTimeout(() => {
      const term = termRef.current;
      if (!term || !term.hasSelection()) {
        setSelectionToolbar(null);
        return;
      }
      const sel = term.getSelection().trim();
      if (!sel) {
        setSelectionToolbar(null);
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.min(Math.max(10, e.clientX - rect.left - 80), rect.width - 260);
      const y = Math.max(10, e.clientY - rect.top - 46);

      setSelectionToolbar({ x, y, text: sel });
    }, 50);
  };

  // Đóng menu khi nhấp chuột ra ngoài
  const handleContainerMouseDown = () => {
    if (contextMenu) setContextMenu(null);
  };

  return (
    <div
      ref={containerRef}
      className={cn(className ?? 'relative h-full', 'select-none')}
      onContextMenu={handleContextMenu}
      onMouseUp={handleMouseUp}
      onMouseDown={handleContainerMouseDown}
    >
      {/* Vùng chứa xterm.js */}
      <div ref={host} className="absolute inset-0 cursor-text" />

      {/* Thông báo copy nhanh */}
      {copiedNotification && (
        <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-950/90 px-3.5 py-1 text-xs font-semibold text-emerald-300 shadow-xl backdrop-blur animate-fade-in flex items-center gap-1.5">
          <Check className="size-3.5" /> Đã sao chép vào bộ nhớ tạm
        </div>
      )}

      {/* Thanh công cụ nổi khi bôi đen văn bản (Floating Selection Toolbar) */}
      {selectionToolbar && !contextMenu && (
        <div
          className="absolute z-30 flex items-center gap-1 rounded-xl border border-slate-700/80 bg-ink-900/95 p-1 shadow-2xl shadow-black/70 backdrop-blur animate-scale-in"
          style={{ left: selectionToolbar.x, top: selectionToolbar.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleCopyText(selectionToolbar.text)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80 hover:text-white"
            title="Sao chép (Ctrl+C)"
          >
            <Copy className="size-3.5 text-zen-blue" />
            Sao chép
          </button>
          <button
            onClick={() => handleExecuteSelected(selectionToolbar.text)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-emerald-600/30 hover:text-emerald-300"
            title="Chạy trực tiếp đoạn này trong shell"
          >
            <Play className="size-3.5 text-emerald-400" />
            Chạy lệnh
          </button>
          <button
            onClick={() => handleSearchGoogle(selectionToolbar.text)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80 hover:text-white"
            title="Tra cứu Google"
          >
            <Search className="size-3.5 text-amber-400" />
            Tìm kiếm
          </button>
          <button
            onClick={() => {
              termRef.current?.clearSelection();
              setSelectionToolbar(null);
            }}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-700/80 hover:text-white"
            title="Hủy chọn"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Menu chuột phải tùy chỉnh (Custom Context Menu) thay thế hoàn toàn bộ chọn hệ thống */}
      {contextMenu && (
        <div
          className="absolute z-40 w-56 rounded-2xl border border-slate-700/90 bg-ink-950/95 p-1.5 text-xs text-slate-300 shadow-2xl shadow-black/90 backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.selection && (
            <>
              <div className="mb-1 rounded-xl bg-slate-900/90 px-2.5 py-1.5 border border-slate-800">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Đoạn đã chọn</span>
                <span className="font-mono text-emerald-300 text-[11px] truncate block max-w-full">
                  {contextMenu.selection}
                </span>
              </div>
              <button
                onClick={() => handleCopyText(contextMenu.selection!)}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-slate-800/80 hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Copy className="size-3.5 text-blue-400" />
                  Sao chép văn bản
                </span>
                <kbd className="text-[10px] text-slate-500 font-mono">Ctrl+C</kbd>
              </button>
              <button
                onClick={() => handleExecuteSelected(contextMenu.selection!)}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-emerald-900/30 hover:text-emerald-300"
              >
                <span className="flex items-center gap-2">
                  <Play className="size-3.5 text-emerald-400" />
                  Chạy như lệnh
                </span>
                <kbd className="text-[10px] text-slate-500 font-mono">Enter</kbd>
              </button>
              <button
                onClick={() => handleSearchGoogle(contextMenu.selection!)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-slate-800/80 hover:text-white"
              >
                <Search className="size-3.5 text-amber-400" />
                Tìm kiếm Google
              </button>
              <div className="my-1 border-t border-slate-800" />
            </>
          )}

          {/* Dán từ Clipboard */}
          <button
            onClick={handlePasteClipboard}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-slate-800/80 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <ClipboardPaste className="size-3.5 text-emerald-400" />
              Dán vào dòng lệnh
            </span>
            <kbd className="text-[10px] text-slate-500 font-mono">Ctrl+V</kbd>
          </button>

          {/* Mở bảng lệnh mẫu */}
          <button
            onClick={() => {
              setContextMenu(null);
              setPaletteOpen(true);
            }}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-slate-800/80 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-purple-400" />
              Bảng lệnh mẫu
            </span>
            <kbd className="text-[10px] text-slate-500 font-mono">Ctrl+Space</kbd>
          </button>

          {/* Chọn tất cả */}
          <button
            onClick={() => {
              termRef.current?.selectAll();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-slate-800/80 hover:text-white"
          >
            <SquareTerminal className="size-3.5 text-slate-400" />
            Chọn tất cả màn hình
          </button>

          {/* Xóa màn hình */}
          <button
            onClick={handleClearScreen}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-slate-800/80 hover:text-white"
          >
            <Trash2 className="size-3.5 text-slate-400" />
            Xóa sạch màn hình ({windows ? 'cls' : 'clear'})
          </button>

          {/* Khởi động lại Shell */}
          <button
            onClick={() => {
              setSession((s) => s + 1);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-slate-400 transition hover:bg-red-950/30 hover:text-red-300"
          >
            <RotateCcw className="size-3.5 text-rose-400" />
            Khởi động lại Shell
          </button>
        </div>
      )}

      {/* Hộp gợi ý tự động khi đang gõ (Auto-Suggestions Popup) */}
      {hint && (
        <div
          className="absolute z-20 w-[min(480px,calc(100%-20px))] overflow-hidden rounded-2xl border border-slate-700/80 bg-ink-950/95 text-xs shadow-2xl shadow-black/80 backdrop-blur"
          style={{ left: Math.max(10, hint.x), top: hint.above ? undefined : hint.y, bottom: hint.above ? `calc(100% - ${hint.y}px)` : undefined }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/60 p-1">
            {hint.items.map((item, i) => (
              <div
                key={item.cmd}
                onClick={() => {
                  sendRef.current(item.cmd.slice(hint.typed.length));
                  appendLineRef.current(item.cmd.slice(hint.typed.length));
                  setHint(null);
                  termRef.current?.focus();
                }}
                onMouseEnter={() => setHint({ ...hint, index: i })}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition',
                  i === hint.index ? 'bg-zen-blue/25 text-white' : 'text-slate-300 hover:bg-slate-800/60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs truncate">
                    <span className="text-emerald-400 font-bold">{item.cmd.slice(0, hint.typed.length)}</span>
                    <span>{item.cmd.slice(hint.typed.length)}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.desc}</div>
                </div>
                {i === hint.index ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-md bg-zen-blue/40 px-1.5 py-0.5 text-[10px] text-blue-200">
                    Tab điền <CornerDownLeft className="size-3" />
                  </span>
                ) : (
                  <Badge className="text-[10px] px-1.5 py-0" tone={item.category === 'shell' ? 'green' : item.category === 'system' ? 'blue' : 'slate'}>
                    {item.category}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500 bg-black/40">
            <span>Tab hoặc Enter: điền lệnh · ↑↓: chọn · Esc: đóng</span>
            <button
              onClick={() => {
                setHint(null);
                setPaletteOpen(true);
              }}
              className="text-blue-400 hover:underline"
            >
              Mở bảng tất cả lệnh
            </button>
          </div>
        </div>
      )}

      {/* Thanh trạng thái và nút tác vụ góc trên bên phải */}
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5 rounded-xl border border-slate-800/70 bg-ink-950/80 px-2.5 py-1 text-xs text-slate-400 backdrop-blur shadow-lg">
        {/* Nút Dán nhanh */}
        <button
          onClick={handlePasteClipboard}
          className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
          title="Dán nội dung từ clipboard (Ctrl+V)"
        >
          <ClipboardPaste className="size-3.5 text-emerald-400" />
          Dán
        </button>

        {/* Nút Bảng lệnh mẫu */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-purple-300 transition hover:bg-purple-950/50 hover:text-purple-200"
          title="Mở thư viện gợi ý lệnh sẵn có (Ctrl+Space)"
        >
          <Sparkles className="size-3.5 text-purple-400" />
          Lệnh mẫu
        </button>

        <div className="h-3 w-px bg-slate-800" />

        <StatusDot tone={status === 'online' ? 'green' : status === 'connecting' ? 'amber' : 'red'} pulse={status === 'online'} />
        <span className="hidden sm:inline">
          {status === 'online' ? 'Đã kết nối' : status === 'connecting' ? 'Đang kết nối' : 'Đã ngắt'}
        </span>

        {status === 'closed' && (
          <Button size="xs" variant="soft" icon={RotateCcw} onClick={() => setSession((s) => s + 1)}>
            Kết nối lại
          </Button>
        )}
      </div>

      {/* Modal Bảng tra cứu & Auto Suggestion Lệnh Mẫu (Command Palette) */}
      <CommandPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        windows={Boolean(windows)}
        onInsert={(cmd) => {
          sendRef.current(cmd);
          appendLineRef.current(cmd);
          setPaletteOpen(false);
          termRef.current?.focus();
        }}
        onExecute={(cmd) => {
          sendRef.current(`${cmd}\r`);
          setPaletteOpen(false);
          termRef.current?.focus();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Modal Bảng lệnh mẫu
function CommandPaletteModal({
  open,
  onClose,
  windows,
  onInsert,
  onExecute,
}: {
  open: boolean;
  onClose: () => void;
  windows: boolean;
  onInsert: (cmd: string) => void;
  onExecute: (cmd: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const catalog = SHELL_CATALOG.filter((item) => (windows ? item.windows : !item.windows));

  const filtered = catalog.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return item.cmd.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q);
  });

  const categories = [
    { id: 'all', label: 'Tất cả' },
    { id: 'shell', label: 'Shell & Môi trường' },
    { id: 'system', label: 'Hệ thống & Dịch vụ' },
    { id: 'docker', label: 'Docker' },
    { id: 'web', label: 'Web Server & SSL' },
    { id: 'net', label: 'Mạng & Firewall' },
    { id: 'files', label: 'Tệp & Quyền' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Bảng gợi ý lệnh có sẵn (Command Palette)" size="lg">
      <div className="space-y-4">
        {/* Tìm kiếm */}
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Tìm lệnh nhanh (vd: source, bashrc, nginx, docker, ram, port, tar...)"
        />

        {/* Danh mục */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'rounded-xl px-3 py-1 text-xs font-semibold transition',
                category === c.id ? 'bg-zen-blue text-white shadow' : 'bg-ink-950/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Danh sách lệnh */}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Không tìm thấy lệnh nào phù hợp với từ khóa &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.cmd}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-ink-950/70 p-3.5 transition hover:border-slate-700 hover:bg-ink-900/60"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-400 select-all">{item.cmd}</span>
                    <Badge className="text-[10px] px-1.5 py-0" tone={item.category === 'shell' ? 'green' : item.category === 'system' ? 'blue' : 'slate'}>
                      {item.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{item.desc}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                  <button
                    onClick={() => onInsert(item.cmd)}
                    className="flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                    title="Điền vào terminal để xem hoặc sửa trước khi chạy"
                  >
                    Chèn vào dòng
                  </button>
                  <button
                    onClick={() => onExecute(item.cmd)}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-600 hover:text-white"
                    title="Chạy lệnh ngay lập tức"
                  >
                    <Play className="size-3.5" />
                    Chạy ngay
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
