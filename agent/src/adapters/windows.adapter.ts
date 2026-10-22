// ZenPanel - Adapter cho Windows Server / Windows 10/11 (PowerShell, WMI/CIM, Windows Firewall)
import { mkdir, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
import { CommandError, exec, execOk, type ExecOptions } from '../core/exec.js';
import { resolveTool } from '../core/download.js';
import { dataPath } from '../core/store.js';
import { CaddyDriver } from './web/caddy.driver.js';
import { IISDriver } from './web/iis.driver.js';
import type { WebServerDriver } from './web/types.js';

const RDP_PORT = 3389;
const FIREWALL_GROUP = 'ZenPanel';
const TASK_PATH = '\\ZenPanel\\';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const UTF8_BOM = '\uFEFF';

function triggerScript(schedule: TaskSchedule): string {
  switch (schedule.type) {
    case 'minutes':
      return `New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes ${schedule.every})`;
    case 'hourly':
      return `New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddMinutes(${schedule.minute})) -RepetitionInterval (New-TimeSpan -Hours 1)`;
    case 'daily':
      return `New-ScheduledTaskTrigger -Daily -At '${schedule.time}'`;
    case 'weekly':
      return `New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${DAYS[schedule.day]} -At '${schedule.time}'`;
    case 'startup':
      return 'New-ScheduledTaskTrigger -AtStartup';
  }
}

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
    // try/catch để trả về đúng thông báo lỗi (Exception.Message) thay vì dòng vị trí lỗi của PowerShell
    const wrapped = `${prelude} try { ${script} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped], { timeout });
    if (result.code !== 0) {
      const message = result.stderr.trim().split(/\r?\n/).filter(Boolean).pop() ?? `PowerShell thoát với mã ${result.code}`;
      throw new CommandError(/access is denied|truy cập bị từ chối/i.test(message) ? `${message} (cần chạy ZenPanel với quyền Administrator)` : message, result);
    }
    return result.stdout;
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
    return list.map((s) => this.toServiceInfo(s)).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private toServiceInfo(s: { Name: string; DisplayName: string; State: string; StartMode: string; Description: string | null }): ServiceInfo {
    const stateMap: Record<string, ServiceState> = { Running: 'running', Stopped: 'stopped', 'Start Pending': 'starting', 'Stop Pending': 'stopping' };
    const startupMap: Record<string, ServiceStartup> = { Auto: 'auto', Manual: 'manual', Disabled: 'disabled' };
    return {
      name: s.Name,
      displayName: s.DisplayName,
      description: s.Description ?? '',
      state: stateMap[s.State] ?? 'unknown',
      startup: startupMap[s.StartMode] ?? 'unknown',
    };
  }

  async getService(name: string): Promise<ServiceInfo | null> {
    const list = await this.psJson<{ Name: string; DisplayName: string; State: string; StartMode: string; Description: string | null }[]>(
      `ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Service -Filter ("Name='" + ${psQuote(name)}.Replace("'", "''") + "'") | Select-Object Name,DisplayName,State,StartMode,Description)`,
    );
    return list.length ? this.toServiceInfo(list[0]) : null;
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

  // ---------------------------------------------------------------- Nguồn, Task Scheduler, cập nhật

  async power(action: PowerAction): Promise<void> {
    await execOk('shutdown.exe', [action === 'reboot' ? '/r' : '/s', '/t', '5', '/c', 'ZenPanel: yêu cầu từ bảng điều khiển']);
  }

  async syncScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
    const taskDir = dataPath('tasks');
    const logDir = dataPath('logs', 'tasks');
    await mkdir(taskDir, { recursive: true });
    await mkdir(logDir, { recursive: true });
    const lines = [
      // Gỡ tác vụ ZenPanel cũ rồi tạo lại theo tasks.json
      `Get-ScheduledTask -TaskPath ${psQuote(TASK_PATH)} -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false;`,
      "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;",
    ];
    for (const task of tasks) {
      const script = path.join(taskDir, `${task.id}.ps1`);
      // BOM để PowerShell 5.1 đọc đúng tiếng Việt trong lệnh
      await writeFile(script, `${UTF8_BOM}${task.command}\r\n`, 'utf8');
      const log = path.join(logDir, `${task.id}.log`);
      const argument = `/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${script}" >> "${log}" 2>&1`;
      lines.push(
        `$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ${psQuote(argument)};`,
        `$trigger = ${triggerScript(task.schedule)};`,
        `Register-ScheduledTask -TaskPath ${psQuote(TASK_PATH)} -TaskName ${psQuote(`zp-${task.id}`)} -Description ${psQuote(task.name)} -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null;`,
      );
      if (!task.enabled) lines.push(`Disable-ScheduledTask -TaskPath ${psQuote(TASK_PATH)} -TaskName ${psQuote(`zp-${task.id}`)} | Out-Null;`);
    }
    await this.ps(lines.join(' '), 120_000);
  }

  runShell(command: string, opts?: ExecOptions) {
    return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`], opts);
  }

  installerScript(): string {
    return 'install.ps1';
  }

  archiveFormat(): 'zip' {
    return 'zip';
  }

  async launchDetachedInstall({ scriptPath, env, logFile }: DetachedInstall): Promise<void> {
    // Chạy installer bằng Scheduled Task riêng (SYSTEM) để không bị dừng khi installer tắt "ZenPanel Agent"
    const runner = path.join(path.dirname(scriptPath), 'run-update.cmd');
    const setEnv = Object.entries(env).map(([key, value]) => `set "${key}=${value}"`);
    await writeFile(runner, ['@echo off', ...setEnv, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" > "${logFile}" 2>&1`, ''].join('\r\n'), 'utf8');
    await this.ps(
      [
        `$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ${psQuote(`/c "${runner}"`)};`,
        "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;",
        "Register-ScheduledTask -TaskName 'ZenPanel Update' -Action $action -Principal $principal -Force | Out-Null;",
        "Start-ScheduledTask -TaskName 'ZenPanel Update';",
      ].join(' '),
    );
  }

  async firewallPersistence(): Promise<FirewallPersistence> {
    return { required: false, installed: true, tool: 'Windows Firewall tự lưu quy tắc' };
  }

  async installFirewallPersistence(): Promise<void> {
    // Windows Firewall luôn lưu quy tắc vĩnh viễn
  }
}
