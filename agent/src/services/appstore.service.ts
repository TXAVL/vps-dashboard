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

  async list(): Promise<AppView[]> {
    const containers = await this.docker.containers().catch(() => [] as DockerContainer[]);
    return APP_CATALOG.map(({ compose: _compose, files: _files, ...app }) => {
      const record = installed.get(app.id) ?? null;
      const own = containers.filter((c) => c.project === projectName(app.id));
      const running = own.filter((c) => c.state === 'running').length;
      const status: AppView['status'] = !record ? 'not-installed' : running === 0 ? 'stopped' : running === own.length ? 'running' : 'partial';
      // Không trả mật khẩu ra danh sách; xem lại trong "Cấu hình lại" hoặc mục Databases
      const safeRecord = record
        ? { ...record, params: Object.fromEntries(Object.entries(record.params).filter(([key]) => app.params.find((p) => p.key === key)?.type !== 'password')) }
        : null;
      return {
        ...app,
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
    await writeFile(path.join(dir, 'docker-compose.yml'), app.compose(params, containerName(app.id), ctx), { mode: 0o600 });
    jobLog(`Đã tạo ${path.join(dir, 'docker-compose.yml')}`);
    return dir;
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
    findApp(id);
    if (!installed.get(id)) throw badRequest('Ứng dụng chưa được cài đặt');
    const dir = appDir(id);
    const project = ['-p', projectName(id)];
    if (action === 'update') {
      await this.docker.compose([...project, 'pull'], dir);
      await this.docker.compose([...project, 'up', '-d'], dir);
    } else await this.docker.compose([...project, action], dir);
  }

  async uninstall(id: string, removeData: boolean): Promise<void> {
    findApp(id);
    const dir = appDir(id);
    this.tunnels.disable(id);
    await this.docker.compose(['-p', projectName(id), 'down', ...(removeData ? ['-v'] : [])], dir).catch(() => undefined);
    installed.remove(id);
    await rm(dir, { recursive: true, force: true });
  }

  async composeFile(id: string): Promise<string> {
    findApp(id);
    if (!installed.get(id)) throw badRequest('Ứng dụng chưa được cài đặt');
    return path.join(appDir(id), 'docker-compose.yml');
  }
}
