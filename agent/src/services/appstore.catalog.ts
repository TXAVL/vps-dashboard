// ZenPanel - Danh mục ứng dụng 1-Click (Docker Compose)

export type AppCategory = 'web' | 'database' | 'tools' | 'devops' | 'storage' | 'network' | 'ai';
export type DatabaseEngine = 'mysql' | 'mariadb' | 'postgres' | 'redis' | 'mongodb';

export interface AppParam {
  key: string;
  label: string;
  type: 'text' | 'password' | 'port';
  default?: string | number;
  /** Tự sinh mật khẩu ngẫu nhiên nếu người dùng để trống */
  generate?: boolean;
  /** Được phép để trống */
  optional?: boolean;
  hint?: string;
}

/** API key AI đã lưu trong ZenPanel (Cài đặt → AI), được bơm vào các app AI khi cài */
export interface AiKey {
  key: string;
  baseUrl: string;
}

export interface ComposeContext {
  ai: Partial<Record<'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'nvidia', AiKey>>;
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
  /** Giao diện web chạy HTTPS tự ký (tunnel cần --no-tls-verify) */
  webScheme?: 'http' | 'https';
  /** Dùng API key AI đã lưu: đổi key thì cần "Cấu hình lại" */
  usesAiKeys?: boolean;
  /** Nền tảng hệ điều hành hỗ trợ: 'all' | 'windows' | 'linux' | 'darwin' | 'bsd' (mặc định 'all') */
  platform?: 'all' | 'windows' | 'linux' | 'darwin' | 'bsd';
  /** Yêu cầu môi trường Desktop có màn hình đồ họa (GUI) */
  requiresGui?: boolean;
  /** Loại ứng dụng: 'docker' | 'native' (mặc định 'docker') */
  appType?: 'docker' | 'native';
  /** Đánh dấu là ứng dụng tùy chỉnh do người dùng thêm */
  isCustom?: boolean;
  /** Lệnh / URL tải hoặc script cài đặt app native */
  nativeInstall?: {
    downloadUrl?: string;
    command?: string;
    targetExe?: string;
  };
  /** File cấu hình đi kèm docker-compose.yml (tên file -> nội dung) */
  files?(p: Record<string, string>, ctx: ComposeContext): Record<string, string>;
  compose?(p: Record<string, string>, container: string, ctx: ComposeContext): string;
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
const passwordParam = (key = 'password', label = 'Mật khẩu', def?: string): AppParam => ({ key, label, type: 'password', default: def, generate: !def });

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
    webScheme: 'https',
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
    params: [
      portParam('port', 'Cổng HTTP', 5678),
      { key: 'webhookUrl', label: 'Webhook URL public (tuỳ chọn)', type: 'text', optional: true, hint: 'Để trống lúc cài, sau đó dùng "Thiết lập n8n" để tự điền link public' },
    ],
    webPort: 'port',
    compose: (p, c) => {
      const env: Record<string, string> = {
        N8N_PORT: '5678',
        N8N_SECURE_COOKIE: 'false',
        GENERIC_TIMEZONE: 'Asia/Ho_Chi_Minh',
        TZ: 'Asia/Ho_Chi_Minh',
        N8N_RUNNERS_ENABLED: 'true',
        N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
        // Tối ưu hóa tiết kiệm RAM cho máy chủ 2GB - 4GB RAM
        NODE_OPTIONS: '--max-old-space-size=256',
        EXECUTIONS_DATA_PRUNE: 'true',
        EXECUTIONS_DATA_MAX_AGE: '48',
        EXECUTIONS_DATA_SAVE_ON_ERROR: 'all',
        EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'none',
        N8N_METRICS: 'false',
        DB_SQLITE_VACUUM_ON_STARTUP: 'true',
      };
      // Webhook URL phải là địa chỉ public thì webhook / OAuth callback mới hoạt động từ bên ngoài
      if (p.webhookUrl) {
        const url = p.webhookUrl.endsWith('/') ? p.webhookUrl : `${p.webhookUrl}/`;
        env.WEBHOOK_URL = url;
        env.N8N_EDITOR_BASE_URL = url;
        try {
          env.N8N_HOST = new URL(url).hostname;
          env.N8N_PROTOCOL = new URL(url).protocol.replace(':', '');
        } catch {}
      }
      return service({
        container: c,
        image: 'n8nio/n8n:latest',
        ports: [`${p.port}:5678`],
        env,
        volumes: { data: '/home/node/.n8n' },
        extra: [
          'deploy:',
          '  resources:',
          '    limits:',
          '      memory: 512M',
          'extra_hosts:',
          '  - "host.docker.internal:host-gateway"',
        ],
      });
    },
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
    name: 'ZenFile Explorer Pro',
    description: 'Bản nâng cấp File Explorer Pro: duyệt toàn bộ tệp tin VPS, xem trước ảnh gallery & video streaming & âm thanh, đọc PDF, chia sẻ link tải bảo mật (mật khẩu & thời hạn), tìm kiếm đệ quy.',
    category: 'storage',
    icon: 'FolderOpen',
    website: 'https://filebrowser.org',
    params: [
      portParam('port', 'Cổng HTTP', 8084),
      passwordParam('password', 'Mật khẩu đăng nhập admin', 'admin'),
      { key: 'rootPath', label: 'Thư mục quản lý trên máy chủ', type: 'text', default: '/', hint: 'Thư mục máy chủ được gắn vào để duyệt tệp (mặc định / là toàn bộ VPS)' },
    ],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'filebrowser/filebrowser:latest',
        ports: [`${p.port}:80`],
        volumes: { data: '/database' },
        binds: [`${p.rootPath || '/'}:/srv`],
        command: `sh -c "/filebrowser config init -a 0.0.0.0 -p 80 -r /srv -d /database/filebrowser.db >/dev/null 2>&1 || true; /filebrowser users add admin '${p.password || 'admin'}' --perm.admin >/dev/null 2>&1 || /filebrowser users update admin -p '${p.password || 'admin'}' >/dev/null 2>&1 || true; exec /filebrowser -a 0.0.0.0 -p 80 -r /srv -d /database/filebrowser.db"`,
      }),
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
  // ------------------------------------------------------------ AI
  {
    id: 'litellm',
    name: 'AI Gateway (LiteLLM)',
    description: '1 endpoint chuẩn OpenAI cho mọi model: ChatGPT, Claude, Gemini, OpenRouter, NVIDIA. Giống OpenRouter nhưng tự host.',
    category: 'ai',
    icon: 'Waypoints',
    website: 'https://docs.litellm.ai',
    usesAiKeys: true,
    params: [portParam('port', 'Cổng API', 4000), { key: 'masterKey', label: 'Master key (API key của gateway)', type: 'password', generate: true }],
    webPort: 'port',
    files: (_p, ctx) => {
      // Định tuyến wildcard: gọi model "anthropic/<tên model>", "gemini/<tên model>"... qua cùng 1 endpoint
      const routes: [keyof ComposeContext['ai'], string, string][] = [
        ['openai', 'openai/*', 'OPENAI_API_KEY'],
        ['anthropic', 'anthropic/*', 'ANTHROPIC_API_KEY'],
        ['gemini', 'gemini/*', 'GEMINI_API_KEY'],
        ['openrouter', 'openrouter/*', 'OPENROUTER_API_KEY'],
        ['nvidia', 'nvidia_nim/*', 'NVIDIA_NIM_API_KEY'],
      ];
      const lines = ['# Managed by ZenPanel - sửa API key trong Cài đặt → AI rồi bấm "Cấu hình lại"', 'model_list:'];
      for (const [provider, model, env] of routes) {
        if (!ctx.ai[provider]) continue;
        lines.push(`  - model_name: ${q(model)}`, '    litellm_params:', `      model: ${q(model)}`, `      api_key: ${q(`os.environ/${env}`)}`);
      }
      if (lines.length === 2) lines.push('  []');
      lines.push('general_settings:', '  master_key: "os.environ/LITELLM_MASTER_KEY"', '');
      return { 'config.yaml': lines.join('\n') };
    },
    compose: (p, c, ctx) => {
      const env: Record<string, string> = { LITELLM_MASTER_KEY: `sk-${p.masterKey}` };
      if (ctx.ai.openai) env.OPENAI_API_KEY = ctx.ai.openai.key;
      if (ctx.ai.anthropic) env.ANTHROPIC_API_KEY = ctx.ai.anthropic.key;
      if (ctx.ai.gemini) env.GEMINI_API_KEY = ctx.ai.gemini.key;
      if (ctx.ai.openrouter) env.OPENROUTER_API_KEY = ctx.ai.openrouter.key;
      if (ctx.ai.nvidia) env.NVIDIA_NIM_API_KEY = ctx.ai.nvidia.key;
      return service({
        container: c,
        image: 'ghcr.io/berriai/litellm:main-stable',
        command: q('--config /app/config.yaml --port 4000'),
        ports: [`${p.port}:4000`],
        env,
        binds: ['./config.yaml:/app/config.yaml:ro'],
      });
    },
  },
  {
    id: 'open-webui',
    name: 'Open WebUI',
    description: 'Giao diện chat AI kiểu ChatGPT, tự nối các API key AI bạn đã lưu trong ZenPanel.',
    category: 'ai',
    icon: 'MessagesSquare',
    website: 'https://openwebui.com',
    usesAiKeys: true,
    params: [portParam('port', 'Cổng HTTP', 3003)],
    webPort: 'port',
    compose: (p, c, ctx) => {
      // Gemini, Claude, NVIDIA, OpenRouter đều có endpoint tương thích OpenAI
      const providers = Object.values(ctx.ai).filter((x): x is { key: string; baseUrl: string } => Boolean(x));
      const env: Record<string, string> = { WEBUI_SECRET_KEY: c, ENABLE_OLLAMA_API: 'false' };
      if (providers.length) {
        env.OPENAI_API_BASE_URLS = providers.map((x) => x.baseUrl).join(';');
        env.OPENAI_API_KEYS = providers.map((x) => x.key).join(';');
      }
      return service({
        container: c,
        image: 'ghcr.io/open-webui/open-webui:main',
        ports: [`${p.port}:8080`],
        env,
        volumes: { data: '/app/backend/data' },
        extra: ['extra_hosts:', '  - "host.docker.internal:host-gateway"'],
      });
    },
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Chạy model AI mã nguồn mở (Llama, Qwen, Gemma...) ngay trên VPS, không cần API key.',
    category: 'ai',
    icon: 'Cpu',
    website: 'https://ollama.com',
    params: [portParam('port', 'Cổng API', 11434)],
    compose: (p, c) => service({ container: c, image: 'ollama/ollama:latest', ports: [`${p.port}:11434`], volumes: { models: '/root/.ollama' } }),
  },
  {
    id: 'flowise',
    name: 'Flowise',
    description: 'Kéo thả xây AI Agent, chatbot RAG, workflow LLM không cần code.',
    category: 'ai',
    icon: 'Bot',
    website: 'https://flowiseai.com',
    params: [portParam('port', 'Cổng HTTP', 3004)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'flowiseai/flowise:latest', ports: [`${p.port}:3000`], volumes: { data: '/root/.flowise' } }),
  },
  {
    id: 'anythingllm',
    name: 'AnythingLLM',
    description: 'Trợ lý AI + chat với tài liệu (RAG), agent có công cụ, hỗ trợ mọi nhà cung cấp LLM.',
    category: 'ai',
    icon: 'BrainCircuit',
    website: 'https://anythingllm.com',
    params: [portParam('port', 'Cổng HTTP', 3005)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'mintplexlabs/anythingllm:latest',
        ports: [`${p.port}:3001`],
        env: { STORAGE_DIR: '/app/server/storage' },
        volumes: { storage: '/app/server/storage' },
        extra: ['cap_add:', '  - SYS_ADMIN'],
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
  // --- Ứng dụng Docker Multi-Arch (Đa nhân hệ điều hành) ---
  {
    id: 'dify',
    name: 'Dify.ai',
    description: 'Nền tảng phát triển ứng dụng GenAI, LLM Apps & AI Agent kéo thả hàng đầu thế giới.',
    category: 'ai',
    icon: 'BrainCircuit',
    website: 'https://dify.ai',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI', 3080)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'langgenius/dify-web:latest',
        ports: [`${p.port}:3000`],
        extra: ['environment:', '  - CONSOLE_API_URL=http://localhost:5001'],
      }),
  },
  {
    id: 'nocodb',
    name: 'NocoDB',
    description: 'Biến cơ sở dữ liệu MySQL, PostgreSQL thành Smart Spreadsheet thay thế Airtable tự host.',
    category: 'database',
    icon: 'Table2',
    website: 'https://nocodb.com',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI', 8088)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'nocodb/nocodb:latest', ports: [`${p.port}:8080`], volumes: { nc_data: '/usr/app/data' } }),
  },
  {
    id: 'stirling-pdf',
    name: 'Stirling PDF',
    description: 'Bộ công cụ xử lý hơn 50+ tính năng PDF offline: ghép, tách, nén, OCR, chuyển đổi an toàn bảo mật.',
    category: 'tools',
    icon: 'FileCode',
    website: 'https://github.com/Stirling-Tools/Stirling-PDF',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI', 8089)],
    webPort: 'port',
    compose: (p, c) => service({ container: c, image: 'frooodle/s-pdf:latest', ports: [`${p.port}:8080`], volumes: { configs: '/configs' } }),
  },
  {
    id: 'netdata',
    name: 'Netdata',
    description: 'Hệ thống giám sát hiệu năng VPS chuyên nghiệp, biểu đồ metric theo từng giây theo thời gian thực.',
    category: 'devops',
    icon: 'Activity',
    website: 'https://www.netdata.cloud',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI', 19999)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'netdata/netdata:latest',
        ports: [`${p.port}:19999`],
        extra: ['cap_add:', '  - SYS_PTRACE', '  - SYS_ADMIN', 'security_opt:', '  - apparmor:unconfined'],
      }),
  },
  // --- Ứng dụng dành riêng cho Windows VPS & Máy chủ Windows (Windows NT Kernel) ---
  {
    id: 'tdrop',
    name: 'T-Drop',
    description: 'Chia sẻ tệp tin P2P / LAN nội bộ tốc độ cao, không giới hạn dung lượng do TXAVL phát triển. Tự động tải từ GitHub release.',
    category: 'storage',
    icon: 'Share2',
    website: 'https://github.com/TXAVL/T-Drop',
    platform: 'windows',
    requiresGui: true,
    appType: 'native',
    params: [],
    nativeInstall: {
      downloadUrl: 'https://github.com/TXAVL/T-Drop/releases/download/v0.1.10/T-Drop-Setup-0.1.10.exe',
      targetExe: 'T-Drop.exe',
    },
  },
  {
    id: 'everything',
    name: 'Everything Search',
    description: 'Tìm kiếm tệp tin và thư mục tức thời trên toàn bộ các ổ đĩa NTFS của máy chủ Windows. Tốc độ tìm 1 triệu file trong 1 giây.',
    category: 'tools',
    icon: 'HardDrive',
    website: 'https://www.voidtools.com',
    platform: 'windows',
    requiresGui: true,
    appType: 'native',
    params: [],
    nativeInstall: {
      downloadUrl: 'https://www.voidtools.com/Everything-1.4.1.1026.x64-Setup.exe',
      targetExe: 'Everything.exe',
    },
  },
  {
    id: 'pwsh7',
    name: 'PowerShell 7 (Core)',
    description: 'Môi trường shell và ngôn ngữ kịch bản hiện đại nhất từ Microsoft, hỗ trợ đa luồng và pipeline mạnh mẽ.',
    category: 'devops',
    icon: 'Code',
    website: 'https://learn.microsoft.com/powershell',
    platform: 'windows',
    appType: 'native',
    params: [],
  },
  {
    id: 'tailscale-win',
    name: 'Tailscale (Windows)',
    description: 'Mạng riêng ảo VPN Mesh Zero-Config dựa trên WireGuard, kết nối an toàn VPS Windows vào mạng LAN riêng của bạn.',
    category: 'network',
    icon: 'Cloud',
    website: 'https://tailscale.com',
    platform: 'windows',
    appType: 'native',
    params: [],
  },
  {
    id: 'openssh-win',
    name: 'OpenSSH Server (Windows)',
    description: 'Kích hoạt dịch vụ OpenSSH Server native của Windows để quản trị dòng lệnh từ xa bảo mật qua SSH port 22.',
    category: 'devops',
    icon: 'KeyRound',
    website: 'https://learn.microsoft.com/windows-server/administration/openssh/openssh_overview',
    platform: 'windows',
    appType: 'native',
    params: [],
  },
  {
    id: 'unikey',
    name: 'UniKey',
    description: 'Bộ gõ tiếng Việt chuẩn quốc dân cho Windows. Nhẹ, chuẩn gõ Telex & VNI.',
    category: 'tools',
    icon: 'Keyboard',
    website: 'https://www.unikey.org',
    platform: 'windows',
    requiresGui: true,
    appType: 'native',
    params: [],
  },
  {
    id: '7zip',
    name: '7-Zip',
    description: 'Trình nén và giải nén tệp tin siêu nhanh, tỷ lệ nén cao, hỗ trợ 7z, ZIP, RAR, TAR...',
    category: 'tools',
    icon: 'Archive',
    website: 'https://7-zip.org',
    platform: 'windows',
    appType: 'native',
    params: [],
  },
  {
    id: 'notepadplusplus',
    name: 'Notepad++',
    description: 'Trình soạn thảo mã nguồn và văn bản nhẹ, đa năng, mở file dung lượng lớn cực nhanh.',
    category: 'tools',
    icon: 'FileCode',
    website: 'https://notepad-plus-plus.org',
    platform: 'windows',
    requiresGui: true,
    appType: 'native',
    params: [],
  },
  // --- Ứng dụng dành riêng cho Linux VPS (Linux Kernel: Ubuntu / Debian / CentOS / Alpine) ---
  {
    id: 'btop',
    name: 'btop++ Monitor',
    description: 'Trình giám sát tài nguyên CPU, RAM, ổ đĩa, tiến trình và lưu lượng mạng đỉnh cao dạng giao diện terminal trực quan.',
    category: 'devops',
    icon: 'Activity',
    website: 'https://github.com/aristocratos/btop',
    platform: 'linux',
    appType: 'native',
    params: [],
  },
  {
    id: 'fastfetch',
    name: 'Fastfetch',
    description: 'Công cụ hiển thị cấu hình máy chủ Linux, nhân Kernel, phần cứng siêu đẹp và siêu nhanh viết bằng C.',
    category: 'tools',
    icon: 'Cpu',
    website: 'https://github.com/fastfetch-cli/fastfetch',
    platform: 'linux',
    appType: 'native',
    params: [],
  },
  {
    id: 'fail2ban',
    name: 'Fail2ban',
    description: 'Lá chắn an ninh tự động quét log và chặn ngay lập tức các IP có hành vi quét cổng và brute-force mật khẩu SSH.',
    category: 'network',
    icon: 'Shield',
    website: 'https://www.fail2ban.org',
    platform: 'linux',
    appType: 'native',
    params: [],
  },
  {
    id: 'certbot',
    name: 'Certbot (Let\'s Encrypt)',
    description: 'Công cụ tự động cấp phát và gia hạn chứng chỉ bảo mật SSL/TLS miễn phí cho domain website trên máy chủ Linux.',
    category: 'web',
    icon: 'KeyRound',
    website: 'https://certbot.eff.org',
    platform: 'linux',
    appType: 'native',
    params: [],
  },
  {
    id: 'coccoc',
    name: 'Cốc Cốc Browser',
    description: 'Trình duyệt Cốc Cốc cho Linux Desktop (Ubuntu có giao diện đồ họa GUI). Tải video nhanh, tích hợp AI.',
    category: 'tools',
    icon: 'Globe',
    website: 'https://coccoc.com',
    platform: 'linux',
    requiresGui: true,
    appType: 'native',
    params: [],
    nativeInstall: {
      command: 'curl -fsSL https://files.coccoc.com/browser/coccoc.deb -o /tmp/coccoc.deb && dpkg -i /tmp/coccoc.deb || apt-get install -f -y',
    },
  },
  {
    id: 'ibus-bamboo',
    name: 'IBus Bamboo',
    description: 'Bộ gõ tiếng Việt số 1 cho các bản phân phối Linux có giao diện đồ họa (Ubuntu Desktop, GNOME, XFCE).',
    category: 'tools',
    icon: 'Keyboard',
    website: 'https://github.com/BambooEngine/ibus-bamboo',
    platform: 'linux',
    requiresGui: true,
    appType: 'native',
    params: [],
    nativeInstall: {
      command: 'add-apt-repository ppa:bamboo-engine/ibus-bamboo -y && apt-get update && apt-get install ibus-bamboo -y',
    },
  },
  // --- Các ứng dụng nâng cao mới bổ sung ---
  {
    id: 'qdrant',
    name: 'Qdrant Vector DB',
    description: 'Cơ sở dữ liệu Vector siêu nhanh viết bằng Rust dành cho AI Search, RAG, Embeddings & Semantic Search.',
    category: 'ai',
    icon: 'BrainCircuit',
    website: 'https://qdrant.tech',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng HTTP REST API', 6333), portParam('grpcPort', 'Cổng gRPC', 6334)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'qdrant/qdrant:latest',
        ports: [`${p.port}:6333`, `${p.grpcPort}:6334`],
        volumes: { storage: '/qdrant/storage' },
      }),
  },
  {
    id: 'rustdesk-server',
    name: 'RustDesk Relay Server',
    description: 'Máy chủ điều khiển máy tính từ xa tự host, thay thế TeamViewer & AnyDesk. Bảo mật mã hóa E2E, không giới hạn băng thông.',
    category: 'tools',
    icon: 'Share2',
    website: 'https://rustdesk.com',
    platform: 'all',
    appType: 'docker',
    params: [portParam('hbbsPort', 'Cổng ID Server (HBBS)', 21115), portParam('hbbrPort', 'Cổng Relay Server (HBBR)', 21117)],
    compose: (p, c) =>
      [
        'services:',
        '  hbbs:',
        '    image: rustdesk/rustdesk-server:latest',
        `    container_name: ${c}-hbbs`,
        '    command: hbbs',
        '    restart: unless-stopped',
        '    ports:',
        `      - "${p.hbbsPort}:21115"`,
        '      - "21116:21116"',
        '      - "21116:21116/udp"',
        '    volumes:',
        '      - data:/root',
        '  hbbr:',
        '    image: rustdesk/rustdesk-server:latest',
        `    container_name: ${c}-hbbr`,
        '    command: hbbr',
        '    restart: unless-stopped',
        '    ports:',
        `      - "${p.hbbrPort}:21117"`,
        '    volumes:',
        '      - data:/root',
        'volumes:',
        '  data:',
      ].join('\n'),
  },
  {
    id: 'searxng',
    name: 'SearXNG Privacy Metasearch',
    description: 'Bộ máy tìm kiếm tổng hợp Internet bảo mật, không lưu cookie, không theo dõi, làm Web Search API cực chuẩn cho AI Agents.',
    category: 'ai',
    icon: 'Globe',
    website: 'https://searx.github.io/searxng',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI & API', 8092)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'searxng/searxng:latest',
        ports: [`${p.port}:8080`],
        volumes: { searxng: '/etc/searxng' },
      }),
  },
  {
    id: 'adguard-home',
    name: 'AdGuard Home',
    description: 'Máy chủ DNS Sinkhole bảo vệ toàn bộ mạng: tự động lọc quảng cáo, chống mã độc & theo dõi, kiểm soát truy cập gia đình & công ty.',
    category: 'network',
    icon: 'Shield',
    website: 'https://adguard.com/adguard-home.html',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI', 3000), portParam('dnsPort', 'Cổng DNS', 53)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'adguard/adguardhome:latest',
        ports: [`${p.port}:3000`, `${p.dnsPort}:53/udp`, `${p.dnsPort}:53`],
        volumes: { work: '/opt/adguardhome/work', conf: '/opt/adguardhome/conf' },
      }),
  },
  {
    id: 'glances',
    name: 'Glances System Monitor',
    description: 'Giám sát chi tiết thông số hệ thống, nhiệt độ CPU, GPU, I/O và Container theo thời gian thực qua giao diện Web hiện đại.',
    category: 'devops',
    icon: 'Activity',
    website: 'https://nicolargo.github.io/glances',
    platform: 'all',
    appType: 'docker',
    params: [portParam('port', 'Cổng Web UI', 61208)],
    webPort: 'port',
    compose: (p, c) =>
      service({
        container: c,
        image: 'nicolargo/glances:latest-full',
        ports: [`${p.port}:61208`],
        env: { GLANCES_OPT: '-w' },
        volumes: { run: '/var/run/docker.sock:ro' },
      }),
  },
  {
    id: 'git-win',
    name: 'Git for Windows & Git Bash',
    description: 'Bộ công cụ quản lý mã nguồn Git CLI chính thức cùng môi trường Git Bash Unix tiện lợi trên hệ thống Windows.',
    category: 'devops',
    icon: 'GitBranch',
    website: 'https://git-scm.com',
    platform: 'windows',
    appType: 'native',
    params: [],
    nativeInstall: {
      command: 'winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements --silent',
    },
  },
  {
    id: 'homebrew-darwin',
    name: 'Homebrew (Darwin / macOS)',
    description: 'Trình quản lý gói phần mềm chuẩn của hệ điều hành macOS (Darwin Kernel), cài đặt mọi công cụ CLI chỉ với 1 lệnh.',
    category: 'tools',
    icon: 'Package',
    website: 'https://brew.sh',
    platform: 'darwin',
    appType: 'native',
    params: [],
    nativeInstall: {
      command: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    },
  },
  {
    id: 'wireguard-bsd',
    name: 'WireGuard (FreeBSD Kernel)',
    description: 'Công cụ mạng riêng ảo VPN WireGuard kernel module native cho FreeBSD / OpenBSD / pfSense.',
    category: 'network',
    icon: 'Shield',
    website: 'https://www.wireguard.com',
    platform: 'bsd',
    appType: 'native',
    params: [],
    nativeInstall: {
      command: 'pkg install -y wireguard wireguard-tools',
    },
  },
];
