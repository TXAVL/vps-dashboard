// ZenPanel - Quản lý database trong các container do App Store cài (MySQL, MariaDB, PostgreSQL, Redis, MongoDB)
import net from 'node:net';
import type { OSAdapter, ServiceInfo } from '../adapters/base.adapter.js';
import { generatePassword } from '../core/auth.js';
import { jobLog, jobResult, jobStep, startJob, type JobView } from '../core/jobs.js';
import { getPrefs } from '../core/prefs.js';
import { badRequest, HttpError, isSqlIdentifier } from '../core/validate.js';
import { APP_CATALOG, type DatabaseEngine } from './appstore.catalog.js';
import { containerName, type AppStoreService } from './appstore.service.js';
import type { DockerService } from './docker.service.js';

export interface DatabaseServer {
  appId: string;
  name: string;
  engine: DatabaseEngine;
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

export interface RemoteCheck {
  /** null = không kiểm tra được */
  ok: boolean | null;
  detail: string;
}

export interface RemoteAccessStatus {
  appId: string;
  port: number;
  publicHost: string | null;
  binding: RemoteCheck;
  engine: RemoteCheck;
  firewall: RemoteCheck;
  local: RemoteCheck;
  internet: RemoteCheck;
  /** Tất cả các lớp đều thông */
  open: boolean;
}

const DB_RULE_PREFIX = 'ZenPanel DB';

/** Thử mở kết nối TCP */
function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

/** Nhờ dịch vụ bên ngoài (portchecker.io) thử kết nối vào IP:cổng - cách duy nhất biết chắc cổng mở ra Internet */
async function externalProbe(host: string, port: number): Promise<boolean | null> {
  try {
    const res = await fetch('https://portchecker.io/api/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, ports: [port] }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as { error?: boolean; check?: { port: number; status: boolean }[] };
    if (json.error || !json.check) return null;
    return json.check.find((c) => c.port === port)?.status ?? null;
  } catch {
    return null;
  }
}

async function publicIp(): Promise<string | null> {
  const prefs = getPrefs();
  if (prefs.publicHost) return prefs.publicHost;
  for (const url of ['https://api.ipify.org', 'https://ipv4.icanhazip.com']) {
    const ip = await fetch(url, { signal: AbortSignal.timeout(6000) })
      .then((r) => r.text())
      .catch(() => '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip.trim())) return ip.trim();
  }
  return null;
}

const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys', 'postgres', 'admin', 'config', 'local']);
const NATIVE_PATTERN = /^(mysql|mysqld|mariadb|postgresql.*|redis.*|mongod)$/i;

export class DatabaseService {
  constructor(
    private readonly docker: DockerService,
    private readonly apps: AppStoreService,
    private readonly adapter: OSAdapter,
  ) {}

  async servers(): Promise<DatabaseServer[]> {
    const containers = await this.docker.containers().catch(() => []);
    return this.apps.installedApps().flatMap((record) => {
      const app = APP_CATALOG.find((a) => a.id === record.id);
      if (!app?.database) return [];
      const container = containerName(app.id);
      const { engine, passwordKey, portKey } = app.database;
      return [
        {
          appId: app.id,
          name: app.name,
          engine,
          container,
          port: Number(record.params[portKey]),
          username: engine === 'postgres' ? 'postgres' : engine === 'redis' ? 'default' : 'root',
          password: record.params[passwordKey],
          running: containers.some((c) => c.name === container && c.state === 'running'),
        },
      ];
    });
  }

  /** Dịch vụ database cài trực tiếp trên OS (apt/yum/Windows Service) - chỉ hiển thị */
  detectNative(services: ServiceInfo[]): ServiceInfo[] {
    return services.filter((s) => NATIVE_PATTERN.test(s.name));
  }

  private async server(appId: string): Promise<DatabaseServer> {
    const server = (await this.servers()).find((s) => s.appId === appId);
    if (!server) throw new HttpError(404, 'Không tìm thấy database server');
    if (!server.running) throw badRequest(`${server.name} đang dừng. Hãy khởi động trong App Store.`);
    return server;
  }

  private mysql(server: DatabaseServer, sql: string): Promise<string> {
    const client = server.engine === 'mariadb' ? 'mariadb' : 'mysql';
    return this.docker.execIn(server.container, [client, '-uroot', '-N', '-B', '-e', sql], { MYSQL_PWD: server.password });
  }

  private postgres(server: DatabaseServer, ...statements: string[]): Promise<string> {
    return this.docker.execIn(server.container, ['psql', '-U', 'postgres', '-At', ...statements.flatMap((s) => ['-c', s])], { PGPASSWORD: server.password });
  }

  private mongo(server: DatabaseServer, script: string): Promise<string> {
    return this.docker.execIn(server.container, ['mongosh', '--quiet', '-u', 'root', '-p', server.password, '--authenticationDatabase', 'admin', '--eval', script]);
  }

  async listDatabases(appId: string): Promise<DatabaseItem[]> {
    const server = await this.server(appId);
    switch (server.engine) {
      case 'mysql':
      case 'mariadb': {
        const out = await this.mysql(
          server,
          'SELECT s.schema_name, COALESCE(SUM(t.data_length + t.index_length), 0), COUNT(t.table_name) FROM information_schema.schemata s LEFT JOIN information_schema.tables t ON t.table_schema = s.schema_name GROUP BY s.schema_name',
        );
        return out
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t'))
          .filter(([name]) => !SYSTEM_DATABASES.has(name))
          .map(([name, size, tables]) => ({ name, size: Number(size), detail: `${tables} bảng` }));
      }
      case 'postgres': {
        const out = await this.postgres(server, 'SELECT datname, pg_database_size(datname), pg_get_userbyid(datdba) FROM pg_database WHERE NOT datistemplate');
        return out
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('|'))
          .filter(([name]) => !SYSTEM_DATABASES.has(name))
          .map(([name, size, owner]) => ({ name, size: Number(size), detail: `Owner: ${owner}` }));
      }
      case 'redis': {
        const out = await this.docker.execIn(server.container, ['redis-cli', '--no-auth-warning', '-a', server.password, 'INFO', 'keyspace']);
        return out
          .split('\n')
          .map((line) => /^(db\d+):keys=(\d+)/.exec(line.trim()))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m) => ({ name: m[1], size: null, detail: `${m[2]} keys` }));
      }
      case 'mongodb': {
        const out = await this.mongo(server, 'JSON.stringify(db.adminCommand({ listDatabases: 1 }).databases)');
        const list = JSON.parse(out.trim()) as { name: string; sizeOnDisk: number }[];
        return list.filter((d) => !SYSTEM_DATABASES.has(d.name)).map((d) => ({ name: d.name, size: d.sizeOnDisk, detail: '' }));
      }
    }
  }

