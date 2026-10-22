// ZenPanel - Lưu trữ cấu hình dạng JSON trong thư mục dữ liệu (~/.zenpanel hoặc ZENPANEL_DATA_DIR)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export function dataPath(...parts: string[]): string {
  return path.join(config.dataDir, ...parts);
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson<T>(name: string, fallback: T): T {
  const file = dataPath(name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Ghi atomic: ghi ra file tạm rồi rename để tránh hỏng file khi mất điện */
export function writeJson(name: string, data: unknown): void {
  const file = dataPath(name);
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}

/** Một collection JSON đơn giản lưu toàn bộ trong 1 file */
export class JsonCollection<T extends { id: string }> {
  constructor(private readonly file: string) {}

  all(): T[] {
    return readJson<T[]>(this.file, []);
  }

  get(id: string): T | undefined {
    return this.all().find((item) => item.id === id);
  }

  upsert(item: T): T {
    const items = this.all().filter((existing) => existing.id !== item.id);
    items.push(item);
    writeJson(this.file, items);
    return item;
  }

  remove(id: string): void {
    writeJson(
      this.file,
      this.all().filter((item) => item.id !== id),
    );
  }
}
