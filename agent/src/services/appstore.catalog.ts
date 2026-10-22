// ZenPanel - Danh mục ứng dụng 1-Click (Docker Compose)

export type AppCategory = 'web' | 'database' | 'tools' | 'devops' | 'storage' | 'network';
export type DatabaseEngine = 'mysql' | 'mariadb' | 'postgres' | 'redis' | 'mongodb';

export interface AppParam {
  key: string;
  label: string;
  type: 'text' | 'password' | 'port';
  default?: string | number;
  /** Tự sinh mật khẩu ngẫu nhiên nếu người dùng để trống */
  generate?: boolean;
}

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  category: AppCategory;
  /** Tên icon lucide-react hiển thị trên dashboard */
  icon: string;
  website: string;
  params: AppParam[];
  /** Cổng chính để mở giao diện web của ứng dụng (key của param) */
  webPort?: string;
  database?: { engine: DatabaseEngine; passwordKey: string; portKey: string };
  compose(p: Record<string, string>, container: string): string;
}

const q = (value: string) => JSON.stringify(value);

/** Sinh file compose 1 service với các tùy chọn chung */
function service(opts: {
  container: string;
  image: string;
  ports?: string[];
  env?: Record<string, string>;
  volumes?: Record<string, string>;
  /** Bind mount từ máy chủ, vd "/var/run/docker.sock:/var/run/docker.sock" */
  binds?: string[];
  command?: string;
  extra?: string[];
}): string {
  const lines = ['services:', '  app:', `    image: ${opts.image}`, `    container_name: ${opts.container}`, '    restart: unless-stopped'];
  if (opts.command) lines.push(`    command: ${opts.command}`);
  if (opts.ports?.length) lines.push('    ports:', ...opts.ports.map((p) => `      - ${q(p)}`));
  if (opts.env && Object.keys(opts.env).length) {
    lines.push('    environment:', ...Object.entries(opts.env).map(([k, v]) => `      ${k}: ${q(v)}`));
  }
  const mounts = [...Object.entries(opts.volumes ?? {}).map(([name, target]) => `${name}:${target}`), ...(opts.binds ?? [])];
  if (mounts.length) lines.push('    volumes:', ...mounts.map((m) => `      - ${q(m)}`));
  if (opts.extra) lines.push(...opts.extra.map((l) => `    ${l}`));
  if (opts.volumes && Object.keys(opts.volumes).length) {
    lines.push('volumes:', ...Object.keys(opts.volumes).map((name) => `  ${name}:`));
  }
  return `${lines.join('\n')}\n`;
}

const portParam = (key: string, label: string, def: number): AppParam => ({ key, label, type: 'port', default: def });
const passwordParam = (key = 'password', label = 'Mật khẩu'): AppParam => ({ key, label, type: 'password', generate: true });