  /** Tạo database + user riêng có toàn quyền trên database đó */
  async createDatabase(appId: string, input: { name?: string; username?: string; password?: string }): Promise<{ name: string; username: string; password: string }> {
    const server = await this.server(appId);
    const name = String(input.name ?? '').trim();
    const username = String(input.username ?? '').trim() || name;
    const password = String(input.password ?? '').trim() || generatePassword(20, false);
    if (!isSqlIdentifier(name)) throw badRequest('Tên database chỉ gồm chữ, số, gạch dưới và không bắt đầu bằng số');
    if (!isSqlIdentifier(username)) throw badRequest('Tên user chỉ gồm chữ, số, gạch dưới');
    if (!/^[\w.\-+=@#%^*!]{8,100}$/.test(password)) throw badRequest('Mật khẩu ≥ 8 ký tự, chỉ gồm chữ, số và . - + = @ # % ^ * ! _');

    switch (server.engine) {
      case 'mysql':
      case 'mariadb':
        await this.mysql(
          server,
          [
            `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
            `CREATE USER IF NOT EXISTS '${username}'@'%' IDENTIFIED BY '${password}';`,
            `GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${username}'@'%';`,
            'FLUSH PRIVILEGES;',
          ].join(' '),
        );
        break;
      case 'postgres':
        await this.postgres(server, `CREATE USER "${username}" WITH PASSWORD '${password}'`).catch(() => undefined);
        await this.postgres(server, `CREATE DATABASE "${name}" OWNER "${username}"`);
        break;
      case 'mongodb':
        await this.mongo(
          server,
          `db.getSiblingDB(${JSON.stringify(name)}).createUser({ user: ${JSON.stringify(username)}, pwd: ${JSON.stringify(password)}, roles: [{ role: 'dbOwner', db: ${JSON.stringify(name)} }] }); db.getSiblingDB(${JSON.stringify(name)}).zenpanel.insertOne({ createdAt: new Date() })`,
        );
        break;
      case 'redis':
        throw badRequest('Redis không có khái niệm tạo database (dùng db0-db15 sẵn có)');
    }
    return { name, username, password };
  }

  async dropDatabase(appId: string, name: string): Promise<void> {
    const server = await this.server(appId);
    if (!isSqlIdentifier(name) || SYSTEM_DATABASES.has(name)) throw badRequest('Không thể xóa database này');
    switch (server.engine) {
      case 'mysql':
      case 'mariadb':
        await this.mysql(server, `DROP DATABASE \`${name}\`;`);
        break;
      case 'postgres':
        await this.postgres(server, `DROP DATABASE "${name}" WITH (FORCE)`);
        break;
      case 'mongodb':
        await this.mongo(server, `db.getSiblingDB(${JSON.stringify(name)}).dropDatabase()`);
        break;
      case 'redis': {
        const index = /^db(\d+)$/.exec(name)?.[1];
        if (index === undefined) throw badRequest('Tên db Redis không hợp lệ');
        await this.docker.execIn(server.container, ['redis-cli', '--no-auth-warning', '-a', server.password, '-n', index, 'FLUSHDB']);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ Truy cập từ xa (mở cổng ra Internet thật)

  /** Kiểm tra từng lớp: Docker publish → cấu hình engine → tường lửa OS → cổng nội bộ → Internet */
  async remoteStatus(appId: string, checkInternet = true): Promise<RemoteAccessStatus> {
    const server = await this.server(appId);
    const host = await publicIp();
    const [binding, engine, firewall, localOk] = await Promise.all([this.checkBinding(server), this.checkEngine(server), this.checkFirewall(server.port), tcpProbe('127.0.0.1', server.port)]);
    const local: RemoteCheck = { ok: localOk, detail: localOk ? `127.0.0.1:${server.port} nhận kết nối` : `Không có gì lắng nghe cổng ${server.port}` };
    let internet: RemoteCheck = { ok: null, detail: 'Chưa kiểm tra' };
    if (checkInternet && host) {
      const ext = await externalProbe(host, server.port);
      internet =
        ext === null
          ? { ok: null, detail: 'Không gọi được dịch vụ kiểm tra bên ngoài, hãy thử kết nối bằng client của bạn' }
          : ext
            ? { ok: true, detail: `Từ Internet kết nối được ${host}:${server.port}` }
            : {
                ok: false,
                detail: firewall.ok
                  ? `Internet chưa vào được ${host}:${server.port} dù tường lửa máy đã mở → nhiều khả năng bị chặn ở Security Group / firewall của nhà cung cấp VPS (AWS, Oracle, GCP, Azure, Vultr...). Hãy mở cổng ${server.port}/TCP ở trang quản lý VPS.`
                  : `Internet chưa vào được ${host}:${server.port}`,
              };
    } else if (!host) internet = { ok: null, detail: 'Không xác định được IP public của máy chủ (đặt trong Cài đặt → Hạn VPS → Public host)' };
    return {
      appId,
      port: server.port,
      publicHost: host,
      binding,
      engine,
      firewall,
      local,
      internet,
      open: Boolean(binding.ok && engine.ok !== false && firewall.ok !== false && local.ok && internet.ok !== false),
    };
  }

  private async checkBinding(server: DatabaseServer): Promise<RemoteCheck> {
    const ports = (await this.docker.containers().catch(() => [])).find((c) => c.name === server.container)?.ports ?? '';
    if (!ports) return { ok: null, detail: 'Không đọc được cấu hình cổng của container' };
    const publicBind = new RegExp(`(0\\.0\\.0\\.0|\\[::\\]|:::?):${server.port}->`).test(ports);
    const localBind = new RegExp(`127\\.0\\.0\\.1:${server.port}->`).test(ports);
    if (publicBind) return { ok: true, detail: `Docker publish ${server.port} trên mọi địa chỉ (0.0.0.0)` };
    if (localBind) return { ok: false, detail: `Container chỉ publish trên 127.0.0.1:${server.port}, máy khác không vào được` };
    return { ok: false, detail: `Container không publish cổng ${server.port} (${ports})` };
  }

  private async checkEngine(server: DatabaseServer): Promise<RemoteCheck> {
    try {
      switch (server.engine) {
        case 'mysql':
        case 'mariadb': {
          const count = (await this.mysql(server, "SELECT COUNT(*) FROM mysql.user WHERE user='root' AND host='%'")).trim();
          return count !== '0' ? { ok: true, detail: "Tài khoản root@'%' được phép đăng nhập từ xa" } : { ok: false, detail: "root chỉ đăng nhập được từ localhost" };
        }
        case 'postgres': {
          const listen = (await this.postgres(server, 'SHOW listen_addresses')).trim();
          const hba = (await this.postgres(server, "SELECT count(*) FROM pg_hba_file_rules WHERE type='host' AND (address='all' OR address='0.0.0.0' OR netmask='0.0.0.0')")).trim();
          if (listen !== '*' && !listen.includes('0.0.0.0')) return { ok: false, detail: `listen_addresses = '${listen}'` };
          return hba !== '0' ? { ok: true, detail: 'listen_addresses = * và pg_hba cho phép mọi IP' } : { ok: false, detail: 'pg_hba.conf chưa có dòng cho phép IP bên ngoài' };
        }
        case 'redis': {
          const bind = await this.docker.execIn(server.container, ['redis-cli', '--no-auth-warning', '-a', server.password, 'CONFIG', 'GET', 'bind']);
          const value = bind.split('\n')[1]?.trim() ?? '';
          return !value || value.includes('*') || value.includes('0.0.0.0') ? { ok: true, detail: `bind = ${value || '(mọi địa chỉ)'}, có mật khẩu` } : { ok: false, detail: `Redis chỉ bind ${value}` };
        }
        case 'mongodb':
          return { ok: true, detail: 'Image MongoDB chính thức lắng nghe mọi địa chỉ (bind_ip_all)' };
      }
    } catch (err) {
      return { ok: null, detail: `Không kiểm tra được: ${(err as Error).message.slice(0, 160)}` };
    }
  }

  private async checkFirewall(port: number): Promise<RemoteCheck> {
    const status = await this.adapter.getFirewallStatus().catch(() => null);
    if (!status || status.backend === 'none') return { ok: null, detail: 'Không phát hiện tường lửa trên máy' };
    if (!status.enabled) return { ok: true, detail: `Tường lửa ${status.backend} đang tắt (mọi cổng đều mở)` };
    const rules = await this.adapter.listFirewallRules().catch(() => []);
    const allowed = rules.some((r) => r.action === 'allow' && r.port && r.port.split(/[,\s]+/).some((p) => (p.includes('-') ? Number(p.split('-')[0]) <= port && port <= Number(p.split('-')[1]) : Number(p) === port)));
    if (allowed) return { ok: true, detail: `${status.backend}: đã có luật cho phép cổng ${port}` };
    // Docker trên Linux publish cổng qua iptables DNAT, đi vòng qua ufw INPUT
    if (this.adapter.family === 'linux' && status.backend === 'ufw') return { ok: true, detail: `Docker publish qua iptables nên ufw không chặn cổng ${port} (vẫn nên thêm luật để dễ quản lý)` };
    return { ok: false, detail: `${status.backend}: chưa có luật cho phép cổng ${port}` };
  }

  /** Mở / đóng truy cập từ xa: sửa cấu hình engine + thêm/xoá luật tường lửa, rồi kiểm tra lại từ Internet */
  setRemoteAccess(appId: string, input: { enabled: boolean; source?: string | null }): JobView {
    return startJob(`${input.enabled ? 'Mở' : 'Đóng'} truy cập từ xa database ${appId}`, 'database', async () => {
      const server = await this.server(appId);
      const source = input.source?.trim() || null;
      const label = `${DB_RULE_PREFIX} ${server.name} ${server.port}`;

      if (!input.enabled) {
        jobStep('Gỡ luật tường lửa');
        const rules = await this.adapter.listFirewallRules().catch(() => []);
        const ours = rules.filter((r) => r.description.includes(DB_RULE_PREFIX) && r.port === String(server.port));
        for (const r of ours) await this.adapter.deleteFirewallRule(r.id);
        jobLog(ours.length ? `Đã gỡ ${ours.length} luật mở cổng ${server.port}` : 'Không có luật nào do ZenPanel tạo cho cổng này');
        if (this.adapter.family === 'linux') jobLog('Lưu ý: Docker trên Linux vẫn publish cổng qua iptables. Muốn chặn hẳn, hãy chặn IP ở tường lửa nhà cung cấp hoặc đổi app sang bind 127.0.0.1.');
        return;
      }

      jobStep('Kiểm tra Docker publish cổng');
      const binding = await this.checkBinding(server);
      jobLog(`${binding.ok ? '✔' : '✘'} ${binding.detail}`);
      if (binding.ok === false) throw new Error(`${binding.detail}. Hãy "Cấu hình lại" app để publish cổng ra 0.0.0.0.`);

      jobStep(`Cho phép ${server.name} nhận kết nối từ xa`);
      switch (server.engine) {
        case 'mysql':
        case 'mariadb':
          await this.mysql(
            server,
            `CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${server.password.replace(/'/g, "''")}'; GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;`,
          );
          jobLog("✔ Đã bật root@'%'");
          break;
        case 'postgres': {
          const listen = (await this.postgres(server, 'SHOW listen_addresses')).trim();
          if (listen !== '*') {
            await this.postgres(server, "ALTER SYSTEM SET listen_addresses = '*'");
            jobLog('Đã đặt listen_addresses = * (cần khởi động lại container)');
            await this.docker.containerAction(server.container, 'restart');
            await new Promise((r) => setTimeout(r, 4000));
          }
          const hba = (await this.postgres(server, "SELECT count(*) FROM pg_hba_file_rules WHERE type='host' AND (address='all' OR address='0.0.0.0')")).trim();
          if (hba === '0') {
            await this.docker.execShell(server.container, 'printf "\\nhost all all 0.0.0.0/0 scram-sha-256\\nhost all all ::/0 scram-sha-256\\n" >> "$PGDATA/pg_hba.conf"');
            await this.postgres(server, 'SELECT pg_reload_conf()');
            jobLog('✔ Đã thêm luật pg_hba cho mọi IP (bắt buộc mật khẩu)');
          } else jobLog('✔ pg_hba đã cho phép IP bên ngoài');
          break;
        }
        case 'redis':
          await this.docker.execIn(server.container, ['redis-cli', '--no-auth-warning', '-a', server.password, 'CONFIG', 'SET', 'bind', '* -::*']).catch(() =>
            this.docker.execIn(server.container, ['redis-cli', '--no-auth-warning', '-a', server.password, 'CONFIG', 'SET', 'bind', '0.0.0.0']),
          );
          await this.docker.execIn(server.container, ['redis-cli', '--no-auth-warning', '-a', server.password, 'CONFIG', 'SET', 'protected-mode', 'no']);
          jobLog('✔ Redis bind mọi địa chỉ (vẫn yêu cầu mật khẩu)');
          break;
        case 'mongodb':
          jobLog('✔ MongoDB đã lắng nghe mọi địa chỉ');
          break;
      }

      jobStep('Mở cổng trên tường lửa máy chủ');
      const fw = await this.checkFirewall(server.port);
      const rules = await this.adapter.listFirewallRules().catch(() => []);
      if (!rules.some((r) => r.description.includes(DB_RULE_PREFIX) && r.port === String(server.port))) {
        await this.adapter.addFirewallRule({ action: 'allow', port: String(server.port), protocol: 'tcp', source, description: label }).catch((err: Error) => jobLog(`⚠ Không thêm được luật tường lửa: ${err.message}`));
        jobLog(`✔ Đã thêm luật cho phép ${server.port}/tcp${source ? ` từ ${source}` : ' từ mọi IP'}`);
      } else jobLog(`✔ ${fw.detail}`);

      jobStep('Kiểm tra từ Internet');
      const status = await this.remoteStatus(appId, true);
      for (const [name, check] of Object.entries({ 'Docker': status.binding, 'Engine': status.engine, 'Tường lửa': status.firewall, 'Nội bộ': status.local, 'Internet': status.internet })) {
        jobLog(`${check.ok === true ? '✔' : check.ok === false ? '✘' : '•'} ${name}: ${check.detail}`);
      }
      jobResult(status);
    });
  }
}
