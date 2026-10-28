// ZenPanel - SecureFolder: khoá thư mục chống sửa / xoá / thêm file trái phép (kể cả khi website bị hack).
// Linux: thuộc tính bất biến chattr +i. Windows: luật DENY ghi/xoá cho Everyone bằng icacls.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { config } from '../config.js';
import { JsonCollection } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';

/** full: khoá cả thư mục lẫn file (không sửa/xoá/thêm) · content: chỉ khoá file có sẵn, vẫn thêm file mới được · top: chỉ khoá thư mục gốc (không thêm/xoá ở cấp ngoài cùng) */
export type LockMode = 'full' | 'content' | 'top';

export interface SecureFolder {
  id: string;
  path: string;
  mode?: LockMode;
  /** Thư mục con (tương đối) được để mở ghi: uploads, cache, session... */
  excludes?: string[];
  note: string;
  createdAt: string;
  /** Lần chuyển trạng thái cuối do người dùng yêu cầu */
  lockedAt: string | null;
}

export interface SecureFolderView extends SecureFolder {
  exists: boolean;
  /** Trạng thái đọc lại từ hệ thống (không tin vào file cấu hình) */
  locked: boolean | null;
}

const store = new JsonCollection<SecureFolder>('secure-folders.json');

/** Thư mục không bao giờ được khoá: khoá nhầm sẽ làm hỏng hệ điều hành hoặc chính ZenPanel */
const PROTECTED_LINUX = ['/', '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/dev', '/proc', '/sys', '/run', '/var', '/var/lib', '/var/log', '/home', '/root', '/tmp', '/opt'];
/** Ổ đĩa gốc, C:\Users, hồ sơ người dùng (C:\Users\<tên>) và toàn bộ cây Windows / Program Files / ProgramData */
const PROTECTED_WINDOWS = /^[a-z]:\\?$|^[a-z]:\\(windows|program files|program files \(x86\)|programdata)(\\.*)?$|^[a-z]:\\users(\\[^\\]+)?$/i;

const sh = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
const ps = (v: string) => `'${v.replace(/'/g, "''")}'`;

export class SecureFolderService {
  constructor(private readonly adapter: OSAdapter) {}

  private get windows() {
    return this.adapter.family === 'windows';
  }

  private async run(command: string, timeout = 180_000) {
    const res = await this.adapter.runShell(command, { timeout });
    return { out: `${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}`.trim(), code: res.code };
  }

  private validate(input: string): string {
    const dir = path.resolve(String(input ?? '').trim());
    if (!String(input ?? '').trim() || !path.isAbsolute(dir)) throw badRequest('Nhập đường dẫn tuyệt đối của thư mục');
    const norm = this.windows ? dir : dir.replace(/\/+$/, '') || '/';
    if (this.windows ? PROTECTED_WINDOWS.test(dir) : PROTECTED_LINUX.includes(norm)) throw badRequest('Đây là thư mục hệ thống, khoá lại có thể làm hỏng máy chủ');
    if (!existsSync(dir)) throw badRequest('Thư mục không tồn tại');
    for (const own of [config.dataDir, config.repoRoot]) {
      const a = path.resolve(own).toLowerCase();
      const b = dir.toLowerCase();
      if (b === a || b.startsWith(a + path.sep) || a.startsWith(b + path.sep)) throw badRequest('Không khoá thư mục chứa dữ liệu / mã nguồn của chính ZenPanel');
    }
    return dir;
  }

