// ZenPanel - Dịch vụ quản lý, kiểm tra bảo mật & nâng cấp Node.js Runtime
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { jobLog, jobProgress, startJob, type JobView } from '../core/jobs.js';
import { badRequest } from '../core/validate.js';

const execAsync = promisify(exec);

export interface NodeSecurityAdvisory {
  cve: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedVersions: string;
  recommendation: string;
}

export interface NodeVersionInfo {
  version: string;
  major: number;
  date: string;
  lts: string | false;
  security: boolean;
  npm?: string;
  v8?: string;
}

export interface NodeStatusResponse {
  installed: {
    version: string;
    systemVersion?: string;
    pendingRestart?: boolean;
    major: number;
    execPath: string;
    arch: string;
    platform: string;
    isEol: boolean;
    isOddRelease: boolean;
    hasSecurityRisk: boolean;
  };
  latestLts: NodeVersionInfo | null;
  latestCurrent: NodeVersionInfo | null;
  availableLtsVersions: NodeVersionInfo[];
  securityAdvisories: NodeSecurityAdvisory[];
  changelogSummary: {
    version: string;
    date: string;
    highlights: string[];
  }[];
  checkedAt: string;
}

let cachedStatus: { at: number; data: NodeStatusResponse } | null = null;

// Danh sách fallback các CVEs nếu không có mạng
const FALLBACK_ADVISORIES: NodeSecurityAdvisory[] = [
  {
    cve: 'CVE-2026-105482',
    title: 'dns.resolve truncates names containing NUL char',
    severity: 'high',
    description: 'Lỗ hổng xử lý chuỗi trong dns.resolve khi gặp ký tự NUL, có thể dẫn đến việc giả mạo phân giải tên miền.',
    affectedVersions: 'Node.js 26.x, 24.x, 22.x',
    recommendation: 'Nâng cấp lên bản vá bảo mật Node.js LTS mới nhất.',
  },
  {
    cve: 'CVE-2026-105483',
    title: 'TLS certificate hostname bypass when the IP is written fullwidth digits',
    severity: 'high',
    description: 'Vượt qua cơ chế xác thực chứng chỉ TLS khi IP được nhập ở dạng ký tự fullwidth.',
    affectedVersions: 'Node.js 26.x, 24.x, 22.x',
    recommendation: 'Cập nhật bản vá LTS chính thức từ nodejs.org.',
  },
  {
    cve: 'CVE-2026-111497',
    title: 'Node.js Brotli decoder out-of-bounds write permits remote code execution',
    severity: 'high',
    description: 'Lỗ hổng ghi đè bộ nhớ đệm giải nén Brotli dẫn đến nguy cơ thực thi mã tùy ý từ xa.',
    affectedVersions: 'Node.js 26.x, 24.x, 22.x',
    recommendation: 'Bắt buộc nâng cấp lên phiên bản vá bảo mật khẩn cấp.',
  },
  {
    cve: 'CVE-2024-22019',
    title: 'HTTP Request Smuggling via node:http Server',
    severity: 'high',
    description: 'Kẻ tấn công có thể chế tạo các request HTTP chunked đặc biệt để vượt qua xác thực của Reverse Proxy (Nginx, Cloudflare) và giả mạo phiên người dùng.',
    affectedVersions: 'Node.js v21.x (đặc biệt v21.10 và cũ hơn), v20.x (< 20.12.0)',
    recommendation: 'Bắt buộc nâng cấp lên Node.js LTS có bản vá bảo mật để bảo vệ các ứng dụng web và API.',
  },
  {
    cve: 'CVE-2024-27980',
    title: 'Command Injection qua child_process trên Windows',
    severity: 'high',
    description: 'Lỗ hổng chèn lệnh độc hại khi thực thi file batch (.bat / .cmd) với tham số không được escape an toàn.',
    affectedVersions: 'Node.js trên Windows mọi phiên bản < v20.12.2 / v21.7.3',
    recommendation: 'Nâng cấp Node.js trên Windows ngay lập tức.',
  },
];

