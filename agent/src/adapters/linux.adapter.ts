// ZenPanel - Adapter cho Linux (Ubuntu, Debian, CentOS, Alpine...): procfs, systemd/OpenRC, ufw/firewalld/iptables
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chmod, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import type {
  DiskUsage,
  FirewallPersistence,
  FirewallRule,
  FirewallRuleInput,
  FirewallStatus,
  DetachedInstall,
  ListeningPort,
  NetworkTotals,
  OSAdapter,
  OSInfo,
  PowerAction,
  ProcessInfo,
  ScheduledTask,
  ServiceAction,
  ServiceInfo,
  ServiceStartup,
  ServiceState,
  ShellCommand,
  TaskSchedule,
} from './base.adapter.js';
import { exec, execOk, type ExecOptions } from '../core/exec.js';
import { resolveTool } from '../core/download.js';
import { dataPath } from '../core/store.js';
import { CaddyDriver } from './web/caddy.driver.js';
import { NginxDriver } from './web/nginx.driver.js';
import type { WebServerDriver } from './web/types.js';

const GO_ARCH: Record<string, string> = { x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' };
const PAGE_SIZE = 4096;
const SSH_PORT = 22;
const CRON_MARK = '# zenpanel:';

function cronExpression(schedule: TaskSchedule): string {
  const hm = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return `${m} ${h}`;
  };
  switch (schedule.type) {
    case 'minutes':
      return `*/${schedule.every} * * * *`;
    case 'hourly':
      return `${schedule.minute} * * * *`;
    case 'daily':
      return `${hm(schedule.time)} * * *`;
    case 'weekly':
      return `${hm(schedule.time)} * * ${schedule.day}`;
    case 'startup':
      return '@reboot';
  }
}
const IGNORED_FS = /^(tmpfs|devtmpfs|udev|overlay|squashfs|none|shm|efivarfs|cgroup.*)$/;
const IGNORED_MOUNTS = /^\/(dev|run|sys|proc|snap)(\/|$)/;

interface CpuSample {
  total: number;
  procs: Map<number, number>;
}

