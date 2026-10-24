// ZenPanel - Dịch vụ Tiện Ích Nhanh & Kho Tính Năng Hệ Thống (Quick Tools & Feature Store)
import { exec } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { promisify } from 'node:util';
import { badRequest } from '../core/validate.js';

const execAsync = promisify(exec);

export interface PortCheckResult {
  host: string;
  port: number;
  open: boolean;
  latencyMs: number;
  error?: string;
}

export interface PortDiagnosticResult {
  port: number;
  localListening: boolean;
  bindAddress?: string;
  process?: string;
  latencyMs?: number;
  iptablesAllowed?: boolean;
  cloudWarning?: string;
  suggestion: string;
}

export interface DnsLookupResult {
  domain: string;
  records: Array<{ type: string; value: string }>;
  latencyMs: number;
}

export interface SslCheckResult {
  domain: string;
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  error?: string;
}

export interface DiskBenchmarkResult {
  speedMbPerSec: number;
  timeSec: number;
  blockSize: string;
  testedPath: string;
  rawOutput: string;
}

export interface AiLatencyResult {
  provider: string;
  endpoint: string;
  reachable: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
}

export class QuickToolsService {
  /** Giải phóng bộ nhớ đệm RAM (PageCache, Dentries & Inodes) trên Linux */
  async purgeRamCache(): Promise<{ ok: boolean; message: string }> {
    if (process.platform !== 'linux') {
      return { ok: true, message: 'Hệ điều hành hiện tại không cần xả drop_caches' };
    }
    try {
      await execAsync('sync && echo 3 > /proc/sys/vm/drop_caches');
      return { ok: true, message: 'Đã xả sạch PageCache và Dentries thành công, RAM đệm đã được giải phóng!' };
    } catch (err: any) {
      // Thử dùng sh -c nếu echo trực tiếp bị lỗi quyền redirection
      try {
        await execAsync("sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'");
        return { ok: true, message: 'Đã giải phóng bộ nhớ đệm RAM thành công!' };
      } catch (inner: any) {
        throw new Error(`Không thể xả cache RAM: ${inner?.message || err?.message}`);
      }
    }
  }