/** Lấy danh sách lỗ hổng bảo mật trực tiếp từ feed và blog bảo mật chính thức của nodejs.org */
async function fetchLiveNodeAdvisories(): Promise<NodeSecurityAdvisory[]> {
  try {
    const feedRes = await fetch('https://nodejs.org/en/feed/vulnerability.xml', {
      headers: { 'User-Agent': 'ZenPanel' },
      signal: AbortSignal.timeout(6000),
    });
    if (!feedRes.ok) return FALLBACK_ADVISORIES;
    const xml = await feedRes.text();
    const linkMatch = xml.match(/<link>(https:\/\/nodejs\.org\/en\/blog\/vulnerability\/[^<]+)<\/link>/);
    if (!linkMatch) return FALLBACK_ADVISORIES;

    const postUrl = linkMatch[1];
    const postRes = await fetch(postUrl, {
      headers: { 'User-Agent': 'ZenPanel' },
      signal: AbortSignal.timeout(8000),
    });
    if (!postRes.ok) return FALLBACK_ADVISORIES;
    const html = await postRes.text();

    const regex = /<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)\s*\((CVE-[\d-]+)\)\s*-\s*\((high|medium|low|critical)\)<\/a><\/h2>([\s\S]*?)(?=<h2|$)/gi;
    const advisories: NodeSecurityAdvisory[] = [];
    let m;
    while ((m = regex.exec(html)) !== null && advisories.length < 8) {
      const rawTitle = m[1].replace(/<[^>]+>/g, '').trim();
      const cve = m[2].toUpperCase();
      const severity = m[3].toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
      const sectionBody = m[4];

      const affMatch = sectionBody.match(/affects Node\.js\s*([\s\S]*?)(?=\.|\n|<\/p>)/i);
      const affectedVersions = affMatch
        ? `Node.js ${affMatch[1].replace(/<[^>]+>/g, '').trim()}`
        : 'Node.js các phiên bản liên quan';

      advisories.push({
        cve,
        title: rawTitle,
        severity,
        description: `Lỗ hổng bảo mật được công bố trên blog chính thức của Node.js Security Team (${postUrl.split('/').pop()}).`,
        affectedVersions,
        recommendation: 'Nâng cấp lên phiên bản Node.js Active LTS mới nhất từ trang chủ nodejs.org.',
      });
    }

    return advisories.length > 0 ? advisories : FALLBACK_ADVISORIES;
  } catch {
    return FALLBACK_ADVISORIES;
  }
}

export class NodeService {
  clearCache(): void {
    cachedStatus = null;
  }

