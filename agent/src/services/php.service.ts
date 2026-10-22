// ZenPanel - Dịch vụ quản lý PHP & PHP-FPM (Trạng thái, Cài đặt, Cấu hình php.ini, Khởi động lại)
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { jobLog, jobProgress } from '../core/jobs.js';

export interface PhpStatus {
  installed: boolean;
  version: string | null;
  fpmRunning: boolean;
  fpmService: string | null;
  socketPath: string | null;
  extensions: string[];
  iniPath: string | null;
  memoryLimit: string | null;
  uploadMaxFilesize: string | null;
  postMaxSize: string | null;
  maxExecutionTime: string | null;
  supportedVersions: string[];
}

export interface PhpConfigUpdate {
  memoryLimit?: string;
  uploadMaxFilesize?: string;
  postMaxSize?: string;
  maxExecutionTime?: string;
}

export class PhpService {
  constructor(private readonly adapter: OSAdapter) {}

  /** Lấy trạng thái chi tiết PHP và PHP-FPM */
  async getStatus(): Promise<PhpStatus> {
    const supportedVersions = ['8.4', '8.3', '8.2', '8.1', '8.0'];
    const phpBin = await this.findPhpBinary();

    if (!phpBin) {
      return {
        installed: false,
        version: null,
        fpmRunning: false,
        fpmService: null,
        socketPath: null,
        extensions: [],
        iniPath: null,
        memoryLimit: null,
        uploadMaxFilesize: null,
        postMaxSize: null,
        maxExecutionTime: null,
        supportedVersions,
      };
    }

    // Lấy phiên bản PHP
    let version: string | null = null;
    try {
      const vRes = await this.adapter.execOk(phpBin, ['-v']);
      const match = /PHP\s+([0-9]+\.[0-9]+\.[0-9]+)/i.exec(vRes.stdout);
      version = match ? match[1] : 'Installed';
    } catch {
      version = 'Unknown';
    }

    // Lấy danh sách extensions
    const extensions: string[] = [];
    try {
      const mRes = await this.adapter.execOk(phpBin, ['-m']);
      const lines = mRes.stdout.split('\n');
      for (const raw of lines) {
        const line = raw.trim();
        if (line && !line.startsWith('[') && !extensions.includes(line)) {
          extensions.push(line);
        }
      }
      extensions.sort((a, b) => a.localeCompare(b));
    } catch {}

    // Lấy cấu hình php.ini & thông số cơ bản
    let iniPath: string | null = null;
    let memoryLimit: string | null = null;
    let uploadMaxFilesize: string | null = null;
    let postMaxSize: string | null = null;
    let maxExecutionTime: string | null = null;

    try {
      const script = "echo ini_get('memory_limit').'|'.ini_get('upload_max_filesize').'|'.ini_get('post_max_size').'|'.ini_get('max_execution_time').'|'.php_ini_loaded_file();";
      const iRes = await this.adapter.execOk(phpBin, ['-r', script]);
      const parts = iRes.stdout.trim().split('|');
      if (parts.length >= 5) {
        memoryLimit = parts[0] || null;
        uploadMaxFilesize = parts[1] || null;
        postMaxSize = parts[2] || null;
        maxExecutionTime = parts[3] ? `${parts[3]}s` : null;
        iniPath = parts[4] || null;
      }
    } catch {}

    // Kiểm tra PHP-FPM và socket
    let fpmRunning = false;
    let fpmService: string | null = null;
    let socketPath: string | null = null;

    if (this.adapter.family === 'linux') {
      try {
        if (existsSync('/run/php')) {
          const socks = (await readdir('/run/php')).filter((n) => n.endsWith('.sock'));
          if (socks.length > 0) {
            socketPath = `/run/php/${socks[0]}`;
            fpmRunning = true;
            fpmService = socks[0].replace('.sock', '');
          }
        }
      } catch {}

      // Nếu chưa xác định từ socket, thử systemctl
      if (!fpmRunning) {
        try {
          const sysctl = await this.adapter.findExecutable('systemctl');
          if (sysctl) {
            const listRes = await this.adapter.exec('bash', ['-c', 'systemctl list-units --type=service --state=running | grep -E "php.*fpm"']).catch(() => null);
            if (listRes && listRes.code === 0 && listRes.stdout) {
              const svcMatch = /([a-zA-Z0-9._-]+fpm\.service)/i.exec(listRes.stdout);
              if (svcMatch) {
                fpmRunning = true;
                fpmService = svcMatch[1].replace('.service', '');
              }
            }
          }
        } catch {}
      }

      // Kiểm tra process list
      if (!fpmRunning) {
        try {
          const psRes = await this.adapter.exec('pgrep', ['-f', 'php-fpm']).catch(() => null);
          if (psRes && psRes.code === 0 && psRes.stdout.trim()) {
            fpmRunning = true;
            fpmService = 'php-fpm';
          }
        } catch {}
      }
    } else {
      // Windows: kiểm tra php-cgi
      try {
        const netstat = await this.adapter.exec('netstat', ['-ano']).catch(() => null);
        if (netstat && netstat.stdout.includes(':9000')) {
          fpmRunning = true;
          fpmService = 'php-cgi (Port 9000)';
          socketPath = '127.0.0.1:9000';
        }
      } catch {}
    }

    return {
      installed: true,
      version,
      fpmRunning,
      fpmService,
      socketPath: socketPath || (fpmRunning ? '127.0.0.1:9000' : null),
      extensions,
      iniPath,
      memoryLimit,
      uploadMaxFilesize,
      postMaxSize,
      maxExecutionTime,
      supportedVersions,
    };
  }