/** Tách chuỗi lệnh thành mảng tham số, tôn trọng dấu nháy kép */
function tokenize(line: string): string[] {
  return (line.match(/"[^"]*"|\S+/g) ?? []).map((token) => token.replace(/^"|"$/g, ''));
}

export class LinuxAdapter implements OSAdapter {
  readonly family = 'linux' as const;
  private users: Map<number, string> | null = null;
  private drivers: WebServerDriver[] | null = null;

  exec(file: string, args: string[], opts?: ExecOptions) {
    return exec(file, args, opts);
  }

  execOk(file: string, args: string[], opts?: ExecOptions) {
    return execOk(file, args, opts);
  }

  async getInfo(): Promise<OSInfo> {
    let name = `Linux ${os.release()}`;
    try {
      const release = await readFile('/etc/os-release', 'utf8');
      const pretty = release.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (pretty) name = pretty[1];
    } catch {
      // Một số distro tối giản không có /etc/os-release
    }
    const cpus = os.cpus();
    return {
      family: this.family,
      name,
      kernel: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpuModel: cpus[0]?.model.trim() ?? 'Unknown CPU',
      cpuCores: cpus.length,
      totalMemory: os.totalmem(),
      isAdmin: process.getuid?.() === 0,
    };
  }

  async findExecutable(name: string): Promise<string | null> {
    try {
      const { stdout, code } = await exec('sh', ['-c', 'command -v "$1"', 'sh', name]);
      return code === 0 ? stdout.trim() || null : null;
    } catch {
      return null;
    }
  }

  async makeExecutable(filePath: string): Promise<void> {
    await chmod(filePath, 0o755);
  }

  executableName(name: string): string {
    return name;
  }

  cloudflaredAssetName(): string {
    const arch = GO_ARCH[os.arch()];
    if (!arch) throw new Error(`Kiến trúc CPU "${os.arch()}" chưa được cloudflared hỗ trợ`);
    return `cloudflared-linux-${arch}`;
  }

  caddyDownloadUrl(): string {
    const arch = GO_ARCH[os.arch()] ?? 'amd64';
    return `https://caddyserver.com/api/download?os=linux&arch=${arch}${arch === 'arm' ? '&arm=7' : ''}`;
  }

  // ---------------------------------------------------------------- Tài nguyên

  async getDisks(): Promise<DiskUsage[]> {
    const { stdout } = await exec('df', ['-kP']);
    const seen = new Set<string>();
    const disks: DiskUsage[] = [];
    for (const line of stdout.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 6) continue;
      const [fs, blocks, used] = cols;
      const mount = cols.slice(5).join(' ');
      if (IGNORED_FS.test(fs) || IGNORED_MOUNTS.test(mount) || seen.has(fs)) continue;
      seen.add(fs);
      disks.push({ mount, fs, total: Number(blocks) * 1024, used: Number(used) * 1024 });
    }
    return disks;
  }

  async getNetworkTotals(): Promise<NetworkTotals> {
    const content = await readFile('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of content.split('\n').slice(2)) {
      const [iface, data] = line.split(':');
      if (!data || iface.trim() === 'lo') continue;
      const cols = data.trim().split(/\s+/).map(Number);
      rx += cols[0];
      tx += cols[8];
    }
    return { rx, tx };
  }

  getLoadAverage(): number[] {
    return os.loadavg();
  }

  // ---------------------------------------------------------------- Tiến trình (đọc trực tiếp /proc)

  private async userMap(): Promise<Map<number, string>> {
    if (this.users) return this.users;
    const map = new Map<number, string>();
    try {
      for (const line of (await readFile('/etc/passwd', 'utf8')).split('\n')) {
        const [name, , uid] = line.split(':');
        if (name && uid) map.set(Number(uid), name);
      }
    } catch {
      // không đọc được passwd thì hiển thị uid
    }
    this.users = map;
    return map;
  }

  private async totalJiffies(): Promise<number> {
    const first = (await readFile('/proc/stat', 'utf8')).split('\n')[0];
    return first
      .split(/\s+/)
      .slice(1)
      .reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  private async sampleCpu(pids: number[]): Promise<CpuSample> {
    const procs = new Map<number, number>();
    await Promise.all(
      pids.map(async (pid) => {
        try {
          const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
          const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
          procs.set(pid, Number(rest[11]) + Number(rest[12]));
        } catch {
          // tiến trình đã thoát
        }
      }),
    );
    return { total: await this.totalJiffies(), procs };
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    const pids = (await readdir('/proc')).filter((entry) => /^\d+$/.test(entry)).map(Number);
    const users = await this.userMap();
    const before = await this.sampleCpu(pids);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const after = await this.sampleCpu(pids);
    const totalDelta = Math.max(after.total - before.total, 1);

    const result = await Promise.all(
      pids.map(async (pid): Promise<ProcessInfo | null> => {
        try {
          const [stat, status, cmdline] = await Promise.all([
            readFile(`/proc/${pid}/stat`, 'utf8'),
            readFile(`/proc/${pid}/status`, 'utf8'),
            readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => ''),
          ]);
          const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
          const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
          const uid = Number(/^Uid:\s+(\d+)/m.exec(status)?.[1] ?? -1);
          const cpuDelta = (after.procs.get(pid) ?? 0) - (before.procs.get(pid) ?? 0);
          return {
            pid,
            ppid: Number(rest[1]),
            name,
            user: users.get(uid) ?? (uid >= 0 ? String(uid) : null),
            cpu: Math.max(0, (cpuDelta / totalDelta) * 100),
            memory: Number(rest[21]) * PAGE_SIZE,
            command: cmdline.replace(/\0/g, ' ').trim() || null,
          };
        } catch {
          return null;
        }
      }),
    );
    return result.filter((p): p is ProcessInfo => p !== null);
  }

  async killProcess(pid: number, force: boolean): Promise<void> {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  }

  // ---------------------------------------------------------------- Dịch vụ (systemd, fallback OpenRC)

  private async initSystem(): Promise<'systemd' | 'openrc'> {
    if (await this.findExecutable('systemctl')) return 'systemd';
    if (await this.findExecutable('rc-service')) return 'openrc';
    throw new Error('Không tìm thấy systemd hoặc OpenRC trên máy này');
  }

  async listServices(): Promise<ServiceInfo[]> {
    if ((await this.initSystem()) === 'openrc') return this.listOpenRC();

    const [units, files] = await Promise.all([
      execOk('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--no-pager', '--plain']),
      execOk('systemctl', ['list-unit-files', '--type=service', '--no-legend', '--no-pager']),
    ]);

    const startupOf = new Map<string, ServiceStartup>();
    for (const line of files.stdout.split('\n')) {
      const [unit, state] = line.trim().split(/\s+/);
      if (!unit?.endsWith('.service')) continue;
      const startup: ServiceStartup =
        state === 'enabled' || state === 'enabled-runtime'
          ? 'auto'
          : state === 'disabled' || state === 'masked'
            ? 'disabled'
            : state === 'static'
              ? 'static'
              : 'manual';
      startupOf.set(unit, startup);
    }

    const services = new Map<string, ServiceInfo>();
    for (const line of units.stdout.split('\n')) {
      const match = /^(\S+\.service)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, unit, load, active, sub, description] = match;
      if (load === 'not-found') continue;
      const state: ServiceState =
        active === 'active'
          ? 'running'
          : active === 'activating'
            ? 'starting'
            : active === 'deactivating'
              ? 'stopping'
              : active === 'failed'
                ? 'failed'
                : 'stopped';
      const name = unit.replace(/\.service$/, '');
      services.set(unit, {
        name,
        displayName: name,
        description: sub === 'exited' ? `${description} (oneshot)` : description,
        state,
        startup: startupOf.get(unit) ?? 'unknown',
      });
    }
    // Unit file chưa được load (đã tắt) vẫn hiển thị để người dùng bật lại
    for (const [unit, startup] of startupOf) {
      if (services.has(unit) || unit.includes('@')) continue;
      const name = unit.replace(/\.service$/, '');
      services.set(unit, { name, displayName: name, description: '', state: 'stopped', startup });
    }
    return [...services.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private async listOpenRC(): Promise<ServiceInfo[]> {
    const [all, status] = await Promise.all([execOk('rc-service', ['--list']), exec('rc-status', ['--all', '--nocolor'])]);
    const states = new Map<string, { state: ServiceState; startup: ServiceStartup }>();
    let runlevel = '';
    for (const line of status.stdout.split('\n')) {
      const level = /^Runlevel:\s*(\S+)/.exec(line);
      if (level) {
        runlevel = level[1];
        continue;
      }
      const match = /^\s*(\S+)\s+\[\s*(\w+)/.exec(line);
      if (!match) continue;
      const state: ServiceState = match[2] === 'started' ? 'running' : match[2] === 'crashed' ? 'failed' : 'stopped';
      const startup: ServiceStartup = ['default', 'boot', 'sysinit'].includes(runlevel) ? 'auto' : 'manual';
      states.set(match[1], { state, startup });
    }
    return all.stdout
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
      .sort()
      .map((name) => ({
        name,
        displayName: name,
        description: '',
        state: states.get(name)?.state ?? 'stopped',
        startup: states.get(name)?.startup ?? 'manual',
      }));
  }

  async getService(name: string): Promise<ServiceInfo | null> {
    if ((await this.initSystem()) === 'openrc') return (await this.listOpenRC()).find((s) => s.name === name) ?? null;
    const { stdout, code } = await exec('systemctl', ['show', `${name}.service`, '--property=LoadState,ActiveState,UnitFileState,Description']);
    if (code !== 0) return null;
    const prop = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(stdout)?.[1] ?? '';
    if (prop('LoadState') === 'not-found') return null;
    const active = prop('ActiveState');
    const file = prop('UnitFileState');
    return {
      name,
      displayName: name,
      description: prop('Description'),
      state: active === 'active' ? 'running' : active === 'activating' ? 'starting' : active === 'deactivating' ? 'stopping' : active === 'failed' ? 'failed' : 'stopped',
      startup: file === 'enabled' ? 'auto' : file === 'disabled' || file === 'masked' ? 'disabled' : file === 'static' ? 'static' : 'manual',
    };
  }

  async controlService(name: string, action: ServiceAction): Promise<void> {
    if ((await this.initSystem()) === 'openrc') {
      if (action === 'enable') await execOk('rc-update', ['add', name, 'default']);
      else if (action === 'disable') await execOk('rc-update', ['del', name, 'default']);
      else await execOk('rc-service', [name, action], { timeout: 60_000 });
      return;
    }
    await execOk('systemctl', [action, name], { timeout: 60_000 });
  }

  async serviceLogs(name: string, lines: number): Promise<string> {
    if ((await this.initSystem()) === 'openrc') return 'OpenRC không lưu log riêng cho từng dịch vụ. Xem /var/log/messages.';
    const { stdout, stderr } = await exec('journalctl', ['-u', name, '-n', String(lines), '--no-pager', '--output=short-iso']);
    return stdout || stderr;
  }

  // ---------------------------------------------------------------- Tường lửa

  private async firewallBackend(): Promise<'ufw' | 'firewalld' | 'iptables' | 'none'> {
    if (await this.findExecutable('ufw')) return 'ufw';
    if (await this.findExecutable('firewall-cmd')) return 'firewalld';
    if (await this.findExecutable('iptables')) return 'iptables';
    return 'none';
  }

  async getFirewallStatus(): Promise<FirewallStatus> {
    const backend = await this.firewallBackend();
    if (backend === 'ufw') {
      const { stdout } = await exec('ufw', ['status']);
      const enabled = /Status:\s*active/i.test(stdout);
      return { backend, enabled, detail: enabled ? 'UFW đang bật' : 'UFW đang tắt' };
    }
    if (backend === 'firewalld') {
      const { stdout } = await exec('firewall-cmd', ['--state']);
      const enabled = stdout.trim() === 'running';
      return { backend, enabled, detail: enabled ? 'firewalld đang chạy' : 'firewalld đang dừng' };
    }
    if (backend === 'iptables') {
      const { stdout } = await exec('iptables', ['-S', 'INPUT']);
      const enabled = /^-P INPUT (DROP|REJECT)/m.test(stdout);
      return { backend, enabled, detail: 'iptables (quy tắc không tự lưu sau khi khởi động lại)' };
    }
    return { backend, enabled: false, detail: 'Không tìm thấy ufw, firewalld hay iptables' };
  }

  async setFirewallEnabled(enabled: boolean, keepPorts: number[]): Promise<void> {
    const backend = await this.firewallBackend();
    const ports = [...new Set([SSH_PORT, ...keepPorts])];
    if (enabled) {
      // Luôn mở SSH + cổng panel trước khi bật để không tự khóa mình ngoài
      for (const port of ports) await this.addFirewallRule({ action: 'allow', port: String(port), protocol: 'tcp', source: null, description: 'ZenPanel keep-alive' });
    }
    if (backend === 'ufw') await execOk('ufw', enabled ? ['--force', 'enable'] : ['disable']);
    else if (backend === 'firewalld') await execOk('systemctl', enabled ? ['enable', '--now', 'firewalld'] : ['disable', '--now', 'firewalld']);
    else if (backend === 'iptables') {
      if (enabled) {
        // Giữ loopback và các kết nối đang mở (phiên SSH hiện tại)
        for (const spec of [
          ['-i', 'lo', '-j', 'ACCEPT'],
          ['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
        ]) {
          const check = await exec('iptables', ['-C', 'INPUT', ...spec]);
          if (check.code !== 0) await execOk('iptables', ['-I', 'INPUT', ...spec]);
        }
      }
      await execOk('iptables', ['-P', 'INPUT', enabled ? 'DROP' : 'ACCEPT']);
      await this.saveIptables();
    } else throw new Error('Không có tường lửa nào được cài trên máy');
  }

  async listFirewallRules(): Promise<FirewallRule[]> {
    const backend = await this.firewallBackend();
    if (backend === 'ufw') return this.ufwRules();
    if (backend === 'firewalld') return this.firewalldRules();
    if (backend === 'iptables') return this.iptablesRules();
    return [];
  }

  private async ufwRules(): Promise<FirewallRule[]> {
    const { stdout } = await exec('ufw', ['status', 'numbered']);
    const rules: FirewallRule[] = [];
    for (const line of stdout.split('\n')) {
      const match = /^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)(?:\s+(?:IN|OUT|FWD))?\s+(.+?)\s*(?:#\s*(.*))?$/.exec(line.trim());
      if (!match) continue;
      const [, num, to, action, from, comment] = match;
      const v6 = to.includes('(v6)') || from.includes('(v6)');
      const target = to.replace('(v6)', '').trim();
      const source = from.replace('(v6)', '').trim();
      const [portPart, proto] = target.split('/');
      rules.push({
        id: `ufw:${num}`,
        action: action === 'ALLOW' || action === 'LIMIT' ? 'allow' : 'deny',
        port: /^[\d,:]+$/.test(portPart) ? portPart.replace(':', '-') : portPart === 'Anywhere' ? null : portPart,
        protocol: proto === 'tcp' || proto === 'udp' ? proto : 'any',
        source: source === 'Anywhere' ? null : source,
        description: [comment, v6 ? 'IPv6' : ''].filter(Boolean).join(' · '),
      });
    }
    return rules;
  }

  private async firewalldRules(): Promise<FirewallRule[]> {
    const [ports, services, rich] = await Promise.all([
      exec('firewall-cmd', ['--list-ports']),
      exec('firewall-cmd', ['--list-services']),
      exec('firewall-cmd', ['--list-rich-rules']),
    ]);
    const rules: FirewallRule[] = [];
    for (const item of ports.stdout.trim().split(/\s+/).filter(Boolean)) {
      const [port, proto] = item.split('/');
      rules.push({ id: `port:${item}`, action: 'allow', port, protocol: proto === 'udp' ? 'udp' : 'tcp', source: null, description: '' });
    }
    for (const name of services.stdout.trim().split(/\s+/).filter(Boolean)) {
      rules.push({ id: `service:${name}`, action: 'allow', port: null, protocol: 'any', source: null, description: `Service: ${name}` });
    }
    for (const line of rich.stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
      rules.push({
        id: `rich:${Buffer.from(line).toString('base64url')}`,
        action: /\b(drop|reject)\b/.test(line) ? 'deny' : 'allow',
        port: /port port="([^"]+)"/.exec(line)?.[1] ?? null,
        protocol: (/protocol="(tcp|udp)"/.exec(line)?.[1] as 'tcp' | 'udp' | undefined) ?? 'any',
        source: /source address="([^"]+)"/.exec(line)?.[1] ?? null,
        description: 'Rich rule',
      });
    }
    return rules;
  }

  private async iptablesRules(): Promise<FirewallRule[]> {
    const { stdout } = await execOk('iptables', ['-S', 'INPUT']);
    return stdout
      .split('\n')
      .filter((line) => line.startsWith('-A INPUT') && /-j (ACCEPT|DROP|REJECT)/.test(line))
      .map((line) => {
        const spec = line.replace(/^-A INPUT /, '');
        return {
          id: `ipt:${Buffer.from(spec).toString('base64url')}`,
          action: /-j ACCEPT/.test(spec) ? ('allow' as const) : ('deny' as const),
          port: /--dports? (\S+)/.exec(spec)?.[1]?.replace(':', '-') ?? null,
          protocol: (/-p (tcp|udp)/.exec(spec)?.[1] as 'tcp' | 'udp' | undefined) ?? 'any',
          source: /-s (\S+)/.exec(spec)?.[1] ?? null,
          description: /--comment "?([^"]+)"?/.exec(spec)?.[1] ?? spec,
        };
      });
  }

  async addFirewallRule(rule: FirewallRuleInput): Promise<void> {
    const backend = await this.firewallBackend();
    const protos = rule.protocol === 'any' ? (rule.port ? ['tcp', 'udp'] : [null]) : [rule.protocol];

    if (backend === 'ufw') {
      const existing = await this.ufwRules();
      for (const proto of protos) {
        const args = [rule.action === 'allow' ? 'allow' : 'deny', 'from', rule.source ?? 'any', 'to', 'any'];
        if (rule.port) args.push('port', rule.port.replace('-', ':'));
        if (proto) args.push('proto', proto);
        args.push('comment', rule.description || 'ZenPanel');
        // Luật chặn IP phải đứng trước các luật cho phép
        if (rule.action === 'deny' && existing.length) args.unshift('insert', '1');
        await execOk('ufw', args);
      }
      return;
    }

    if (backend === 'firewalld') {
      for (const proto of protos) {
        if (!rule.source && rule.port && rule.action === 'allow') {
          await execOk('firewall-cmd', ['--permanent', `--add-port=${rule.port}/${proto}`]);
        } else {
          const family = rule.source?.includes(':') ? 'ipv6' : 'ipv4';
          const parts = [`rule family="${family}"`];
          if (rule.source) parts.push(`source address="${rule.source}"`);
          if (rule.port) parts.push(`port port="${rule.port}" protocol="${proto}"`);
          parts.push(rule.action === 'allow' ? 'accept' : 'drop');
          await execOk('firewall-cmd', ['--permanent', `--add-rich-rule=${parts.join(' ')}`]);
        }
      }
      await execOk('firewall-cmd', ['--reload']);
      return;
    }

    if (backend === 'iptables') {
      for (const proto of protos) {
        const args = ['-I', 'INPUT'];
        if (rule.source) args.push('-s', rule.source);
        if (proto) args.push('-p', proto);
        if (rule.port && proto) args.push('-m', proto, '--dport', rule.port.replace('-', ':'));
        args.push('-m', 'comment', '--comment', rule.description || 'ZenPanel');
        args.push('-j', rule.action === 'allow' ? 'ACCEPT' : 'DROP');
        await execOk('iptables', args);
      }
      await this.saveIptables();
      return;
    }
    throw new Error('Không có tường lửa nào được cài trên máy');
  }

  async deleteFirewallRule(id: string): Promise<void> {
    const [kind, ...restParts] = id.split(':');
    const value = restParts.join(':');
    if (kind === 'ufw') await execOk('ufw', ['--force', 'delete', value]);
    else if (kind === 'port') await execOk('firewall-cmd', ['--permanent', `--remove-port=${value}`]);
    else if (kind === 'service') await execOk('firewall-cmd', ['--permanent', `--remove-service=${value}`]);
    else if (kind === 'rich') await execOk('firewall-cmd', ['--permanent', `--remove-rich-rule=${Buffer.from(value, 'base64url').toString()}`]);
    else if (kind === 'ipt') {
      await execOk('iptables', ['-D', 'INPUT', ...tokenize(Buffer.from(value, 'base64url').toString())]);
      await this.saveIptables();
    }
    else throw new Error('Mã luật tường lửa không hợp lệ');
    if (kind === 'port' || kind === 'service' || kind === 'rich') await execOk('firewall-cmd', ['--reload']);
  }

  async listListeningPorts(): Promise<ListeningPort[]> {
    if (await this.findExecutable('ss')) {
      const { stdout } = await execOk('ss', ['-tulnpH']);
      return stdout
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .filter((cols) => cols.length >= 5)
        .map((cols) => {
          const local = cols[4];
          const sep = local.lastIndexOf(':');
          const proc = /\("([^"]+)",pid=(\d+)/.exec(cols.slice(6).join(' '));
          return {
            protocol: cols[0].startsWith('udp') ? ('udp' as const) : ('tcp' as const),
            address: local.slice(0, sep).replace(/%\S+$/, ''),
            port: Number(local.slice(sep + 1)),
            pid: proc ? Number(proc[2]) : null,
            process: proc?.[1] ?? null,
          };
        })
        .filter((p) => p.port > 0);
    }
    // BusyBox (Alpine) chỉ có netstat
    const { stdout } = await execOk('netstat', ['-tulnp']);
    return stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((cols) => /^(tcp|udp)/.test(cols[0] ?? ''))
      .map((cols) => {
        const local = cols[3];
        const sep = local.lastIndexOf(':');
        const procCol = cols[cols.length - 1];
        const [pid, name] = procCol.includes('/') ? procCol.split('/') : [null, null];
        return {
          protocol: cols[0].startsWith('udp') ? ('udp' as const) : ('tcp' as const),
          address: local.slice(0, sep),
          port: Number(local.slice(sep + 1)),
          pid: pid ? Number(pid) : null,
          process: name ?? null,
        };
      });
  }

  // ---------------------------------------------------------------- File, Terminal, Website

  async fileRoots(): Promise<string[]> {
    return ['/'];
  }

  defaultShell(): ShellCommand {
    if (existsSync('/bin/bash')) return { file: '/bin/bash', args: ['-l'], label: 'Bash' };
    if (existsSync('/bin/zsh')) return { file: '/bin/zsh', args: ['-l'], label: 'Zsh' };
    return { file: '/bin/sh', args: ['-l'], label: 'sh' };
  }

  defaultWebRoot(): string {
    return process.getuid?.() === 0 ? '/var/www' : dataPath('www');
  }

  webServers(): WebServerDriver[] {
    this.drivers ??= [new NginxDriver(this), new CaddyDriver(this)];
    return this.drivers;
  }

  async installWebServer(kind: string): Promise<void> {
    if (kind === 'caddy') {
      await resolveTool(this, 'caddy', { url: this.caddyDownloadUrl() });
      return;
    }
    if (kind !== 'nginx') throw new Error(`Không hỗ trợ cài "${kind}" trên Linux`);
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
    const opts = { timeout: 600_000, env };
    if (await this.findExecutable('apt-get')) {
      await execOk('apt-get', ['update'], opts);
      await execOk('apt-get', ['install', '-y', 'nginx'], opts);
    } else if (await this.findExecutable('dnf')) await execOk('dnf', ['install', '-y', 'nginx'], opts);
    else if (await this.findExecutable('yum')) await execOk('yum', ['install', '-y', 'nginx'], opts);
    else if (await this.findExecutable('apk')) await execOk('apk', ['add', 'nginx'], opts);
    else throw new Error('Không nhận diện được trình quản lý gói (apt/dnf/yum/apk)');

    if (await this.findExecutable('systemctl')) await exec('systemctl', ['enable', '--now', 'nginx']);
    else if (await this.findExecutable('rc-service')) {
      await exec('rc-update', ['add', 'nginx', 'default']);
      await exec('rc-service', ['nginx', 'start']);
    }
  }

  // ---------------------------------------------------------------- Nguồn, cron, cập nhật

  async power(action: PowerAction): Promise<void> {
    const systemd = await this.findExecutable('systemctl');
    // Trễ 2 giây để kịp trả response cho dashboard
    setTimeout(() => {
      if (systemd) void exec('systemctl', [action === 'reboot' ? 'reboot' : 'poweroff']);
      else void exec(action === 'reboot' ? 'reboot' : 'poweroff', []);
    }, 2000);
  }

  async syncScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
    if (!(await this.findExecutable('crontab'))) throw new Error('Chưa cài cron. Chạy: apt install cron (hoặc dnf install cronie)');
    const logDir = dataPath('logs', 'tasks');
    await mkdir(logDir, { recursive: true });
    const current = await exec('crontab', ['-l']);
    const keep = (current.code === 0 ? current.stdout : '').split('\n').filter((line) => line.trim() && !line.includes(CRON_MARK));
    const managed = tasks
      .filter((task) => task.enabled)
      .map((task) => {
        // % là ký tự đặc biệt trong crontab
        const command = task.command.replace(/%/g, '\\%').replace(/\n/g, ' ');
        return `${cronExpression(task.schedule)} ( ${command} ) >> ${path.join(logDir, `${task.id}.log`)} 2>&1 ${CRON_MARK}${task.id}`;
      });
    await execOk('crontab', ['-'], { input: `${[...keep, ...managed].join('\n')}\n` });
  }

  runShell(command: string, opts?: ExecOptions) {
    const shell = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    return exec(shell, ['-c', command], opts);
  }

  installerScript(): string {
    return 'install.sh';
  }

  archiveFormat(): 'tar.gz' {
    return 'tar.gz';
  }

  async launchDetachedInstall({ scriptPath, env, logFile }: DetachedInstall): Promise<void> {
    const command = `bash "${scriptPath}" > "${logFile}" 2>&1`;
    // systemd-run tách installer khỏi cgroup của zenpanel.service, nếu không installer sẽ bị kill khi restart service
    if (await this.findExecutable('systemd-run')) {
      await execOk('systemd-run', [
        `--unit=zenpanel-update-${Date.now()}`,
        '--collect',
        ...Object.entries(env).map(([key, value]) => `--setenv=${key}=${value}`),
        '/bin/bash',
        '-c',
        command,
      ]);
      return;
    }
    const child = spawn('setsid', ['/bin/bash', '-c', command], { detached: true, stdio: 'ignore', env: { ...process.env, ...env } });
    child.unref();
  }

  // ---------------------------------------------------------------- Lưu quy tắc tường lửa vĩnh viễn

  async firewallPersistence(): Promise<FirewallPersistence> {
    const backend = await this.firewallBackend();
    if (backend === 'ufw') return { required: false, installed: true, tool: 'UFW tự lưu quy tắc' };
    if (backend === 'firewalld') return { required: false, installed: true, tool: 'firewalld (--permanent)' };
    if (backend === 'none') return { required: false, installed: false, tool: 'Không có tường lửa' };
    if (await this.findExecutable('netfilter-persistent')) return { required: true, installed: true, tool: 'iptables-persistent' };
    if (existsSync('/usr/libexec/iptables/iptables.init') || existsSync('/etc/sysconfig/iptables-config')) return { required: true, installed: true, tool: 'iptables-services' };
    return { required: true, installed: false, tool: (await this.findExecutable('apt-get')) ? 'iptables-persistent' : 'iptables-services' };
  }

  async installFirewallPersistence(): Promise<void> {
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
    const opts = { timeout: 600_000, env };
    if (await this.findExecutable('apt-get')) {
      // Trả lời trước câu hỏi "lưu quy tắc hiện tại?" để apt không dừng lại chờ nhập
      await execOk('debconf-set-selections', [], {
        input: 'iptables-persistent iptables-persistent/autosave_v4 boolean true\niptables-persistent iptables-persistent/autosave_v6 boolean true\n',
      });
      await execOk('apt-get', ['update'], opts);
      await execOk('apt-get', ['install', '-y', 'iptables-persistent'], opts);
      await exec('systemctl', ['enable', 'netfilter-persistent']);
    } else if ((await this.findExecutable('dnf')) || (await this.findExecutable('yum'))) {
      const pm = (await this.findExecutable('dnf')) ? 'dnf' : 'yum';
      await execOk(pm, ['install', '-y', 'iptables-services'], opts);
      await exec('systemctl', ['enable', 'iptables']);
    } else if (await this.findExecutable('apk')) {
      await execOk('apk', ['add', 'iptables-openrc'], opts);
      await exec('rc-update', ['add', 'iptables', 'default']);
    } else throw new Error('Không nhận diện được trình quản lý gói để cài iptables-persistent');
    await this.saveIptables();
  }

  /** Ghi quy tắc iptables hiện tại ra file để tự nạp lại khi khởi động */
  private async saveIptables(): Promise<void> {
    if (await this.findExecutable('netfilter-persistent')) {
      await exec('netfilter-persistent', ['save']);
      return;
    }
    const save = await exec('sh', ['-c', 'iptables-save']);
    if (save.code !== 0) return;
    for (const file of ['/etc/sysconfig/iptables', '/etc/iptables/rules.v4', '/etc/iptables/rules-save']) {
      if (existsSync(path.dirname(file))) {
        await writeFile(file, save.stdout);
        return;
      }
    }
  }
}
