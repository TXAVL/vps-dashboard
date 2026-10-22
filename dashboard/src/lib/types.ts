// ZenPanel - Kiểu dữ liệu trả về từ Agent API

export interface OSInfo {
  family: 'windows' | 'linux';
  name: string;
  kernel: string;
  arch: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemory: number;
  isAdmin: boolean;
}

export interface TunnelState {
  status: 'idle' | 'starting' | 'online' | 'error' | 'stopped';
  url: string | null;
  error: string | null;
}

export interface WebServerInfo {
  kind: string;
  label: string;
  supports: { php: boolean; proxy: boolean; ssl: boolean };
  installed: boolean;
}

export interface SystemInfo {
  os: OSInfo;
  version: string;
  port: number;
  dataDir: string;
  agentUptime: number;
  tunnel: TunnelState;
  webServers: WebServerInfo[];
}

export interface DiskUsage {
  mount: string;
  fs: string;
  total: number;
  used: number;
}

export interface MetricsSnapshot {
  time: number;
  cpu: { usage: number; perCore: number[] };
  memory: { total: number; used: number };
  disks: DiskUsage[];
  network: { rxRate: number; txRate: number; rxTotal: number; txTotal: number };
  load: number[] | null;
  uptime: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number | null;
  name: string;
  user: string | null;
  cpu: number;
  memory: number;
  command: string | null;
}

export interface ServiceInfo {
  name: string;
  displayName: string;
  description: string;
  state: 'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'unknown';
  startup: 'auto' | 'manual' | 'disabled' | 'static' | 'unknown';
}

export interface FirewallStatus {
  backend: 'ufw' | 'firewalld' | 'iptables' | 'windows' | 'none';
  enabled: boolean;
  detail: string;
}

export interface FirewallRule {
  id: string;
  action: 'allow' | 'deny';
  port: string | null;
  protocol: 'tcp' | 'udp' | 'any';
  source: string | null;
  description: string;
}

export interface ListeningPort {
  protocol: 'tcp' | 'udp';
  address: string;
  port: number;
  pid: number | null;
  process: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string;
  mode: string;
}

export interface DockerInfo {
  installed: boolean;
  running: boolean;
  version: string | null;
  error: string | null;
}

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

export interface AppParam {
  key: string;
  label: string;
  type: 'text' | 'password' | 'port';
  default?: string | number;
  generate?: boolean;
}

export interface AppView {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'database' | 'tools' | 'devops' | 'storage' | 'network';
  icon: string;
  website: string;
  params: AppParam[];
  webPort?: string;
  database?: { engine: DatabaseServer['engine']; passwordKey: string; portKey: string };
  installed: { id: string; params: Record<string, string>; installedAt: string } | null;
  status: 'running' | 'stopped' | 'partial' | 'not-installed';
  containers: DockerContainer[];
}

export interface DatabaseServer {
  appId: string;
  name: string;
  engine: 'mysql' | 'mariadb' | 'postgres' | 'redis' | 'mongodb';
  container: string;
  port: number;
  username: string;
  password: string;
  running: boolean;
}

export interface DatabaseItem {
  name: string;
  size: number | null;
  detail: string;
}

export interface Site {
  id: string;
  domain: string;
  aliases: string[];
  root: string;
  type: 'static' | 'php' | 'proxy';
  proxyPort: number | null;
  ssl: boolean;
  forceHttps: boolean;
  enabled: boolean;
  webServer: string;
  accessLog: string;
  errorLog: string;
  quotaMB: number;
  createdAt: string;
  lastError: string | null;
}

export interface SiteStats {
  diskBytes: number;
  files: number;
  bandwidthBytes: number;
  requests: number;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  plan: string;
  settings: Record<string, string>;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface PanelPrefs {
  networkUnit: 'bytes' | 'bits';
  theme: 'zen' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan';
  base: 'slate' | 'oled' | 'navy';
  vpsExpiry: string | null;
  vpsProvider: string;
  vpsRenewUrl: string;
  vpsPrice: string;
  expiryWarnDays: number;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
}

export interface RemoteVersion {
  ref: string;
  label: string;
  version: string;
  sha: string;
  message: string;
  date: string | null;
}

export interface UpdateState {
  current: string;
  latest: RemoteVersion | null;
  available: boolean;
  checkedAt: string | null;
  error: string | null;
  downloadedLatest: boolean;
}

export interface VersionPackage {
  id: string;
  ref: string;
  version: string;
  sha: string;
  file: string;
  size: number;
  downloadedAt: string;
  current: boolean;
}

export interface Job {
  id: string;
  title: string;
  kind: string;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  endedAt: string | null;
  error: string | null;
  log: string;
}

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

export interface NetworkInfo {
  publicIpv4: string | null;
  publicIpv6: string | null;
  hostname: string;
  interfaces: { name: string; mac: string | null; internal: boolean; addresses: { address: string; family: string; cidr: string | null }[] }[];
}

export interface LoginRecord {
  at: string;
  ip: string;
  ok: boolean;
  userAgent: string;
}