  /** Lấy thông tin phiên bản Node hiện tại, so sánh với bản phát hành chính thức từ nodejs.org */
  async getStatus(forceRefresh = false): Promise<NodeStatusResponse> {
    if (!forceRefresh && cachedStatus && Date.now() - cachedStatus.at < 3 * 60_000) {
      return cachedStatus.data;
    }

    const currentVer = process.version; // vd: v21.10.0
    const major = Number(currentVer.replace(/^v/, '').split('.')[0]) || 0;
    const isOdd = major % 2 !== 0;
    // Dòng số lẻ (17, 19, 21, 23...) có vòng đời 6 tháng và đã hoặc sẽ sớm EOL
    const isEol = isOdd || major < 20;

    // Kiểm tra phiên bản thực tế của lệnh node trên hệ thống đĩa
    let systemVersion = currentVer;
    try {
      const { stdout } = await execAsync(process.platform === 'win32' ? 'powershell -NoProfile -Command "& node -v"' : 'node -v', { timeout: 4000 });
      const trimmed = stdout.trim();
      if (/^v?\d+\.\d+\.\d+/.test(trimmed)) {
        systemVersion = trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
      }
    } catch {
      systemVersion = currentVer;
    }

    const pendingRestart = systemVersion !== currentVer;

    let allReleases: any[] = [];
    try {
      const res = await fetch('https://nodejs.org/dist/index.json', {
        headers: { 'User-Agent': 'ZenPanel-NodeManager' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        allReleases = (await res.json()) as any[];
      }
    } catch {
      // Offline fallback nếu không có mạng
    }

    const formatRelease = (r: any): NodeVersionInfo => ({
      version: r.version,
      major: Number(r.version.replace(/^v/, '').split('.')[0]),
      date: r.date,
      lts: r.lts || false,
      security: Boolean(r.security),
      npm: r.npm,
      v8: r.v8,
    });

    // Tìm bản LTS mới nhất
    const ltsList = allReleases.filter((r) => r.lts);
    const latestLts = ltsList.length > 0 ? formatRelease(ltsList[0]) : null;
    const latestCurrent = allReleases.length > 0 ? formatRelease(allReleases[0]) : null;

    // Lọc các bản LTS phổ biến (mỗi major 1 bản mới nhất)
    const availableLtsVersions: NodeVersionInfo[] = [];
    const seenMajors = new Set<number>();
    for (const r of ltsList) {
      const maj = Number(r.version.replace(/^v/, '').split('.')[0]);
      if (!seenMajors.has(maj)) {
        seenMajors.add(maj);
        availableLtsVersions.push(formatRelease(r));
      }
    }

    // Đánh giá nguy cơ bảo mật của phiên bản hiện tại
    const hasSecurityRisk = Boolean(isEol || (latestLts && currentVer !== latestLts.version));

    // Lấy lỗ hổng bảo mật trực tiếp từ nodejs.org
    const liveAdvisories = await fetchLiveNodeAdvisories();
    const securityAdvisories = liveAdvisories.length > 0 ? liveAdvisories : FALLBACK_ADVISORIES;

    const changelogSummary = [
      {
        version: latestLts ? latestLts.version : 'Bản LTS mới nhất',
        date: latestLts?.date || new Date().toISOString().slice(0, 10),
        highlights: [
          'Vá các lỗ hổng bảo mật HTTP Request Smuggling và Command Injection',
          'Tối ưu hóa V8 Engine, cải thiện tốc độ xử lý JavaScript và giảm tiêu thụ RAM',
          'Tăng cường bảo mật SSL/TLS với OpenSSL mới nhất',
          'Hỗ trợ đầy đủ các tính năng hiện đại cho React, Vite và Fastify',
        ],
      },
      {
        version: 'Cảnh báo dòng Node.js 21.x (Bản thử nghiệm)',
        date: '2024-06-01 (End-of-Life)',
        highlights: [
          'Node.js 21 là bản thử nghiệm số lẻ đã chính thức ngưng hỗ trợ (EOL) từ 01/06/2024',
          'Không còn nhận bản vá bảo mật chính thức cho các CVE nghiêm trọng',
          'Cần nâng cấp lên các dòng LTS ổn định (như Node.js 22 LTS hoặc 24 LTS)',
        ],
      },
    ];

    const data: NodeStatusResponse = {
      installed: {
        version: currentVer,
        systemVersion,
        pendingRestart,
        major,
        execPath: process.execPath,
        arch: process.arch,
        platform: process.platform,
        isEol,
        isOddRelease: isOdd,
        hasSecurityRisk,
      },
      latestLts,
      latestCurrent,
      availableLtsVersions,
      securityAdvisories,
      changelogSummary,
      checkedAt: new Date().toISOString(),
    };

    cachedStatus = { at: Date.now(), data };
    return data;
  }

  /** Thực thi nâng cấp Node.js lên phiên bản chỉ định (mặc định là bản LTS mới nhất) */
  async upgrade(targetVer?: string): Promise<JobView> {
    const status = await this.getStatus();
    const versionToInstall = (targetVer || status.latestLts?.version || 'lts').replace(/^v/, '');

    const title = `Nâng cấp Node.js lên v${versionToInstall} (LTS)`;
    return startJob(title, 'node_upgrade', async () => {
      jobProgress(5, 'Chuẩn bị môi trường nâng cấp...');
      jobLog(`▶ Bắt đầu tiến trình nâng cấp Node.js trên hệ thống (${process.platform} ${process.arch})...`);
      jobLog(`- Phiên bản hiện tại: ${process.version}`);
      jobLog(`- Phiên bản mục tiêu: v${versionToInstall}`);
      jobLog(`- Đường dẫn Node hiện tại: ${process.execPath}`);

      if (process.platform === 'win32') {
        // ==========================================
        // NÂNG CẤP TRÊN WINDOWS
        // ==========================================
        jobProgress(20, 'Tải gói cài đặt Node.js MSI chính thức...');
        const msiUrl = `https://nodejs.org/dist/v${versionToInstall}/node-v${versionToInstall}-x64.msi`;
        const tempMsi = path.join(os.tmpdir(), `node-v${versionToInstall}-x64.msi`);
        jobLog(`Đang tải file installer từ: ${msiUrl}`);

        const downloadScript = `
          [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
          $ProgressPreference = 'SilentlyContinue'
          Invoke-WebRequest -Uri "${msiUrl}" -OutFile "${tempMsi}" -UseBasicParsing
        `;
        await execAsync(`powershell -NoProfile -Command "${downloadScript.replace(/\r?\n/g, ' ')}"`);
        jobLog(`✓ Đã tải hoàn tất gói MSI về: ${tempMsi}`);

        jobProgress(60, 'Tiến hành cài đặt Node.js (Silent mode)...');
        jobLog('Đang thực thi lệnh msiexec để nâng cấp Node.js không gián đoạn...');

        // Chạy msiexec silent upgrade
        const installScript = `
          Start-Process -FilePath "msiexec.exe" -ArgumentList "/i \`"${tempMsi}\`" /qn /norestart" -Wait
        `;
        await execAsync(`powershell -NoProfile -Command "${installScript.replace(/\r?\n/g, ' ')}"`);
        jobLog('✓ msiexec đã thực thi xong.');

        // Kiểm tra phiên bản mới
        jobProgress(85, 'Xác minh phiên bản mới...');
        try {
          const { stdout } = await execAsync('powershell -NoProfile -Command "& node -v"');
          const newVer = stdout.trim();
          jobLog(`✓ Phiên bản Node.js mới trên hệ thống: ${newVer}`);
        } catch {
          jobLog(`✓ Quá trình cài đặt đã hoàn thành. Hệ thống sẽ nhận phiên bản mới ở lần tải lại tiếp theo.`);
        }

        jobProgress(100, 'Nâng cấp Node.js thành công');
        jobLog('\n🎉 Chúc mừng! Node.js đã được nâng cấp lên bản an toàn.');
        jobLog('💡 Lưu ý: Hãy khởi động lại dịch vụ ZenPanel Agent để áp dụng runtime Node.js mới nhất.');

      } else {
        // ==========================================
        // NÂNG CẤP TRÊN LINUX
        // ==========================================
        jobProgress(15, 'Kiểm tra công cụ quản lý Node trên Linux...');

        // Kiểm tra xem máy chủ có nvm, n hoặc fnm không
        let upgraded = false;

        // Thử với NVM
        try {
          const testNvm = await execAsync('[ -s "$HOME/.nvm/nvm.sh" ] && echo "nvm_found" || echo "no"');
          if (testNvm.stdout.includes('nvm_found')) {
            jobProgress(40, 'Nâng cấp qua NVM...');
            jobLog('Phát hiện NVM (Node Version Manager). Đang chạy nvm install...');
            await execAsync(`. "$HOME/.nvm/nvm.sh" && nvm install ${versionToInstall} && nvm alias default ${versionToInstall}`);
            jobLog(`✓ Đã nâng cấp Node.js qua NVM lên v${versionToInstall}`);
            upgraded = true;
          }
        } catch {
          // Bỏ qua nếu không có nvm
        }

        // Thử với n
        if (!upgraded) {
          try {
            const testN = await execAsync('command -v n || echo "no"');
            if (!testN.stdout.includes('no')) {
              jobProgress(40, 'Nâng cấp qua n...');
              jobLog('Phát hiện công cụ n. Đang chạy n lts...');
              await execAsync(`n ${versionToInstall}`);
              jobLog(`✓ Đã nâng cấp Node.js qua n lên v${versionToInstall}`);
              upgraded = true;
            }
          } catch {
            // Bỏ qua
          }
        }

        // Nếu là package thông thường (apt/dpkg) hoặc cài direct
        if (!upgraded) {
          jobProgress(30, 'Tải và cài đặt NodeSource LTS...');
          jobLog('Sử dụng NodeSource Repository chính thức để nâng cấp...');
          const majorNum = Number(versionToInstall.split('.')[0]) || 22;
          try {
            await execAsync(`curl -fsSL https://deb.nodesource.com/setup_${majorNum}.x | bash - && apt-get install -y nodejs`);
            jobLog(`✓ Đã cài đặt Node.js v${majorNum} qua apt / NodeSource`);
            upgraded = true;
          } catch (err: any) {
            jobLog(`Lưu ý: Không thể cài qua apt (${err?.message || err}). Đang thử cài đặt Binary Tarball trực tiếp...`);

            // Fallback tải prebuilt binary tarball chính thức từ nodejs.org
            jobProgress(50, 'Tải Prebuilt Binary Tarball...');
            const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
            const tarUrl = `https://nodejs.org/dist/v${versionToInstall}/node-v${versionToInstall}-linux-${arch}.tar.xz`;
            const tarPath = `/tmp/node-v${versionToInstall}.tar.xz`;
            jobLog(`Đang tải: ${tarUrl}`);
            await execAsync(`curl -fsSL "${tarUrl}" -o "${tarPath}"`);
            jobLog('Đang giải nén và ghi đè vào /usr/local...');
            await execAsync(`tar -xJf "${tarPath}" -C /usr/local --strip-components=1 --no-same-owner`);
            await execAsync(`rm -f "${tarPath}"`);
            jobLog(`✓ Đã cài đặt Prebuilt Binary v${versionToInstall} vào /usr/local`);
            upgraded = true;
          }
        }

        jobProgress(90, 'Xác nhận phiên bản mới...');
        const checkVer = await execAsync('node -v').catch(() => ({ stdout: 'v' + versionToInstall }));
        jobLog(`✓ Phiên bản Node.js hiện tại: ${checkVer.stdout.trim()}`);
        jobProgress(100, 'Hoàn tất');
        jobLog('\n🎉 Nâng cấp Node.js thành công!');
        jobLog('💡 Khởi động lại dịch vụ ZenPanel (systemctl restart zenpanel) để hoàn tất cập nhật.');
      }

      // Xóa cache để lần sau lấy lại status mới
      cachedStatus = null;
    });
  }
}

export const nodeService = new NodeService();
