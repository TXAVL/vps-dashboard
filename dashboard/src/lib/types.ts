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
  optional?: boolean;
  hint?: string;
}

export interface AppView {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'database' | 'tools' | 'devops' | 'storage' | 'network' | 'ai';
  icon: string;
  website: string;
  params: AppParam[];
  webPort?: string;
  database?: { engine: DatabaseServer['engine']; passwordKey: string; portKey: string };
  installed: { id: string; params: Record<string, string>; installedAt: string } | null;
  webScheme?: 'http' | 'https';
  usesAiKeys?: boolean;
  guide: { credentials?: string; steps: string[] } | null;
  publicLink: (TunnelState & { enabled: boolean }) | null;
  status: 'running' | 'stopped' | 'partial' | 'not-installed';
  containers: DockerContainer[];
  isCompatible?: boolean;
  platform?: 'all' | 'windows' | 'linux' | 'darwin' | 'bsd';
  requiresGui?: boolean;
  appType?: 'docker' | 'native';
  isCustom?: boolean;
  repoId?: string;
  repoName?: string;
}

export interface AppRepo {
  id: string;
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
  appCount: number;
  lastSynced?: string;
  error?: string;
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
  theme:
    | 'zen'
    | 'emerald'
    | 'violet'
    | 'cyan'
    | 'amber'
    | 'rose'
    | 'orange'
    | 'fuchsia'
    | 'lime'
    | 'indigo'
    | 'teal'
    | 'crimson';
  base: 'slate' | 'oled' | 'navy' | 'zinc' | 'dracula' | 'nord' | 'forest' | 'mocha';
  vpsExpiry: string | null;
  vpsProvider: string;
  vpsRenewUrl: string;
  vpsPrice: string;
  expiryWarnDays: number;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  updateCheckMinutes: number;
  publicHost: string;
  autoRamOptimize: boolean;
  autoRamThreshold: number;
  autoRamIntervalMin: number;
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
  progress?: number;
  stage?: string;
  etaSeconds?: number | null;
  steps?: JobStep[];
  result?: unknown;
  lines?: number;
}

export interface JobStep {
  label: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  endedAt: string | null;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { title: string; items: string[] }[];
}

export interface UpdateChangelog {
  current: string;
  target: string;
  entries: ChangelogEntry[];
  commits: { sha: string; message: string; date: string | null }[];
}

export interface PhpStatus {
  installed: boolean;
  version: string | null;
  fpmRunning: boolean;
  fpmService: string | null;
  socketPath: string | null;
  extensions: string[];
  iniPath: string | null;
  memoryLimit: string | null;
  uploadMaxFilesize: string | null;
  postMaxSize: string | null;
  maxExecutionTime: string | null;
  supportedVersions: string[];
}

export interface PhpConfigInput {
  memoryLimit?: string;
  uploadMaxFilesize?: string;
  postMaxSize?: string;
  maxExecutionTime?: string;
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
  reverseDns: string | null;
  publicIpv6: string | null;
  hostname: string;
  interfaces: { name: string; mac: string | null; internal: boolean; addresses: { address: string; family: string; cidr: string | null }[] }[];
}

export interface LoginRecord {
  id?: string;
  at: string;
  ip: string;
  country?: string;
  ok: boolean;
  reason?: string;
  userAgent: string;
  browser?: string;
  os?: string;
  device?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other';
}

export interface UserSessionView {
  id: string;
  username: string;
  ip: string;
  country?: string;
  browser: string;
  os: string;
  device: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other';
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: number;
  revoked: boolean;
  isCurrent: boolean;
}

export interface FirewallPersistence {
  required: boolean;
  installed: boolean;
  tool: string;
}

export interface AiAccountKey {
  id: string;
  name: string;
  key: string;
  masked: string;
  status: 'active' | 'rate_limited' | 'error';
  lastUsedAt?: string;
  rateLimitedUntil?: number;
  errorMsg?: string;
}

export interface AiProvider {
  id: 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'nvidia';
  label: string;
  baseUrl: string;
  keyUrl: string;
  keyHint: string;
  configured: boolean;
  masked: string | null;
  savedAt: string | null;
  lastTest: { ok: boolean; at: string; message: string } | null;
  defaultModel: string | null;
  accounts?: AiAccountKey[];
  totalAccounts?: number;
  activeAccounts?: number;
}

export interface Stack {
  name: string;
  status: string;
  managed: boolean;
  appStore: boolean;
  configFiles: string[];
}

export interface SpeedResult {
  at: string;
  pingMs: number;
  jitterMs: number;
  download: number;
  upload: number;
  server: { colo: string; city: string; country: string };
  client: { ip: string; isp: string };
}

export interface SpeedState {
  running: boolean;
  phase: 'idle' | 'meta' | 'ping' | 'download' | 'upload' | 'done' | 'error';
  progress: number;
  liveSpeed: number;
  pingMs: number | null;
  jitterMs: number | null;
  download: number | null;
  upload: number | null;
  error: string | null;
  last: SpeedResult | null;
}

export interface CfPermission {
  id: string;
  label: string;
  required: string;
  ok: boolean;
  message: string;
}

export interface CfAccessRule {
  id: string;
  mode: string;
  target: string;
  value: string;
  notes: string;
  createdAt: string;
}

export interface CleanScanResult {
  cpu: {
    usage: number;
    cores: number;
    isOverloaded: boolean;
    topProcesses: { pid: number; name: string; cpu: number; memory: number; user: string | null; command: string | null }[];
  };
  ram: {
    total: number;
    used: number;
    free: number;
    pageCache: number;
  };
  disks: DiskUsage[];
  docker: {
    installed: boolean;
    running: boolean;
    stoppedContainers: number;
    danglingImages: number;
    totalImages: number;
    totalVolumes: number;
    systemDfText: string;
  };
  system: {
    systemLogsBytes: number;
    packageCacheBytes: number;
    tempFilesBytes: number;
  };
  estimatedTotalReclaimableBytes: number;
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
  cleanDockerLogs?: boolean;
  cleanDevCaches?: boolean;
  cleanOldPackages?: boolean;
  cleanCrashDumps?: boolean;
}

export interface NodeSecurityAdvisory {
  cve: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedVersions: string;
  recommendation: string;
}

export interface NodeVersionInfo {
  version: string;
  major: number;
  date: string;
  lts: string | false;
  security: boolean;
  npm?: string;
  v8?: string;
}

export interface NodeStatusResponse {
  installed: {
    version: string;
    systemVersion?: string;
    pendingRestart?: boolean;
    major: number;
    execPath: string;
    arch: string;
    platform: string;
    isEol: boolean;
    isOddRelease: boolean;
    hasSecurityRisk: boolean;
  };
  latestLts: NodeVersionInfo | null;
  latestCurrent: NodeVersionInfo | null;
  availableLtsVersions: NodeVersionInfo[];
  securityAdvisories: NodeSecurityAdvisory[];
  changelogSummary: {
    version: string;
    date: string;
    highlights: string[];
  }[];
  checkedAt: string;
}

export interface SystemToolItem {
  id: 'node' | 'npm' | 'git' | 'cloudflared' | 'docker';
  name: string;
  category: 'runtime' | 'package_manager' | 'vcs' | 'network' | 'container';
  description: string;
  installed: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
  isCrucialForZenPanel: boolean;
  changelogUrl?: string;
  releaseDate?: string;
  securityNotes?: string;
  notes?: string;
}

export interface SystemToolsStatusResponse {
  tools: SystemToolItem[];
  checkedAt: string;
  totalWithUpdates: number;
}

