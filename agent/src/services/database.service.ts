// ZenPanel - Quản lý database trong các container do App Store cài (MySQL, MariaDB, PostgreSQL, Redis, MongoDB)
import type { ServiceInfo } from '../adapters/base.adapter.js';
import { generatePassword } from '../core/auth.js';
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

const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys', 'postgres', 'admin', 'config', 'local']);
const NATIVE_PATTERN = /^(mysql|mysqld|mariadb|postgresql.*|redis.*|mongod)$/i;

export class DatabaseService {
  constructor(
    private readonly docker: DockerService,
    private readonly apps: AppStoreService,
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
}