  private cleanExcludes(dir: string, list: unknown): string[] {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const raw of list) {
      const rel = String(raw ?? '').trim().replace(/^[\\/]+|[\\/]+$/g, '');
      if (!rel) continue;
      const abs = path.resolve(dir, rel);
      if (abs === dir || !abs.toLowerCase().startsWith(dir.toLowerCase() + path.sep)) throw badRequest(`Thư mục loại trừ "${rel}" phải nằm bên trong thư mục được khoá`);
      out.push(rel);
    }
    return [...new Set(out)].slice(0, 30);
  }

  private async status(dir: string, mode: LockMode = 'full'): Promise<boolean | null> {
    if (!existsSync(dir)) return null;
    if (this.windows) {
      const r = await this.run(`icacls ${ps(dir)}`, 30_000);
      return /(?:Everyone|S-1-1-0):(?:\(OI\))?(?:\(CI\))?(?:\(IO\))?\(DENY\)/i.test(r.out);
    }
    if (mode === 'content') {
      // Thư mục gốc không bị khoá: kiểm tra 1 file bên trong
      const f = await this.run(`find ${sh(dir)} -type f -print -quit 2>/dev/null`, 15_000);
      const file = f.out.trim().split('\n')[0];
      if (!file) return null;
      const r = await this.run(`lsattr ${sh(file)} 2>/dev/null`, 15_000);
      return r.code === 0 ? /^[^\s]*i[^\s]*\s/.test(r.out.trim()) : null;
    }
    const r = await this.run(`lsattr -d ${sh(dir)} 2>/dev/null`, 15_000);
    if (r.code !== 0) return null;
    return /^[^\s]*i[^\s]*\s/.test(r.out.trim());
  }

  async list(): Promise<SecureFolderView[]> {
    const items = store.all().sort((a, b) => a.path.localeCompare(b.path));
    return Promise.all(items.map(async (f) => ({ ...f, exists: existsSync(f.path), locked: await this.status(f.path, f.mode ?? 'full') })));
  }

  /** Thêm thư mục vào danh sách bảo vệ và khoá ngay */
  async add(input: { path: string; note?: string; mode?: string; excludes?: string[] }): Promise<SecureFolderView> {
    const dir = this.validate(input.path);
    if (store.all().some((f) => f.path === dir)) throw badRequest('Thư mục này đã có trong danh sách');
    const mode: LockMode = input.mode === 'content' || input.mode === 'top' ? input.mode : 'full';
    const folder: SecureFolder = { id: randomUUID().slice(0, 8), path: dir, mode, excludes: this.cleanExcludes(dir, input.excludes), note: String(input.note ?? '').slice(0, 120), createdAt: new Date().toISOString(), lockedAt: null };
    store.upsert(folder);
    await this.setLocked(folder.id, true);
    return (await this.list()).find((f) => f.id === folder.id)!;
  }

  async setLocked(id: string, locked: boolean): Promise<void> {
    const folder = store.get(id);
    if (!folder) throw new HttpError(404, 'Không tìm thấy thư mục');
    this.validate(folder.path);
    const mode = folder.mode ?? 'full';
    const excl = (folder.excludes ?? []).map((r) => path.resolve(folder.path, r)).filter((r) => existsSync(r));
    let result: { out: string; code: number };
    if (this.windows) {
      if (!locked) {
        result = await this.run(`icacls ${ps(folder.path)} /remove:d '*S-1-1-0' /T /C`);
      } else if (mode === 'top') {
        result = await this.run(`icacls ${ps(folder.path)} /deny '*S-1-1-0:(W,D,DC)' /C`);
      } else {
        // content: chỉ file (OI)(IO) · full: thư mục + file
        result = await this.run(`icacls ${ps(folder.path)} /deny '*S-1-1-0:${mode === 'content' ? '(OI)(IO)' : '(OI)(CI)'}(W,D,DC)' /T /C`);
        for (const e of excl) await this.run(`icacls ${ps(e)} /remove:d '*S-1-1-0' /T /C`);
      }
    } else {
      if (!(await this.adapter.findExecutable('chattr'))) throw badRequest('Máy chủ thiếu lệnh chattr (gói e2fsprogs)');
      const flag = locked ? '+i' : '-i';
      if (!locked || mode === 'full') result = await this.run(`chattr -R ${flag} ${sh(folder.path)}`);
      else if (mode === 'top') result = await this.run(`chattr ${flag} ${sh(folder.path)}`);
      else result = await this.run(`find ${sh(folder.path)} -type f -exec chattr ${flag} {} +`);
      if (locked) for (const e of excl) await this.run(`chattr -R -i ${sh(e)}`);
    }
    // Đọc lại thật sự thay vì tin vào mã thoát
    const now = await this.status(folder.path, mode);
    if (now !== locked) {
      throw badRequest(
        `Không ${locked ? 'khoá' : 'mở khoá'} được${this.windows ? '' : ' (hệ thống file hỗ trợ chattr? cần chạy bằng root)'}: ${result.out.split('\n').slice(-2).join(' ').slice(0, 200)}`,
      );
    }
    store.upsert({ ...folder, lockedAt: locked ? new Date().toISOString() : null });
  }

  /** Gỡ khỏi danh sách (mở khoá trước nếu đang khoá) */
  async remove(id: string): Promise<void> {
    const folder = store.get(id);
    if (!folder) throw new HttpError(404, 'Không tìm thấy thư mục');
    if (existsSync(folder.path) && (await this.status(folder.path, folder.mode ?? 'full'))) await this.setLocked(id, false);
    store.remove(id);
  }
}
