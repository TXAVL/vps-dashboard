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
}
