// ZenPanel - Interface quy chuẩn chung cho mọi OS adapter.
// Mọi thao tác hệ thống phải đi qua đây, không gọi lệnh OS trực tiếp trong service/controller.
import type { ExecOptions, ExecResult } from '../core/exec.js';
import type { WebServerDriver } from './web/types.js';

export type OSFamily = 'windows' | 'linux';

export interface OSInfo {
  family: OSFamily;
  /** Tên hiển thị, ví dụ "Ubuntu 24.04 LTS" hoặc "Windows Server 2022" */
  name: string;
  kernel: string;
  arch: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemory: number;
  isAdmin: boolean;
}

export interface DiskUsage {
  mount: string;
  fs: string;
  total: number;
  used: number;
}

export interface NetworkTotals {
  rx: number;
  tx: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number | null;
  name: string;
  user: string | null;
  /** % CPU tính trên toàn bộ máy (0-100) */
  cpu: number;
  /** Bộ nhớ đang dùng (byte) */
  memory: number;
  command: string | null;
}

export type ServiceState = 'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'unknown';
export type ServiceStartup = 'auto' | 'manual' | 'disabled' | 'static' | 'unknown';
export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

export interface ServiceInfo {
  name: string;
  displayName: string;
  description: string;
  state: ServiceState;
  startup: ServiceStartup;
}

export type FirewallBackend = 'ufw' | 'firewalld' | 'iptables' | 'windows' | 'none';

export interface FirewallStatus {
  backend: FirewallBackend;
  enabled: boolean;
  /** Ghi chú thêm (ví dụ profile nào của Windows Firewall đang bật) */
  detail: string;
}

export interface FirewallRule {
  id: string;
  action: 'allow' | 'deny';
  /** Cổng hoặc dải cổng "8000-8100"; null = mọi cổng */
  port: string | null;
  protocol: 'tcp' | 'udp' | 'any';
  /** IP/CIDR nguồn; null = mọi nơi */
  source: string | null;
  description: string;
}

export interface FirewallRuleInput {
  action: 'allow' | 'deny';
  port: string | null;
  protocol: 'tcp' | 'udp' | 'any';
  source: string | null;
  description?: string;
}

export interface ListeningPort {
  protocol: 'tcp' | 'udp';
  address: string;
  port: number;
  pid: number | null;
  process: string | null;
}

export interface ShellCommand {
  file: string;
  args: string[];
  label: string;
}

export interface OSAdapter {
  readonly family: OSFamily;
  getInfo(): Promise<OSInfo>;

  /** Chạy một chương trình đa nền tảng (docker, caddy, cloudflared...) */
  exec(file: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;
  execOk(file: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;

  /** Tìm file thực thi trong PATH, trả về đường dẫn tuyệt đối hoặc null */
  findExecutable(name: string): Promise<string | null>;
  /** Cấp quyền thực thi cho file vừa tải về (no-op trên Windows) */
  makeExecutable(filePath: string): Promise<void>;
  /** "caddy" -> "caddy.exe" trên Windows */
  executableName(name: string): string;

  /** Tên file cloudflared trên GitHub Releases tương ứng OS + kiến trúc CPU */
  cloudflaredAssetName(): string;
  /** URL tải Caddy phù hợp OS + CPU */
  caddyDownloadUrl(): string;

  // --- Giám sát tài nguyên ---
  getDisks(): Promise<DiskUsage[]>;
  getNetworkTotals(): Promise<NetworkTotals>;
  getLoadAverage(): number[] | null;

  // --- Tiến trình ---
  listProcesses(): Promise<ProcessInfo[]>;
  killProcess(pid: number, force: boolean): Promise<void>;

  // --- Dịch vụ hệ thống (Windows Services / systemd / OpenRC) ---
  listServices(): Promise<ServiceInfo[]>;
  controlService(name: string, action: ServiceAction): Promise<void>;
  serviceLogs(name: string, lines: number): Promise<string>;

  // --- Tường lửa ---
  getFirewallStatus(): Promise<FirewallStatus>;
  setFirewallEnabled(enabled: boolean, keepPorts: number[]): Promise<void>;
  listFirewallRules(): Promise<FirewallRule[]>;
  addFirewallRule(rule: FirewallRuleInput): Promise<void>;
  deleteFirewallRule(id: string): Promise<void>;
  listListeningPorts(): Promise<ListeningPort[]>;

  // --- File Manager ---
  /** Các điểm gốc để duyệt file: ["/"] trên Linux, ["C:\\", "D:\\"] trên Windows */
  fileRoots(): Promise<string[]>;

  // --- Web Terminal ---
  defaultShell(): ShellCommand;

  // --- Website ---
  defaultWebRoot(): string;
  /** Các web server có thể dùng trên OS này (Nginx/Caddy trên Linux, IIS/Caddy trên Windows) */
  webServers(): WebServerDriver[];
  /** Cài web server bằng trình quản lý gói của OS */
  installWebServer(kind: string): Promise<void>;
}
