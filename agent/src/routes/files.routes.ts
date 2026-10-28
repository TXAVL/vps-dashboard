// ZenPanel - API File Manager
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/context.js';
import { issueTicket, verifyTicket } from '../core/auth.js';
import { badRequest, HttpError } from '../core/validate.js';
import {
  chmodEntry,
  compress,
  createEntry,
  deleteEntries,
  downloadRemoteFile,
  extract,
  listDirectory,
  moveEntries,
  readTextFile,
  renameEntry,
  resolvePath,
  saveUpload,
  writeTextFile,
} from '../services/file.service.js';

function resolvePaths(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length) throw badRequest('Chưa chọn file nào');
  return input.map(resolvePath);
}

const TMP_ZIP_DIR = path.join(os.tmpdir(), 'zenpanel-dl');
const TTL_MS = 300_000;
const isTmpZip = (file: string) => path.dirname(file) === TMP_ZIP_DIR;

export async function fileRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/api/files/roots', async () => ({ roots: await ctx.adapter.fileRoots(), separator: path.sep }));

  app.get('/api/files', async (req) => {
    const dir = resolvePath((req.query as { path?: string }).path);
    return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), entries: await listDirectory(dir) };
  });

  app.get('/api/files/content', async (req) => readTextFile(resolvePath((req.query as { path?: string }).path)));

  app.put('/api/files/content', async (req) => {
    const body = (req.body ?? {}) as { path?: string; content?: string };
    await writeTextFile(resolvePath(body.path), body.content as string);
    return { ok: true };
  });

  app.post('/api/files/create', async (req) => {
    const body = (req.body ?? {}) as { path?: string; name?: string; type?: string };
    return { path: await createEntry(resolvePath(body.path), body.name, body.type === 'directory' ? 'directory' : 'file') };
  });

  app.post('/api/files/rename', async (req) => {
    const body = (req.body ?? {}) as { path?: string; name?: string };
    return { path: await renameEntry(resolvePath(body.path), body.name) };
  });

  app.post('/api/files/move', async (req) => {
    const body = (req.body ?? {}) as { paths?: string[]; destination?: string; mode?: string };
    await moveEntries(resolvePaths(body.paths), resolvePath(body.destination), body.mode === 'copy' ? 'copy' : 'move');
    return { ok: true };
  });

  app.post('/api/files/delete', async (req) => {
    await deleteEntries(resolvePaths((req.body as { paths?: string[] } | undefined)?.paths));
    return { ok: true };
  });

  app.post('/api/files/compress', async (req) => {
    const body = (req.body ?? {}) as { paths?: string[]; destination?: string; format?: string };
    const format = body.format === 'tar.gz' ? 'tar.gz' : 'zip';
    await compress(resolvePaths(body.paths), resolvePath(body.destination), format);
    return { ok: true };
  });

  app.post('/api/files/extract', async (req) => {
    const body = (req.body ?? {}) as { path?: string; destination?: string };
    await extract(resolvePath(body.path), resolvePath(body.destination));
    return { ok: true };
  });

  app.post('/api/files/upload', async (req) => {
    const dir = resolvePath((req.query as { path?: string }).path);
    const saved: string[] = [];
    for await (const part of req.files()) saved.push(await saveUpload(dir, part.filename, part.file));
    return { saved };
  });

  // Link tải dùng vé ngắn hạn (thời hạn 5 phút, gắn expires vào params)
  app.post('/api/files/download-ticket', async (req) => {
    const file = resolvePath((req.body as { path?: string } | undefined)?.path);
    const info = await stat(file);
    if (info.isDirectory()) throw badRequest('Hãy nén thư mục trước khi tải về');
    const ttlMs = 300_000; // 5 phút kể từ khi tạo link
    const expires = Date.now() + ttlMs;
    const ticket = issueTicket(`download:${file}`, ttlMs);
    const params = new URLSearchParams({ path: file, ticket, expires: String(expires) });
    return { url: `/api/files/download?${params}`, expires, ttl: 300 };
  });

  // Tải thư mục: nén zip tạm, vé 5 phút, zip tự xoá sau khi tải xong hoặc hết hạn (không để lại trên VPS)
  app.post('/api/files/download-folder', async (req) => {
    const dir = resolvePath((req.body as { path?: string } | undefined)?.path);
    if (!(await stat(dir)).isDirectory()) throw badRequest('Đây không phải thư mục');
    await mkdir(TMP_ZIP_DIR, { recursive: true });
    const base = path.basename(dir) || 'root';
    const zipPath = path.join(TMP_ZIP_DIR, `${randomBytes(6).toString('hex')}-${base}.zip`);
    await compress([dir], zipPath, 'zip');
    setTimeout(() => void rm(zipPath, { force: true }), TTL_MS + 30_000).unref();
    const expires = Date.now() + TTL_MS;
    const params = new URLSearchParams({ path: zipPath, ticket: issueTicket(`download:${zipPath}`, TTL_MS), expires: String(expires), name: `${base}.zip` });
    return { url: `/api/files/download?${params}`, expires, ttl: 300 };
  });

  // Link xem trực tiếp ảnh, video, âm thanh, PDF (vé có thời hạn 10 phút)
  app.post('/api/files/view-ticket', async (req) => {
    const file = resolvePath((req.body as { path?: string } | undefined)?.path);
    const info = await stat(file);
    if (info.isDirectory()) throw badRequest('Không thể xem trước thư mục');
    const params = new URLSearchParams({ path: file, ticket: issueTicket(`view:${file}`, 600_000) });
    return { url: `/api/files/raw?${params}` };
  });

  // Đổi quyền file/thư mục (chmod)
  app.post('/api/files/chmod', async (req) => {
    const body = (req.body ?? {}) as { path?: string; mode?: string };
    await chmodEntry(resolvePath(body.path), String(body.mode ?? '0755'));
    return { ok: true };
  });

  // Tải file từ internet về máy chủ (Remote download)
  app.post('/api/files/download-remote', async (req) => {
    const body = (req.body ?? {}) as { url?: string; destination?: string; filename?: string };
    const result = await downloadRemoteFile(String(body.url ?? ''), resolvePath(body.destination), body.filename);
    return { ok: true, path: result.path, size: result.size };
  });
}

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json',
  md: 'text/plain; charset=utf-8',
};

