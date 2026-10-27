// ZenPanel - Bảo mật truy cập & cấu hình máy chủ: SSH (port, root, mật khẩu, key), lịch sử đăng nhập,
// Fail2ban (IP bị chặn), hostname / múi giờ / DNS. Mọi lệnh đi qua adapter.runShell (bash hoặc PowerShell).
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OSAdapter } from '../adapters/base.adapter.js';
import { badRequest, isIpOrCidr } from '../core/validate.js';

export interface SshSettings {
  installed: boolean;
  running: boolean;
  configFile: string;
  port: number;
  permitRootLogin: 'yes' | 'no' | 'prohibit-password';
  passwordAuthentication: boolean;
  pubkeyAuthentication: boolean;
  maxAuthTries: number;
  clientAliveInterval: number;
  serviceName: string;
}

export interface SshKey {
  fingerprint: string;
  type: string;
  comment: string;
  bits: string;
}

export interface LoginEvent {
  /** Thời điểm chuẩn ISO-8601 (UTC) - dashboard tự đổi sang múi giờ máy chủ */
  time: string;
  user: string;
  ip: string;
  method: string;
  ok: boolean;
}

export interface Fail2banJail {
  name: string;
  currentlyBanned: number;
  totalBanned: number;
  currentlyFailed: number;
  bannedIps: string[];
}

export interface TimezoneOption {
  id: string;
  label: string;
  /** vd "UTC+07:00" */
  offset: string;
  group: string;
}

export interface HostConfig {
  hostname: string;
  timezone: string;
  /** Tên IANA để định dạng giờ trên trình duyệt (Windows dùng tên riêng nên cần bản IANA tương ứng) */
  timezoneIana: string;
  utcOffset: string;
  time: string;
  ntpSynced: boolean | null;
  dns: string[];
  uptimeSec: number;
  kernel: string;
}

const SSH_KEYS: [string, string][] = [
  ['Port', 'port'],
  ['PermitRootLogin', 'permitRootLogin'],
  ['PasswordAuthentication', 'passwordAuthentication'],
  ['PubkeyAuthentication', 'pubkeyAuthentication'],
  ['MaxAuthTries', 'maxAuthTries'],
  ['ClientAliveInterval', 'clientAliveInterval'],
];

/** "UTC+07:00" của 1 múi giờ IANA ở thời điểm hiện tại */
function utcOffsetOf(zone: string): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

/** Chuỗi thời gian của journal / last / PowerShell -> ISO UTC (chuỗi không có múi giờ được hiểu theo giờ máy chủ) */
function toIso(raw: string): string {
  const trimmed = raw.trim().replace(/(\.\d{3})\d+/, '$1');
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? raw.trim() : new Date(ms).toISOString();
}

const sh = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
const ps = (v: string) => `'${v.replace(/'/g, "''")}'`;

export class AccessService {
  constructor(private readonly adapter: OSAdapter) {}

  private get windows() {
    return this.adapter.family === 'windows';
  }

  private async run(command: string, timeout = 30_000): Promise<{ out: string; code: number }> {
    const res = await this.adapter.runShell(command, { timeout });
    return { out: `${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}`.trim(), code: res.code };
  }

  // ------------------------------------------------------------------ SSH

