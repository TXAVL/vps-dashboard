// ZenPanel - Kho ứng dụng 1-Click: sinh docker-compose.yml vào ~/.zenpanel/apps/<id> rồi "compose up"
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generatePassword } from '../core/auth.js';
import { jobLog } from '../core/jobs.js';
import { dataPath, JsonCollection } from '../core/store.js';
import { badRequest, HttpError, isPort } from '../core/validate.js';
import { APP_CATALOG, type AppDefinition } from './appstore.catalog.js';
import type { DockerContainer, DockerService } from './docker.service.js';

export interface InstalledApp {
  id: string;
  params: Record<string, string>;
  installedAt: string;
}

export interface AppView extends Omit<AppDefinition, 'compose'> {
  installed: InstalledApp | null;
  status: 'running' | 'stopped' | 'partial' | 'not-installed';
  containers: DockerContainer[];
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
  constructor(private readonly docker: DockerService) {}

  installedApps(): InstalledApp[] {
    return installed.all();
  }

  async list(): Promise<AppView[]> {
    const containers = await this.docker.containers().catch(() => [] as DockerContainer[]);
    return APP_CATALOG.map(({ compose: _compose, ...app }) => {
      const record = installed.get(app.id) ?? null;
      const own = containers.filter((c) => c.project === projectName(app.id));
      const running = own.filter((c) => c.state === 'running').length;
      const status: AppView['status'] = !record
        ? 'not-installed'
        : running === 0
          ? 'stopped'
          : running === own.length
            ? 'running'
            : 'partial';
      // Không trả mật khẩu ra danh sách; xem chi tiết trong mục Databases
      const safeRecord = record
        ? { ...record, params: Object.fromEntries(Object.entries(record.params).filter(([key]) => app.params.find((p) => p.key === key)?.type !== 'password')) }
        : null;
      return { ...app, installed: safeRecord, status, containers: own };
    });
  }

  /** Kiểm tra tham số trước khi chạy job cài đặt (lỗi nhập liệu báo ngay cho người dùng) */
  prepareInstall(id: string, input: Record<string, unknown>): Record<string, string> {
    const app = findApp(id);
    if (installed.get(id)) throw badRequest('Ứng dụng đã được cài đặt');

    const params: Record<string, string> = {};
    for (const param of app.params) {
      let value = input[param.key] === undefined || input[param.key] === '' ? param.default : input[param.key];
      // Chỉ chữ + số để không vỡ cú pháp command của docker-compose
      if ((value === undefined || value === '') && param.generate) value = generatePassword(20, false);
      if (value === undefined || value === '') throw badRequest(`Thiếu "${param.label}"`);
      const text = String(value).trim();
      if (param.type === 'port' && !isPort(Number(text))) throw badRequest(`${param.label} không hợp lệ`);
      if (param.type === 'password' && !/^[\w.\-+=@#%^*!]{4,200}$/.test(text)) {
        throw badRequest(`${param.label} chỉ được chứa chữ, số và . - + = @ # % ^ * ! _`);
      }
      params[param.key] = text;
    }
    const used = new Set(installed.all().flatMap((record) => {
      const def = APP_CATALOG.find((a) => a.id === record.id);
      return def ? def.params.filter((p) => p.type === 'port').map((p) => record.params[p.key]) : [];
    }));
    for (const param of app.params.filter((p) => p.type === 'port')) {
      if (used.has(params[param.key])) throw badRequest(`Cổng ${params[param.key]} đang được ứng dụng khác của ZenPanel sử dụng`);
    }
    return params;
  }

  async install(id: string, params: Record<string, string>): Promise<void> {
    const app = findApp(id);
    jobLog(`Ứng dụng: ${app.name}`);
    const dir = appDir(id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'docker-compose.yml'), app.compose(params, containerName(id)), { mode: 0o600 });
    jobLog(`Đã tạo ${path.join(dir, 'docker-compose.yml')}`);
    jobLog('Đang tải image và khởi động container (lần đầu có thể mất vài phút)...');
    try {
      await this.docker.compose(['-p', projectName(id), 'up', '-d'], dir);
    } catch (err) {
      // Dọn dẹp nếu cài thất bại để có thể cài lại
      await this.docker.compose(['-p', projectName(id), 'down'], dir).catch(() => undefined);
      throw err;
    }
    installed.upsert({ id, params, installedAt: new Date().toISOString() });
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
