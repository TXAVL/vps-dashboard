// ZenPanel - Kiểm tra cập nhật qua GitHub API, quản lý các gói phiên bản đã tải, cài đặt / rollback
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { config } from '../config.js';
import { downloadFile } from '../core/download.js';
import { jobLog, jobProgress, jobResult, jobStep, startJob, type JobView } from '../core/jobs.js';
import { getPrefs } from '../core/prefs.js';
import { dataPath, JsonCollection } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';

const UTF8_BOM = '﻿';

export interface RemoteVersion {
  ref: string;
  label: string;
  version: string;
  sha: string;
  message: string;
  date: string | null;
}

export interface VersionPackage {
  id: string;
  ref: string;
  version: string;
  sha: string;
  file: string;
  size: number;
  downloadedAt: string;
}

export interface UpdateState {
  current: string;
  latest: RemoteVersion | null;
  available: boolean;
  checkedAt: string | null;
  error: string | null;
  downloadedLatest: boolean;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { title: string; items: string[] }[];
}

const packages = new JsonCollection<VersionPackage>('versions.json');
/** Số gói phiên bản giữ lại trên đĩa (ngoài bản đang chạy) */
const KEEP_PACKAGES = 2;

/**
 * Đọc mảng CHANGELOG trong dashboard/src/lib/changelog.ts của bản mới (object literal kiểu JS).
 * Parser nhỏ chỉ hiểu chuỗi, mảng, object và key không ngoặc - không eval mã từ xa.
 */
function parseChangelogSource(source: string): ChangelogEntry[] {
  const decl = source.indexOf('CHANGELOG');
  const start = decl < 0 ? -1 : source.indexOf('[', source.indexOf('=', decl));
  if (start < 0) return [];
  let i = start;
  const ws = () => {
    for (;;) {
      while (i < source.length && /\s|,/.test(source[i])) i++;
      if (source.startsWith('//', i)) i = source.indexOf('\n', i) + 1 || source.length;
      else if (source.startsWith('/*', i)) i = source.indexOf('*/', i) + 2;
      else return;
    }
  };
  const value = (): unknown => {
    ws();
    const ch = source[i];
    if (ch === '[') {
      i++;
      const arr: unknown[] = [];
      for (ws(); i < source.length && source[i] !== ']'; ws()) arr.push(value());
      i++;
      return arr;
    }
    if (ch === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      for (ws(); i < source.length && source[i] !== '}'; ws()) {
        let key: string;
        if (source[i] === "'" || source[i] === '"') key = value() as string;
        else {
          const m = /^[A-Za-z_$][\w$]*/.exec(source.slice(i, i + 64));
          if (!m) throw new Error('changelog không hợp lệ');
          key = m[0];
          i += key.length;
        }
        ws();
        if (source[i] !== ':') throw new Error('changelog không hợp lệ');
        i++;
        obj[key] = value();
      }
      i++;
      return obj;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let out = '';
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          const next = source[i + 1];
          out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
        } else out += source[i++];
      }
      i++;
      return out;
    }
    const m = /^-?[\w.]+/.exec(source.slice(i, i + 32));
    if (!m) throw new Error('changelog không hợp lệ');
    i += m[0].length;
    return m[0];
  };
  const list = value();
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map((e) => ({
      version: String(e.version ?? ''),
      date: String(e.date ?? ''),
      highlights: (Array.isArray(e.highlights) ? (e.highlights as Record<string, unknown>[]) : []).map((h) => ({
        title: String(h.title ?? ''),
        items: Array.isArray(h.items) ? h.items.map(String) : [],
      })),
    }));
}

/** So sánh semver đơn giản (1.2.10 > 1.2.9) */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

async function github<T>(pathname: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${config.updateRepo}${pathname}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ZenPanel-Agent' },
    signal: AbortSignal.timeout(15_000),
  }).catch((err: Error) => {
    throw new HttpError(502, `Không kết nối được GitHub (${err.name === 'TimeoutError' ? 'quá 15 giây, VPS có thể đang chặn kết nối ra ngoài' : err.message})`);
  });
  if (res.status === 403 || res.status === 429) throw new HttpError(502, 'GitHub API đang giới hạn lượt gọi, hãy thử lại sau ít phút');
  if (!res.ok) throw new HttpError(502, `GitHub API lỗi ${res.status}`);
  return (await res.json()) as T;
}

