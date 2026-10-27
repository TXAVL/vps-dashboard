// ZenPanel - SecureFolder: khoá thư mục chống sửa / xoá / thêm file trái phép (kể cả khi website bị hack).
// Linux: thuộc tính bất biến chattr +i. Windows: luật DENY ghi/xoá cho Everyone bằng icacls.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { config } from '../config.js';
import { JsonCollection } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';

export interface SecureFolder {
  id: string;
  path: string;
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

  private async status(dir: string): Promise<boolean | null> {
    if (!existsSync(dir)) return null;
    if (this.windows) {
      const r = await this.run(`icacls ${ps(dir)}`, 30_000);
      return /Everyone:\(OI\)\(CI\)\(DENY\)/i.test(r.out) || /S-1-1-0:\(OI\)\(CI\)\(DENY\)/i.test(r.out);
    }
    const r = await this.run(`lsattr -d ${sh(dir)} 2>/dev/null`, 15_000);
    if (r.code !== 0) return null;
    return /^[^\s]*i[^\s]*\s/.test(r.out.trim());
  }

  async list(): Promise<SecureFolderView[]> {
    const items = store.all().sort((a, b) => a.path.localeCompare(b.path));
    return Promise.all(items.map(async (f) => ({ ...f, exists: existsSync(f.path), locked: await this.status(f.path) })));
  }

  /** Thêm thư mục vào danh sách bảo vệ và khoá ngay */
  async add(input: { path: string; note?: string }): Promise<SecureFolderView> {
    const dir = this.validate(input.path);
    if (store.all().some((f) => f.path === dir)) throw badRequest('Thư mục này đã có trong danh sách');
    const folder: SecureFolder = { id: randomUUID().slice(0, 8), path: dir, note: String(input.note ?? '').slice(0, 120), createdAt: new Date().toISOString(), lockedAt: null };
    store.upsert(folder);
    await this.setLocked(folder.id, true);
    return (await this.list()).find((f) => f.id === folder.id)!;
  }

  async setLocked(id: string, locked: boolean): Promise<void> {
    const folder = store.get(id);
    if (!folder) throw new HttpError(404, 'Không tìm thấy thư mục');
    this.validate(folder.path);
    let result: { out: string; code: number };
    if (this.windows) {
      result = locked
        ? await this.run(`icacls ${ps(folder.path)} /deny '*S-1-1-0:(OI)(CI)(W,D,DC)' /T /C`)
        : await this.run(`icacls ${ps(folder.path)} /remove:d '*S-1-1-0' /T /C`);
    } else {
      if (!(await this.adapter.findExecutable('chattr'))) throw badRequest('Máy chủ thiếu lệnh chattr (gói e2fsprogs)');
      result = await this.run(`chattr -R ${locked ? '+i' : '-i'} ${sh(folder.path)}`);
    }
    // Đọc lại thật sự thay vì tin vào mã thoát
    const now = await this.status(folder.path);
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
    if (existsSync(folder.path) && (await this.status(folder.path))) await this.setLocked(id, false);
    store.remove(id);
  }
}
