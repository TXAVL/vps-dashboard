// ZenPanel - Nhật ký thay đổi hiển thị trong hộp thoại "Có gì mới"

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { title: string; items: string[] }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.0',
    date: '2026-10-22',
    highlights: [
      {
        title: 'Ứng dụng chạy nền (thay PM2)',
        items: [
          'Chạy bot Discord/Telegram, worker, API Node.js/Python 24/24 ngay trong ZenPanel',
          'Tự khởi động lại khi chết (chờ lâu dần nếu crash liên tục), tự chạy khi VPS khởi động lại',
          'Log realtime: tạm dừng, lọc, chỉ xem lỗi, xoá, tải về; xem CPU/RAM cả cây tiến trình',
          'Giới hạn RAM: vượt ngưỡng tự khởi động lại; nhập 1 chạm các app đang chạy bằng PM2',
        ],
      },
      {
        title: 'Docker & cập nhật',
        items: [
          'Docker → Kho image: image phổ biến theo nhóm, tìm kiếm Docker Hub, chọn tag, pull hoặc tạo container ngay',
          'Chọn tần suất tự kiểm tra cập nhật: 15 mốc từ 15 phút tới 1 tháng',
        ],
      },
      {
        title: 'Cài đặt',
        items: [
          'Domain/IP public: hiện rõ IP public, IPv6 và hostname reverse DNS tự phát hiện — chỉ cần nhập khi có domain riêng',
          'Đơn vị tốc độ mạng đặt tên rõ ràng: "Theo dung lượng" (B/s → TB/s) và "Theo băng thông" (bps → Tbps)',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-22',
    highlights: [
      {
        title: 'Mở app từ bên ngoài',
        items: [
          'Mỗi app trong App Store có "Link public" riêng (Cloudflare Tunnel, có HTTPS) — vào được VS Code, n8n, Grafana... từ mọi nơi',
          'Truy cập trực tiếp IP:cổng kèm nút mở cổng tường lửa 1 chạm',
          'Hướng dẫn sử dụng & tài khoản mặc định hiện ngay sau khi cài',
          'Nút "Cấu hình lại" đổi cổng, mật khẩu, API key mà không mất dữ liệu',
          'Wizard "Thiết lập n8n": link public → Webhook URL → tạo Owner → nối AI',
        ],
      },
      {
        title: 'AI Agent',
        items: [
          'Cài đặt → AI: lưu API key NVIDIA, OpenRouter, ChatGPT, Gemini, Claude và kiểm tra key 1 chạm',
          'AI Gateway (LiteLLM): 1 endpoint chuẩn OpenAI cho mọi model, giống OpenRouter nhưng tự host',
          'App AI mới: Open WebUI, Ollama, Flowise, AnythingLLM — tự dùng chung API key đã lưu',
        ],
      },
      {
        title: 'Database, Docker, mạng',
        items: [
          'Database hiện host public (IP hoặc domain bạn đặt), chuỗi kết nối và nút mở cổng cho máy bên ngoài',
          'Docker → Compose: tạo, sửa, chạy, dừng, pull stack docker-compose.yml',
          'Speedtest thật đo từ VPS tới Cloudflare: ping, jitter, tải xuống, tải lên + lịch sử',
          'Tường lửa iptables tự cài iptables-persistent để quy tắc không mất khi khởi động lại',
        ],
      },
      {
        title: 'Cloudflare WAF làm lại',
        items: [
          'Hướng dẫn tạo API Token từng bước + bảng quyền cần cấp, kiểm tra token thiếu quyền nào',
          'Chọn domain, chia tab: Bảo vệ (mức bảo mật, Under Attack), SSL/TLS, Chặn IP/Quốc gia/ASN, DNS, Cache',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-22',
    highlights: [
      {
        title: 'Cập nhật & giao diện',
        items: [
          'Tự kiểm tra bản mới trên GitHub, tải sẵn, cài / quay lại phiên bản cũ ngay trên panel',
          'Đổi giao diện: 6 màu nhấn × 3 nền, đơn vị mạng KB/s hoặc Mbps',
          'Uptime chạy tới từng giây, đếm ngược hạn VPS, nút khởi động lại / tắt máy',
          'Log realtime khi cài ứng dụng, pull image, cài web server',
          'Lịch tác vụ (cron / Task Scheduler), lịch sử đăng nhập, đăng xuất mọi thiết bị',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-22',
    highlights: [{ title: 'Bản đầu tiên của dashboard', items: ['Tổng quan, tiến trình, dịch vụ, tường lửa, Docker, App Store, terminal, website, file, database, Cloudflare'] }],
  },
];
