// ZenPanel - File Manager: duyệt, sửa, tải lên/xuống, nén/giải nén (.zip, .tar.gz) thuần Node
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Unzip, UnzipInflate, Zip, ZipDeflate, type UnzipFile } from 'fflate';
import * as tar from 'tar';
import { badRequest } from '../core/validate.js';

const MAX_EDIT_SIZE = 5 * 1024 * 1024;

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string;
  mode: string;
}

/** Chuẩn hóa và chặn đường dẫn tương đối / rỗng */
export function resolvePath(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw badRequest('Thiếu đường dẫn');
  if (!path.isAbsolute(input)) throw badRequest('Đường dẫn phải là đường dẫn tuyệt đối');
  return path.resolve(input);
}

function safeName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || /[\\/]/.test(name) || name === '.' || name === '..') {
    throw badRequest('Tên file/thư mục không hợp lệ');
  }
  return name.trim();
}

function modeString(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

export async function listDirectory(dir: string): Promise<FileEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = await Promise.all(
    entries.map(async (entry): Promise<FileEntry | null> => {
      const full = path.join(dir, entry.name);
      try {
        const info = await lstat(full);
        let type: FileEntry['type'] = info.isDirectory() ? 'directory' : info.isSymbolicLink() ? 'symlink' : 'file';
        if (type === 'symlink') {
          // Symlink trỏ tới thư mục thì cho phép mở như thư mục
          const target = await stat(full).catch(() => null);
          if (target?.isDirectory()) type = 'directory';
        }
        return { name: entry.name, path: full, type, size: info.size, modified: info.mtime.toISOString(), mode: modeString(info.mode) };
      } catch {
        // file hệ thống bị khóa (pagefile.sys...) -> bỏ qua
        return null;
      }
    }),
  );
  return result
    .filter((e): e is FileEntry => e !== null)
    .sort((a, b) => (a.type === 'directory') === (b.type === 'directory') ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);
}

export async function readTextFile(file: string): Promise<{ content: string; size: number; binary: boolean }> {
  const info = await stat(file);
  if (info.isDirectory()) throw badRequest('Đây là thư mục');
  if (info.size > MAX_EDIT_SIZE) throw badRequest('File quá lớn để mở trong trình soạn thảo (tối đa 5MB)');
  const buffer = await readFile(file);
  const binary = buffer.subarray(0, 8000).includes(0);
  return { content: binary ? '' : buffer.toString('utf8'), size: info.size, binary };
}

export async function writeTextFile(file: string, content: string): Promise<void> {
  if (typeof content !== 'string') throw badRequest('Nội dung không hợp lệ');
  await writeFile(file, content, 'utf8');
}

export async function createEntry(dir: string, name: unknown, type: 'file' | 'directory'): Promise<string> {
  const target = path.join(dir, safeName(name));
  if (type === 'directory') await mkdir(target, { recursive: false });
  else await writeFile(target, '', { flag: 'wx' });
  return target;
}

export async function renameEntry(from: string, newName: unknown): Promise<string> {
  const target = path.join(path.dirname(from), safeName(newName));
  await rename(from, target);
  return target;
}

export async function moveEntries(paths: string[], destDir: string, mode: 'move' | 'copy'): Promise<void> {
  for (const source of paths) {
    const target = path.join(destDir, path.basename(source));
    if (path.resolve(target) === path.resolve(source)) continue;
    if (mode === 'copy') await cp(source, target, { recursive: true, errorOnExist: true, force: false });
    else {
      try {
        await rename(source, target);
      } catch (err) {
        // Khác ổ đĩa / phân vùng -> copy rồi xóa
        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
        await cp(source, target, { recursive: true });
        await rm(source, { recursive: true, force: true });
      }
    }
  }
}

export async function deleteEntries(paths: string[]): Promise<void> {
  for (const target of paths) {
    if (path.parse(target).root === target) throw badRequest('Không thể xóa thư mục gốc');
    await rm(target, { recursive: true, force: true });
  }
}