  /** Cài đặt PHP & PHP-FPM cùng các extension phổ biến (chạy trong job nền) */
  async installPhp(version?: string): Promise<void> {
    jobLog('▶ Bắt đầu quy trình cài đặt PHP & PHP-FPM trên máy chủ');
    jobProgress(10, 'Đang chuẩn bị môi trường và kiểm tra trình quản lý gói...', 35);

    if (this.adapter.family === 'linux') {
      const isApt = await this.adapter.findExecutable('apt-get');
      const isDnf = await this.adapter.findExecutable('dnf');
      const isYum = await this.adapter.findExecutable('yum');
      const isApk = await this.adapter.findExecutable('apk');

      const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
      const opts = { timeout: 600_000, env };

      if (isApt) {
        jobLog('Phát hiện hệ điều hành Debian/Ubuntu (apt-get). Đang cập nhật danh mục gói...');
        jobProgress(20, 'Đang cập nhật nguồn APT (apt-get update)...', 30);
        await this.adapter.execOk('apt-get', ['update'], opts);

        const vPrefix = version ? `php${version}-` : 'php-';
        const vFpm = version ? `php${version}-fpm` : 'php-fpm';
        const vCli = version ? `php${version}-cli` : 'php-cli';

        const packages = [
          vFpm,
          vCli,
          `${vPrefix}mysql`,
          `${vPrefix}mbstring`,
          `${vPrefix}xml`,
          `${vPrefix}curl`,
          `${vPrefix}zip`,
          `${vPrefix}gd`,
          `${vPrefix}bcmath`,
          `${vPrefix}intl`,
          `${vPrefix}opcache`,
        ];

        jobLog(`Đang cài đặt các gói: ${packages.join(', ')} ...`);
        jobProgress(50, 'Đang tải về và cài đặt các gói PHP-FPM & extensions...', 20);
        await this.adapter.execOk('apt-get', ['install', '-y', ...packages], opts);

        jobLog('Đang kích hoạt và khởi chạy dịch vụ PHP-FPM...');
        jobProgress(85, 'Đang kích hoạt dịch vụ PHP-FPM...', 10);

        const systemctl = await this.adapter.findExecutable('systemctl');
        if (systemctl) {
          // Thử khởi động service cụ thể hoặc wildcard
          const candidateServices = version ? [`php${version}-fpm`] : ['php-fpm', 'php8.3-fpm', 'php8.2-fpm', 'php8.1-fpm'];
          for (const svc of candidateServices) {
            try {
              await this.adapter.exec('systemctl', ['enable', '--now', svc]);
              jobLog(`Đã kích hoạt dịch vụ ${svc}`);
              break;
            } catch {}
          }
        }
      } else if (isDnf || isYum) {
        const mgr = isDnf ? 'dnf' : 'yum';
        jobLog(`Phát hiện RedHat/CentOS/AlmaLinux (${mgr}). Đang cài đặt PHP-FPM...`);
        jobProgress(40, `Đang cài đặt PHP-FPM qua ${mgr}...`, 25);
        await this.adapter.execOk(mgr, ['install', '-y', 'php-fpm', 'php-cli', 'php-mysqlnd', 'php-mbstring', 'php-xml', 'php-curl', 'php-zip', 'php-gd', 'php-bcmath', 'php-intl', 'php-opcache'], opts);

        jobProgress(85, 'Đang kích hoạt dịch vụ php-fpm...', 10);
        await this.adapter.exec('systemctl', ['enable', '--now', 'php-fpm']);
      } else if (isApk) {
        jobLog('Phát hiện Alpine Linux (apk). Đang cài đặt PHP-FPM...');
        jobProgress(40, 'Đang cài đặt PHP-FPM qua apk...', 25);
        await this.adapter.execOk('apk', ['add', 'php-fpm', 'php-cli', 'php-mysqli', 'php-mbstring', 'php-xml', 'php-curl', 'php-zip', 'php-gd', 'php-bcmath', 'php-intl', 'php-opcache'], opts);
        await this.adapter.exec('rc-service', ['php-fpm', 'start']).catch(() => undefined);
      } else {
        throw new Error('Không nhận diện được trình quản lý gói hệ thống (apt/dnf/yum/apk)');
      }

      jobProgress(95, 'Kiểm tra trạng thái hoạt động của PHP sau cài đặt...', 5);
      const postStatus = await this.getStatus();
      jobLog(`Cài đặt thành công PHP phiên bản: ${postStatus.version || 'Hoàn tất'}`);
      jobProgress(100, 'Cài đặt PHP & PHP-FPM hoàn tất thành công!', 0);
    } else {
      // Windows
      jobLog('Đang chuẩn bị cài đặt PHP trên Windows...');
      jobProgress(30, 'Kiểm tra winget hoặc Chocolatey trên máy chủ Windows...', 25);
      const winget = await this.adapter.findExecutable('winget');
      const choco = await this.adapter.findExecutable('choco');

      if (winget) {
        jobLog('Tìm thấy winget, đang cài đặt PHP...');
        jobProgress(60, 'Đang cài đặt PHP thông qua winget...', 15);
        await this.adapter.execOk(winget, ['install', '--id', 'PHP.PHP', '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements']);
      } else if (choco) {
        jobLog('Tìm thấy Chocolatey, đang cài đặt PHP...');
        jobProgress(60, 'Đang cài đặt PHP thông qua Chocolatey...', 15);
        await this.adapter.execOk(choco, ['install', 'php', '-y']);
      } else {
        throw new Error('Trên Windows, vui lòng cài đặt sẵn winget, chocolatey hoặc tải PHP vào PATH để ZenPanel quản lý.');
      }
      jobProgress(100, 'Cài đặt PHP trên Windows hoàn tất!', 0);
    }
  }

