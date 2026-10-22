// ZenPanel - WebSocket: đẩy metrics realtime và Web Terminal (PowerShell / Bash)
import { spawn } from 'node:child_process';
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
    const query = req.query as { cols?: string; rows?: string };
    const cols = Math.min(500, Math.max(20, Number(query.cols) || 120));
    const rows = Math.min(200, Math.max(5, Number(query.rows) || 30));

    let session: Awaited<ReturnType<typeof openShell>>;
    try {
      session = await openShell(ctx, cols, rows);
    } catch (err) {
      socket.send(`\r\n\x1b[31mKhông mở được shell: ${(err as Error).message}\x1b[0m\r\n`);
      socket.close();
      return;
    }
    const { shell, mode } = session;
    const label = ctx.adapter.defaultShell().label;
    socket.send(`\x1b[32m● ZenPanel Terminal\x1b[0m — ${label} trên ${ctx.osInfo.hostname}${mode === 'pipe' ? ' \x1b[33m(chế độ đơn giản, không có PTY)\x1b[0m' : ''}\r\n`);
    req.log.info({ mode }, 'ZenPanel: mở web terminal');

    shell.onData((data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    });
    shell.onExit((code) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(`\r\n\x1b[33mShell đã thoát (code ${code})\x1b[0m\r\n`);
        socket.close();
      }
    });
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
        if (msg.type === 'input' && typeof msg.data === 'string') shell.write(msg.data);
        else if (msg.type === 'resize' && msg.cols && msg.rows) shell.resize(Math.min(500, msg.cols), Math.min(200, msg.rows));
      } catch {
        // bỏ qua message không hợp lệ
      }
    });
    socket.on('close', () => shell.kill());
  });
}