  private sshConfigFile(): string {
    return this.windows ? path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'ssh', 'sshd_config') : '/etc/ssh/sshd_config';
  }

  private async sshService(): Promise<string> {
    for (const name of this.windows ? ['sshd'] : ['ssh', 'sshd']) {
      if (await this.adapter.getService(name).catch(() => null)) return name;
    }
    return this.windows ? 'sshd' : 'ssh';
  }

  /** Giá trị hiệu lực của sshd: ưu tiên `sshd -T` (đã gộp sshd_config.d), nếu không có thì đọc file */
  async ssh(): Promise<SshSettings> {
    const file = this.sshConfigFile();
    const service = await this.sshService();
    const info = await this.adapter.getService(service).catch(() => null);
    const base: SshSettings = {
      installed: Boolean(info) || existsSync(file),
      running: info?.state === 'running',
      configFile: file,
      port: 22,
      permitRootLogin: 'prohibit-password',
      passwordAuthentication: true,
      pubkeyAuthentication: true,
      maxAuthTries: 6,
      clientAliveInterval: 0,
      serviceName: service,
    };
    if (!base.installed) return base;

    let text = '';
    if (!this.windows) {
      const t = await this.run('sshd -T 2>/dev/null || /usr/sbin/sshd -T 2>/dev/null');
      if (t.code === 0 && /\bport\s+\d+/i.test(t.out)) text = t.out;
    }
    if (!text) text = await readFile(file, 'utf8').catch(() => '');
    const get = (key: string) => {
      const matches = [...text.matchAll(new RegExp(`^\\s*${key}\\s+(\\S+)`, 'gim'))];
      return matches.length ? matches[0][1] : undefined;
    };
    const yes = (v: string | undefined, def: boolean) => (v === undefined ? def : v.toLowerCase() === 'yes');
    base.port = Number(get('Port')) || 22;
    const root = (get('PermitRootLogin') ?? 'prohibit-password').toLowerCase();
    base.permitRootLogin = root === 'yes' ? 'yes' : root === 'no' ? 'no' : 'prohibit-password';
    base.passwordAuthentication = yes(get('PasswordAuthentication'), true);
    base.pubkeyAuthentication = yes(get('PubkeyAuthentication'), true);
    base.maxAuthTries = Number(get('MaxAuthTries')) || 6;
    base.clientAliveInterval = Number(get('ClientAliveInterval')) || 0;
    return base;
  }

  private authorizedKeysFile(): string {
    if (this.windows) {
      return path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'ssh', 'administrators_authorized_keys');
    }
    return path.join(os.homedir(), '.ssh', 'authorized_keys');
  }

  async keys(): Promise<{ file: string; keys: SshKey[]; raw: number }> {
    const file = this.authorizedKeysFile();
    const text = await readFile(file, 'utf8').catch(() => '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const keys: SshKey[] = [];
    for (const line of lines) {
      const fp = await this.fingerprint(line);
      keys.push(fp);
    }
    return { file, keys, raw: lines.length };
  }

  private async fingerprint(line: string): Promise<SshKey> {
    const tmp = path.join(os.tmpdir(), `zp-key-${Date.now()}-${Math.random().toString(36).slice(2)}.pub`);
    await writeFile(tmp, `${line}\n`);
    try {
      const res = await this.run(`ssh-keygen -lf ${this.windows ? ps(tmp) : sh(tmp)}`, 10_000);
      const m = /^(\d+)\s+(\S+)\s+(.*)\s+\(([^)]+)\)\s*$/m.exec(res.out);
      if (m) return { bits: m[1], fingerprint: m[2], comment: m[3] === 'no comment' ? '' : m[3], type: m[4] };
    } catch {
      // ssh-keygen không có: hiển thị thông tin thô
    }
    const parts = line.trim().split(/\s+/);
    return { bits: '', fingerprint: parts[1]?.slice(0, 24) ?? '?', comment: parts.slice(2).join(' '), type: parts[0] ?? '?' };
  }

  private validPublicKey(key: string): boolean {
    return /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]+( [^\r\n]*)?$/.test(key.trim());
  }

  async addKey(publicKey: string): Promise<void> {
    const key = publicKey.trim();
    if (!this.validPublicKey(key)) throw badRequest('SSH public key không hợp lệ (phải bắt đầu bằng ssh-ed25519, ssh-rsa, ecdsa-...)');
    const file = this.authorizedKeysFile();
    await mkdir(path.dirname(file), { recursive: true });
    const current = await readFile(file, 'utf8').catch(() => '');
    if (current.includes(key.split(/\s+/)[1])) throw badRequest('Key này đã có trong danh sách');
    await writeFile(file, `${current.trimEnd()}${current.trim() ? '\n' : ''}${key}\n`);
    if (!this.windows) await chmod(file, 0o600).catch(() => undefined);
  }

  async removeKey(fingerprint: string): Promise<void> {
    const file = this.authorizedKeysFile();
    const text = await readFile(file, 'utf8').catch(() => '');
    const lines = text.split(/\r?\n/);
    const keep: string[] = [];
    let removed = 0;
    for (const line of lines) {
      if (line.trim() && !line.trim().startsWith('#') && (await this.fingerprint(line)).fingerprint === fingerprint) {
        removed++;
        continue;
      }
      keep.push(line);
    }
    if (!removed) throw badRequest('Không tìm thấy key');
    await writeFile(file, `${keep.join('\n').trimEnd()}\n`);
  }

  /** Tạo cặp key ed25519 trên máy chủ: public key được thêm vào authorized_keys, private key trả về đúng 1 lần */
  async generateKey(comment: string): Promise<{ privateKey: string; publicKey: string }> {
    const label = comment.replace(/[^\w.@-]/g, '').slice(0, 40) || 'zenpanel';
    const tmp = path.join(os.tmpdir(), `zp-gen-${Date.now()}`);
    const res = await this.run(`ssh-keygen -t ed25519 -N ${this.windows ? '""' : "''"} -C ${this.windows ? ps(label) : sh(label)} -f ${this.windows ? ps(tmp) : sh(tmp)}`, 20_000);
    if (res.code !== 0) throw badRequest(`Không tạo được key (cần cài openssh-client): ${res.out.slice(0, 200)}`);
    const privateKey = await readFile(tmp, 'utf8');
    const publicKey = (await readFile(`${tmp}.pub`, 'utf8')).trim();
    await this.run(this.windows ? `Remove-Item ${ps(tmp)},${ps(`${tmp}.pub`)} -Force` : `rm -f ${sh(tmp)} ${sh(`${tmp}.pub`)}`).catch(() => undefined);
    await this.addKey(publicKey);
    return { privateKey, publicKey };
  }

  /**
   * Đổi cấu hình sshd an toàn: sao lưu file, kiểm tra cú pháp bằng `sshd -t`, tự hoàn tác nếu lỗi.
   * Đổi port thì mở cổng mới trên tường lửa trước khi áp dụng để không tự khoá mình.
   */
  async updateSsh(input: Partial<Pick<SshSettings, 'port' | 'permitRootLogin' | 'passwordAuthentication' | 'pubkeyAuthentication' | 'maxAuthTries' | 'clientAliveInterval'>>): Promise<{ warnings: string[]; settings: SshSettings }> {
    const current = await this.ssh();
    if (!current.installed) throw badRequest('Máy chủ chưa cài OpenSSH Server');
    const warnings: string[] = [];
    const next = { ...current, ...input };

    if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) throw badRequest('Port SSH phải từ 1 đến 65535');
    if (!['yes', 'no', 'prohibit-password'].includes(next.permitRootLogin)) throw badRequest('Giá trị PermitRootLogin không hợp lệ');
    if (!next.passwordAuthentication && !next.pubkeyAuthentication) throw badRequest('Không thể tắt cả mật khẩu lẫn SSH key, bạn sẽ bị khoá khỏi máy chủ');
    if (!next.passwordAuthentication) {
      const { raw } = await this.keys();
      if (!raw) throw badRequest('Chưa có SSH key nào trong authorized_keys. Hãy thêm key trước khi tắt đăng nhập bằng mật khẩu.');
    }
    next.maxAuthTries = Math.min(20, Math.max(1, Math.round(Number(next.maxAuthTries) || 6)));
    next.clientAliveInterval = Math.min(3600, Math.max(0, Math.round(Number(next.clientAliveInterval) || 0)));

    if (next.port !== current.port) {
      await this.adapter.addFirewallRule({ action: 'allow', port: String(next.port), protocol: 'tcp', source: null, description: `ZenPanel SSH ${next.port}` }).catch((err: Error) => warnings.push(`Không mở được cổng ${next.port} trên tường lửa: ${err.message}`));
      warnings.push(`Đã mở cổng ${next.port}. Nếu VPS có Security Group của nhà cung cấp, hãy mở cổng ${next.port}/TCP trước khi đóng phiên SSH hiện tại.`);
    }

    const file = current.configFile;
    const original = await readFile(file, 'utf8');
    await copyFile(file, `${file}.zenpanel.bak`);
    // Chỉ sửa phần toàn cục (trước khối Match đầu tiên): các khối Match là ngoại lệ riêng của người dùng, giữ nguyên
    const matchAt = original.search(/^[ 	]*Match[ 	]/im);
    let head = matchAt >= 0 ? original.slice(0, matchAt) : original;
    const tail = matchAt >= 0 ? original.slice(matchAt) : '';
    const values: Record<string, string> = {
      port: String(next.port),
      permitRootLogin: next.permitRootLogin,
      passwordAuthentication: next.passwordAuthentication ? 'yes' : 'no',
      pubkeyAuthentication: next.pubkeyAuthentication ? 'yes' : 'no',
      maxAuthTries: String(next.maxAuthTries),
      clientAliveInterval: String(next.clientAliveInterval),
    };
    for (const [directive, field] of SSH_KEYS) {
      const re = new RegExp(`^[ \t]*${directive}[ \t]+.*(?:\r?\n|$)`, 'gim');
      let replaced = false;
      // sshd lấy giá trị đầu tiên: thay dòng đầu, bỏ các dòng trùng phía sau (dòng comment # không bị khớp)
      head = head.replace(re, () => {
        if (replaced) return '';
        replaced = true;
        return `${directive} ${values[field]}
`;
      });
      if (!replaced) head = `${head.trimEnd()}
${directive} ${values[field]}
`;
    }
    const text = tail ? `${head.trimEnd()}

${tail}` : head;
    await writeFile(file, text);

    if (!this.windows) {
      const check = await this.run('sshd -t 2>&1 || /usr/sbin/sshd -t 2>&1');
      if (check.code !== 0) {
        await writeFile(file, original);
        throw badRequest(`Cấu hình sshd không hợp lệ, đã hoàn tác: ${check.out.slice(0, 300)}`);
      }
    }
    await this.adapter.controlService(current.serviceName, 'restart').catch(async () => {
      await writeFile(file, original);
      throw badRequest('Không khởi động lại được dịch vụ SSH, đã hoàn tác cấu hình');
    });
    if (next.port !== current.port) warnings.push('Phiên SSH đang mở không bị ngắt, nhưng kết nối mới phải dùng cổng mới.');
    return { warnings, settings: await this.ssh() };
  }

  // ------------------------------------------------------------------ Lịch sử đăng nhập

  async logins(): Promise<{ events: LoginEvent[]; topAttackers: { ip: string; count: number }[]; supported: boolean; timezone: string; utcOffset: string }> {
    if (this.windows) {
      const res = await this.run(
        "$e = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624,4625} -MaxEvents 300 -ErrorAction SilentlyContinue; if ($e) { $e | ForEach-Object { $x=[xml]$_.ToXml(); $d=@{}; $x.Event.EventData.Data | ForEach-Object { $d[$_.Name]=$_.'#text' }; if ($d['LogonType'] -in '3','10') { '{0:yyyy-MM-ddTHH:mm:ss}|{1}|{2}|{3}|{4}' -f $_.TimeCreated, $d['TargetUserName'], $d['IpAddress'], $(if ($d['LogonType'] -eq '10') {'rdp'} else {'network'}), $(if ($_.Id -eq 4624) {'ok'} else {'fail'}) } } }",
        60_000,
      );
      const events = res.out.split('\n').map((l) => l.trim().split('|')).filter((p) => p.length === 5).map(([time, user, ip, method, ok]): LoginEvent => ({ time: toIso(time), user, ip: ip === '-' ? '' : ip, method, ok: ok === 'ok' }));
      return { events: events.slice(0, 100), topAttackers: this.topFailed(events), supported: true, timezone: await this.ianaZone(), utcOffset: utcOffsetOf(await this.ianaZone()) };
    }
    const events: LoginEvent[] = [];
    // -F: ngày giờ đầy đủ kèm năm, -i: IP dạng số
    const ok = await this.run("last -n 40 -i -w -F 2>/dev/null | grep -v '^reboot\\|^wtmp\\|^$' | head -40");
    for (const line of ok.out.split('\n')) {
      const m = /^(\S+)\s+(\S+)\s+(\S+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d+\s+[\d:]{8}\s+\d{4})/.exec(line);
      if (!m) continue;
      events.push({ user: m[1], method: m[2].startsWith('pts') ? 'ssh' : m[2], ip: /^[\d.:a-f]+$/i.test(m[3]) && m[3] !== '0.0.0.0' ? m[3] : '', time: toIso(m[4]), ok: true });
    }
    // Đăng nhập thất bại: journal (ssh/sshd) hoặc auth.log / secure
    const failed = await this.run(
      "(journalctl -u ssh -u sshd --no-pager -n 3000 --output=short-iso 2>/dev/null; cat /var/log/auth.log /var/log/secure 2>/dev/null | tail -n 3000) | grep -E 'Failed (password|publickey)|Invalid user' | tail -n 400",
      40_000,
    );
    const fails: LoginEvent[] = [];
    for (const line of failed.out.split('\n')) {
      const m = /^(\S+).*?(?:Failed \w+ for (?:invalid user )?(\S+)|Invalid user (\S+)) from ([\da-f.:]+)/i.exec(line);
      if (m) fails.push({ time: toIso(m[1]), user: m[2] ?? m[3], ip: m[4], method: 'ssh', ok: false });
    }
    const all = [...fails.slice(-60), ...events].sort((a, b) => b.time.localeCompare(a.time));
    const zone = await this.ianaZone();
    return { events: all, topAttackers: this.topFailed(fails), supported: true, timezone: zone, utcOffset: utcOffsetOf(zone) };
  }

  private topFailed(events: LoginEvent[]) {
    const counts = new Map<string, number>();
    for (const e of events) if (!e.ok && e.ip) counts.set(e.ip, (counts.get(e.ip) ?? 0) + 1);
    return [...counts].map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }

  // ------------------------------------------------------------------ Fail2ban

  async fail2ban(): Promise<{ supported: boolean; installed: boolean; running: boolean; jails: Fail2banJail[] }> {
    if (this.windows) return { supported: false, installed: false, running: false, jails: [] };
    if (!(await this.adapter.findExecutable('fail2ban-client'))) return { supported: true, installed: false, running: false, jails: [] };
    const status = await this.run('fail2ban-client status');
    if (status.code !== 0) return { supported: true, installed: true, running: false, jails: [] };
    const names = (/Jail list:\s*(.*)/.exec(status.out)?.[1] ?? '').split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    const jails: Fail2banJail[] = [];
    for (const name of names) {
      const res = await this.run(`fail2ban-client status ${sh(name)}`);
      const num = (label: string) => Number(new RegExp(`${label}:\\s*(\\d+)`).exec(res.out)?.[1] ?? 0);
      const ips = (/Banned IP list:\s*(.*)/.exec(res.out)?.[1] ?? '').split(/\s+/).filter(Boolean);
      jails.push({ name, currentlyBanned: num('Currently banned'), totalBanned: num('Total banned'), currentlyFailed: num('Currently failed'), bannedIps: ips });
    }
    return { supported: true, installed: true, running: true, jails };
  }

  async fail2banAction(action: 'ban' | 'unban', jail: string, ip: string): Promise<void> {
    if (!/^[\w.-]{1,40}$/.test(jail)) throw badRequest('Tên jail không hợp lệ');
    if (!isIpOrCidr(ip)) throw badRequest('IP không hợp lệ');
    const res = await this.run(`fail2ban-client set ${sh(jail)} ${action === 'ban' ? 'banip' : 'unbanip'} ${sh(ip)}`);
    if (res.code !== 0) throw badRequest(res.out.slice(0, 200) || 'Fail2ban từ chối thao tác');
  }

  // ------------------------------------------------------------------ Hostname / múi giờ / DNS

  /** Múi giờ IANA hiện tại của máy chủ (đọc từ hệ điều hành, không dựa vào cache của tiến trình Node) */
  async ianaZone(): Promise<string> {
    if (!this.windows) {
      const r = await this.run('timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null');
      const zone = r.out.split('\n')[0]?.trim();
      if (zone && zone.includes('/')) return zone;
      if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  async host(): Promise<HostConfig> {
    if (this.windows) {
      const r = await this.run(
        "$tz=(Get-TimeZone).Id; $dns=(Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object {$_.ServerAddresses} | ForEach-Object {$_.ServerAddresses} | Select-Object -Unique) -join ','; \"$env:COMPUTERNAME|$tz|$dns|\" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
      );
      const [hostname, timezone, dns, time] = r.out.split('|');
      const iana = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return { hostname, timezone, timezoneIana: iana, utcOffset: utcOffsetOf(iana), dns: (dns ?? '').split(',').filter(Boolean), time: time ?? '', ntpSynced: null, uptimeSec: os.uptime(), kernel: os.release() };
    }
    const [zone, extra, dns, now] = await Promise.all([
      this.ianaZone(),
      this.run('timedatectl show -p NTPSynchronized --value 2>/dev/null'),
      this.run("(resolvectl dns 2>/dev/null | grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+|[0-9a-f:]{6,}' ; grep -E '^nameserver' /etc/resolv.conf | awk '{print $2}') | sort -u"),
      this.run("date '+%Y-%m-%d %H:%M:%S'"),
    ]);
    const nameservers = dns.out.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('127.') && s !== '::1');
    return {
      hostname: os.hostname(),
      timezone: zone,
      timezoneIana: zone,
      utcOffset: utcOffsetOf(zone),
      time: now.out.trim() || new Date().toLocaleString('sv-SE'),
      ntpSynced: extra.out.trim() ? extra.out.trim() === 'yes' : null,
      dns: nameservers.length ? nameservers : dns.out.split('\n').filter(Boolean),
      uptimeSec: os.uptime(),
      kernel: os.release(),
    };
  }

  /** Danh sách múi giờ CÓ THẬT trên máy này: timedatectl (Linux) hoặc tzutil (Windows) */
  async timezones(): Promise<TimezoneOption[]> {
    if (this.windows) {
      const out = (await this.run('tzutil /l')).out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const list: TimezoneOption[] = [];
      for (let i = 0; i < out.length - 1; i++) {
        const m = /^\((UTC[^)]*)\)\s*(.*)$/.exec(out[i]);
        if (m && !out[i + 1].startsWith('(UTC')) {
          list.push({ id: out[i + 1], label: m[2] || out[i + 1], offset: m[1].replace(/^UTC$/, 'UTC+00:00'), group: 'Windows' });
          i++;
        }
      }
      return list;
    }
    const res = await this.run('timedatectl list-timezones 2>/dev/null');
    let ids = res.out ? res.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    if (!ids.length) {
      // Máy không có timedatectl (Alpine...): đọc thư mục zoneinfo thật
      const found = await this.run("cd /usr/share/zoneinfo 2>/dev/null && find . -type f | sed 's|^\\./||' | grep -E '^[A-Z][A-Za-z_]+/[A-Za-z_/+-]+$|^UTC$' | sort");
      ids = found.out ? found.out.split('\n').map((s) => s.trim()).filter(Boolean) : Intl.supportedValuesOf('timeZone');
    }
    return ids.map((id) => ({ id, label: id.replace(/_/g, ' '), offset: utcOffsetOf(id), group: id.includes('/') ? id.split('/')[0] : 'Khác' }));
  }

  async setHostname(hostname: string): Promise<{ rebootRequired: boolean }> {
    if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(hostname)) throw badRequest('Hostname chỉ gồm chữ, số, gạch ngang (tối đa 63 ký tự)');
    if (this.windows) {
      const r = await this.run(`Rename-Computer -NewName ${ps(hostname)} -Force`);
      if (r.code !== 0) throw badRequest(r.out.slice(0, 200));
      return { rebootRequired: true };
    }
    const r = await this.run(`hostnamectl set-hostname ${sh(hostname)} 2>&1 || (echo ${sh(hostname)} > /etc/hostname && hostname ${sh(hostname)})`);
    if (r.code !== 0) throw badRequest(r.out.slice(0, 200));
    await this.run(`grep -q ${sh(hostname)} /etc/hosts || sed -i "s/^127\\.0\\.1\\.1.*/127.0.1.1 ${hostname}/" /etc/hosts`).catch(() => undefined);
    return { rebootRequired: false };
  }

  async setTimezone(zone: string): Promise<void> {
    if (!/^[\w+\-/ ().,]{1,80}$/.test(zone)) throw badRequest('Múi giờ không hợp lệ');
    const r = await this.run(this.windows ? `tzutil /s ${ps(zone)}` : `timedatectl set-timezone ${sh(zone)}`);
    if (r.code !== 0) throw badRequest(r.out.slice(0, 200) || 'Không đổi được múi giờ');
  }

  async setDns(servers: string[]): Promise<void> {
    const list = servers.map((s) => s.trim()).filter(Boolean);
    if (!list.length || list.length > 4) throw badRequest('Nhập 1-4 địa chỉ DNS');
    for (const s of list) if (!isIpOrCidr(s) || s.includes('/')) throw badRequest(`DNS "${s}" không hợp lệ`);
    if (this.windows) {
      const r = await this.run(`Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses (${list.map(ps).join(',')}) }`);
      if (r.code !== 0) throw badRequest(r.out.slice(0, 200));
      return;
    }
    const resolved = await this.run('systemctl is-active systemd-resolved 2>/dev/null');
    if (resolved.out.trim() === 'active') {
      const conf = '/etc/systemd/resolved.conf';
      let text = await readFile(conf, 'utf8').catch(() => '[Resolve]\n');
      if (!/^\[Resolve\]/m.test(text)) text += '\n[Resolve]\n';
      text = /^#?DNS=.*$/m.test(text) ? text.replace(/^#?DNS=.*$/m, `DNS=${list.join(' ')}`) : text.replace(/^\[Resolve\]\s*$/m, `[Resolve]\nDNS=${list.join(' ')}`);
      await writeFile(conf, text);
      await this.run('systemctl restart systemd-resolved');
    } else {
      await writeFile('/etc/resolv.conf', `# Quản lý bởi ZenPanel\n${list.map((s) => `nameserver ${s}`).join('\n')}\n`);
    }
  }

  async syncTime(): Promise<string> {
    if (this.windows) return (await this.run('w32tm /resync /force')).out;
    const r = await this.run('timedatectl set-ntp true 2>&1; (chronyc makestep 2>/dev/null || systemctl restart systemd-timesyncd 2>/dev/null); timedatectl status | head -8');
    return r.out;
  }
}