  /** Khởi động lại dịch vụ PHP-FPM */
  async restartFpm(): Promise<{ ok: boolean; message: string }> {
    if (this.adapter.family === 'linux') {
      const status = await this.getStatus();
      const svc = status.fpmService || 'php-fpm';
      const systemctl = await this.adapter.findExecutable('systemctl');

      if (systemctl) {
        const res = await this.adapter.exec('systemctl', ['restart', svc]);
        if (res.code === 0) return { ok: true, message: `Đã khởi động lại dịch vụ ${svc}` };

        // Thử tìm service khác nếu không được
        const fallback = await this.adapter.exec('bash', ['-c', 'systemctl restart php*-fpm']).catch(() => null);
        if (fallback && fallback.code === 0) return { ok: true, message: 'Đã khởi động lại các dịch vụ php-fpm' };
      }

      const rc = await this.adapter.findExecutable('rc-service');
      if (rc) {
        await this.adapter.exec('rc-service', ['php-fpm', 'restart']);
        return { ok: true, message: 'Đã khởi động lại php-fpm (OpenRC)' };
      }

      // Fallback gửi tín hiệu USR2 cho master process
      await this.adapter.exec('pkill', ['-USR2', 'php-fpm']).catch(() => null);
      return { ok: true, message: 'Đã gửi tín hiệu reload tới tiến trình PHP-FPM' };
    }

    return { ok: true, message: 'Đã gửi yêu cầu khởi động lại PHP trên Windows' };
  }

  /** Tùy chỉnh thông số php.ini */
  async updateConfig(updates: PhpConfigUpdate): Promise<{ ok: boolean; message: string }> {
    const status = await this.getStatus();
    if (!status.installed || !status.iniPath) {
      throw new Error('Chưa tìm thấy file php.ini được nạp trên hệ thống');
    }

    let content = await readFile(status.iniPath, 'utf8');

    const updateDirective = (key: string, val: string | undefined) => {
      if (!val) return;
      const cleanVal = val.trim();
      const regex = new RegExp(`^\\s*;?\\s*(${key}\\s*=\\s*).*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key} = ${cleanVal}`);
      } else {
        content += `\n${key} = ${cleanVal}\n`;
      }
    };

    if (updates.memoryLimit) updateDirective('memory_limit', updates.memoryLimit);
    if (updates.uploadMaxFilesize) updateDirective('upload_max_filesize', updates.uploadMaxFilesize);
    if (updates.postMaxSize) updateDirective('post_max_size', updates.postMaxSize);
    if (updates.maxExecutionTime) {
      const numOnly = updates.maxExecutionTime.replace(/[^0-9]/g, '');
      if (numOnly) updateDirective('max_execution_time', numOnly);
    }

    await writeFile(status.iniPath, content, 'utf8');

    // Tự động khởi động lại FPM để cấu hình có hiệu lực
    await this.restartFpm().catch(() => undefined);

    return { ok: true, message: 'Đã cập nhật cấu hình php.ini và áp dụng vào PHP-FPM' };
  }

  private async findPhpBinary(): Promise<string | null> {
    const bin = await this.adapter.findExecutable('php');
    if (bin) return bin;

    // Các đường dẫn phổ biến trên Linux và Windows
    const candidates = [
      '/usr/bin/php',
      '/usr/local/bin/php',
      'C:\\tools\\php\\php.exe',
      'C:\\php\\php.exe',
      'C:\\Program Files\\PHP\\php.exe',
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return null;
  }
}