async function versionAt(sha: string): Promise<string> {
  // Lỗi mạng / GitHub phải báo ra giao diện, KHÔNG được coi là "0.0.0" (sẽ thành "không có bản mới" mà không ai biết)
  const res = await fetch(`https://raw.githubusercontent.com/${config.updateRepo}/${sha}/agent/package.json`, {
    headers: { 'User-Agent': 'ZenPanel-Agent' },
    signal: AbortSignal.timeout(15_000),
  }).catch((err: Error) => {
    throw new HttpError(502, `Không tải được thông tin phiên bản từ GitHub (${err.name === 'TimeoutError' ? 'quá 15 giây, VPS có thể đang chặn kết nối ra ngoài' : err.message}). Kiểm tra mạng / DNS của VPS rồi bấm "Kiểm tra".`);
  });
  if (!res.ok) throw new HttpError(502, `GitHub trả lỗi ${res.status} khi đọc phiên bản (bản vừa đẩy có thể chưa kịp cập nhật, thử lại sau 1–2 phút)`);
  const version = ((await res.json().catch(() => ({}))) as { version?: string }).version;
  if (!version) throw new HttpError(502, 'Không đọc được số phiên bản trong package.json trên GitHub');
  return version;
}

export class UpdateService {
  private state: UpdateState;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly adapter: OSAdapter,
    currentVersion: string,
  ) {
    this.state = { current: currentVersion, latest: null, available: false, checkedAt: null, error: null, downloadedLatest: false };
  }

  getState(): UpdateState {
    const latest = this.state.latest;
    return { ...this.state, downloadedLatest: Boolean(latest && packages.all().some((p) => p.sha === latest.sha)) };
  }

  async check(): Promise<UpdateState> {
    try {
      const commit = await github<{ sha: string; commit: { message: string; committer: { date: string } } }>(`/commits/${config.updateBranch}`);
      const version = await versionAt(commit.sha);
      this.state = {
        ...this.state,
        latest: {
          ref: config.updateBranch,
          label: `${config.updateBranch} (mới nhất)`,
          version,
          sha: commit.sha,
          message: commit.commit.message.split('\n')[0],
          date: commit.commit.committer.date,
        },
        available: compareVersions(version, this.state.current) > 0,
        checkedAt: new Date().toISOString(),
        error: null,
      };
    } catch (err) {
      this.state = { ...this.state, checkedAt: new Date().toISOString(), error: (err as Error).message };
    }
    return this.getState();
  }

  /** Các phiên bản có thể tải hoặc quay lại: nhánh chính + tag + các bản sao lưu đã có trên máy + commit lịch sử */
  async remoteVersions(): Promise<RemoteVersion[]> {
    const state = this.state.latest ? this.getState() : await this.check();
    const list: RemoteVersion[] = [];
    const seenShas = new Set<string>();

    if (state.latest) {
      list.push(state.latest);
      seenShas.add(state.latest.sha);
    }

    // 1. Thẻ phát hành (Tags) từ GitHub nếu có
    const tags = await github<{ name: string; commit: { sha: string } }[]>('/tags?per_page=30').catch(() => []);
    for (const tag of tags) {
      if (!seenShas.has(tag.commit.sha)) {
        seenShas.add(tag.commit.sha);
        list.push({
          ref: tag.name,
          label: `Bản phát hành ${tag.name}`,
          version: tag.name.replace(/^v/, ''),
          sha: tag.commit.sha,
          message: 'Bản phát hành chính thức từ GitHub',
          date: null,
        });
      }
    }

    // 2. Các gói sao lưu / phiên bản dự phòng đã lưu sẵn trên ổ đĩa máy chủ (Offline rollback)
    for (const pkg of packages.all()) {
      if (!seenShas.has(pkg.sha) && existsSync(pkg.file)) {
        seenShas.add(pkg.sha);
        list.push({
          ref: pkg.sha,
          label: `Bản sao lưu v${pkg.version}`,
          version: pkg.version,
          sha: pkg.sha,
          message: `Gói sao lưu có sẵn trên máy (${(pkg.size / 1024).toFixed(1)} KB) · Sẵn sàng quay lại ngay lập tức`,
          date: pkg.downloadedAt,
        });
      }
    }

    // 3. Quét các commit có gắn phiên bản gần đây trên nhánh cập nhật (hỗ trợ rollback ngay cả khi không gắn tag)
    try {
      const commits = await github<{ sha: string; commit: { message: string; committer: { date: string } } }[]>(
        `/commits?sha=${encodeURIComponent(config.updateBranch)}&per_page=20`,
      );
      for (const c of commits) {
        if (!seenShas.has(c.sha)) {
          const firstLine = c.commit.message.split('\n')[0];
          const m = firstLine.match(/v?(\d+\.\d+\.\d+)/i);
          const ver = m ? m[1] : '';
          if (ver) {
            seenShas.add(c.sha);
            list.push({
              ref: c.sha,
              label: `Commit ${c.sha.slice(0, 7)} (v${ver})`,
              version: ver,
              sha: c.sha,
              message: firstLine,
              date: c.commit.committer.date,
            });
          }
        }
      }
    } catch {
      // bỏ qua lỗi nếu bị giới hạn GitHub rate limit
    }

    // 1. Sắp xếp theo phiên bản mới nhất trước; nếu bằng phiên bản thì ngày mới nhất trước
    list.sort((a, b) => compareVersions(b.version, a.version) || (b.date ?? '').localeCompare(a.date ?? ''));

    // 2. Cùng 1 phiên bản chỉ lấy bản mới nhất, loại bỏ trùng lặp
    const uniqueList: RemoteVersion[] = [];
    const seenVersions = new Set<string>();
    for (const item of list) {
      const cleanVer = item.version.trim().replace(/^v/, '');
      if (!cleanVer || seenVersions.has(cleanVer)) continue;
      seenVersions.add(cleanVer);
      uniqueList.push(item);
    }

    return uniqueList;
  }

  listPackages(): (VersionPackage & { current: boolean })[] {
    return packages
      .all()
      .filter((p) => existsSync(p.file))
      .sort((a, b) => compareVersions(b.version, a.version) || b.downloadedAt.localeCompare(a.downloadedAt))
      .map((p) => ({ ...p, current: p.version === this.state.current }));
  }

  /** Nhật ký thay đổi (thân thiện người dùng) giữa bản đang chạy và bản đích, đọc từ mã nguồn bản đích */
  async changelog(ref: string): Promise<{ current: string; target: string; entries: ChangelogEntry[]; commits: { sha: string; message: string; date: string | null }[] }> {
    if (!/^[\w.\-/]{1,100}$/.test(ref)) throw badRequest('Tên phiên bản không hợp lệ');
    const commit = await github<{ sha: string }>(`/commits/${encodeURIComponent(ref)}`);
    const target = await versionAt(commit.sha);
    let entries: ChangelogEntry[] = [];
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${config.updateRepo}/${commit.sha}/dashboard/src/lib/changelog.ts`, {
        headers: { 'User-Agent': 'ZenPanel-Agent' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) entries = parseChangelogSource(await res.text());
    } catch {
      entries = [];
    }
    const older = compareVersions(target, this.state.current) < 0;
    entries = entries.filter((e) =>
      older
        ? compareVersions(e.version, target) > 0 && compareVersions(e.version, this.state.current) <= 0
        : compareVersions(e.version, this.state.current) > 0 && compareVersions(e.version, target) <= 0,
    );
    // Vài commit gần nhất để bổ sung khi bản đích chưa có mục changelog
    const commits = await github<{ sha: string; commit: { message: string; committer: { date: string } } }[]>(`/commits?sha=${commit.sha}&per_page=8`)
      .then((list) => list.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0], date: c.commit.committer.date })))
      .catch(() => []);
    return { current: this.state.current, target, entries, commits };
  }

  /** Tải gói mã nguồn của 1 ref (nhánh / tag / sha) về ~/.zenpanel/versions */
  download(ref: string): JobView {
    if (!/^[\w.\-/]{1,100}$/.test(ref)) throw badRequest('Tên phiên bản không hợp lệ');
    return startJob(`Tải phiên bản ${ref}`, 'update', async () => {
      jobStep('Hỏi GitHub thông tin phiên bản');
      const commit = await github<{ sha: string }>(`/commits/${encodeURIComponent(ref)}`);
      const version = await versionAt(commit.sha);
      const existing = packages.all().find((p) => p.sha === commit.sha && existsSync(p.file));
      if (existing) {
        jobLog(`Phiên bản ${version} (${commit.sha.slice(0, 7)}) đã có sẵn, bỏ qua tải lại.`);
        jobResult({ id: existing.id, version, sha: commit.sha, cached: true });
        return;
      }
      const format = this.adapter.archiveFormat();
      const id = `${version}-${commit.sha.slice(0, 7)}`;
      const file = dataPath('versions', `zenpanel-${id}.${format}`);
      const url = `https://codeload.github.com/${config.updateRepo}/${format === 'zip' ? 'zip' : 'tar.gz'}/${commit.sha}`;
      jobLog(`Phiên bản ${version} · commit ${commit.sha.slice(0, 7)}`);
      jobLog(`Đang tải ${url}`);
      jobStep('Tải gói mã nguồn');
      await mkdir(path.dirname(file), { recursive: true });
      const started = Date.now();
      await downloadFile(url, file, (received, total) => {
        const speed = received / Math.max(0.2, (Date.now() - started) / 1000);
        // codeload thường không gửi content-length: ước lượng gói ~6 MB
        const percent = total ? (received / total) * 100 : Math.min(95, (received / (6 * 1024 * 1024)) * 100);
        const eta = total ? Math.max(0, Math.round((total - received) / Math.max(1, speed))) : null;
        jobProgress(percent, undefined, eta);
        jobResult({ received, total, speed });
      });
      const size = (await stat(file)).size;
      jobLog(`Đã lưu ${file} (${(size / 1024 / 1024).toFixed(2)} MB)`);
      packages.upsert({ id, ref, version, sha: commit.sha, file, size, downloadedAt: new Date().toISOString() });
      jobStep('Dọn gói phiên bản cũ');
      const removed = await this.prune(id);
      if (removed) jobLog(`Đã xoá ${removed} gói phiên bản cũ để tiết kiệm ổ đĩa (giữ ${KEEP_PACKAGES} bản gần nhất).`);
      jobResult({ id, version, sha: commit.sha, size, cached: false });
    });
  }

  /** Giữ bản đang chạy + KEEP_PACKAGES gói mới nhất (tính cả gói vừa tải), xoá phần còn lại */
  private async prune(keepId: string): Promise<number> {
    const list = packages
      .all()
      .filter((p) => p.version !== this.state.current && p.id !== keepId)
      .sort((a, b) => compareVersions(b.version, a.version) || b.downloadedAt.localeCompare(a.downloadedAt));
    let removed = 0;
    for (const pkg of list.slice(Math.max(0, KEEP_PACKAGES - 1))) {
      await rm(pkg.file, { force: true }).catch(() => undefined);
      packages.remove(pkg.id);
      removed++;
    }
    return removed;
  }

  async removePackage(id: string): Promise<void> {
    const pkg = packages.get(id);
    if (!pkg) throw new HttpError(404, 'Không tìm thấy gói phiên bản');
    await rm(pkg.file, { force: true });
    packages.remove(id);
  }

  /** Cài (hoặc quay lại) 1 phiên bản đã tải: installer chạy tách rời rồi khởi động lại agent */
  async install(id: string): Promise<{ logFile: string }> {
    const pkg = packages.get(id);
    if (!pkg || !existsSync(pkg.file)) throw new HttpError(404, 'Gói phiên bản không còn trên đĩa, hãy tải lại');
    const source = path.join(config.repoRoot, 'agent', 'scripts', this.adapter.installerScript());
    if (!existsSync(source)) throw badRequest('Không tìm thấy installer trong thư mục cài đặt ZenPanel');

    const dir = dataPath('updates');
    await mkdir(dir, { recursive: true });
    const script = path.join(dir, this.adapter.installerScript());
    // Copy installer ra ngoài thư mục app vì installer sẽ ghi đè chính thư mục đó
    if (script.endsWith('.ps1')) await writeFile(script, UTF8_BOM + (await readFile(source, 'utf8')).replace(/^﻿/, ''), 'utf8');
    else await copyFile(source, script);

    const logFile = dataPath('logs', 'update.log');
    await mkdir(path.dirname(logFile), { recursive: true });
    await writeFile(logFile, `ZenPanel: bắt đầu cài phiên bản ${pkg.version} (${pkg.sha.slice(0, 7)}) lúc ${new Date().toISOString()}\n`);
    await this.adapter.launchDetachedInstall({
      scriptPath: script,
      logFile,
      env: {
        ZENPANEL_ARCHIVE: pkg.file,
        ZENPANEL_PORT: String(config.port),
        ZENPANEL_TUNNEL: config.tunnelEnabled ? '1' : '0',
        ZENPANEL_DATA_DIR: config.dataDir,
      },
    });
    return { logFile };
  }

  async installLog(): Promise<string> {
    const file = dataPath('logs', 'update.log');
    if (!existsSync(file)) return '';
    const text = await readFile(file, 'utf8');
    return text.slice(-200_000).replace(/\x1b\[[0-9;]*m/g, '');
  }

  private lastAutoCheck = 0;

  /** Tự kiểm tra theo tần suất trong Cài đặt (đổi tần suất có hiệu lực ngay, không cần khởi động lại) */
  startAuto(): void {
    const tick = async () => {
      const prefs = getPrefs();
      if (!prefs.autoCheckUpdate) return;
      if (Date.now() - this.lastAutoCheck < prefs.updateCheckMinutes * 60_000) return;
      this.lastAutoCheck = Date.now();
      const state = await this.check();
      if (state.available && state.latest && prefs.autoDownloadUpdate && !state.downloadedLatest) {
        try {
          this.download(state.latest.sha);
        } catch {
          // bỏ qua, lần kiểm tra sau sẽ thử lại
        }
      }
    };
    setTimeout(() => void tick(), 30_000);
    this.timer = setInterval(() => void tick(), 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
