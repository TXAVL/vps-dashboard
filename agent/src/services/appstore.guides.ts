// ZenPanel - Hướng dẫn sử dụng sau khi cài cho từng ứng dụng trong App Store
// Bước đầu tiên luôn là mở app: dùng "Link public" (Cloudflare Tunnel riêng của app) hoặc IP:cổng.

export interface AppGuide {
  /** Tài khoản / mật khẩu mặc định cần biết */
  credentials?: string;
  steps: string[];
}

const OPEN = 'Bấm "Truy cập" trên thẻ ứng dụng → "Bật link public" để có địa chỉ https://...trycloudflare.com mở được từ mọi nơi (hoặc mở cổng tường lửa để vào bằng IP:cổng).';

export const APP_GUIDES: Record<string, AppGuide> = {
  'code-server': {
    credentials: 'Mật khẩu đăng nhập: tham số "Mật khẩu" lúc cài (xem lại trong "Cấu hình lại").',
    steps: [OPEN, 'Nhập mật khẩu để vào VS Code trên trình duyệt.', 'Thư mục làm việc mặc định là /home/coder (lưu trong volume, không mất khi cập nhật).', 'Cài extension như VS Code bình thường ở thanh bên trái.'],
  },
  n8n: {
    steps: [
      OPEN,
      'Bấm "Thiết lập n8n" để ZenPanel tự điền Webhook URL = link public (bắt buộc để webhook, form, OAuth hoạt động từ bên ngoài).',
      'Mở n8n, tạo tài khoản Owner ở lần đầu truy cập.',
      'Dùng AI: thêm credential "OpenAI" với Base URL của AI Gateway (http://host.docker.internal:4000/v1) và master key của gateway, hoặc nhập trực tiếp key ChatGPT / Claude / Gemini.',
      'Lưu ý: link trycloudflare đổi khi agent khởi động lại → chạy lại "Thiết lập n8n" hoặc dùng domain riêng qua app Cloudflare Tunnel.',
    ],
  },
  wordpress: {
    steps: [OPEN, 'Chọn ngôn ngữ, đặt tên site và tạo tài khoản quản trị WordPress.', 'Database đã được ZenPanel tạo sẵn (MariaDB riêng), không cần nhập.'],
  },
  grafana: { credentials: 'admin / admin (Grafana bắt đổi mật khẩu ở lần đăng nhập đầu).', steps: [OPEN, 'Thêm Data source (Prometheus, MySQL, PostgreSQL...) rồi tạo dashboard.'] },
  portainer: { steps: [OPEN, 'Tạo tài khoản admin trong 5 phút đầu sau khi cài (quá hạn thì bấm Khởi động lại app).', 'Chọn môi trường "Docker" local để quản lý container.'] },
  'uptime-kuma': { steps: [OPEN, 'Tạo tài khoản admin ở lần đầu.', 'Thêm monitor cho website / cổng / ping và cấu hình thông báo Telegram, Discord...'] },
  gitea: { steps: [OPEN, 'Trang cài đặt lần đầu: giữ SQLite3, sửa "Base URL" thành link public, tạo tài khoản admin ở cuối trang.'] },
  minio: { credentials: 'minioadmin / mật khẩu đặt lúc cài.', steps: [OPEN, 'Console nằm ở cổng Console; API S3 ở cổng API.', 'Tạo bucket và Access Key để ứng dụng khác kết nối.'] },
  filebrowser: { credentials: 'admin / mật khẩu ngẫu nhiên in trong log container (Docker → Log).', steps: [OPEN, 'Đổi mật khẩu trong Settings → Profile.'] },
  vaultwarden: { steps: [OPEN, 'Vaultwarden bắt buộc HTTPS: hãy dùng link public (trycloudflare có sẵn HTTPS).', 'Tạo tài khoản, sau đó dùng app Bitwarden với "Server URL" là link public.'] },
  nextcloud: { steps: [OPEN, 'Tạo tài khoản admin, chọn SQLite (đơn giản) hoặc nhập MySQL/PostgreSQL từ mục Databases.', 'Thêm domain/link public vào "trusted_domains" nếu Nextcloud báo truy cập không tin cậy.'] },
  ghost: { steps: ['Đặt tham số "URL website" đúng link public rồi bấm "Cấu hình lại".', 'Vào <link>/ghost để tạo tài khoản quản trị.'] },
  jellyfin: { steps: [OPEN, 'Làm theo trình hướng dẫn: tạo tài khoản, thêm thư viện từ thư mục /media.'] },
  dozzle: { steps: [OPEN, 'Xem log realtime của mọi container trên máy chủ.'] },
  qbittorrent: { credentials: 'admin / mật khẩu tạm in trong log container (Docker → Log).', steps: [OPEN, 'Đổi mật khẩu trong Tools → Options → Web UI.'] },
  syncthing: { steps: [OPEN, 'Đặt mật khẩu GUI trong Actions → Settings → GUI.', 'Thêm thiết bị bằng Device ID rồi chia sẻ thư mục.'] },
  memos: { steps: [OPEN, 'Tài khoản đầu tiên tạo ra là admin.'] },
  'it-tools': { steps: [OPEN] },
  adminer: { steps: [OPEN, 'Server: host.docker.internal:<cổng database>, user root/postgres và mật khẩu xem ở mục Databases.'] },
  phpmyadmin: { steps: [OPEN, 'Server: host.docker.internal:<cổng MySQL/MariaDB>, user root và mật khẩu xem ở mục Databases.'] },
  'mongo-express': { steps: ['Sửa "MongoDB URL" đúng mật khẩu root của MongoDB (mục Databases) rồi "Cấu hình lại".', OPEN] },
  mysql: { steps: ['Quản lý database, user, chuỗi kết nối trong mục Databases.', 'Máy khác muốn kết nối: dùng Host bên ngoài + cổng, và mở cổng trong mục Databases.'] },
  mariadb: { steps: ['Quản lý database, user, chuỗi kết nối trong mục Databases.'] },
  postgres: { steps: ['Quản lý database, user, chuỗi kết nối trong mục Databases.'] },
  redis: { steps: ['Kết nối: redis://default:<mật khẩu>@<host>:<cổng>. Xem trong mục Databases.'] },
  mongodb: { steps: ['Kết nối: mongodb://root:<mật khẩu>@<host>:<cổng>/. Xem trong mục Databases.'] },
  litellm: {
    credentials: 'API key: "sk-" + master key đặt lúc cài (xem trong "Cấu hình lại").',
    steps: [
      'Lưu API key của ChatGPT / Claude / Gemini / OpenRouter / NVIDIA trong Cài đặt → AI, rồi bấm "Cấu hình lại" gateway.',
      'Endpoint chuẩn OpenAI: http://<host>:<cổng>/v1 (trong Docker: http://host.docker.internal:<cổng>/v1).',
      'Tên model: openai/gpt-4o, anthropic/claude-sonnet-5-5, gemini/gemini-2.5-flash, openrouter/<model>, nvidia_nim/<model>.',
      'Dùng cho n8n, Flowise, AnythingLLM, Open WebUI... bằng cách chọn nhà cung cấp "OpenAI" và đổi Base URL.',
      'Trang quản trị: http://<host>:<cổng>/ui (đăng nhập bằng master key).',
    ],
  },
  'open-webui': {
    steps: [OPEN, 'Tài khoản đầu tiên đăng ký là admin.', 'Các API key AI đã lưu trong ZenPanel được nối sẵn; đổi key thì bấm "Cấu hình lại".', 'Chọn model ở góc trên và bắt đầu chat.'],
  },
  ollama: { steps: ['Tải model: Docker → mở Terminal và chạy: docker exec -it zen-ollama ollama pull llama3.2', 'API: http://<host>:11434 (Open WebUI, n8n, Flowise kết nối được).'] },
  flowise: { steps: [OPEN, 'Tạo tài khoản ở lần đầu.', 'Thêm Credential cho ChatGPT / Claude / Gemini (hoặc ChatOpenAI với Base URL của AI Gateway), rồi kéo thả Agent / Chatflow.'] },
  anythingllm: { steps: [OPEN, 'Trình hướng dẫn đầu tiên: chọn LLM Provider (OpenAI, Anthropic, Gemini, OpenRouter, NVIDIA NIM hoặc "Generic OpenAI" = AI Gateway).', 'Tạo Workspace, tải tài liệu lên để chat với tài liệu.'] },
  nginx: { steps: [OPEN, 'Đặt file website vào volume html (Docker → Volumes) hoặc dùng mục Websites để chạy site trực tiếp trên máy chủ.'] },
  cloudflared: { steps: ['Tạo Tunnel trong Cloudflare Zero Trust → Networks → Tunnels, copy Token khi chọn "Docker".', 'Thêm Public Hostname trỏ tới http://localhost:<cổng app> để có domain riêng cố định.'] },
};
