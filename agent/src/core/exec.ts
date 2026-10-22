// ZenPanel - Helper chạy tiến trình con. Chỉ adapter (và driver của adapter) được dùng trực tiếp.
import { spawn } from 'node:child_process';
import { inJob, jobOutput } from './jobs.js';

/** Che mật khẩu / token trong dòng lệnh khi ghi log */
const mask = (arg: string) => arg.replace(/((?:PASSWORD|PWD|TOKEN|SECRET)[^=]*=).+/i, '$1******');

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  /** Giới hạn dung lượng stdout giữ lại (byte) */
  maxOutput?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly result?: ExecResult,
  ) {
    super(message);
  }
}

/** Chạy lệnh, không throw khi exit code khác 0 (chỉ throw khi không tìm thấy lệnh / timeout) */
export function exec(file: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const maxOutput = opts.maxOutput ?? 20 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    if (inJob()) jobOutput(`$ ${[file, ...args].map(mask).join(' ')}\n`);
    const timer = opts.timeout
      ? setTimeout(() => {
          killedByTimeout = true;
          child.kill();
        }, opts.timeout)
      : null;

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stdout.length < maxOutput) stdout += text;
      jobOutput(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stderr.length < 1024 * 1024) stderr += text;
      jobOutput(text);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new CommandError(`Không chạy được "${file}": ${err.message}`));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (killedByTimeout) {
        reject(new CommandError(`Lệnh "${file}" quá thời gian ${opts.timeout}ms`, { stdout, stderr, code: -1 }));
        return;
      }
      resolve({ stdout, stderr, code: code ?? -1 });
    });

    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

/** Chạy lệnh và throw CommandError nếu exit code khác 0 */
export async function execOk(file: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const result = await exec(file, args, opts);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(-5).join('\n');
    throw new CommandError(detail || `"${file}" thoát với mã ${result.code}`, result);
  }
  return result;
}
