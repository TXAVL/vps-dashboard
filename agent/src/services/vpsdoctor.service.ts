// ZenPanel - Dịch vụ Bác Sĩ VPS (VPS Doctor) & Tối ưu hóa tương thích toàn diện cho mọi loại VPS
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { AppContext } from '../core/context.js';
import { jobLog } from '../core/jobs.js';
import { badRequest } from '../core/validate.js';

const execAsync = promisify(exec);

export interface NetworkEndpointCheck {
  name: string;
  host: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface VpsDoctorReport {
  timestamp: string;
  os: {
    family: string;
    name: string;
    kernel: string;
    arch: string;
    hostname: string;
  };
  network: {
    publicIp: string | null;
    privateIps: string[];
    isBehindNat: boolean;
    ispInfo?: string;
  };
  memory: {
    totalRam: number;
    freeRam: number;
    usedRam: number;
    totalSwap: number;
    freeSwap: number;
    usedSwap: number;
    swapRecommended: boolean;
    swapAdvice?: string;
  };
  firewall: {
    backend: string;
    enabled: boolean;
    panelPortAllowed: boolean;
    sshPortAllowed: boolean;
    advice?: string;
  };
  networkConnectivity: NetworkEndpointCheck[];
  kernelOptimizations: {
    bbrEnabled: boolean;
    canEnableBbr: boolean;
  };
  score: number;
  recommendations: Array<{
    id: string;
    level: 'warning' | 'info' | 'success';
    title: string;
    desc: string;
    actionLabel?: string;
    actionEndpoint?: string;
  }>;
}

let cachedPublicIp: { ip: string; at: number } | null = null;

export class VpsDoctorService {
  constructor(private readonly ctx: AppContext) {}

