// ZenPanel - Interface quy chuẩn chung cho mọi OS adapter.
// Mọi thao tác hệ thống phải đi qua đây, không gọi lệnh OS trực tiếp trong service/controller.
import type { ChildProcess } from 'node:child_process';
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
  /** PID tiến trình chính (khi đang chạy) */
  pid?: number | null;
  /** RAM đang dùng (byte) */
  memory?: number | null;
}

/** Nguồn nhật ký hệ thống: journal (Linux), Event Log (Windows) hoặc file log */
export interface LogSource {
  id: string;
  label: string;
  group: string;
  kind: 'journal' | 'eventlog' | 'file';
  /** kind=file: đường dẫn file */
  path?: string;
}

/** Thông tin RAM chi tiết để tối ưu (byte) */
export interface MemoryDetail {
  total: number;
  available: number;
  /** RAM trống thật (chưa bị cache chiếm): MemFree (Linux) / Free+Zero page list (Windows) - dùng để đo kết quả tối ưu */
  free: number;
  used: number;
  /** Cache có thể thu hồi: PageCache + Buffers + SReclaimable (Linux) / Standby (Windows) */
  cache: number;
  buffers: number;
  shared: number;
  swapTotal: number;
  swapUsed: number;
  /** Windows: Modified page list / Linux: Dirty */
  dirty: number;
  /** Tham số kernel liên quan (vm.swappiness...) - chỉ Linux */
  tunables: Record<string, string>;
}

export interface RamOptimizeOptions {
  /** Thu hồi cache (drop_caches / Standby list) */
  dropCache?: boolean;
  /** Thu gọn working set mọi tiến trình (Windows) / compact memory (Linux) */
  trimWorkingSets?: boolean;
  /** Đẩy swap về RAM (swapoff/swapon) khi đủ RAM trống */
  resetSwap?: boolean;
}

export type FirewallBackend = 'ufw' | 'firewalld' | 'iptables' | 'windows' | 'none';

export interface FirewallStatus {
  backend: FirewallBackend;
  enabled: boolean;
  /** Ghi chú thêm (ví dụ profile nào của Windows Firewall đang bật) */
  detail: string;
}

export interface FirewallPersistence {
  /** Backend cần công cụ riêng để giữ quy tắc sau khi khởi động lại (iptables) */
  required: boolean;
  installed: boolean;
  tool: string;
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

export type PowerAction = 'reboot' | 'shutdown';

/** Lịch chạy tác vụ thống nhất cho cron (Linux) và Task Scheduler (Windows) */
export type TaskSchedule =
  | { type: 'minutes'; every: number }
  | { type: 'hourly'; minute: number }
  | { type: 'daily'; time: string }
  | { type: 'weekly'; day: number; time: string }
  | { type: 'startup' };

export interface ScheduledTask {
  id: string;
  name: string;
  command: string;
  schedule: TaskSchedule;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  lastExitCode: number | null;
}

export interface SystemCleanScan {
  systemLogsBytes: number;
  packageCacheBytes: number;
  tempFilesBytes: number;
  pageCacheBytes: number;
  details?: Record<string, string>;
}

export interface CleanExecutionOptions {
  cleanDockerContainers?: boolean;
  cleanDockerImages?: boolean;
  cleanDockerAllImages?: boolean;
  cleanDockerBuildCache?: boolean;
  cleanDockerVolumes?: boolean;
  cleanSystemLogs?: boolean;
  cleanPackageCache?: boolean;
  cleanTempFiles?: boolean;
  cleanRamCache?: boolean;
  /** Cắt log container Docker (json-file) đang phình to */
  cleanDockerLogs?: boolean;
  /** Cache npm / pip / yarn / composer / go của người dùng */
  cleanDevCaches?: boolean;
  /** Bản snap cũ (Linux), WinSxS component cleanup (Windows) */
  cleanOldPackages?: boolean;
  /** File core dump / crash dump */
  cleanCrashDumps?: boolean;
}

/** Gói cập nhật: chạy installer tách rời khỏi agent (installer sẽ khởi động lại agent) */
export interface DetachedInstall {
  scriptPath: string;
  /** Biến môi trường cho installer: ZENPANEL_ARCHIVE, ZENPANEL_PORT, ZENPANEL_TUNNEL... */
  env: Record<string, string>;
  logFile: string;
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
  /** Đọc trạng thái 1 dịch vụ (dùng để xác minh sau khi điều khiển) */
  getService(name: string): Promise<ServiceInfo | null>;
  controlService(name: string, action: ServiceAction): Promise<void>;
  serviceLogs(name: string, lines: number): Promise<string>;

