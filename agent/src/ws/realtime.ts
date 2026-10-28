// ZenPanel - WebSocket: đẩy metrics realtime và Web Terminal (PowerShell / Bash)
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { AppContext } from '../core/context.js';
import { tokenFromRequest, verifyToken } from '../core/auth.js';
import type { MetricsSnapshot } from '../core/metrics.js';

interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number) => void): void;
}

type PtyModule = typeof import('@lydell/node-pty');
let ptyModule: PtyModule | null | undefined;

async function loadPty(): Promise<PtyModule | null> {
  if (ptyModule !== undefined) return ptyModule;
  try {
    ptyModule = await import('@lydell/node-pty');
  } catch {
    ptyModule = null;
  }
  return ptyModule;
}

/** Mở shell: ưu tiên pseudo-terminal thật, fallback sang pipe nếu node-pty không có bản build cho máy */
async function openShell(ctx: AppContext, cols: number, rows: number): Promise<{ shell: PtyLike; mode: 'pty' | 'pipe' }> {
  const { file, args } = ctx.adapter.defaultShell();
  const env = { ...process.env, TERM: 'xterm-256color', ZENPANEL: '1' } as Record<string, string>;
  const pty = await loadPty();
  if (pty) {
    const proc = pty.spawn(file, args, { name: 'xterm-256color', cols, rows, cwd: os.homedir(), env });
    return {
      mode: 'pty',
      shell: {
        write: (d) => proc.write(d),
        resize: (c, r) => proc.resize(c, r),
        kill: () => proc.kill(),
        onData: (cb) => proc.onData(cb),
        onExit: (cb) => proc.onExit(({ exitCode }) => cb(exitCode)),
      },
    };
  }
  const child = spawn(file, args, { cwd: os.homedir(), env, windowsHide: true });
  return {
    mode: 'pipe',
    shell: {
      // Không có PTY nên phải tự echo và đổi Enter thành xuống dòng
      write: (d) => child.stdin.write(d.replace(/\r/g, os.EOL)),
      resize: () => undefined,
      kill: () => child.kill(),
      onData: (cb) => {
        child.stdout.on('data', (b: Buffer) => cb(b.toString('utf8').replace(/\r?\n/g, '\r\n')));
        child.stderr.on('data', (b: Buffer) => cb(b.toString('utf8').replace(/\r?\n/g, '\r\n')));
      },
      onExit: (cb) => child.on('exit', (code) => cb(code ?? 0)),
    },
  };
}

/** Tiền tố tin nhắn điều khiển gửi cho client (không in ra terminal) */
const CONTROL = '\u0000zp:';
/** Giữ shell sống sau khi mất kết nối để client nối lại được */
const TERMINAL_GRACE_MS = 10 * 60_000;

interface TerminalSession {
  id: string;
  shell: PtyLike;
  socket: WebSocket | null;
  /** Output phát sinh khi chưa có socket, phát lại khi nối lại */
  missed: string;
  killTimer: NodeJS.Timeout | null;
}
const terminals = new Map<string, TerminalSession>();

function authorize(socket: WebSocket, token: string | undefined): boolean {
  if (verifyToken(token)) return true;
  socket.close(4401, 'Unauthorized');
  return false;
}