/** Liệt kê đệ quy để đưa vào file zip */
async function walk(base: string, rel = ''): Promise<{ abs: string; rel: string; dir: boolean }[]> {
  const abs = path.join(base, rel);
  const info = await stat(abs);
  if (!info.isDirectory()) return [{ abs, rel, dir: false }];
  const children = await readdir(abs);
  const nested = await Promise.all(children.map((child) => walk(base, rel ? path.join(rel, child) : child)));
  return [{ abs, rel, dir: true }, ...nested.flat()];
}

export async function compress(paths: string[], destination: string, format: 'zip' | 'tar.gz'): Promise<void> {
  if (!paths.length) throw badRequest('Chưa chọn file để nén');
  const cwd = path.dirname(paths[0]);
  if (paths.some((p) => path.dirname(p) !== cwd)) throw badRequest('Các file cần nén phải nằm cùng một thư mục');

  if (format === 'tar.gz') {
    await tar.create({ gzip: true, file: destination, cwd }, paths.map((p) => path.basename(p)));
    return;
  }

  const out = createWriteStream(destination);
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      out.destroy(err);
      return;
    }
    out.write(chunk);
    if (final) out.end();
  });

  for (const source of paths) {
    const items = await walk(cwd, path.basename(source));
    for (const item of items) {
      const name = item.rel.split(path.sep).join('/');
      if (item.dir) {
        const entry = new ZipDeflate(`${name}/`, { level: 0 });
        zip.add(entry);
        entry.push(new Uint8Array(0), true);
        continue;
      }
      const entry = new ZipDeflate(name, { level: 6 });
      zip.add(entry);
      // Đọc theo luồng để nén được file lớn mà không ngốn RAM
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(item.abs);
        stream.on('data', (chunk) => entry.push(new Uint8Array(chunk as Buffer)));
        stream.on('end', () => {
          entry.push(new Uint8Array(0), true);
          resolve();
        });
        stream.on('error', reject);
      });
    }
  }
  zip.end();
  await done;
}

export async function extract(archive: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const lower = archive.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
    await tar.extract({ file: archive, cwd: destDir });
    return;
  }
  if (!lower.endsWith('.zip')) throw badRequest('Chỉ hỗ trợ giải nén .zip, .tar, .tar.gz, .tgz');

  const root = path.resolve(destDir);
  const pending: Promise<void>[] = [];
  const unzip = new Unzip((file: UnzipFile) => {
    const target = path.resolve(root, file.name);
    // Chặn Zip Slip: file trong archive không được ghi ra ngoài thư mục đích
    if (target !== root && !target.startsWith(root + path.sep)) return;
    if (file.name.endsWith('/')) {
      pending.push(mkdir(target, { recursive: true }).then(() => undefined));
      return;
    }
    pending.push(
      new Promise<void>((resolve, reject) => {
        mkdir(path.dirname(target), { recursive: true })
          .then(() => {
            const out = createWriteStream(target);
            out.on('finish', resolve);
            out.on('error', reject);
            file.ondata = (err, chunk, final) => {
              if (err) {
                reject(err);
                return;
              }
              out.write(chunk);
              if (final) out.end();
            };
            file.start();
          })
          .catch(reject);
      }),
    );
  });
  unzip.register(UnzipInflate);

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(archive);
    stream.on('data', (chunk) => unzip.push(new Uint8Array(chunk as Buffer)));
    stream.on('end', () => {
      unzip.push(new Uint8Array(0), true);
      resolve();
    });
    stream.on('error', reject);
  });
  await Promise.all(pending);
}

export async function saveUpload(dir: string, filename: string, file: NodeJS.ReadableStream): Promise<string> {
  const target = path.join(dir, safeName(path.basename(filename)));
  await pipeline(file, createWriteStream(target));
  return target;
}

/** Tổng dung lượng + số file (inode) của thư mục, dùng cho thống kê website */
export async function directoryUsage(dir: string, limit = 200_000): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length && files < limit) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      files += 1;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) bytes += (await stat(full).catch(() => ({ size: 0 }))).size;
    }
  }
  return { bytes, files };
}
