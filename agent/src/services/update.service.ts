// ZenPanel - Kiểm tra cập nhật qua GitHub API, quản lý các gói phiên bản đã tải, cài đặt / rollback
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { config } from '../config.js';
import { downloadFile } from '../core/download.js';
import { jobLog, startJob, type JobView } from '../core/jobs.js';
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

const packages = new JsonCollection<VersionPackage>('versions.json');

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
  });
  if (res.status === 403 || res.status === 429) throw new HttpError(502, 'GitHub API đang giới hạn lượt gọi, hãy thử lại sau ít phút');
  if (!res.ok) throw new HttpError(502, `GitHub API lỗi ${res.status}`);
  return (await res.json()) as T;
}

async function versionAt(sha: string): Promise<string> {
  const res = await fetch(`https://raw.githubusercontent.com/${config.updateRepo}/${sha}/agent/package.json`, { headers: { 'User-Agent': 'ZenPanel-Agent' } });
  if (!res.ok) return '0.0.0';
  return ((await res.json()) as { version?: string }).version ?? '0.0.0';
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

  /** Các phiên bản có thể tải: nhánh chính + các tag/release trên GitHub */
  async remoteVersions(): Promise<RemoteVersion[]> {
    const state = this.state.latest ? this.getState() : await this.check();
    const tags = await github<{ name: string; commit: { sha: string } }[]>('/tags?per_page=30').catch(() => []);
    const list: RemoteVersion[] = state.latest ? [state.latest] : [];
    for (const tag of tags) list.push({ ref: tag.name, label: tag.name, version: tag.name.replace(/^v/, ''), sha: tag.commit.sha, message: '', date: null });
    return list;
  }

  listPackages(): (VersionPackage & { current: boolean })[] {
    return packages
      .all()
      .filter((p) => existsSync(p.file))
      .sort((a, b) => compareVersions(b.version, a.version) || b.downloadedAt.localeCompare(a.downloadedAt))
      .map((p) => ({ ...p, current: p.version === this.state.current }));
  }

  /** Tải gói mã nguồn của 1 ref (nhánh / tag / sha) về ~/.zenpanel/versions */
  download(ref: string): JobView {
    if (!/^[\w.\-/]{1,100}$/.test(ref)) throw badRequest('Tên phiên bản không hợp lệ');
    return startJob(`Tải phiên bản ${ref}`, 'update', async () => {
      const commit = await github<{ sha: string }>(`/commits/${encodeURIComponent(ref)}`);
      const version = await versionAt(commit.sha);
      const existing = packages.all().find((p) => p.sha === commit.sha && existsSync(p.file));
      if (existing) {
        jobLog(`Phiên bản ${version} (${commit.sha.slice(0, 7)}) đã có sẵn, bỏ qua tải lại.`);
        return;
      }
      const format = this.adapter.archiveFormat();
      const id = `${version}-${commit.sha.slice(0, 7)}`;
      const file = dataPath('versions', `zenpanel-${id}.${format}`);
      const url = `https://codeload.github.com/${config.updateRepo}/${format === 'zip' ? 'zip' : 'tar.gz'}/${commit.sha}`;
      jobLog(`Phiên bản ${version} · commit ${commit.sha.slice(0, 7)}`);
      jobLog(`Đang tải ${url}`);
      await mkdir(path.dirname(file), { recursive: true });
      await downloadFile(url, file);
      const size = (await stat(file)).size;
      jobLog(`Đã lưu ${file} (${(size / 1024 / 1024).toFixed(2)} MB)`);
      packages.upsert({ id, ref, version, sha: commit.sha, file, size, downloadedAt: new Date().toISOString() });
    });
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
