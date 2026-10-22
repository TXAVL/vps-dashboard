// ZenPanel - Docker Compose stacks: tự viết docker-compose.yml, chạy / dừng / cập nhật, quản lý cả stack có sẵn trên máy
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jobLog } from '../core/jobs.js';
import { dataPath } from '../core/store.js';
import { badRequest, HttpError } from '../core/validate.js';
import type { DockerService } from './docker.service.js';

export interface StackView {
  name: string;
  status: string;
  /** Stack do ZenPanel quản lý (sửa được file) hay có sẵn trên máy */
  managed: boolean;
  /** Stack của App Store (zen-*) */
  appStore: boolean;
  configFiles: string[];
}

const NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const stacksDir = () => dataPath('stacks');
const stackFile = (name: string) => path.join(stacksDir(), name, 'docker-compose.yml');

function validName(name: string): string {
  if (!NAME.test(name)) throw badRequest('Tên stack chỉ gồm chữ thường, số, gạch ngang, gạch dưới');
  return name;
}

function validYaml(yaml: unknown): string {
  if (typeof yaml !== 'string' || !/^\s*services\s*:/m.test(yaml)) throw badRequest('docker-compose.yml phải có khối "services:"');
  if (yaml.length > 200_000) throw badRequest('File compose quá lớn');
  return yaml;
}

export class StackService {
  constructor(private readonly docker: DockerService) {}

  async list(): Promise<StackView[]> {
    const running = await this.docker.composeProjects().catch(() => []);
    const own = existsSync(stacksDir()) ? (await readdir(stacksDir(), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name) : [];
    const views = new Map<string, StackView>();
    for (const name of own) views.set(name, { name, status: 'chưa chạy', managed: true, appStore: false, configFiles: [stackFile(name)] });
    for (const project of running) {
      const prev = views.get(project.name);
      views.set(project.name, {
        name: project.name,
        status: project.status,
        managed: Boolean(prev),
        appStore: project.name.startsWith('zen-'),
        configFiles: prev?.configFiles ?? project.configFiles,
      });
    }
    return [...views.values()].sort((a, b) => Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name));
  }

  private async find(name: string): Promise<StackView> {
    const stack = (await this.list()).find((s) => s.name === name);
    if (!stack) throw new HttpError(404, 'Không tìm thấy stack');
    return stack;
  }

  async read(name: string): Promise<{ yaml: string; file: string }> {
    const stack = await this.find(validName(name));
    const file = stack.configFiles[0];
    if (!file || !existsSync(file)) throw badRequest('Không đọc được file compose của stack này');
    return { yaml: await readFile(file, 'utf8'), file };
  }

  async save(name: string, yaml: unknown, create: boolean): Promise<void> {
    validName(name);
    const content = validYaml(yaml);
    if (create && existsSync(stackFile(name))) throw badRequest('Stack đã tồn tại');
    if (!create && !existsSync(stackFile(name))) throw badRequest('Chỉ sửa được stack do ZenPanel tạo');
    await mkdir(path.dirname(stackFile(name)), { recursive: true });
    await writeFile(stackFile(name), content);
  }

  /** up / down / restart / pull (chạy trong job để xem log) */
  async action(name: string, action: 'up' | 'down' | 'restart' | 'pull'): Promise<void> {
    const stack = await this.find(validName(name));
    const files = stack.configFiles.filter((f) => existsSync(f));
    if (!files.length) throw badRequest('Không tìm thấy file compose của stack');
    const args = ['-p', name, ...files.flatMap((f) => ['-f', f])];
    const cwd = path.dirname(files[0]);
    jobLog(`Stack ${name} · ${files.join(', ')}`);
    if (action === 'up') await this.docker.compose([...args, 'up', '-d', '--remove-orphans'], cwd);
    else if (action === 'pull') {
      await this.docker.compose([...args, 'pull'], cwd);
      await this.docker.compose([...args, 'up', '-d'], cwd);
    } else await this.docker.compose([...args, action], cwd);
  }

  async remove(name: string, removeVolumes: boolean): Promise<void> {
    validName(name);
    if (!existsSync(stackFile(name))) throw badRequest('Chỉ xoá được stack do ZenPanel tạo (stack App Store hãy gỡ trong App Store)');
    await this.docker.compose(['-p', name, '-f', stackFile(name), 'down', ...(removeVolumes ? ['-v'] : [])], path.dirname(stackFile(name))).catch(() => undefined);
    await rm(path.dirname(stackFile(name)), { recursive: true, force: true });
  }
}