export const APP_CATALOG: AppDefinition[] = [
  {
    id: 'nginx',
    name: 'Nginx',
    description: 'Web server / reverse proxy hiệu năng cao, chạy trong container.',
    category: 'web',
    icon: 'Globe',
    website: 'https://nginx.org',
    params: [portParam('port', 'Cổng HTTP', 8080)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'nginx:stable-alpine', ports: [`${p.port}:80`], volumes: { html: '/usr/share/nginx/html' } }),
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'CMS phổ biến nhất thế giới, kèm sẵn MariaDB riêng.',
    category: 'web',
    icon: 'Newspaper',
    website: 'https://wordpress.org',
    params: [portParam('port', 'Cổng HTTP', 8081), passwordParam('dbPassword', 'Mật khẩu database')],
    webPort: 'port',
    compose: (p, c) =>
      [
        'services:',
        '  db:',
        '    image: mariadb:11',
        `    container_name: ${c}-db`,
        '    restart: unless-stopped',
        '    environment:',
        '      MARIADB_DATABASE: "wordpress"',
        '      MARIADB_USER: "wordpress"',
        `      MARIADB_PASSWORD: ${q(p.dbPassword)}`,
        `      MARIADB_ROOT_PASSWORD: ${q(p.dbPassword)}`,
        '    volumes:',
        '      - db:/var/lib/mysql',
        '  app:',
        '    image: wordpress:latest',
        `    container_name: ${c}`,
        '    restart: unless-stopped',
        '    depends_on: [db]',
        '    ports:',
        `      - "${p.port}:80"`,
        '    environment:',
        '      WORDPRESS_DB_HOST: "db"',
        '      WORDPRESS_DB_NAME: "wordpress"',
        '      WORDPRESS_DB_USER: "wordpress"',
        `      WORDPRESS_DB_PASSWORD: ${q(p.dbPassword)}`,
        '    volumes:',
        '      - html:/var/www/html',
        'volumes:',
        '  db:',
        '  html:',
        '',
      ].join('\n'),
  },
  {
    id: 'mysql',
    name: 'MySQL 8.4',
    description: 'Hệ quản trị CSDL quan hệ phổ biến nhất. Quản lý trong mục Databases.',
    category: 'database',
    icon: 'Database',
    website: 'https://www.mysql.com',
    params: [portParam('port', 'Cổng', 3306), passwordParam('password', 'Mật khẩu root')],
    database: { engine: 'mysql', passwordKey: 'password', portKey: 'port' },
    compose: (p, c) =>
      service({ container: c, image: 'mysql:8.4', ports: [`${p.port}:3306`], env: { MYSQL_ROOT_PASSWORD: p.password }, volumes: { data: '/var/lib/mysql' } }),
  },
  {
    id: 'mariadb',
    name: 'MariaDB 11',
    description: 'Bản fork mã nguồn mở của MySQL, tương thích hoàn toàn.',
    category: 'database',
    icon: 'Database',
    website: 'https://mariadb.org',
    params: [portParam('port', 'Cổng', 3307), passwordParam('password', 'Mật khẩu root')],
    database: { engine: 'mariadb', passwordKey: 'password', portKey: 'port' },
    compose: (p, c) =>
      service({ container: c, image: 'mariadb:11', ports: [`${p.port}:3306`], env: { MARIADB_ROOT_PASSWORD: p.password }, volumes: { data: '/var/lib/mysql' } }),
  },
  {
    id: 'postgres',
    name: 'PostgreSQL 17',
    description: 'CSDL quan hệ mạnh mẽ, chuẩn SQL, nhiều tính năng nâng cao.',
    category: 'database',
    icon: 'Database',
    website: 'https://www.postgresql.org',
    params: [portParam('port', 'Cổng', 5432), passwordParam('password', 'Mật khẩu user postgres')],
    database: { engine: 'postgres', passwordKey: 'password', portKey: 'port' },
    compose: (p, c) =>
      service({ container: c, image: 'postgres:17-alpine', ports: [`${p.port}:5432`], env: { POSTGRES_PASSWORD: p.password }, volumes: { data: '/var/lib/postgresql/data' } }),
  },
  {
    id: 'redis',
    name: 'Redis 7',
    description: 'In-memory key-value store cho cache, queue, session.',
    category: 'database',
    icon: 'Zap',
    website: 'https://redis.io',
    params: [portParam('port', 'Cổng', 6379), passwordParam()],
    database: { engine: 'redis', passwordKey: 'password', portKey: 'port' },
    compose: (p, c) =>
      service({
        container: c,
        image: 'redis:7-alpine',
        ports: [`${p.port}:6379`],
        command: q(`redis-server --appendonly yes --requirepass ${p.password}`),
        volumes: { data: '/data' },
      }),
  },
  {
    id: 'mongodb',
    name: 'MongoDB 8',
    description: 'CSDL NoSQL dạng document linh hoạt.',
    category: 'database',
    icon: 'Leaf',
    website: 'https://www.mongodb.com',
    params: [portParam('port', 'Cổng', 27017), passwordParam('password', 'Mật khẩu user root')],
    database: { engine: 'mongodb', passwordKey: 'password', portKey: 'port' },
    compose: (p, c) =>
      service({
        container: c,
        image: 'mongo:8',
        ports: [`${p.port}:27017`],
        env: { MONGO_INITDB_ROOT_USERNAME: 'root', MONGO_INITDB_ROOT_PASSWORD: p.password },
        volumes: { data: '/data/db' },
      }),
  },
  {
    id: 'adminer',
    name: 'Adminer',
    description: 'Quản trị MySQL / PostgreSQL / SQLite qua web, chỉ 1 file nhẹ.',
    category: 'tools',
    icon: 'Table',
    website: 'https://www.adminer.org',
    params: [portParam('port', 'Cổng HTTP', 8082)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'adminer:latest', ports: [`${p.port}:8080`], extra: ['extra_hosts:', '  - "host.docker.internal:host-gateway"'] }),
  },
  {
    id: 'phpmyadmin',
    name: 'phpMyAdmin',
    description: 'Giao diện web quản trị MySQL/MariaDB kinh điển.',
    category: 'tools',
    icon: 'Table2',
    website: 'https://www.phpmyadmin.net',
    params: [portParam('port', 'Cổng HTTP', 8083)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'phpmyadmin:latest',
        ports: [`${p.port}:80`],
        env: { PMA_ARBITRARY: '1', UPLOAD_LIMIT: '256M' },
        extra: ['extra_hosts:', '  - "host.docker.internal:host-gateway"'],
      }),
  },
  {
    id: 'portainer',
    name: 'Portainer CE',
    description: 'Giao diện quản lý Docker nâng cao.',
    category: 'devops',
    icon: 'Container',
    website: 'https://www.portainer.io',
    params: [portParam('port', 'Cổng HTTPS', 9443)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'portainer/portainer-ce:latest',
        ports: [`${p.port}:9443`],
        volumes: { data: '/data' },
        binds: ['/var/run/docker.sock:/var/run/docker.sock'],
      }),
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Giám sát uptime website, API, port với thông báo đa kênh.',
    category: 'devops',
    icon: 'Activity',
    website: 'https://uptime.kuma.pet',
    params: [portParam('port', 'Cổng HTTP', 3001)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'louislam/uptime-kuma:1', ports: [`${p.port}:3001`], volumes: { data: '/app/data' } }),
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Nền tảng tự động hóa workflow, thay thế Zapier.',
    category: 'devops',
    icon: 'Workflow',
    website: 'https://n8n.io',
    params: [portParam('port', 'Cổng HTTP', 5678)],
    webPort: 'port',
    compose: (p, c) =>
      service({ container: c, image: 'n8nio/n8n:latest', ports: [`${p.port}:5678`], env: { N8N_SECURE_COOKIE: 'false' }, volumes: { data: '/home/node/.n8n' } }),
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Git server tự host nhẹ, giao diện giống GitHub.',
    category: 'devops',
    icon: 'GitBranch',
    website: 'https://gitea.io',
    params: [portParam('port', 'Cổng HTTP', 3000), portParam('sshPort', 'Cổng SSH', 2222)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'gitea/gitea:latest', ports: [`${p.port}:3000`, `${p.sshPort}:22`], volumes: { data: '/data' } }),
  },
  {
    id: 'minio',
    name: 'MinIO',
    description: 'Object storage tương thích Amazon S3.',
    category: 'storage',
    icon: 'HardDrive',
    website: 'https://min.io',
    params: [portParam('port', 'Cổng API', 9000), portParam('consolePort', 'Cổng Console', 9001), passwordParam('password', 'Mật khẩu (user: minioadmin)')],
    webPort: 'consolePort',
    compose: (p, c) =>
      service({
        container: c,
        image: 'minio/minio:latest',
        command: q('server /data --console-address :9001'),
        ports: [`${p.port}:9000`, `${p.consolePort}:9001`],
        env: { MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: p.password },
        volumes: { data: '/data' },
      }),
  },
  {
    id: 'filebrowser',
    name: 'File Browser',
    description: 'Chia sẻ & quản lý file qua web cho người dùng cuối.',
    category: 'storage',
    icon: 'FolderOpen',
    website: 'https://filebrowser.org',
    params: [portParam('port', 'Cổng HTTP', 8084)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'filebrowser/filebrowser:latest', ports: [`${p.port}:80`], volumes: { srv: '/srv' } }),
  },
  {
    id: 'code-server',
    name: 'Code Server',
    description: 'VS Code chạy trên trình duyệt.',
    category: 'devops',
    icon: 'Code',
    website: 'https://coder.com',
    params: [portParam('port', 'Cổng HTTP', 8443), passwordParam()],
    webPort: 'port',
    compose: (p, c) =>
      service({ container: c, image: 'codercom/code-server:latest', ports: [`${p.port}:8080`], env: { PASSWORD: p.password }, volumes: { home: '/home/coder' } }),
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Server quản lý mật khẩu tương thích Bitwarden.',
    category: 'tools',
    icon: 'KeyRound',
    website: 'https://github.com/dani-garcia/vaultwarden',
    params: [portParam('port', 'Cổng HTTP', 8085)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'vaultwarden/server:latest', ports: [`${p.port}:80`], volumes: { data: '/data' } }),
  },
  {
    id: 'cloudflared',
    name: 'Cloudflare Tunnel',
    description: 'Named Tunnel cố định (cần Tunnel Token từ Cloudflare Zero Trust).',
    category: 'network',
    icon: 'Cloud',
    website: 'https://one.dash.cloudflare.com',
    params: [{ key: 'token', label: 'Tunnel Token', type: 'password' }],
    compose: (p, c) =>
      service({ container: c, image: 'cloudflare/cloudflared:latest', command: q(`tunnel --no-autoupdate run --token ${p.token}`), extra: ['network_mode: host'] }),
  },
];
