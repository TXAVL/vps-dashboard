// ZenPanel - Quản lý Docker qua Docker CLI (giống nhau trên Windows & Linux)
import type { OSAdapter } from '../adapters/base.adapter.js';
import { badRequest, HttpError } from '../core/validate.js';

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
  project: string | null;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdSince: string;
}

const CONTAINER_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause', 'remove'] as const;
export type ContainerAction = (typeof CONTAINER_ACTIONS)[number];

function parseJsonLines<T>(output: string): T[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

const isRef = (value: string) => /^[\w][\w.\-/:@]{0,254}$/.test(value);

export class DockerService {
  private composeCmd: { file: string; prefix: string[] } | null = null;

  constructor(private readonly adapter: OSAdapter) {}

  private async docker(args: string[], timeout = 60_000): Promise<string> {
    if (!(await this.adapter.findExecutable('docker'))) {
      throw new HttpError(503, 'Chưa cài Docker trên máy chủ này');
    }
    const { stdout } = await this.adapter.execOk('docker', args, { timeout });
    return stdout;
  }

  async info(): Promise<{ installed: boolean; running: boolean; version: string | null; error: string | null }> {
    if (!(await this.adapter.findExecutable('docker'))) return { installed: false, running: false, version: null, error: null };
    const result = await this.adapter.exec('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 15_000 });
    if (result.code !== 0) return { installed: true, running: false, version: null, error: result.stderr.trim() || 'Docker daemon chưa chạy' };
    return { installed: true, running: true, version: result.stdout.trim(), error: null };
  }

  /** "docker compose" (v2) hoặc "docker-compose" (v1) */
  async compose(args: string[], cwd: string, timeout = 900_000): Promise<string> {
    if (!this.composeCmd) {
      const v2 = await this.adapter.exec('docker', ['compose', 'version']).catch(() => null);
      if (v2?.code === 0) this.composeCmd = { file: 'docker', prefix: ['compose'] };
      else if (await this.adapter.findExecutable('docker-compose')) this.composeCmd = { file: 'docker-compose', prefix: [] };
      else throw new HttpError(503, 'Chưa cài Docker Compose');
    }
    const { stdout, stderr } = await this.adapter.execOk(this.composeCmd.file, [...this.composeCmd.prefix, ...args], { cwd, timeout });
    return stdout + stderr;
  }

  async composeProjects(): Promise<{ name: string; status: string; configFiles: string[] }[]> {
    const out = (await this.compose(['ls', '-a', '--format', 'json'], process.cwd(), 30_000)).trim();
    const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
    const rows = json ? (JSON.parse(json) as { Name: string; Status: string; ConfigFiles: string }[]) : [];
    return rows.map((row) => ({ name: row.Name, status: row.Status, configFiles: row.ConfigFiles ? row.ConfigFiles.split(',').map((f) => f.trim()) : [] }));
  }

  async containers(): Promise<DockerContainer[]> {
    const rows = parseJsonLines<Record<string, string>>(await this.docker(['ps', '-a', '--no-trunc', '--format', '{{json .}}']));
    return rows.map((row) => ({
      id: row.ID.slice(0, 12),
      name: row.Names,
      image: row.Image,
      state: row.State,
      status: row.Status,
      ports: row.Ports,
      createdAt: row.CreatedAt,
      project: /com\.docker\.compose\.project=([^,]+)/.exec(row.Labels ?? '')?.[1] ?? null,
    }));
  }

  async stats(): Promise<Record<string, { cpu: string; memory: string; memPerc: string; net: string }>> {
    const rows = parseJsonLines<Record<string, string>>(await this.docker(['stats', '--no-stream', '--format', '{{json .}}'], 30_000));
    return Object.fromEntries(
      rows.map((row) => [row.ID.slice(0, 12), { cpu: row.CPUPerc, memory: row.MemUsage, memPerc: row.MemPerc, net: row.NetIO }]),
    );
  }

  async containerAction(id: string, action: ContainerAction): Promise<void> {
    if (!isRef(id)) throw badRequest('Mã container không hợp lệ');
    if (!CONTAINER_ACTIONS.includes(action)) throw badRequest('Thao tác không hợp lệ');
    if (action === 'remove') await this.docker(['rm', '-f', id]);
    else await this.docker([action, id]);
  }

  async logs(id: string, tail = 300): Promise<string> {
    if (!isRef(id)) throw badRequest('Mã container không hợp lệ');
    const result = await this.adapter.exec('docker', ['logs', '--tail', String(tail), '--timestamps', id], { timeout: 30_000 });
    // docker logs ghi cả stdout và stderr của container
    return `${result.stdout}${result.stderr}`;
  }

  async images(): Promise<DockerImage[]> {
    const rows = parseJsonLines<Record<string, string>>(await this.docker(['images', '--format', '{{json .}}']));
    return rows.map((row) => ({ id: row.ID, repository: row.Repository, tag: row.Tag, size: row.Size, createdSince: row.CreatedSince }));
  }

  async removeImage(id: string): Promise<void> {
    if (!isRef(id)) throw badRequest('Mã image không hợp lệ');
    await this.docker(['rmi', id]);
  }

  async pull(image: string): Promise<void> {
    if (!isRef(image)) throw badRequest('Tên image không hợp lệ');
    await this.docker(['pull', image], 900_000);
  }

  async run(input: { image: string; name?: string; ports?: string[]; env?: string[]; volumes?: string[]; restart?: string }): Promise<string> {
    if (!isRef(input.image)) throw badRequest('Tên image không hợp lệ');
    const args = ['run', '-d'];
    if (input.name) {
      if (!/^[\w][\w.-]{0,63}$/.test(input.name)) throw badRequest('Tên container không hợp lệ');
      args.push('--name', input.name);
    }
    for (const port of input.ports ?? []) {
      if (!/^(\d{1,5}:)?\d{1,5}(\/(tcp|udp))?$/.test(port)) throw badRequest(`Cổng "${port}" không hợp lệ (vd 8080:80)`);
      args.push('-p', port);
    }
    for (const env of input.env ?? []) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(env)) throw badRequest(`Biến môi trường "${env}" không hợp lệ (vd KEY=value)`);
      args.push('-e', env);
    }
    for (const volume of input.volumes ?? []) args.push('-v', volume);
    args.push('--restart', ['no', 'always', 'unless-stopped', 'on-failure'].includes(input.restart ?? '') ? input.restart! : 'unless-stopped');
    args.push(input.image);
    return (await this.docker(args, 900_000)).trim();
  }

  async volumes(): Promise<{ name: string; driver: string }[]> {
    const rows = parseJsonLines<Record<string, string>>(await this.docker(['volume', 'ls', '--format', '{{json .}}']));
    return rows.map((row) => ({ name: row.Name, driver: row.Driver }));
  }

  async networks(): Promise<{ id: string; name: string; driver: string; scope: string }[]> {
    const rows = parseJsonLines<Record<string, string>>(await this.docker(['network', 'ls', '--format', '{{json .}}']));
    return rows.map((row) => ({ id: row.ID, name: row.Name, driver: row.Driver, scope: row.Scope }));
  }

  /** Chạy lệnh trong container (dùng cho quản lý database) */
  async execIn(container: string, command: string[], env: Record<string, string> = {}): Promise<string> {
    const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    return this.docker(['exec', ...envArgs, container, ...command], 120_000);
  }

  async systemDf(): Promise<string> {
    return this.docker(['system', 'df']).catch(() => '');
  }

  async prune(target: 'containers' | 'images' | 'all-images' | 'builder' | 'volumes'): Promise<string> {
    switch (target) {
      case 'containers':
        return this.docker(['container', 'prune', '-f']);
      case 'images':
        return this.docker(['image', 'prune', '-f']);
      case 'all-images':
        return this.docker(['image', 'prune', '-a', '-f']);
      case 'builder':
        return this.docker(['builder', 'prune', '-a', '-f']);
      case 'volumes':
        return this.docker(['volume', 'prune', '-f']);
    }
  }
}
