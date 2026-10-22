// ZenPanel - Kho ứng dụng 1-Click: sinh docker-compose.yml vào ~/.zenpanel/apps/<id> rồi "compose up"
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generatePassword } from '../core/auth.js';
import { jobLog } from '../core/jobs.js';
import { dataPath, JsonCollection } from '../core/store.js';
import { badRequest, HttpError, isPort } from '../core/validate.js';
import type { OSAdapter } from '../adapters/base.adapter.js';
import type { AiService } from './ai.service.js';
import { APP_CATALOG, type AppDefinition } from './appstore.catalog.js';
import { APP_GUIDES, type AppGuide } from './appstore.guides.js';
import type { AppTunnelService } from './apptunnel.service.js';
import type { DockerContainer, DockerService } from './docker.service.js';
import type { TunnelState } from './tunnel.service.js';

export interface InstalledApp {
  id: string;
  params: Record<string, string>;
  installedAt: string;
}

export interface AppView extends Omit<AppDefinition, 'compose' | 'files'> {
  installed: InstalledApp | null;
  status: 'running' | 'stopped' | 'partial' | 'not-installed';
  containers: DockerContainer[];
  guide: AppGuide | null;
  publicLink: (TunnelState & { enabled: boolean }) | null;
  isCompatible: boolean;
  platform: 'all' | 'windows' | 'linux';
  requiresGui: boolean;
  appType: 'docker' | 'native';
}

const installed = new JsonCollection<InstalledApp>('apps.json');

export const projectName = (id: string) => `zen-${id}`;
export const containerName = (id: string) => `zen-${id}`;
const appDir = (id: string) => dataPath('apps', id);

function findApp(id: string): AppDefinition {
  const app = APP_CATALOG.find((a) => a.id === id);
  if (!app) throw new HttpError(404, 'Không tìm thấy ứng dụng');
  return app;
}

export class AppStoreService {
  constructor(
    private readonly docker: DockerService,
    private readonly ai: AiService,
    private readonly tunnels: AppTunnelService,
    private readonly adapter?: OSAdapter,
  ) {}

  installedApps(): InstalledApp[] {
    return installed.all();
  }

  systemInfo(): { platform: 'windows' | 'linux'; hasGui: boolean } {
    const isWindows = process.platform === 'win32';
    const hasGui = isWindows ? true : Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    return { platform: isWindows ? 'windows' : 'linux', hasGui };
  }

  async list(): Promise<AppView[]> {
    const containers = await this.docker.containers().catch(() => [] as DockerContainer[]);
    const sys = this.systemInfo();

    return APP_CATALOG.map(({ compose: _compose, files: _files, ...app }) => {
      const record = installed.get(app.id) ?? null;
      const own = containers.filter((c) => c.project === projectName(app.id));
      const running = own.filter((c) => c.state === 'running').length;

      let status: AppView['status'] = !record ? 'not-installed' : running === 0 ? 'stopped' : running === own.length ? 'running' : 'partial';
      if (record && app.appType === 'native') {
        status = 'running';
      }

      const isCompatible =
        (app.platform === undefined || app.platform === 'all' || app.platform === sys.platform) &&
        (!app.requiresGui || sys.hasGui);

      // Không trả mật khẩu ra danh sách; xem lại trong "Cấu hình lại" hoặc mục Databases
      const safeRecord = record
        ? { ...record, params: Object.fromEntries(Object.entries(record.params).filter(([key]) => app.params.find((p) => p.key === key)?.type !== 'password')) }
        : null;

      return {
        ...app,
        platform: app.platform ?? 'all',
        requiresGui: Boolean(app.requiresGui),
        appType: app.appType ?? 'docker',
        isCompatible,
        installed: safeRecord,
        status,
        containers: own,
        guide: APP_GUIDES[app.id] ?? null,
        publicLink: record && app.webPort ? this.tunnels.state(app.id) : null,
      };
    });
  }

