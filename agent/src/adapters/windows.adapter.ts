// ZenPanel - Adapter cho Windows Server / Windows 10/11 (PowerShell, WMI/CIM, Windows Firewall)
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import type {
  DiskUsage,
  FirewallRule,
  FirewallRuleInput,
  FirewallStatus,
  ListeningPort,
  NetworkTotals,
  OSAdapter,
  OSInfo,
  ProcessInfo,
  ServiceAction,
  ServiceInfo,
  ServiceStartup,
  ServiceState,
  ShellCommand,
} from './base.adapter.js';
import { exec, execOk, type ExecOptions } from '../core/exec.js';
import { resolveTool } from '../core/download.js';
import { dataPath } from '../core/store.js';
import { CaddyDriver } from './web/caddy.driver.js';
import { IISDriver } from './web/iis.driver.js';
import type { WebServerDriver } from './web/types.js';

const RDP_PORT = 3389;
const FIREWALL_GROUP = 'ZenPanel';

/** Đặt chuỗi vào nháy đơn an toàn cho PowerShell */
const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

export class WindowsAdapter implements OSAdapter {
  readonly family = 'windows' as const;
  private roots: { at: number; drives: { root: string; fs: string }[] } | null = null;
  private drivers: WebServerDriver[] | null = null;

  exec(file: string, args: string[], opts?: ExecOptions) {
    return exec(file, args, opts);
  }

  execOk(file: string, args: string[], opts?: ExecOptions) {
    return execOk(file, args, opts);
  }