/** Route tải file & xem trực tiếp nằm ngoài vùng requireAuth: xác thực bằng vé ngắn hạn */
export async function fileDownloadRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/files/download', async (req, reply) => {
    const query = req.query as { path?: string; ticket?: string; expires?: string; name?: string };
    const file = resolvePath(query.path);

    // Chặn IDM / trình bắt link tự động và tải đa luồng (Range nhiều phân đoạn)
    const ua = String(req.headers['user-agent'] ?? '').toLowerCase();
    if (/\b(idm|internet download manager|download accelerator|fdm|free download manager|flashget|getright|go!zilla|jdownloader|aria2)\b/.test(ua) || ua.includes('idman')) {
      throw new HttpError(403, 'ZenPanel: Đã chặn tải qua IDM / Download Manager. Vui lòng tải trực tiếp bằng trình duyệt web.');
    }
    if (String(req.headers['range'] ?? '').includes(',')) {
      throw new HttpError(416, 'ZenPanel: Không hỗ trợ tải đa luồng phân đoạn.');
    }

    // Kiểm tra thời hạn 5 phút kể từ lúc tạo link (gán trong params expires & vé ticket)
    if (query.expires && Number(query.expires) < Date.now()) {
      throw new HttpError(401, 'Link tải đã hết hạn (quá thời hạn 5 phút kể từ khi tạo link). Vui lòng tạo link tải mới.');
    }

    if (!verifyTicket(query.ticket, `download:${file}`)) {
      throw new HttpError(401, 'Link tải không hợp lệ hoặc đã hết hạn 5 phút. Vui lòng bấm tải lại từ ZenPanel.');
    }

    const info = await stat(file);
    const tmp = isTmpZip(file);
    const name = encodeURIComponent(tmp && query.name ? path.basename(query.name) : path.basename(file));
    const stream = createReadStream(file);
    if (tmp) stream.on('close', () => void rm(file, { force: true }));
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Length', info.size)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${name}`)
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .header('Accept-Ranges', 'none')
      .header('X-Accel-Buffering', 'no')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Download-Options', 'noopen')
      .send(stream);
  });

  app.get('/api/files/raw', async (req, reply) => {
    const query = req.query as { path?: string; ticket?: string };
    const file = resolvePath(query.path);
    if (!verifyTicket(query.ticket, `view:${file}`)) throw new HttpError(401, 'Link xem đã hết hạn, hãy làm mới lại');
    const info = await stat(file);
    const ext = path.extname(file).replace('.', '').toLowerCase();
    const mime = MIME_MAP[ext] ?? 'application/octet-stream';
    const name = encodeURIComponent(path.basename(file));
    return reply
      .header('Content-Type', mime)
      .header('Content-Length', info.size)
      .header('Content-Disposition', `inline; filename*=UTF-8''${name}`)
      .header('Cache-Control', 'public, max-age=3600')
      .send(createReadStream(file));
  });
}