  /** Tham số đầy đủ (kể cả mật khẩu) để xem / sửa trong "Cấu hình lại" */
  config(id: string): InstalledApp {
    findApp(id);
    const record = installed.get(id);
    if (!record) throw badRequest('Ứng dụng chưa được cài đặt');
    return record;
  }

  private validateParams(app: AppDefinition, input: Record<string, unknown>, current?: Record<string, string>): Record<string, string> {
    const params: Record<string, string> = {};
    for (const param of app.params) {
      const raw = input[param.key];
      let value: unknown = raw === undefined || raw === '' ? (current?.[param.key] ?? param.default) : raw;
      // Chỉ chữ + số để không vỡ cú pháp command của docker-compose
      if ((value === undefined || value === '') && param.generate) value = generatePassword(20, false);
      if ((value === undefined || value === '') && param.optional) {
        params[param.key] = '';
        continue;
      }
      if (value === undefined || value === '') throw badRequest(`Thiếu "${param.label}"`);
      const text = String(value).trim();
      if (param.type === 'port' && !isPort(Number(text))) throw badRequest(`${param.label} không hợp lệ`);
      if (param.type === 'password' && !/^[\w.\-+=@#%^*!]{4,200}$/.test(text)) {
        throw badRequest(`${param.label} chỉ được chứa chữ, số và . - + = @ # % ^ * ! _`);
      }
      if (param.key === 'webhookUrl' && text && !/^https?:\/\/\S+$/i.test(text)) throw badRequest('Webhook URL phải bắt đầu bằng http:// hoặc https://');
      params[param.key] = text;
    }
    const used = new Set(
      installed
        .all()
        .filter((record) => record.id !== app.id)
        .flatMap((record) => {
          const def = APP_CATALOG.find((a) => a.id === record.id);
          return def ? def.params.filter((p) => p.type === 'port').map((p) => record.params[p.key]) : [];
        }),
    );
    for (const param of app.params.filter((p) => p.type === 'port')) {
      if (used.has(params[param.key])) throw badRequest(`Cổng ${params[param.key]} đang được ứng dụng khác của ZenPanel sử dụng`);
    }
    return params;
  }

  /** Kiểm tra dung lượng ổ đĩa còn trống trước khi cài đặt để tránh làm đầy ổ cứng (full disk) */
  async assertSufficientDiskSpace(app: AppDefinition): Promise<{ free: number; total: number; mount: string; required: number }> {
    if (!this.adapter) return { free: 0, total: 0, mount: '/', required: 0 };
    const disks = await this.adapter.getDisks().catch(() => []);
    if (!disks.length) return { free: 0, total: 0, mount: '/', required: 0 };

    const targetDir = appDir(app.id);
    let primary = disks.find((d) => targetDir.toLowerCase().startsWith(d.mount.toLowerCase()));
    if (!primary) {
      primary = disks.find((d) => d.mount === '/' || /^[a-zA-Z]:\\?$/.test(d.mount)) ?? disks[0];
    }

    const freeBytes = primary.total - primary.used;
    // App AI cần tối thiểu 4.0 GB trống, các app khác tối thiểu 2.5 GB trống
    const requiredBytes = (app.category === 'ai' ? 4.0 : 2.5) * 1024 * 1024 * 1024;
    const requiredGb = (requiredBytes / (1024 * 1024 * 1024)).toFixed(1);
    const freeGb = (freeBytes / (1024 * 1024 * 1024)).toFixed(2);

    if (freeBytes < requiredBytes) {
      throw badRequest(
        `Dung lượng ổ đĩa khả dụng không đủ (${freeGb} GB còn trống trên phân vùng ${primary.mount}). ` +
        `Cần tối thiểu ${requiredGb} GB trống để cài đặt ${app.name} an toàn nhằm tránh làm đầy ổ đĩa (full disk) gây treo máy chủ. ` +
        `Vui lòng vào tab "Dọn dẹp" để giải phóng bớt dung lượng trước khi cài đặt.`
      );
    }

    return { free: freeBytes, total: primary.total, mount: primary.mount, required: requiredBytes };
  }

  /** Kiểm tra tham số và dung lượng đĩa trước khi chạy job cài đặt */
  async prepareInstall(id: string, input: Record<string, unknown>): Promise<Record<string, string>> {
    const app = findApp(id);
    if (installed.get(id)) throw badRequest('Ứng dụng đã được cài đặt');
    await this.assertSufficientDiskSpace(app);
    return this.validateParams(app, input);
  }

  prepareReconfigure(id: string, input: Record<string, unknown>): Record<string, string> {
    const app = findApp(id);
    return this.validateParams(app, input, this.config(id).params);
  }

  /** Ghi docker-compose.yml (+ file cấu hình đi kèm) với API key AI hiện tại */
  private async writeFiles(app: AppDefinition, params: Record<string, string>): Promise<string> {
    const dir = appDir(app.id);
    await mkdir(dir, { recursive: true });
    const ctx = this.ai.context();
    if (app.usesAiKeys) {
      const providers = Object.keys(ctx.ai);
      jobLog(providers.length ? `API key AI được nối vào app: ${providers.join(', ')}` : 'Chưa có API key AI nào (Cài đặt → AI). App vẫn chạy, thêm key sau rồi "Cấu hình lại".');
    }
    for (const [name, content] of Object.entries(app.files?.(params, ctx) ?? {})) {
      await writeFile(path.join(dir, name), content, { mode: 0o600 });
      jobLog(`Đã tạo ${path.join(dir, name)}`);
    }
    if (app.compose) {
      await writeFile(path.join(dir, 'docker-compose.yml'), app.compose(params, containerName(app.id), ctx), { mode: 0o600 });
      jobLog(`Đã tạo ${path.join(dir, 'docker-compose.yml')}`);
    }
    return dir;
  }

  /** Cài đặt Native App (Windows hoặc Linux GUI/CLI) */
  private async installNativeApp(app: AppDefinition, dir: string): Promise<void> {
    const isWindows = process.platform === 'win32';
    await mkdir(dir, { recursive: true });

    if (isWindows) {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      if (app.id === 'tdrop') {
        jobLog('Đang tải T-Drop từ GitHub release (TXAVL/T-Drop)...');
        const exePath = path.join(dir, 'T-Drop.exe');
        const script = `
          [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
          $url = "https://github.com/TXAVL/T-Drop/releases/latest/download/T-Drop.exe"
          Invoke-WebRequest -Uri $url -OutFile "${exePath}" -UseBasicParsing
        `;
        await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`);
        jobLog(`✓ T-Drop đã được tải thành công về: ${exePath}`);
        // Tạo shortcut trên Desktop
        const desktopShortcut = `
          $WshShell = New-Object -ComObject WScript.Shell
          $Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\T-Drop.lnk')
          $Shortcut.TargetPath = '${exePath}'
          $Shortcut.WorkingDirectory = '${dir}'
          $Shortcut.Save()
        `;
        await execAsync(`powershell -NoProfile -Command "${desktopShortcut.replace(/\r?\n/g, ' ')}"`);
        jobLog('✓ Đã tạo Shortcut T-Drop ngoài Desktop');
      } else if (app.id === 'unikey') {
        jobLog('Đang tải UniKey Windows 64-bit...');
        const zipPath = path.join(dir, 'unikey.zip');
        const script = `
          [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
          $url = "https://www.unikey.org/assets/release/unikey43RC5-200929-win64.zip"
          Invoke-WebRequest -Uri $url -OutFile "${zipPath}" -UseBasicParsing
          Expand-Archive -Path "${zipPath}" -DestinationPath "${dir}" -Force
          Remove-Item -Path "${zipPath}" -Force -ErrorAction SilentlyContinue
        `;
        await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`);
        jobLog(`✓ UniKey đã được giải nén sẵn sàng trong: ${dir}`);
      } else if (app.id === '7zip') {
        jobLog('Đang tải và cài đặt 7-Zip silent...');
        const installerPath = path.join(dir, '7z-installer.exe');
        const script = `
          [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
          $url = "https://www.7-zip.org/a/7z2408-x64.exe"
          Invoke-WebRequest -Uri $url -OutFile "${installerPath}" -UseBasicParsing
          Start-Process -FilePath "${installerPath}" -ArgumentList "/S" -Wait
          Remove-Item -Path "${installerPath}" -Force -ErrorAction SilentlyContinue
        `;
        await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`);
        jobLog('✓ 7-Zip đã được cài đặt thành công vào hệ thống Windows');
      } else if (app.id === 'notepadplusplus') {
        jobLog('Đang tải và cài đặt Notepad++ silent...');
        const installerPath = path.join(dir, 'npp-installer.exe');
        const script = `
          [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
          $url = "https://github.com/notepad-plus-plus/notepad-plus-plus/releases/download/v8.6.9/npp.8.6.9.Installer.x64.exe"
          Invoke-WebRequest -Uri $url -OutFile "${installerPath}" -UseBasicParsing
          Start-Process -FilePath "${installerPath}" -ArgumentList "/S" -Wait
          Remove-Item -Path "${installerPath}" -Force -ErrorAction SilentlyContinue
        `;
        await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`);
        jobLog('✓ Notepad++ đã được cài đặt thành công vào hệ thống Windows');
      }
    } else {
      // Linux
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      if (app.id === 'coccoc') {
        jobLog('Đang tải gói Cốc Cốc (.deb)...');
        await execAsync('curl -fsSL https://files.coccoc.com/browser/coccoc.deb -o /tmp/coccoc.deb');
        jobLog('Đang cài đặt trình duyệt Cốc Cốc qua dpkg / apt...');
        await execAsync('dpkg -i /tmp/coccoc.deb || apt-get install -fy');
        jobLog('✓ Trình duyệt Cốc Cốc đã cài đặt thành công!');
      } else if (app.id === 'ibus-bamboo') {
        jobLog('Đang thêm PPA ibus-bamboo và cài đặt bộ gõ tiếng Việt...');
        await execAsync('add-apt-repository -y ppa:bamboo-engine/ibus-bamboo && apt-get update && apt-get install -y ibus-bamboo');
        jobLog('✓ Bộ gõ tiếng Việt IBus-Bamboo đã cài đặt thành công!');
      }
    }
  }

  async install(id: string, params: Record<string, string>): Promise<void> {
    const app = findApp(id);
    jobLog(`Ứng dụng: ${app.name}`);
    try {
      const disk = await this.assertSufficientDiskSpace(app);
      if (disk.total > 0) {
        jobLog(`Kiểm tra ổ đĩa ${disk.mount}: còn trống ${(disk.free / 1073741824).toFixed(2)} GB / tổng ${(disk.total / 1073741824).toFixed(2)} GB (an toàn) ✔`);
      }
    } catch (err) {
      jobLog(`✘ LỖI Ổ ĐĨA: ${(err as Error).message}`);
      throw err;
    }

    if (app.appType === 'native') {
      const dir = appDir(app.id);
      await this.installNativeApp(app, dir);
      installed.upsert({ id, params, installedAt: new Date().toISOString() });
      jobLog(`\n🎉 Cài đặt hoàn tất ${app.name}!`);
      return;
    }

    const dir = await this.writeFiles(app, params);
    jobLog('Đang tải image và khởi động container (lần đầu có thể mất vài phút)...');
    try {
      await this.docker.compose(['-p', projectName(id), 'up', '-d'], dir);
    } catch (err) {
      // Dọn dẹp nếu cài thất bại để có thể cài lại
      await this.docker.compose(['-p', projectName(id), 'down'], dir).catch(() => undefined);
      throw err;
    }
    installed.upsert({ id, params, installedAt: new Date().toISOString() });
    if (app.webPort) jobLog(`\n➜ Mở app: bấm "Truy cập" trên thẻ ${app.name} → "Bật link public", hoặc http://<IP máy chủ>:${params[app.webPort]}`);
  }

  /** Đổi tham số / nạp lại API key AI rồi tạo lại container (dữ liệu trong volume giữ nguyên) */
  async reconfigure(id: string, params: Record<string, string>): Promise<void> {
    const app = findApp(id);
    const record = this.config(id);
    if (app.appType === 'native') {
      installed.upsert({ ...record, params });
      return;
    }
    const dir = await this.writeFiles(app, params);
    await this.docker.compose(['-p', projectName(id), 'up', '-d', '--remove-orphans'], dir);
    installed.upsert({ ...record, params });
    // Đổi cổng thì tunnel phải trỏ sang cổng mới
    if (app.webPort && this.tunnels.state(id).enabled && params[app.webPort] !== record.params[app.webPort]) {
      jobLog('Cổng web đổi → bật lại link public');
      await this.tunnels.enable(id, Number(params[app.webPort]), app.webScheme ?? 'http');
    }
  }

  async setPublicLink(id: string, enabled: boolean): Promise<TunnelState & { enabled: boolean }> {
    const app = findApp(id);
    const record = this.config(id);
    if (!app.webPort) throw badRequest('Ứng dụng này không có giao diện web');
    if (enabled) await this.tunnels.enable(id, Number(record.params[app.webPort]), app.webScheme ?? 'http');
    else this.tunnels.disable(id);
    return this.tunnels.state(id);
  }

  async action(id: string, action: 'start' | 'stop' | 'restart' | 'update'): Promise<void> {
    const app = findApp(id);
    if (!installed.get(id)) throw badRequest('Ứng dụng chưa được cài đặt');

    if (app.appType === 'native') {
      const isWindows = process.platform === 'win32';
      if (isWindows && app.nativeInstall?.targetExe) {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);
        const exeName = app.nativeInstall.targetExe.replace(/\.exe$/i, '');
        const exePath = path.join(appDir(id), app.nativeInstall.targetExe);

        if (action === 'stop' || action === 'restart') {
          await execAsync(`powershell -NoProfile -Command "Stop-Process -Name '${exeName}' -Force -ErrorAction SilentlyContinue"`).catch(() => undefined);
        }
        if (action === 'start' || action === 'restart') {
          await execAsync(`powershell -NoProfile -Command "Start-Process -FilePath '${exePath}' -WorkingDirectory '${appDir(id)}' -ErrorAction SilentlyContinue"`).catch(() => undefined);
        }
      }
      return;
    }

    const dir = appDir(id);
    const project = ['-p', projectName(id)];
    if (action === 'update') {
      await this.docker.compose([...project, 'pull'], dir);
      await this.docker.compose([...project, 'up', '-d', '--remove-orphans'], dir);
    } else if (action === 'start') {
      // Dùng up -d để đảm bảo nếu container chưa được tạo hoặc bị xoá thì tự sinh lại thay vì báo lỗi "no container found"
      await this.docker.compose([...project, 'up', '-d'], dir);
    } else {
      try {
        await this.docker.compose([...project, action], dir);
      } catch (err: unknown) {
        const msg = String((err as Error)?.message || '');
        if (msg.includes('no container found')) {
          // Container đã không còn tồn tại nên coi như đã dừng
          return;
        }
        throw err;
      }
    }
  }

  async uninstall(id: string, removeData: boolean): Promise<void> {
    const app = findApp(id);
    const dir = appDir(id);
    this.tunnels.disable(id);

    if (app.appType === 'native') {
      await this.action(id, 'stop').catch(() => undefined);
      installed.remove(id);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return;
    }

    await this.docker.compose(['-p', projectName(id), 'down', ...(removeData ? ['-v'] : [])], dir).catch(() => undefined);
    installed.remove(id);
    await rm(dir, { recursive: true, force: true });
  }

  async composeFile(id: string): Promise<string> {
    const app = findApp(id);
    if (!installed.get(id)) throw badRequest('Ứng dụng chưa được cài đặt');
    if (app.appType === 'native') throw badRequest('Ứng dụng native không sử dụng docker-compose.yml');
    return path.join(appDir(id), 'docker-compose.yml');
  }
}
