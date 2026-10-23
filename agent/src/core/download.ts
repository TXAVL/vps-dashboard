// ZenPanel - Tải binary phụ trợ (cloudflared, caddy...) về ~/.zenpanel/bin
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { dataPath } from './store.js';

export function binDir(): string {
  return dataPath('bin');
}

export async function downloadFile(url: string, target: string, onProgress?: (received: number, total: number | null) => void): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Không tải được ${url} (HTTP ${res.status})`);
  const tmp = `${target}.download`;
  const total = Number(res.headers.get('content-length')) || null;
  let received = 0;
  let lastReport = 0;
  const source = Readable.fromWeb(res.body as ReadableStream);
  if (onProgress) {
    source.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (Date.now() - lastReport > 300) {
        lastReport = Date.now();
        onProgress(received, total);
      }
    });
  }
  await pipeline(source, createWriteStream(tmp));
  onProgress?.(received, total);
  await rename(tmp, target);
}

/**
 * Tìm binary theo thứ tự: PATH -> ~/.zenpanel/bin -> tải về (nếu cho phép).
 * Trả về null khi không có và không được phép tải.
 */
export async function resolveTool(
  adapter: OSAdapter,
  name: string,
  download?: { url: string; onDownload?: (url: string) => void },
): Promise<string | null> {
  const fromPath = await adapter.findExecutable(name);
  if (fromPath) return fromPath;

  const local = path.join(binDir(), adapter.executableName(name));
  try {
    await access(local);
    return local;
  } catch {
    // chưa có bản tải sẵn
  }

  if (!download) return null;
  download.onDownload?.(download.url);
  await downloadFile(download.url, local);
  await adapter.makeExecutable(local);
  return local;
}