  /** Lấy Public IPv4 thực tế của máy chủ từ các dịch vụ tin cậy */
  async getPublicIp(): Promise<string | null> {
    if (cachedPublicIp && Date.now() - cachedPublicIp.at < 10 * 60_000) {
      return cachedPublicIp.ip;
    }

    const providers = [
      'https://api.ipify.org',
      'https://icanhazip.com',
      'https://ifconfig.me/ip',
      'https://checkip.amazonaws.com',
    ];

    for (const url of providers) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'curl/7.88.1' },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const text = (await res.text()).trim();
          if (/^(\d{1,3}\.){3}\d{1,3}$/.test(text)) {
            cachedPublicIp = { ip: text, at: Date.now() };
            return text;
          }
        }
      } catch {
        // Thử provider tiếp theo
      }
    }
    return null;
  }

  /** Lấy danh sách IP Private của tất cả các interface mạng */
  getPrivateIps(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.family === 'IPv4') {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  /** Kiểm tra máy chủ có đang nằm sau NAT / Cloud 1:1 NAT hay không */
  isBehindNat(publicIp: string | null, privateIps: string[]): boolean {
    return Boolean(publicIp && !privateIps.includes(publicIp));
  }

  /** Kiểm tra swap memory */
  async getSwapInfo(): Promise<{ total: number; free: number; used: number }> {
    if (process.platform === 'win32') {
      return { total: 0, free: 0, used: 0 };
    }
    try {
      const meminfo = await readFile('/proc/meminfo', 'utf8');
      const getVal = (key: string) => {
        const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm').exec(meminfo);
        return match ? Number(match[1]) * 1024 : 0;
      };
      const total = getVal('SwapTotal');
      const free = getVal('SwapFree');
      return { total, free, used: total - free };
    } catch {
      return { total: 0, free: 0, used: 0 };
    }
  }

  /** Kiểm tra kết nối mạng quốc tế (GitHub, Docker Hub, Cloudflare, Google DNS) */
  async testNetworkConnectivity(): Promise<NetworkEndpointCheck[]> {
    const endpoints = [
      { name: 'Cloudflare DNS', host: '1.1.1.1', url: 'https://1.1.1.1' },
      { name: 'Google DNS', host: '8.8.8.8', url: 'https://8.8.8.8' },
      { name: 'GitHub API (Cập nhật & Repo)', host: 'api.github.com', url: 'https://api.github.com' },
      { name: 'Docker Hub Registry', host: 'registry-1.docker.io', url: 'https://registry-1.docker.io/v2/' },
    ];

    const results = await Promise.all(
      endpoints.map(async (ep) => {
        const start = Date.now();
        try {
          const res = await fetch(ep.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(4000),
          });
          const latencyMs = Date.now() - start;
          return {
            name: ep.name,
            host: ep.host,
            ok: res.status < 500,
            latencyMs,
          };
        } catch (err: any) {
          return {
            name: ep.name,
            host: ep.host,
            ok: false,
            latencyMs: Date.now() - start,
            error: err?.message || 'Không thể kết nối',
          };
        }
      })
    );
    return results;
  }

  /** Kiểm tra thuật toán tắc nghẽn TCP BBR */
  async checkBbr(): Promise<{ bbrEnabled: boolean; canEnableBbr: boolean }> {
    if (process.platform !== 'linux') {
      return { bbrEnabled: false, canEnableBbr: false };
    }
    try {
      const cc = await readFile('/proc/sys/net/ipv4/tcp_congestion_control', 'utf8').catch(() => '');
      const isBbr = cc.trim().includes('bbr');
      // Kiểm tra kernel release >= 4.9
      const release = os.release();
      const majorMinor = release.split('.').slice(0, 2).map(Number);
      const canEnable = (majorMinor[0] > 4 || (majorMinor[0] === 4 && majorMinor[1] >= 9)) && !isBbr;
      return { bbrEnabled: isBbr, canEnableBbr: canEnable };
    } catch {
      return { bbrEnabled: false, canEnableBbr: false };
    }
  }

  /** Chạy chẩn đoán toàn diện VPS Doctor */
  async diagnose(): Promise<VpsDoctorReport> {
    const [publicIp, swap, connectivity, bbr] = await Promise.all([
      this.getPublicIp(),
      this.getSwapInfo(),
      this.testNetworkConnectivity(),
      this.checkBbr(),
    ]);

    const privateIps = this.getPrivateIps();
    const isBehindNat = Boolean(publicIp && !privateIps.includes(publicIp));
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;

    // Kiểm tra firewall
    let firewallBackend = 'none';
    let firewallEnabled = false;
    let panelPortAllowed = true;
    let sshPortAllowed = true;

    try {
      const fwStatus = await this.ctx.adapter.getFirewallStatus();
      firewallBackend = fwStatus.backend;
      firewallEnabled = fwStatus.enabled;
      if (firewallEnabled) {
        const rules = await this.ctx.adapter.listFirewallRules();
        panelPortAllowed = rules.some((r) => r.action === 'allow' && (r.port === String(this.ctx.port) || r.port === 'all'));
        sshPortAllowed = rules.some((r) => r.action === 'allow' && (r.port === '22' || r.port === 'all'));
      }
    } catch {
      // Bỏ qua lỗi firewall
    }

    // Đánh giá khuyến nghị & tính điểm
    let score = 100;
    const recommendations: VpsDoctorReport['recommendations'] = [];

    // 1. Kiểm tra Swap
    const isLinux = process.platform === 'linux';
    const totalRamGb = totalRam / (1024 * 1024 * 1024);
    const swapRecommended = isLinux && totalRamGb <= 4 && swap.total < 1024 * 1024 * 1024;
    let swapAdvice: string | undefined;

    if (swapRecommended) {
      score -= 15;
      swapAdvice = `VPS có RAM ${totalRamGb.toFixed(1)} GB nhưng chưa có Swap (hoặc Swap < 1GB). Khuyên tạo 2GB Swap để chống tràn RAM khi chạy Docker/DB.`;
      recommendations.push({
        id: 'create-swap',
        level: 'warning',
        title: 'Chưa có bộ nhớ ảo Swap (Nguy cơ tràn RAM OOM Crash)',
        desc: swapAdvice,
        actionLabel: 'Tạo Swap 2GB 1-Click',
        actionEndpoint: '/api/system/vps-doctor/create-swap',
      });
    }

    // 2. Kiểm tra Firewall
    if (firewallEnabled && !panelPortAllowed) {
      score -= 20;
      recommendations.push({
        id: 'fix-panel-firewall',
        level: 'warning',
        title: `Tường lửa đang chặn cổng ZenPanel (${this.ctx.port})`,
        desc: `Tường lửa đang bật nhưng chưa có luật cho phép cổng ${this.ctx.port}. Có thể bị mất kết nối nếu truy cập trực tiếp bằng IP.`,
        actionLabel: 'Mở Cổng ZenPanel Ngay',
        actionEndpoint: '/api/system/vps-doctor/fix-firewall',
      });
    }

    // 3. Kiểm tra TCP BBR
    if (bbr.canEnableBbr) {
      score -= 5;
      recommendations.push({
        id: 'enable-bbr',
        level: 'info',
        title: 'Chưa kích hoạt thuật toán tăng tốc mạng TCP BBR của Google',
        desc: 'BBR giúp giảm độ trễ, tối ưu hóa băng thông tải trang web và SSE streaming cho AI Gateway tăng 20% - 50%.',
        actionLabel: 'Bật TCP BBR 1-Click',
        actionEndpoint: '/api/system/vps-doctor/enable-bbr',
      });
    }

    // 4. Kiểm tra Mạng Quốc tế
    const failedConns = connectivity.filter((c) => !c.ok);
    if (failedConns.length > 0) {
      score -= 15 * failedConns.length;
      recommendations.push({
        id: 'network-issues',
        level: 'warning',
        title: `Kết nối mạng quốc tế gặp trục trặc (${failedConns.map((c) => c.name).join(', ')})`,
        desc: 'VPS có thể bị nghẽn mạng quốc tế hoặc cấu hình DNS máy chủ (/etc/resolv.conf) phản hồi chậm.',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: 'all-good',
        level: 'success',
        title: 'Hệ thống VPS hoạt động xuất sắc!',
        desc: 'Mọi thiết lập mạng, bộ nhớ RAM, tường lửa và tối ưu hóa hệ điều hành đều đạt chuẩn cao nhất.',
      });
    }

    return {
      timestamp: new Date().toISOString(),
      os: {
        family: this.ctx.osInfo.family,
        name: this.ctx.osInfo.name,
        kernel: this.ctx.osInfo.kernel,
        arch: this.ctx.osInfo.arch,
        hostname: this.ctx.osInfo.hostname,
      },
      network: {
        publicIp,
        privateIps,
        isBehindNat,
      },
      memory: {
        totalRam,
        freeRam,
        usedRam,
        totalSwap: swap.total,
        freeSwap: swap.free,
        usedSwap: swap.used,
        swapRecommended,
        swapAdvice,
      },
      firewall: {
        backend: firewallBackend,
        enabled: firewallEnabled,
        panelPortAllowed,
        sshPortAllowed,
      },
      networkConnectivity: connectivity,
      kernelOptimizations: bbr,
      score: Math.max(10, Math.min(100, score)),
      recommendations,
    };
  }

  /** Tự động tạo và kích hoạt Swapfile (2GB hoặc 4GB) trên Linux */
  async createSwap(sizeGb = 2): Promise<void> {
    if (process.platform !== 'linux') {
      throw badRequest('Tính năng tạo Swap chỉ áp dụng cho hệ điều hành Linux');
    }

    jobLog(`Bắt đầu tạo Swapfile dung lượng ${sizeGb} GB...`);
    const swapPath = '/swapfile';

    try {
      // 1. Tắt swap cũ nếu có
      await execAsync('swapoff -a').catch(() => undefined);

      // 2. Cấp phát file dung lượng
      jobLog(`Đang cấp phát không gian ổ đĩa tại ${swapPath}...`);
      try {
        await execAsync(`fallocate -l ${sizeGb}G ${swapPath}`);
      } catch {
        // Fallback dùng dd nếu filesystem không hỗ trợ fallocate
        await execAsync(`dd if=/dev/zero of=${swapPath} bs=1M count=${sizeGb * 1024} status=progress`);
      }

      // 3. Phân quyền an toàn 600
      await execAsync(`chmod 600 ${swapPath}`);
      jobLog('✓ Đã thiết lập phân quyền an toàn 0600 cho swapfile');

      // 4. Định dạng mkswap
      await execAsync(`mkswap ${swapPath}`);
      jobLog('✓ Đã định dạng Swap thành công');

      // 5. Kích hoạt swapon
      await execAsync(`swapon ${swapPath}`);
      jobLog('✓ Đã kích hoạt Swap vào hệ thống Linux!');

      // 6. Ghi vào /etc/fstab để tự động kích hoạt khi reboot
      const fstab = await readFile('/etc/fstab', 'utf8').catch(() => '');
      if (!fstab.includes(swapPath)) {
        await writeFile('/etc/fstab', `${fstab.trimEnd()}\n${swapPath} none swap sw 0 0\n`);
        jobLog('✓ Đã lưu cấu hình vào /etc/fstab (tự bật khi khởi động lại VPS)');
      }

      // 7. Cấu hình swappiness hợp lý = 20
      await execAsync('sysctl vm.swappiness=20').catch(() => undefined);
      jobLog(`🎉 Tạo và kích hoạt thành công ${sizeGb} GB Swap!`);
    } catch (err: any) {
      jobLog(`✘ Lỗi khi tạo Swap: ${err?.message || err}`);
      throw err;
    }
  }

  /** Bật TCP BBR tăng tốc mạng cho Linux */
  async enableBbr(): Promise<void> {
    if (process.platform !== 'linux') {
      throw badRequest('Tính năng TCP BBR chỉ áp dụng cho Linux');
    }

    jobLog('Đang kiểm tra và kích hoạt thuật toán TCP BBR...');
    try {
      const sysctlConf = await readFile('/etc/sysctl.conf', 'utf8').catch(() => '');
      let updated = sysctlConf;
      if (!updated.includes('net.core.default_qdisc=fq')) {
        updated += '\nnet.core.default_qdisc=fq';
      }
      if (!updated.includes('net.ipv4.tcp_congestion_control=bbr')) {
        updated += '\nnet.ipv4.tcp_congestion_control=bbr';
      }
      await writeFile('/etc/sysctl.conf', `${updated.trim()}\n`);
      await execAsync('sysctl -p').catch(() => undefined);
      jobLog('✓ Đã kích hoạt thuật toán Google TCP BBR thành công!');
    } catch (err: any) {
      jobLog(`✘ Lỗi khi bật TCP BBR: ${err?.message || err}`);
      throw err;
    }
  }

  /** Tự động mở cổng ZenPanel và SSH trên Tường lửa */
  async fixFirewall(): Promise<void> {
    jobLog(`Đang thêm quy tắc cho phép cổng ZenPanel (${this.ctx.port}) và SSH (22)...`);
    await this.ctx.adapter.addFirewallRule({
      action: 'allow',
      port: String(this.ctx.port),
      protocol: 'tcp',
      source: null,
      description: 'ZenPanel Web Dashboard',
    });
    await this.ctx.adapter.addFirewallRule({
      action: 'allow',
      port: '22',
      protocol: 'tcp',
      source: null,
      description: 'SSH Remote Access',
    });
    jobLog('✓ Đã mở cổng thành công trên Tường lửa!');
  }
}