export async function realtimeRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/ws/metrics', { websocket: true }, (socket, req) => {
    if (!authorize(socket, tokenFromRequest(req, true))) return;
    socket.send(JSON.stringify({ type: 'history', data: ctx.metrics.getHistory() }));
    const onSnapshot = (snapshot: MetricsSnapshot) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'snapshot', data: snapshot }));
    };
    const onTunnel = (state: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'tunnel', data: state }));
    };
    ctx.metrics.on('snapshot', onSnapshot);
    ctx.tunnel?.on('state', onTunnel);
    socket.on('close', () => {
      ctx.metrics.off('snapshot', onSnapshot);
      ctx.tunnel?.off('state', onTunnel);
    });
  });

  app.get('/ws/terminal', { websocket: true }, async (socket, req) => {
    if (!authorize(socket, tokenFromRequest(req, true))) return;
    const query = req.query as { cols?: string; rows?: string; sid?: string };
    const cols = Math.min(500, Math.max(20, Number(query.cols) || 120));
    const rows = Math.min(200, Math.max(5, Number(query.rows) || 30));

    // Ping định kỳ để proxy / Cloudflare không cắt kết nối rảnh
    const pinger = setInterval(() => {
      if (socket.readyState === socket.OPEN) socket.ping();
    }, 25_000);
    socket.on('close', () => clearInterval(pinger));

    let term = query.sid ? terminals.get(query.sid) : undefined;
    if (term) {
      // Nối lại phiên shell cũ còn sống: gỡ socket cũ (nếu còn), hủy hẹn giờ kill, phát lại phần output đã bỏ lỡ
      if (term.killTimer) clearTimeout(term.killTimer);
      term.killTimer = null;
      if (term.socket && term.socket !== socket) term.socket.close(4002, 'Replaced');
      term.socket = socket;
      socket.send(`${CONTROL}${JSON.stringify({ sid: term.id, reattached: true })}`);
      socket.send('\r\n\x1b[32m● Đã kết nối lại phiên terminal\x1b[0m\r\n');
      if (term.missed) socket.send(term.missed);
      term.missed = '';
      term.shell.resize(cols, rows);
    } else {
      let session: Awaited<ReturnType<typeof openShell>>;
      try {
        session = await openShell(ctx, cols, rows);
      } catch (err) {
        socket.send(`\r\n\x1b[31mKhông mở được shell: ${(err as Error).message}\x1b[0m\r\n`);
        socket.close();
        return;
      }
      const id = randomBytes(12).toString('hex');
      const created: TerminalSession = { id, shell: session.shell, socket, missed: '', killTimer: null };
      terminals.set(id, created);
      term = created;
      const label = ctx.adapter.defaultShell().label;
      socket.send(`${CONTROL}${JSON.stringify({ sid: id, reattached: false })}`);
      if (query.sid) socket.send('\r\n\x1b[33mPhiên cũ đã hết hạn, đã mở shell mới.\x1b[0m\r\n');
      socket.send(`\x1b[32m● ZenPanel Terminal\x1b[0m — ${label} trên ${ctx.osInfo.hostname}${session.mode === 'pipe' ? ' \x1b[33m(chế độ đơn giản, không có PTY)\x1b[0m' : ''}\r\n`);
      req.log.info({ mode: session.mode }, 'ZenPanel: mở web terminal');

      session.shell.onData((data) => {
        const t = terminals.get(id);
        if (!t) return;
        if (t.socket && t.socket.readyState === t.socket.OPEN) t.socket.send(data);
        else t.missed = (t.missed + data).slice(-200_000);
      });
      session.shell.onExit((code) => {
        const t = terminals.get(id);
        terminals.delete(id);
        if (t?.killTimer) clearTimeout(t.killTimer);
        if (t?.socket && t.socket.readyState === t.socket.OPEN) {
          t.socket.send(`\r\n\x1b[33mShell đã thoát (code ${code})\x1b[0m\r\n`);
          t.socket.close(4001, 'Shell exited');
        }
      });
    }

    const current = term;
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
        if (msg.type === 'input' && typeof msg.data === 'string') current.shell.write(msg.data);
        else if (msg.type === 'resize' && msg.cols && msg.rows) current.shell.resize(Math.min(500, msg.cols), Math.min(200, msg.rows));
        else if (msg.type === 'terminate') {
          // Client yêu cầu ngắt hẳn shell (hết thời gian không tương tác): xoá phiên ngay, không giữ chờ nối lại
          terminals.delete(current.id);
          if (current.killTimer) clearTimeout(current.killTimer);
          current.shell.kill();
        }
        // type "ping" từ client chỉ để giữ kết nối, không cần xử lý
      } catch {
        // bỏ qua message không hợp lệ
      }
    });
    socket.on('close', () => {
      // Socket này không còn là socket hiện tại (đã bị nối lại): không làm gì
      if (current.socket !== socket) return;
      current.socket = null;
      // Giữ shell sống một lúc để client kịp nối lại sau khi rớt mạng
      current.killTimer = setTimeout(() => {
        terminals.delete(current.id);
        current.shell.kill();
      }, TERMINAL_GRACE_MS);
    });
  });
}