  // --- Tường lửa ---
  getFirewallStatus(): Promise<FirewallStatus>;
  setFirewallEnabled(enabled: boolean, keepPorts: number[]): Promise<void>;
  listFirewallRules(): Promise<FirewallRule[]>;
  addFirewallRule(rule: FirewallRuleInput): Promise<void>;
  deleteFirewallRule(id: string): Promise<void>;
  listListeningPorts(): Promise<ListeningPort[]>;
  /** Kiểm tra quy tắc tường lửa có được lưu vĩnh viễn qua lần khởi động lại không */
  firewallPersistence(): Promise<FirewallPersistence>;
  /** Cài công cụ lưu quy tắc (iptables-persistent / iptables-services) */
  installFirewallPersistence(): Promise<void>;

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

  // --- Nguồn & tác vụ định kỳ ---
  power(action: PowerAction): Promise<void>;
  /** Ghi toàn bộ tác vụ của ZenPanel vào cron / Task Scheduler (nguồn dữ liệu là tasks.json) */
  syncScheduledTasks(tasks: ScheduledTask[]): Promise<void>;
  /** Chạy 1 lệnh người dùng bằng shell mặc định (bash -c / powershell -Command) */
  runShell(command: string, opts?: ExecOptions): Promise<ExecResult>;
  /** Chạy lệnh dài hạn (bot, worker...) qua shell của OS, stdout/stderr dạng pipe để ghi log */
  spawnShell(command: string, opts: { cwd: string; env: NodeJS.ProcessEnv }): ChildProcess;
  /** Dừng cả cây tiến trình (shell + các tiến trình con) */
  killTree(pid: number, force: boolean): Promise<void>;

  // --- Cập nhật panel ---
  /** "install.sh" hoặc "install.ps1" */
  installerScript(): string;
  /** Định dạng gói mã nguồn tải từ GitHub: tar.gz (Linux) hoặc zip (Windows) */
  archiveFormat(): 'tar.gz' | 'zip';
  /** Chạy installer ở tiến trình riêng, không bị dừng khi agent khởi động lại */
  launchDetachedInstall(install: DetachedInstall): Promise<void>;

  // --- Dọn dẹp hệ thống ---
  cleanScan(): Promise<SystemCleanScan>;
  cleanSystem(options: CleanExecutionOptions, onLog: (msg: string) => void): Promise<void>;

  // --- Tối ưu RAM ---
  memoryDetail(): Promise<MemoryDetail>;
  optimizeRam(options: RamOptimizeOptions, onLog: (msg: string) => void): Promise<void>;
  /** Thu gọn working set 1 tiến trình (Windows); Linux trả false vì không hỗ trợ */
  trimProcessMemory(pid: number): Promise<boolean>;
  /** Linux: đặt vm.swappiness / vm.vfs_cache_pressure (ghi cả /etc/sysctl.d để giữ sau reboot) */
  setMemoryTunable(key: 'vm.swappiness' | 'vm.vfs_cache_pressure', value: number): Promise<void>;

  // --- Nhật ký hệ thống ---
  logSources(): Promise<LogSource[]>;
  /** Đọc N dòng cuối của nguồn journal / eventlog (file do service tự đọc) */
  readSystemLog(id: string, lines: number): Promise<string>;
  /** Xóa hoặc làm rỗng nhật ký hệ thống (journal / eventlog) */
  clearSystemLog?(id: string): Promise<void>;
}
