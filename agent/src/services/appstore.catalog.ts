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
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Đám mây riêng: lưu trữ file, lịch, danh bạ, chia sẻ như Google Drive.',
    category: 'storage',
    icon: 'Cloud',
    website: 'https://nextcloud.com',
    params: [portParam('port', 'Cổng HTTP', 8086)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'nextcloud:latest', ports: [`${p.port}:80`], volumes: { data: '/var/www/html' } }),
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Nền tảng blog / newsletter hiện đại, nhanh và đẹp.',
    category: 'web',
    icon: 'Newspaper',
    website: 'https://ghost.org',
    params: [portParam('port', 'Cổng HTTP', 2368), { key: 'url', label: 'URL website (vd http://IP:2368)', type: 'text', default: 'http://localhost:2368' }],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'ghost:5-alpine',
        ports: [`${p.port}:2368`],
        env: { url: p.url, database__client: 'sqlite3', database__connection__filename: '/var/lib/ghost/content/data/ghost.db' },
        volumes: { content: '/var/lib/ghost/content' },
      }),
  },
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Máy chủ media cá nhân: phim, nhạc, ảnh, stream mọi thiết bị.',
    category: 'storage',
    icon: 'Clapperboard',
    website: 'https://jellyfin.org',
    params: [portParam('port', 'Cổng HTTP', 8096)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'jellyfin/jellyfin:latest', ports: [`${p.port}:8096`], volumes: { config: '/config', cache: '/cache', media: '/media' } }),
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Dashboard giám sát & trực quan hoá số liệu (user/pass: admin/admin).',
    category: 'devops',
    icon: 'ChartLine',
    website: 'https://grafana.com',
    params: [portParam('port', 'Cổng HTTP', 3002)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'grafana/grafana-oss:latest', ports: [`${p.port}:3000`], volumes: { data: '/var/lib/grafana' } }),
  },
  {
    id: 'dozzle',
    name: 'Dozzle',
    description: 'Xem log mọi container Docker realtime trên web, siêu nhẹ.',
    category: 'devops',
    icon: 'ScrollText',
    website: 'https://dozzle.dev',
    params: [portParam('port', 'Cổng HTTP', 8087)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'amir20/dozzle:latest', ports: [`${p.port}:8080`], binds: ['/var/run/docker.sock:/var/run/docker.sock:ro'] }),
  },
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    description: 'Tải torrent qua giao diện web (mật khẩu tạm in trong log container).',
    category: 'network',
    icon: 'Download',
    website: 'https://www.qbittorrent.org',
    params: [portParam('port', 'Cổng Web UI', 8088), portParam('peerPort', 'Cổng torrent', 6881)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'lscr.io/linuxserver/qbittorrent:latest',
        ports: [`${p.port}:${p.port}`, `${p.peerPort}:${p.peerPort}`, `${p.peerPort}:${p.peerPort}/udp`],
        env: { WEBUI_PORT: p.port, TORRENTING_PORT: p.peerPort, PUID: '1000', PGID: '1000', TZ: 'Asia/Ho_Chi_Minh' },
        volumes: { config: '/config', downloads: '/downloads' },
      }),
  },
  {
    id: 'syncthing',
    name: 'Syncthing',
    description: 'Đồng bộ thư mục giữa các máy, mã hoá đầu cuối, không qua cloud.',
    category: 'storage',
    icon: 'RefreshCw',
    website: 'https://syncthing.net',
    params: [portParam('port', 'Cổng Web UI', 8384)],
    webPort: 'port',
    compose: (p, c) =>
      service({ container: c, image: 'syncthing/syncthing:latest', ports: [`${p.port}:8384`, '22000:22000/tcp', '22000:22000/udp'], volumes: { data: '/var/syncthing' } }),
  },
  {
    id: 'memos',
    name: 'Memos',
    description: 'Ghi chú nhanh dạng timeline tự host, hỗ trợ Markdown.',
    category: 'tools',
    icon: 'NotebookPen',
    website: 'https://usememos.com',
    params: [portParam('port', 'Cổng HTTP', 5230)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'neosmemo/memos:stable', ports: [`${p.port}:5230`], volumes: { data: '/var/opt/memos' } }),
  },
  {
    id: 'it-tools',
    name: 'IT Tools',
    description: 'Bộ 80+ công cụ cho dev: mã hoá, JWT, UUID, chuyển đổi định dạng...',
    category: 'tools',
    icon: 'Wrench',
    website: 'https://it-tools.tech',
    params: [portParam('port', 'Cổng HTTP', 8089)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'corentinth/it-tools:latest', ports: [`${p.port}:80`] }),
  },
  {
    id: 'mongo-express',
    name: 'Mongo Express',
    description: 'Quản trị MongoDB qua web (kết nối tới MongoDB của App Store).',
    category: 'tools',
    icon: 'Leaf',
    website: 'https://github.com/mongo-express/mongo-express',
    params: [portParam('port', 'Cổng HTTP', 8090), { key: 'mongoUrl', label: 'MongoDB URL', type: 'text', default: 'mongodb://root:matkhau@host.docker.internal:27017/' }],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'mongo-express:latest',
        ports: [`${p.port}:8081`],
        env: { ME_CONFIG_MONGODB_URL: p.mongoUrl, ME_CONFIG_BASICAUTH: 'false' },
        extra: ['extra_hosts:', '  - "host.docker.internal:host-gateway"'],
      }),
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