  /** Chạy script PowerShell, ném lỗi nếu thất bại */
  private async ps(script: string, timeout = 60_000): Promise<string> {
    const prelude = "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8;";
    const { stdout } = await execOk('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `${prelude} ${script}`], {
      timeout,
    });
    return stdout;
  }

  /** Chạy script trả về JSON mảng (script phải tự gọi ConvertTo-Json -InputObject @(...)) */
  private async psJson<T>(script: string, timeout?: number): Promise<T> {
    const out = (await this.ps(script, timeout)).trim();
    return (out ? JSON.parse(out) : []) as T;
  }

  async getInfo(): Promise<OSInfo> {
    let name = `Windows ${os.release()}`;
    let isAdmin = false;
    try {
      const info = await this.psJson<{ caption: string; admin: boolean }>(
        "$id=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent(); ConvertTo-Json -Compress -InputObject @{ caption=(Get-CimInstance Win32_OperatingSystem).Caption; admin=$id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }",
      );
      name = info.caption?.trim() || name;
      isAdmin = Boolean(info.admin);
    } catch {
      // Giữ tên mặc định nếu không gọi được CIM
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
      isAdmin,
    };
  }

  async findExecutable(name: string): Promise<string | null> {
    try {
      const { stdout, code } = await exec('where.exe', [name]);
      if (code !== 0) return null;
      return stdout.split(/\r?\n/).find((line) => line.trim())?.trim() ?? null;
    } catch {
      return null;
    }
  }

  async makeExecutable(): Promise<void> {
    // Windows không cần chmod
  }

  executableName(name: string): string {
    return name.endsWith('.exe') ? name : `${name}.exe`;
  }

  cloudflaredAssetName(): string {
    return os.arch() === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  }

  caddyDownloadUrl(): string {
    return `https://caddyserver.com/api/download?os=windows&arch=${os.arch() === 'arm64' ? 'arm64' : 'amd64'}`;
  }

  // ---------------------------------------------------------------- Tài nguyên

  private async drives(): Promise<{ root: string; fs: string }[]> {
    if (this.roots && Date.now() - this.roots.at < 60_000) return this.roots.drives;
    let drives: { root: string; fs: string }[] = [];
    try {
      const list = await this.psJson<{ id: string; fs: string | null }[]>(
        'ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { @{ id=$_.DeviceID; fs=$_.FileSystem } })',
      );
      drives = list.map((d) => ({ root: `${d.id}\\`, fs: d.fs ?? 'NTFS' }));
    } catch {
      drives = [{ root: `${process.env.SystemDrive ?? 'C:'}\\`, fs: 'NTFS' }];
    }
    this.roots = { at: Date.now(), drives };
    return drives;
  }

  async getDisks(): Promise<DiskUsage[]> {
    const drives = await this.drives();
    const result = await Promise.all(
      drives.map(async ({ root, fs }) => {
        try {
          const s = await statfs(root);
          const total = s.blocks * s.bsize;
          return { mount: root, fs, total, used: total - s.bfree * s.bsize };
        } catch {
          return null;
        }
      }),
    );
    return result.filter((d): d is DiskUsage => d !== null);
  }

  async getNetworkTotals(): Promise<NetworkTotals> {
    // "netstat -e" rất nhanh; dòng số liệu đầu tiên là Bytes (nhãn có thể bị dịch theo ngôn ngữ OS)
    const { stdout } = await exec('netstat', ['-e']);
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^\S.*?\s+(\d+)\s+(\d+)\s*$/.exec(line);
      if (match) return { rx: Number(match[1]), tx: Number(match[2]) };
    }
    return { rx: 0, tx: 0 };
  }

  getLoadAverage(): null {
    return null;
  }

  // ---------------------------------------------------------------- Tiến trình

  async listProcesses(): Promise<ProcessInfo[]> {
    const cores = os.cpus().length || 1;
    const list = await this.psJson<{ pid: number; ppid: number; name: string; cpu: number; mem: number; cmd: string | null }[]>(
      [
        '$perf=@{}; Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { $perf[[int]$_.IDProcess]=$_ };',
        '$list = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne 0 } | ForEach-Object {',
        '  $p=$perf[[int]$_.ProcessId];',
        '  [pscustomobject]@{ pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; name=$_.Name;',
        '    cpu=$(if($p){[double]$p.PercentProcessorTime}else{0});',
        '    mem=$(if($p){[int64]$p.WorkingSetPrivate}else{[int64]$_.WorkingSetSize}); cmd=$_.CommandLine } };',
        'ConvertTo-Json -Compress -InputObject @($list)',
      ].join(' '),
    );
    return list.map((p) => ({
      pid: p.pid,
      ppid: p.ppid,
      name: p.name,
      user: null,
      cpu: Math.min(100, (p.cpu ?? 0) / cores),
      memory: p.mem ?? 0,
      command: p.cmd,
    }));
  }

  async killProcess(pid: number, force: boolean): Promise<void> {
    await execOk('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])]);
  }

  // ---------------------------------------------------------------- Windows Services

  async listServices(): Promise<ServiceInfo[]> {
    const list = await this.psJson<{ Name: string; DisplayName: string; State: string; StartMode: string; Description: string | null }[]>(
      'ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Service | Select-Object Name,DisplayName,State,StartMode,Description)',
    );
    const stateMap: Record<string, ServiceState> = {
      Running: 'running',
      Stopped: 'stopped',
      'Start Pending': 'starting',
      'Stop Pending': 'stopping',
    };
    const startupMap: Record<string, ServiceStartup> = { Auto: 'auto', Manual: 'manual', Disabled: 'disabled' };
    return list
      .map((s) => ({
        name: s.Name,
        displayName: s.DisplayName,
        description: s.Description ?? '',
        state: stateMap[s.State] ?? 'unknown',
        startup: startupMap[s.StartMode] ?? 'unknown',
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async controlService(name: string, action: ServiceAction): Promise<void> {
    const n = psQuote(name);
    const scripts: Record<ServiceAction, string> = {
      start: `Start-Service -Name ${n}`,
      stop: `Stop-Service -Name ${n} -Force`,
      restart: `Restart-Service -Name ${n} -Force`,
      enable: `Set-Service -Name ${n} -StartupType Automatic`,
      disable: `Set-Service -Name ${n} -StartupType Disabled`,
    };
    await this.ps(scripts[action], 90_000);
  }

  async serviceLogs(name: string, lines: number): Promise<string> {
    return this.ps(
      [
        `$svc = Get-Service -Name ${psQuote(name)};`,
        `Get-EventLog -LogName System -Source 'Service Control Manager' -Newest 2000 |`,
        `Where-Object { $_.Message -like ('*' + $svc.DisplayName + '*') } | Select-Object -First ${lines} |`,
        `ForEach-Object { $_.TimeGenerated.ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $_.EntryType + '  ' + $_.Message }`,
      ].join(' '),
    );
  }

  // ---------------------------------------------------------------- Windows Firewall

  async getFirewallStatus(): Promise<FirewallStatus> {
    const profiles = await this.psJson<{ Name: string; Enabled: boolean }[]>(
      'ConvertTo-Json -Compress -InputObject @(Get-NetFirewallProfile | ForEach-Object { @{ Name=$_.Name; Enabled=[bool]$_.Enabled } })',
    );
    return {
      backend: 'windows',
      enabled: profiles.some((p) => p.Enabled),
      detail: profiles.map((p) => `${p.Name}: ${p.Enabled ? 'Bật' : 'Tắt'}`).join(' · '),
    };
  }

  async setFirewallEnabled(enabled: boolean, keepPorts: number[]): Promise<void> {
    if (enabled) {
      for (const port of [...new Set([RDP_PORT, ...keepPorts])]) {
        await this.addFirewallRule({ action: 'allow', port: String(port), protocol: 'tcp', source: null, description: `ZenPanel keep-alive ${port}` });
      }
    }
    await this.ps(`Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled ${enabled ? 'True' : 'False'}`);
  }

  async listFirewallRules(): Promise<FirewallRule[]> {
    const list = await this.psJson<{ id: string; name: string; action: string; port: string; protocol: string; source: string }[]>(
      [
        `$rules = Get-NetFirewallRule -Group ${psQuote(FIREWALL_GROUP)} -ErrorAction SilentlyContinue | ForEach-Object {`,
        '  $pf = $_ | Get-NetFirewallPortFilter; $af = $_ | Get-NetFirewallAddressFilter;',
        '  @{ id=$_.Name; name=$_.DisplayName; action=$_.Action.ToString(); port=($pf.LocalPort -join ","); protocol=[string]$pf.Protocol; source=($af.RemoteAddress -join ",") } };',
        'ConvertTo-Json -Compress -InputObject @($rules)',
      ].join(' '),
    );
    return list.map((r) => ({
      id: r.id,
      action: r.action === 'Allow' ? 'allow' : 'deny',
      port: !r.port || r.port === 'Any' ? null : r.port,
      protocol: r.protocol === 'TCP' ? 'tcp' : r.protocol === 'UDP' ? 'udp' : 'any',
      source: !r.source || r.source === 'Any' ? null : r.source,
      description: r.name,
    }));
  }

  async addFirewallRule(rule: FirewallRuleInput): Promise<void> {
    const protos = rule.protocol === 'any' ? (rule.port ? ['TCP', 'UDP'] : ['Any']) : [rule.protocol.toUpperCase()];
    for (const proto of protos) {
      const label =
        rule.description ||
        `ZenPanel - ${rule.action === 'allow' ? 'Allow' : 'Block'} ${rule.port ?? 'all'}${proto !== 'Any' ? `/${proto}` : ''}${rule.source ? ` from ${rule.source}` : ''}`;
      const parts = [
        'New-NetFirewallRule',
        `-DisplayName ${psQuote(proto !== 'Any' && protos.length > 1 ? `${label} (${proto})` : label)}`,
        `-Group ${psQuote(FIREWALL_GROUP)}`,
        '-Direction Inbound',
        `-Action ${rule.action === 'allow' ? 'Allow' : 'Block'}`,
        `-Protocol ${proto}`,
      ];
      if (rule.port) parts.push(`-LocalPort ${psQuote(rule.port)}`);
      if (rule.source) parts.push(`-RemoteAddress ${psQuote(rule.source)}`);
      await this.ps(`${parts.join(' ')} | Out-Null`);
    }
  }

  async deleteFirewallRule(id: string): Promise<void> {
    await this.ps(`Remove-NetFirewallRule -Name ${psQuote(id)}`);
  }

  async listListeningPorts(): Promise<ListeningPort[]> {
    const list = await this.psJson<{ protocol: 'tcp' | 'udp'; address: string; port: number; pid: number; process: string | null }[]>(
      [
        '$names=@{}; Get-Process | ForEach-Object { $names[[int]$_.Id]=$_.ProcessName };',
        '$tcp = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { @{ protocol="tcp"; address=$_.LocalAddress; port=[int]$_.LocalPort; pid=[int]$_.OwningProcess; process=$names[[int]$_.OwningProcess] } };',
        '$udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue | ForEach-Object { @{ protocol="udp"; address=$_.LocalAddress; port=[int]$_.LocalPort; pid=[int]$_.OwningProcess; process=$names[[int]$_.OwningProcess] } };',
        'ConvertTo-Json -Compress -InputObject @(@($tcp) + @($udp))',
      ].join(' '),
    );
    return list.filter((p) => p && p.port > 0).map((p) => ({ ...p, process: p.process ?? null }));
  }

  // ---------------------------------------------------------------- File, Terminal, Website

  async fileRoots(): Promise<string[]> {
    return (await this.drives()).map((d) => d.root);
  }

  defaultShell(): ShellCommand {
    return { file: 'powershell.exe', args: ['-NoLogo'], label: 'PowerShell' };
  }

  defaultWebRoot(): string {
    return dataPath('www');
  }

  webServers(): WebServerDriver[] {
    this.drivers ??= [new IISDriver(this), new CaddyDriver(this)];
    return this.drivers;
  }

  async installWebServer(kind: string): Promise<void> {
    if (kind === 'caddy') {
      await resolveTool(this, 'caddy', { url: this.caddyDownloadUrl() });
      return;
    }
    if (kind !== 'iis') throw new Error(`Không hỗ trợ cài "${kind}" trên Windows`);
    // Windows Server dùng Install-WindowsFeature, Windows 10/11 dùng Enable-WindowsOptionalFeature
    await this.ps(
      "if (Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue) { Install-WindowsFeature -Name Web-Server -IncludeManagementTools | Out-Null } else { Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole,IIS-WebServer -All -NoRestart | Out-Null }",
      900_000,
    );
  }
}
