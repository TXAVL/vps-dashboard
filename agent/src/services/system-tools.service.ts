// ZenPanel - Dịch vụ phát hiện, kiểm tra phiên bản & nâng cấp các công cụ hệ thống cần thiết cho ZenPanel
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { jobLog, jobProgress, startJob, type JobView } from '../core/jobs.js';
import { badRequest } from '../core/validate.js';
import { dataPath } from '../core/store.js';
import { nodeService } from './nodejs.service.js';

const execAsync = promisify(exec);

export interface SystemToolItem {
  id: string;
  name: string;
  category: 'runtime' | 'package_manager' | 'vcs' | 'network' | 'container' | 'webserver' | 'utility' | string;
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

/** Phân tách phiên bản thành các số semver [major, minor, patch] chuẩn xác, loại bỏ hậu tố build (.windows.1, -ubuntu...) */
export function parseSemverParts(v: string | null | undefined): number[] {
  if (!v) return [];
  const clean = v.trim().replace(/^v/i, '');
  const m = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [];
  return [
    Number.parseInt(m[1] || '0', 10),
    Number.parseInt(m[2] || '0', 10),
    Number.parseInt(m[3] || '0', 10),
  ];
}

/** So sánh phiên bản dạng X.Y.Z hoặc YYYY.M.D chuẩn */
export function isNewerVersion(currentVer: string | null, latestVer: string | null): boolean {
  if (!latestVer) return false;
  if (!currentVer) return true;

  const c = parseSemverParts(currentVer);
  const l = parseSemverParts(latestVer);

  if (l.length === 0) return false;
  if (c.length === 0) return true;

  for (let i = 0; i < 3; i++) {
    const cv = c[i] ?? 0;
    const lv = l[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
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

    const [
      nodeTool,
      npmTool,
      gitTool,
      cloudflaredTool,
      dockerTool,
      composeTool,
      webTool,
      pythonTool,
      curlTarTool,
    ] = await Promise.all([
      this.checkNode(forceRefresh),
      this.checkNpm(),
      this.checkGit(),
      this.checkCloudflared(),
      this.checkDocker(),
      this.checkCompose(),
      this.checkWebServer(),
      this.checkPython(),
      this.checkCurlTar(),
    ]);

    const tools: SystemToolItem[] = [
      nodeTool,
      npmTool,
      gitTool,
      cloudflaredTool,
      dockerTool,
      composeTool,
      webTool,
      pythonTool,
      curlTarTool,
    ];
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
    const runningVer = process.version; // vd: v22.10.0
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

  // 3. Kiểm tra Git Version Control
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
    let hasUpdate = false;

    if (process.platform === 'win32') {
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
      hasUpdate = isNewerVersion(current, latest);
    } else {
      // Linux: kiểm tra chính xác với package manager
      try {
        const { stdout: aptPolicy } = await execAsync('apt-cache policy git 2>/dev/null', { timeout: 5000 });
        const instMatch = aptPolicy.match(/Installed:\s*([^\s]+)/);
        const candMatch = aptPolicy.match(/Candidate:\s*([^\s]+)/);
        if (instMatch && candMatch) {
          const installedPkg = instMatch[1];
          const candidatePkg = candMatch[1];
          if (installedPkg === candidatePkg) {
            // Đã là bản mới nhất kho gói cung cấp
            latest = current;
            hasUpdate = false;
          } else {
            const candVerMatch = candidatePkg.match(/(\d+\.\d+\.\d+)/);
            latest = candVerMatch ? candVerMatch[1] : candidatePkg;
            hasUpdate = isNewerVersion(current, latest);
          }
        }
      } catch {
        // Không phải hệ thống APT
      }

      // Nếu chưa xác định được và chưa có update, kiểm tra qua git upstream
      if (!latest && current) {
        try {
          const res = await fetch('https://api.github.com/repos/git/git/tags?per_page=1', {
            headers: { 'User-Agent': 'ZenPanel' },
            signal: AbortSignal.timeout(6000),
          });
          if (res.ok) {
            const tags = (await res.json()) as any[];
            const tag = tags[0]?.name || '';
            const m = tag.match(/(\d+\.\d+\.\d+)/);
            if (m) {
              const upstream = m[1];
              // Trên Linux, chỉ báo hasUpdate khi thực sự có bản mới hơn
              if (isNewerVersion(current, upstream)) {
                latest = upstream;
                hasUpdate = true;
              } else {
                latest = current;
                hasUpdate = false;
              }
            }
          }
        } catch {}
      }
    }

    if (!latest && current) latest = current;

    return {
      id: 'git',
      name: 'Git Version Control',
      category: 'vcs',
      description: 'Công cụ đồng bộ mã nguồn, dùng để tải các bản cập nhật và sao lưu ZenPanel từ GitHub',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: latest ? `v${latest}` : null,
      hasUpdate: Boolean(hasUpdate && current && latest && isNewerVersion(current, latest)),
      isCrucialForZenPanel: true,
      changelogUrl: process.platform === 'win32' ? 'https://github.com/git-for-windows/git/releases' : 'https://github.com/git/git/releases',
    };
  }

  // 4. Kiểm tra Cloudflared Tunnel
  private async checkCloudflared(): Promise<SystemToolItem> {
    let current: string | null = null;
    let binaryPath = 'cloudflared';

    try {
      const { stdout } = await execAsync('cloudflared --version', { timeout: 5000 });
      const m = stdout.match(/(\d{4}\.\d+\.\d+)/);
      if (m) current = m[1];
    } catch {
      // Tìm trong thư mục bin cục bộ của ZenPanel
      try {
        const localBin = path.join(dataPath('bin'), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
        if (existsSync(localBin)) {
          binaryPath = localBin;
          const { stdout } = await execAsync(`"${localBin}" --version`, { timeout: 5000 });
          const m = stdout.match(/(\d{4}\.\d+\.\d+)/);
          if (m) current = m[1];
        }
      } catch {}
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
      notes: binaryPath !== 'cloudflared' ? 'Đang chạy từ bộ cài nội bộ ZenPanel' : undefined,
    };
  }

  // 5. Kiểm tra Docker Engine
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
      latestVersion: current ? `v${current}` : null,
      hasUpdate: false,
      isCrucialForZenPanel: false,
      notes: current ? 'Đang hoạt động trên hệ thống' : 'Chưa cài đặt (Cần cho các app container)',
      changelogUrl: 'https://docs.docker.com/engine/release-notes/',
    };
  }

  // 6. Kiểm tra Docker Compose
  private async checkCompose(): Promise<SystemToolItem> {
    let current: string | null = null;
    try {
      const { stdout } = await execAsync('docker compose version 2>/dev/null || docker-compose --version', { timeout: 5000 });
      const m = stdout.match(/(\d+\.\d+\.\d+)/);
      if (m) current = m[1];
    } catch {
      current = null;
    }

    return {
      id: 'compose',
      name: 'Docker Compose',
      category: 'container',
      description: 'Công cụ điều phối và quản lý multi-container cho các ứng dụng stack phức tạp',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: current ? `v${current}` : null,
      hasUpdate: false,
      isCrucialForZenPanel: false,
      notes: current ? 'Đang hoạt động trên hệ thống' : 'Chưa cài đặt',
      changelogUrl: 'https://docs.docker.com/compose/release-notes/',
    };
  }

  // 7. Kiểm tra Web Server (Caddy / Nginx)
  private async checkWebServer(): Promise<SystemToolItem> {
    let current: string | null = null;
    let name = 'Web Server (Caddy / Nginx)';
    let id: 'caddy' | 'nginx' | 'webserver' = 'webserver';

    try {
      const { stdout: caddyOut } = await execAsync('caddy version', { timeout: 5000 });
      const m = caddyOut.match(/v?(\d+\.\d+\.\d+)/);
      if (m) {
        current = m[1];
        name = 'Caddy Web Server';
        id = 'caddy';
      }
    } catch {}

    if (!current) {
      try {
        const { stderr: nginxOut } = await execAsync('nginx -v', { timeout: 5000 });
        const m = (nginxOut || '').match(/nginx\/(\d+\.\d+\.\d+)/);
        if (m) {
          current = m[1];
          name = 'Nginx Web Server';
          id = 'nginx';
        }
      } catch {}
    }

    return {
      id,
      name,
      category: 'webserver',
      description: 'Máy chủ Web HTTP/HTTPS và Reverse Proxy tự động cấp phát SSL Let\'s Encrypt',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: current ? `v${current}` : null,
      hasUpdate: false,
      isCrucialForZenPanel: false,
      notes: current ? `${name} đang sẵn sàng trên máy chủ` : 'Chưa cài đặt (ZenPanel tự quản lý)',
    };
  }

  // 8. Kiểm tra Python
  private async checkPython(): Promise<SystemToolItem> {
    let current: string | null = null;
    try {
      const { stdout } = await execAsync('python3 --version 2>/dev/null || python --version', { timeout: 5000 });
      const m = stdout.match(/(\d+\.\d+\.\d+)/);
      if (m) current = m[1];
    } catch {
      current = null;
    }

    return {
      id: 'python',
      name: 'Python Runtime',
      category: 'runtime',
      description: 'Môi trường thông dịch Python dùng cho các kịch bản tự động hóa, tác vụ nền và AI',
      installed: current !== null,
      currentVersion: current ? `v${current}` : null,
      latestVersion: current ? `v${current}` : null,
      hasUpdate: false,
      isCrucialForZenPanel: false,
      notes: current ? 'Đang hoạt động trên hệ thống' : 'Chưa cài đặt (Tùy chọn)',
      changelogUrl: 'https://www.python.org/downloads/',
    };
  }

  // 9. Kiểm tra Tiện ích hệ thống (cURL & Tar)
  private async checkCurlTar(): Promise<SystemToolItem> {
    let curlVer: string | null = null;
    let tarVer: string | null = null;
    try {
      const { stdout } = await execAsync('curl --version', { timeout: 5000 });
      const m = stdout.match(/curl\s+(\d+\.\d+\.\d+)/i);
      if (m) curlVer = m[1];
    } catch {}
    try {
      const { stdout } = await execAsync('tar --version', { timeout: 5000 });
      const m = stdout.match(/(\d+\.\d+(?:\.\d+)?)/);
      if (m) tarVer = m[1];
    } catch {}

    const installed = curlVer !== null || tarVer !== null;
    const parts: string[] = [];
    if (curlVer) parts.push(`curl v${curlVer}`);
    if (tarVer) parts.push(`tar v${tarVer}`);

    return {
      id: 'curl_tar',
      name: 'Tiện ích hệ thống (cURL & Tar)',
      category: 'utility',
      description: 'Bộ công cụ tải file mạng và nén/giải nén sao lưu dữ liệu cốt lõi của hệ thống',
      installed,
      currentVersion: parts.length > 0 ? parts.join(', ') : null,
      latestVersion: parts.length > 0 ? parts.join(', ') : null,
      hasUpdate: false,
      isCrucialForZenPanel: true,
      notes: installed ? 'Đã cài đặt sẵn trên máy' : 'Cần cài đặt để tải và giải nén sao lưu',
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
        jobProgress(30, 'Nâng cấp Git trên Linux...');
        try {
          const isUbuntu = await execAsync('[ -f /etc/os-release ] && grep -qi ubuntu /etc/os-release && echo "ubuntu" || echo "other"');
          if (isUbuntu.stdout.includes('ubuntu')) {
            jobLog('Phát hiện Ubuntu: Cấu hình official Git PPA để nhận bản mới nhất...');
            await execAsync('export DEBIAN_FRONTEND=noninteractive; apt-get update -y && apt-get install -y software-properties-common && add-apt-repository -y ppa:git-core/ppa && apt-get update -y && apt-get install -y git', { timeout: 180_000 }).catch(() => null);
          }
        } catch {}

        jobLog('Thực thi cập nhật qua trình quản lý gói hệ điều hành...');
        try {
          await execAsync('which apt-get >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade git || which dnf >/dev/null 2>&1 && dnf upgrade -y git || which yum >/dev/null 2>&1 && yum update -y git || which apk >/dev/null 2>&1 && apk add --upgrade git', { timeout: 180_000 });
        } catch (e: any) {
          jobLog(`Ghi nhận: ${e.message}`);
        }
      }

      jobProgress(85, 'Kiểm tra phiên bản Git sau khi nâng cấp...');
      const { stdout: finalVer } = await execAsync('git --version');
      jobLog(`✓ Kết quả phiên bản trên máy: ${finalVer.trim()}`);
      jobProgress(100, 'Nâng cấp Git hoàn tất.');
      cachedToolsStatus = null;
    });
  }

  // Thực thi nâng cấp Cloudflared
  private async upgradeCloudflared(): Promise<JobView> {
    return startJob('Nâng cấp Cloudflare Tunnel (cloudflared)', 'system_tool_upgrade', async () => {
      jobProgress(10, 'Chuẩn bị nâng cấp cloudflared...');
      jobLog('▶ Bắt đầu tiến trình nâng cấp Cloudflare Tunnel client...');

      let updated = false;
      try {
        jobLog('Thực thi lệnh nâng cấp chính thức: cloudflared update');
        const { stdout, stderr } = await execAsync('cloudflared update', { timeout: 180_000 });
        if (stdout) jobLog(stdout);
        if (stderr) jobLog(stderr);
        updated = true;
      } catch (err: any) {
        jobLog(`Lệnh cloudflared update báo: ${err.message}. Thử phương thức tải nhị phân trực tiếp...`);
      }

      if (!updated) {
        jobProgress(50, 'Đang tải bản cập nhật cloudflared từ GitHub...');
        const localBin = path.join(dataPath('bin'), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
        jobLog(`Ghi đè bản mới vào: ${localBin}`);
        // Tải qua curl
        const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
        const osName = process.platform === 'win32' ? 'windows' : 'linux';
        const ext = process.platform === 'win32' ? '.exe' : '';
        const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${osName}-${arch}${ext}`;
        jobLog(`Đang tải từ: ${url}`);
        if (process.platform === 'win32') {
          await execAsync(`powershell -NoProfile -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${localBin}' -UseBasicParsing"`, { timeout: 120_000 });
        } else {
          await execAsync(`curl -fsSL "${url}" -o "${localBin}" && chmod +x "${localBin}"`, { timeout: 120_000 });
        }
        jobLog(`✓ Đã tải và cập nhật nhị phân cloudflared mới thành công.`);
      }

      jobProgress(85, 'Kiểm tra phiên bản cloudflared sau nâng cấp...');
      const { stdout: newVer } = await execAsync('cloudflared --version').catch(async () => {
        const localBin = path.join(dataPath('bin'), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
        return execAsync(`"${localBin}" --version`);
      });
      jobLog(`✓ Phiên bản mới: ${newVer.trim()}`);
      jobProgress(100, 'Nâng cấp cloudflared hoàn tất.');
      cachedToolsStatus = null;
    });
  }
}

export const systemToolsService = new SystemToolsService();
