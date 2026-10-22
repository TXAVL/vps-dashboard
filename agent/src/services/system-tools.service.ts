// ZenPanel - Dịch vụ phát hiện, kiểm tra phiên bản & nâng cấp các công cụ hệ thống cần thiết cho ZenPanel
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { jobLog, jobProgress, startJob, type JobView } from '../core/jobs.js';
import { badRequest } from '../core/validate.js';
import { nodeService } from './nodejs.service.js';

const execAsync = promisify(exec);

export interface SystemToolItem {
  id: 'node' | 'npm' | 'git' | 'cloudflared' | 'docker';
  name: string;
  category: 'runtime' | 'package_manager' | 'vcs' | 'network' | 'container';
  description: string;
  installed: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
  isCrucialForZenPanel: boolean;
  changelogUrl?: string;
  releaseDate?: string;
  securityNotes?: string;
  notes?: string;
}

export interface SystemToolsStatusResponse {
  tools: SystemToolItem[];
  checkedAt: string;
  totalWithUpdates: number;
}

let cachedToolsStatus: { at: number; data: SystemToolsStatusResponse } | null = null;

/** So sánh phiên bản dạng X.Y.Z hoặc YYYY.M.D */
export function isNewerVersion(currentVer: string | null, latestVer: string | null): boolean {
  if (!latestVer) return false;
  if (!currentVer) return true;

  const clean = (v: string) => v.trim().replace(/^v/i, '').replace(/[^0-9.]/g, '');
  const cParts = clean(currentVer).split('.').map(Number);
  const lParts = clean(latestVer).split('.').map(Number);

  const len = Math.max(cParts.length, lParts.length);
  for (let i = 0; i < len; i++) {
    const c = cParts[i] ?? 0;
    const l = lParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export class SystemToolsService {
  clearCache(): void {
    cachedToolsStatus = null;
  }

  /** Lấy danh sách các công cụ hệ thống, phiên bản hiện tại và phiên bản mới nhất */
  async getStatus(forceRefresh = false): Promise<SystemToolsStatusResponse> {
    if (!forceRefresh && cachedToolsStatus && Date.now() - cachedToolsStatus.at < 2 * 60_000) {
      return cachedToolsStatus.data;
    }

    const [nodeTool, npmTool, gitTool, cloudflaredTool, dockerTool] = await Promise.all([
      this.checkNode(forceRefresh),
      this.checkNpm(),
      this.checkGit(),
      this.checkCloudflared(),
      this.checkDocker(),
    ]);

    const tools: SystemToolItem[] = [nodeTool, npmTool, gitTool, cloudflaredTool, dockerTool];
    const totalWithUpdates = tools.filter((t) => t.hasUpdate).length;

    const result: SystemToolsStatusResponse = {
      tools,
      checkedAt: new Date().toISOString(),
      totalWithUpdates,
    };

    cachedToolsStatus = { at: Date.now(), data: result };
    return result;
  }

  // 1. Kiểm tra Node.js Runtime
  private async checkNode(forceRefresh = false): Promise<SystemToolItem> {
    const runningVer = process.version; // vd: v21.10.0
    const nodeStatus = await nodeService.getStatus(forceRefresh).catch(() => null);

    const systemVer = nodeStatus?.installed?.systemVersion || runningVer;
    const latest = nodeStatus?.latestLts?.version || nodeStatus?.latestCurrent?.version || null;
    const isEol = nodeStatus?.installed?.isEol ?? false;
    const hasSec = nodeStatus?.installed?.hasSecurityRisk ?? false;
    const pendingRestart = nodeStatus?.installed?.pendingRestart ?? false;

    // Nếu trên máy đã cài bản mới (systemVer >= latest), hasUpdate là false
    const hasUpdate = (isEol || isNewerVersion(systemVer, latest)) && !pendingRestart;

    let notes: string | undefined;
    if (pendingRestart) {
      notes = `Đã cài đặt ${systemVer} trên hệ thống (tiến trình đang chạy ${runningVer}). Khởi động lại ZenPanel để kích hoạt runtime mới.`;
    }

    return {
      id: 'node',
      name: 'Node.js Runtime',
      category: 'runtime',
      description: 'Môi trường thực thi JavaScript/TypeScript cốt lõi cho ZenPanel Agent và các dịch vụ nền',
      installed: true,
      currentVersion: pendingRestart ? `${systemVer} (cần khởi động lại)` : runningVer,
      latestVersion: latest,
      hasUpdate,
      isCrucialForZenPanel: true,
      changelogUrl: 'https://nodejs.org/en/blog/release',
      releaseDate: nodeStatus?.latestLts?.date,
      securityNotes: hasSec
        ? 'Phiên bản hiện tại có cảnh báo bảo mật hoặc thuộc nhánh EOL (như 21.x). Khuyên dùng nâng cấp lên LTS mới nhất.'
        : undefined,
      notes,
    };
  }

  // 2. Kiểm tra npm Package Manager
  private async checkNpm(): Promise<SystemToolItem> {
    let current: string | null = null;
    try {
      const { stdout } = await execAsync('npm -v', { timeout: 5000 });
      current = stdout.trim();
    } catch {
      current = null;
    }

    let latest: string | null = null;
    try {
      const res = await fetch('https://registry.npmjs.org/npm/latest', {
        headers: { 'User-Agent': 'ZenPanel' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        latest = data.version || null;
      }
    } catch {
      // offline fallback
    }

    const hasUpdate = isNewerVersion(current, latest);

    return {
      id: 'npm',
      name: 'npm (Node Package Manager)',
      category: 'package_manager',
      description: 'Trình quản lý gói thư viện dùng để cài đặt và cập nhật các mô-đun của ZenPanel',
      installed: current !== null,
      currentVersion: current ? `v${current.replace(/^v/, '')}` : null,
      latestVersion: latest ? `v${latest.replace(/^v/, '')}` : null,
      hasUpdate,
      isCrucialForZenPanel: true,
      changelogUrl: 'https://github.com/npm/cli/releases',
    };
  }

  // 3. Kiểm tra Git
  private async checkGit(): Promise<SystemToolItem> {
    let current: string | null = null;
    try {
      const { stdout } = await execAsync('git --version', { timeout: 5000 });
      const m = stdout.match(/(\d+\.\d+\.\d+)/);
      if (m) current = m[1];
    } catch {
      current = null;
    }

    let latest: string | null = null;
    try {
      const res = await fetch('https://api.github.com/repos/git-for-windows/git/releases/latest', {
        headers: { 'User-Agent': 'ZenPanel' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const tag = data.tag_name || '';
        const m = tag.match(/(\d+\.\d+\.\d+)/);
        if (m) latest = m[1];
      }
    } catch {
      // fallback
    }

    const hasUpdate = isNewerVersion(current, latest);

    return {
      id: 'git',
      name: 'Git Version Control',
      category: 'vcs',
      description: 'Công cụ đồng bộ mã nguồn, dùng để tải các bản cập nhật và sao lưu ZenPanel từ GitHub',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: latest ? `v${latest}` : null,
      hasUpdate,
      isCrucialForZenPanel: true,
      changelogUrl: 'https://github.com/git-for-windows/git/releases',
    };
  }

  // 4. Kiểm tra Cloudflared Tunnel
  private async checkCloudflared(): Promise<SystemToolItem> {
    let current: string | null = null;
    try {
      const { stdout } = await execAsync('cloudflared --version', { timeout: 5000 });
      const m = stdout.match(/(\d{4}\.\d+\.\d+)/);
      if (m) current = m[1];
    } catch {
      current = null;
    }

    let latest: string | null = null;
    try {
      const res = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', {
        headers: { 'User-Agent': 'ZenPanel' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const tag = (data.tag_name || '').replace(/^v/, '');
        const m = tag.match(/(\d{4}\.\d+\.\d+)/);
        if (m) latest = m[1];
      }
    } catch {
      // fallback
    }

    const hasUpdate = isNewerVersion(current, latest);

    return {
      id: 'cloudflared',
      name: 'Cloudflare Tunnel (cloudflared)',
      category: 'network',
      description: 'Cầu nối mạng an toàn cho phép truy cập ZenPanel từ xa qua internet mà không cần mở port',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: latest ? `v${latest}` : null,
      hasUpdate,
      isCrucialForZenPanel: false,
      changelogUrl: 'https://github.com/cloudflare/cloudflared/releases',
    };
  }

  // 5. Kiểm tra Docker
  private async checkDocker(): Promise<SystemToolItem> {
    let current: string | null = null;
    try {
      const { stdout } = await execAsync('docker --version', { timeout: 5000 });
      const m = stdout.match(/(\d+\.\d+\.\d+)/);
      if (m) current = m[1];
    } catch {
      current = null;
    }

    return {
      id: 'docker',
      name: 'Docker Engine',
      category: 'container',
      description: 'Nền tảng container hóa dùng để triển khai các ứng dụng App Store (MySQL, Nginx, Redis...)',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: null, // docker upgrade thường qua desktop hoặc package manager OS
      hasUpdate: false,
      isCrucialForZenPanel: false,
      notes: current ? 'Đang hoạt động trên hệ thống' : 'Chưa cài đặt (Tùy chọn)',
    };
  }

  /** Nâng cấp công cụ hệ thống cụ thể */
  async upgradeTool(id: string): Promise<JobView> {
    const status = await this.getStatus();
    const item = status.tools.find((t) => t.id === id);
    if (!item) {
      throw badRequest(`Không tìm thấy công cụ hệ thống: ${id}`);
    }

    if (!item.hasUpdate && item.installed) {
      throw badRequest(`${item.name} đã ở phiên bản mới nhất, không cần nâng cấp.`);
    }

    switch (id) {
      case 'node':
        cachedToolsStatus = null;
        nodeService.clearCache();
        return nodeService.upgrade(item.latestVersion || undefined);

      case 'npm':
        return this.upgradeNpm(item.latestVersion || 'latest');

      case 'git':
        return this.upgradeGit(item.latestVersion || 'latest');

      case 'cloudflared':
        return this.upgradeCloudflared();

      default:
        throw badRequest(`Chưa hỗ trợ tự động nâng cấp cho ${item.name}`);
    }
  }

  // Thực thi nâng cấp npm
  private async upgradeNpm(targetVer: string): Promise<JobView> {
    return startJob(`Nâng cấp npm lên ${targetVer}`, 'system_tool_upgrade', async () => {
      jobProgress(10, 'Chuẩn bị nâng cấp npm...');
      jobLog(`▶ Bắt đầu tiến trình nâng cấp npm package manager...`);
      jobLog(`- Phiên bản npm hiện tại: ${await execAsync('npm -v').then((r) => r.stdout.trim()).catch(() => 'unknown')}`);
      jobLog(`- Mục tiêu: npm@${targetVer}`);

      jobProgress(30, 'Đang tải và cài đặt npm mới...');
      const cmd = `npm install -g npm@latest`;
      jobLog(`Thực thi lệnh: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd, { timeout: 120_000 });
      if (stdout) jobLog(stdout);
      if (stderr) jobLog(stderr);

      jobProgress(80, 'Kiểm tra phiên bản mới sau khi nâng cấp...');
      const { stdout: newVer } = await execAsync('npm -v', { timeout: 10_000 });
      jobLog(`✓ Nâng cấp hoàn tất! Phiên bản npm mới: v${newVer.trim()}`);
      jobProgress(100, 'Nâng cấp npm thành công.');

      // Xóa cache trạng thái
      cachedToolsStatus = null;
    });
  }

  // Thực thi nâng cấp Git
  private async upgradeGit(targetVer: string): Promise<JobView> {
    return startJob(`Nâng cấp Git lên v${targetVer}`, 'system_tool_upgrade', async () => {
      jobProgress(10, 'Chuẩn bị nâng cấp Git...');
      jobLog(`▶ Bắt đầu tiến trình cập nhật Git...`);

      if (process.platform === 'win32') {
        jobProgress(30, 'Kiểm tra cơ chế nâng cấp Git trên Windows...');
        try {
          jobLog('Thử lệnh cập nhật chính thức của Git for Windows: git update-git-for-windows -y');
          const { stdout, stderr } = await execAsync('git update-git-for-windows -y', { timeout: 300_000 });
          if (stdout) jobLog(stdout);
          if (stderr) jobLog(stderr);
        } catch (err: any) {
          jobLog(`Lệnh update tích hợp báo: ${err.message}. Thử phương thức winget / tải trực tiếp...`);
          try {
            jobLog('Thực thi nâng cấp qua winget: winget upgrade Git.Git --silent');
            const { stdout } = await execAsync('winget upgrade Git.Git --silent --accept-source-agreements --accept-package-agreements', { timeout: 300_000 });
            if (stdout) jobLog(stdout);
          } catch (wingetErr: any) {
            jobLog(`Winget không khả dụng: ${wingetErr.message}`);
            throw new Error('Vui lòng tải bản cài đặt Git mới nhất tại https://git-scm.com/download/win hoặc chạy lệnh winget upgrade Git.Git');
          }
        }
      } else {
        // Linux
        jobProgress(30, 'Nâng cấp Git trên Linux qua apt-get...');
        jobLog('Thực thi: apt-get update && apt-get install --only-upgrade git -y');
        const { stdout } = await execAsync('apt-get update && apt-get install --only-upgrade git -y', { timeout: 120_000 });
        if (stdout) jobLog(stdout);
      }

      jobProgress(85, 'Kiểm tra phiên bản Git sau khi nâng cấp...');
      const { stdout: finalVer } = await execAsync('git --version');
      jobLog(`✓ Kết quả: ${finalVer.trim()}`);
      jobProgress(100, 'Nâng cấp Git thành công.');
      cachedToolsStatus = null;
    });
  }

  // Thực thi nâng cấp Cloudflared
  private async upgradeCloudflared(): Promise<JobView> {
    return startJob('Nâng cấp Cloudflare Tunnel (cloudflared)', 'system_tool_upgrade', async () => {
      jobProgress(10, 'Chuẩn bị nâng cấp cloudflared...');
      jobLog('▶ Bắt đầu tiến trình nâng cấp Cloudflare Tunnel client...');
      jobLog('Thực thi lệnh chính thức của Cloudflare: cloudflared update');

      jobProgress(40, 'Đang tải bản cập nhật cloudflared...');
      const { stdout, stderr } = await execAsync('cloudflared update', { timeout: 180_000 });
      if (stdout) jobLog(stdout);
      if (stderr) jobLog(stderr);

      jobProgress(85, 'Kiểm tra phiên bản cloudflared sau nâng cấp...');
      const { stdout: newVer } = await execAsync('cloudflared --version');
      jobLog(`✓ Phiên bản mới: ${newVer.trim()}`);
      jobProgress(100, 'Nâng cấp cloudflared thành công.');
      cachedToolsStatus = null;
    });
  }
}

export const systemToolsService = new SystemToolsService();