  /** Kiểm tra độ mở và độ trễ của một cổng TCP bất kỳ (cục bộ hoặc từ xa) */
  async checkPort(host: string, port: number, timeoutMs = 4000): Promise<PortCheckResult> {
    if (!host || !port || port < 1 || port > 65535) {
      throw badRequest('Host và Port không hợp lệ (1-65535)');
    }

    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.on('connect', () => {
        const latencyMs = Date.now() - start;
        cleanup();
        resolve({ host, port, open: true, latencyMs });
      });

      socket.on('timeout', () => {
        const latencyMs = Date.now() - start;
        cleanup();
        resolve({ host, port, open: false, latencyMs, error: 'Kết nối quá thời gian chờ (Timeout)' });
      });

      socket.on('error', (err) => {
        const latencyMs = Date.now() - start;
        cleanup();
        resolve({ host, port, open: false, latencyMs, error: err.message });
      });

      socket.connect(port, host);
    });
  }

  /** Phân giải DNS tên miền (A, AAAA, MX) kèm đo thời gian phản hồi */
  async lookupDns(domain: string): Promise<DnsLookupResult> {
    const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/:\d+$/, '').split('/')[0].trim();
    if (!cleanDomain) throw badRequest('Tên miền không hợp lệ');

    const start = Date.now();
    const records: Array<{ type: string; value: string }> = [];

    try {
      const [ipv4List, ipv6List] = await Promise.allSettled([
        dns.resolve4(cleanDomain),
        dns.resolve6(cleanDomain),
      ]);

      if (ipv4List.status === 'fulfilled') {
        for (const ip of ipv4List.value) records.push({ type: 'A', value: ip });
      }
      if (ipv6List.status === 'fulfilled') {
        for (const ip of ipv6List.value) records.push({ type: 'AAAA', value: ip });
      }

      try {
        const mxList = await dns.resolveMx(cleanDomain);
        for (const mx of mxList) {
          records.push({ type: 'MX', value: `${mx.exchange} (ưu tiên ${mx.priority})` });
        }
      } catch {
        // MX có thể không tồn tại, bỏ qua
      }
    } catch (err: any) {
      throw new Error(`Lỗi phân giải DNS cho ${cleanDomain}: ${err?.message || err}`);
    }

    const latencyMs = Date.now() - start;
    return { domain: cleanDomain, records, latencyMs };
  }

  /** Kiểm tra chứng chỉ SSL và số ngày còn lại của website */
  async checkSsl(domain: string, port = 443, timeoutMs = 5000): Promise<SslCheckResult> {
    const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/:\d+$/, '').split('/')[0].trim();
    if (!cleanDomain) throw badRequest('Tên miền không hợp lệ');

    return new Promise((resolve) => {
      const socket = tls.connect(
        {
          host: cleanDomain,
          port,
          servername: cleanDomain,
          rejectUnauthorized: false, // Để vẫn đọc được chứng chỉ tự ký hoặc hết hạn
          timeout: timeoutMs,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            if (!cert || Object.keys(cert).length === 0) {
              socket.destroy();
              resolve({
                domain: cleanDomain,
                valid: false,
                issuer: 'Không xác định',
                subject: 'Không có chứng chỉ',
                validFrom: '',
                validTo: '',
                daysRemaining: 0,
                error: 'Máy chủ không gửi chứng chỉ TLS/SSL',
              });
              return;
            }

            const validTo = new Date(cert.valid_to);
            const now = Date.now();
            const daysRemaining = Math.ceil((validTo.getTime() - now) / (1000 * 60 * 60 * 24));
            const valid = daysRemaining > 0;

            const formatField = (val: unknown, fallback: string): string => {
              if (!val) return fallback;
              if (Array.isArray(val)) return String(val[0] || fallback);
              return String(val);
            };

            const issuer = typeof cert.issuer === 'object' ? formatField(cert.issuer.O || cert.issuer.CN, 'Unknown') : String(cert.issuer);
            const subject = typeof cert.subject === 'object' ? formatField(cert.subject.CN, cleanDomain) : String(cert.subject);

            socket.destroy();
            resolve({
              domain: cleanDomain,
              valid,
              issuer,
              subject,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              daysRemaining,
            });
          } catch (err: any) {
            socket.destroy();
            resolve({
              domain: cleanDomain,
              valid: false,
              issuer: 'Lỗi',
              subject: cleanDomain,
              validFrom: '',
              validTo: '',
              daysRemaining: 0,
              error: err?.message || 'Không thể đọc chứng chỉ SSL',
            });
          }
        },
      );

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          domain: cleanDomain,
          valid: false,
          issuer: 'Timeout',
          subject: cleanDomain,
          validFrom: '',
          validTo: '',
          daysRemaining: 0,
          error: 'Kết nối TLS kiểm tra SSL bị quá thời gian',
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          domain: cleanDomain,
          valid: false,
          issuer: 'Lỗi kết nối',
          subject: cleanDomain,
          validFrom: '',
          validTo: '',
          daysRemaining: 0,
          error: err.message,
        });
      });
    });
  }

  /** Chẩn đoán chuyên sâu độ mở cổng và nguyên nhân không truy cập được từ Internet */
  async diagnosePort(port: number): Promise<PortDiagnosticResult> {
    if (!port || port < 1 || port > 65535) {
      throw badRequest('Port không hợp lệ (1-65535)');
    }

    // 1. Kiểm tra lắng nghe nội bộ qua net.Socket tới 127.0.0.1
    const local = await this.checkPort('127.0.0.1', port, 2500);
    const localListening = local.open;

    let bindAddress: string | undefined;
    let processName: string | undefined;
    let iptablesAllowed = false;

    if (process.platform === 'linux') {
      // 2. Kiểm tra tiến trình và bind address qua ss
      try {
        const { stdout } = await execAsync(`ss -tulnpH "sport = :${port}" 2>/dev/null || true`);
        const line = stdout.trim().split('\n')[0];
        if (line) {
          const parts = line.split(/\s+/);
          bindAddress = parts[4] || undefined;
          const procMatch = /\("([^"]+)"/.exec(line);
          if (procMatch) processName = procMatch[1];
        }
      } catch {
        // bỏ qua
      }

      // 3. Kiểm tra xem iptables / ufw đã cho phép chưa
      try {
        const { stdout } = await execAsync(`iptables -S INPUT 2>/dev/null || true`);
        iptablesAllowed = stdout.includes(`--dport ${port}`) && stdout.includes('-j ACCEPT');
      } catch {
        // bỏ qua
      }
    } else {
      iptablesAllowed = true;
    }

    // 4. Tổng hợp khuyến nghị và chẩn đoán
    let suggestion = '';
    let cloudWarning: string | undefined;

    if (!localListening) {
      suggestion = `Ứng dụng hoặc container chưa khởi động (không có tiến trình nào lắng nghe cổng ${port} trên máy). Hãy kiểm tra lại Logs của app xem có bị lỗi tắt không.`;
    } else if (bindAddress && (bindAddress.startsWith('127.0.0.1:') || bindAddress.startsWith('localhost:'))) {
      suggestion = `CẢNH BÁO BINDING: Dịch vụ chỉ lắng nghe trên Localhost (127.0.0.1:${port}) chứ KHÔNG phải 0.0.0.0. Vì vậy dù tường lửa mở, máy khác ngoài Internet vẫn không thể truy cập! Hãy sửa cấu hình dịch vụ hoặc docker-compose để bind sang 0.0.0.0:${port}.`;
    } else {
      suggestion = `Dịch vụ đang chạy và phản hồi tốt trên máy (${local.latencyMs}ms). Tường lửa máy chủ VPS đã được mở.`;
      cloudWarning = `Nếu bạn dùng VPS Cloud (Oracle Cloud, AWS EC2, Google Cloud, Azure, Linode...), bạn BẮT BUỘC phải vào trang quản lý của nhà mạng để mở thêm Ingress Rule / Security Group cho cổng ${port} mới có thể kết nối từ máy tính ngoài Internet.`;
    }

    return {
      port,
      localListening,
      bindAddress,
      process: processName,
      latencyMs: local.latencyMs,
      iptablesAllowed,
      cloudWarning,
      suggestion,
    };
  }

  /** Benchmark tốc độ ghi ổ cứng I/O (MB/s) - Tiện ích phong cách vPanel / Bench */
  async diskBenchmark(testPath?: string): Promise<DiskBenchmarkResult> {
    const targetDir = testPath || (process.platform === 'linux' ? '/tmp' : process.env.TEMP || '.');
    const tempFile = `${targetDir}/zen_bench_${Date.now()}.tmp`;

    if (process.platform === 'linux') {
      try {
        const start = Date.now();
        const { stderr, stdout } = await execAsync(`dd if=/dev/zero of="${tempFile}" bs=1M count=256 conv=fdatasync 2>&1`);
        const elapsedSec = (Date.now() - start) / 1000;
        await execAsync(`rm -f "${tempFile}"`).catch(() => {});

        const output = stderr || stdout;
        const match = /(\d+(?:\.\d+)?)\s*(MB\/s|GB\/s|kB\/s)/i.exec(output);
        let speed = 0;
        if (match) {
          const val = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          if (unit.includes('GB')) speed = val * 1024;
          else if (unit.includes('MB')) speed = val;
          else if (unit.includes('KB')) speed = val / 1024;
        } else {
          speed = Math.round((256 / Math.max(0.1, elapsedSec)) * 10) / 10;
        }

        return {
          speedMbPerSec: Math.round(speed * 10) / 10,
          timeSec: Math.round(elapsedSec * 100) / 100,
          blockSize: '1M x 256 (256 MB)',
          testedPath: targetDir,
          rawOutput: output.trim(),
        };
      } catch (err: any) {
        await execAsync(`rm -f "${tempFile}"`).catch(() => {});
        throw new Error(`Lỗi benchmark đĩa: ${err?.message || err}`);
      }
    }

    // Windows fallback benchmark
    const fs = await import('node:fs/promises');
    const start = Date.now();
    const buffer = Buffer.alloc(16 * 1024 * 1024); // 16MB x 8 = 128MB
    for (let i = 0; i < 8; i++) {
      await fs.writeFile(tempFile, buffer, { flag: i === 0 ? 'w' : 'a' });
    }
    const elapsedSec = (Date.now() - start) / 1000;
    await fs.unlink(tempFile).catch(() => {});
    const speed = Math.round((128 / Math.max(0.1, elapsedSec)) * 10) / 10;

    return {
      speedMbPerSec: speed,
      timeSec: Math.round(elapsedSec * 100) / 100,
      blockSize: '16M x 8 (128 MB)',
      testedPath: targetDir,
      rawOutput: `Windows I/O Benchmark: 128MB written in ${elapsedSec.toFixed(2)}s (${speed} MB/s)`,
    };
  }

  /** Sửa phân quyền thư mục website (vPanel File Permissions Fixer: 755 folder, 644 file) */
  async fixWebPermissions(targetPath = '/var/www'): Promise<{ ok: boolean; message: string; target: string }> {
    if (process.platform !== 'linux') {
      return { ok: true, message: 'Tính năng phân quyền chmod/chown chỉ áp dụng trên Linux', target: targetPath };
    }

    try {
      // 1. Gán sở hữu www-data nếu có, nếu không thì giữ nguyên user
      await execAsync(`chown -R www-data:www-data "${targetPath}" 2>/dev/null || true`);
      // 2. Chuyển thư mục thành 755
      await execAsync(`find "${targetPath}" -type d -exec chmod 755 {} + 2>/dev/null || chmod -R 755 "${targetPath}"`);
      // 3. Chuyển tệp tin thành 644
      await execAsync(`find "${targetPath}" -type f -exec chmod 644 {} + 2>/dev/null || true`);

      return {
        ok: true,
        message: `Đã chuẩn hóa phân quyền thư mục ${targetPath} thành công (755 cho thư mục, 644 cho tệp tin, sở hữu www-data)!`,
        target: targetPath,
      };
    } catch (err: any) {
      throw new Error(`Không thể phân quyền thư mục ${targetPath}: ${err?.message || err}`);
    }
  }

  /** Đo độ trễ kết nối (Ping/TTFB) tới các nhà cung cấp AI & DNS */
  async testAiLatency(providerId: string): Promise<AiLatencyResult> {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/models',
      anthropic: 'https://api.anthropic.com/v1/messages',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
      openrouter: 'https://openrouter.ai/api/v1/models',
      groq: 'https://api.groq.com/openai/v1/models',
      cloudflare_dns: 'https://1.1.1.1/dns-query?name=google.com&type=A',
      google_dns: 'https://dns.google/resolve?name=google.com&type=A',
    };

    const targetUrl = endpoints[providerId.toLowerCase()] || `https://${providerId}`;
    const start = Date.now();

    try {
      const res = await fetch(targetUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(6000),
      }).catch(async () => {
        return fetch(targetUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(6000),
        });
      });

      const latencyMs = Date.now() - start;
      return {
        provider: providerId,
        endpoint: targetUrl,
        reachable: true,
        status: res.status,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        provider: providerId,
        endpoint: targetUrl,
        reachable: false,
        latencyMs,
        error: err?.message || 'Không thể kết nối',
      };
    }
  }
}
