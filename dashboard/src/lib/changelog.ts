// ZenPanel - Nhật ký thay đổi hiển thị trong hộp thoại "Có gì mới"

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { title: string; items: string[] }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.2',
    date: '2026-10-22',
    highlights: [
      {
        title: 'Khắc phục kết nối Web Quản trị Database (Adminer / phpMyAdmin)',
        items: [
          'Giải quyết triệt để lỗi không truy cập được cổng :8082 khi xem panel qua Cloudflare Tunnel (trycloudflare.com).',
          'Tích hợp hộp thoại kết nối thông minh với nút bấm 1-chạm "Bật Link Public Cloudflare riêng cho Adminer" kèm HTTPS truy cập từ mọi nơi.',
          'Hỗ trợ truy cập trực tiếp bằng IP Public của VPS (kèm nút mở cổng Firewall) và mạng nội bộ Localhost/LAN.',
        ],
      },
      {
        title: 'ZenFile Explorer Pro (Bản nâng cấp File Manager trong App Store)',
        items: [
          'Nâng cấp ứng dụng trong App Store thành "ZenFile Explorer Pro", gắn kết trực tiếp thư mục gốc VPS (bind mount) để quản lý toàn diện.',
          'Không kích hoạt sẵn nhằm tiết kiệm RAM/CPU, cài đặt nhanh bằng 1 click trong App Store qua Docker Compose.',
          'Thêm mẫu cấu hình docker-compose.yml độc lập tại agent/templates/zen-file-explorer/ để người dùng sao chép hoặc tải về thủ công.',
        ],
      },
      {
        title: 'Nâng cấp toàn diện trình File Manager tích hợp',
        items: [
          'Trình xem trước tệp tin đa phương tiện (Media Preview): xem ảnh trực tiếp, phát nhạc audio player, phát video streaming và xem tài liệu PDF.',
          'Tải tệp từ internet trực tiếp về VPS (Remote Download): tải nhanh từ link HTTP/HTTPS vào thư mục hiện tại.',
          'Phân quyền tập tin (Chmod): xem và chỉnh sửa mã quyền Octal (0755, 0644, 0777, 0600) linh hoạt.',
          'Sao chép đường dẫn tuyệt đối với 1 click và thanh lọc tệp thông minh (Tất cả, Thư mục, Hình ảnh, Video & Nhạc, Code, Nén).',
          'Nút chuyển đổi & giới thiệu nhanh ZenFile Pro ngay trên thanh tiêu đề File Manager.',
        ],
      },
      {
        title: 'Nâng cấp Quản lý Máy chủ PHP & Giao diện PHP-FPM chuyên nghiệp',
        items: [
          'Thẻ quản lý Máy chủ PHP trực quan: kiểm tra phiên bản PHP, trạng thái dịch vụ PHP-FPM và đường dẫn socket FastCGI realtime.',
          'Cài đặt 1-chạm PHP & PHP-FPM cùng các module thiết yếu (mysqli, pdo_mysql, curl, mbstring, gd, zip, xml, opcache, bcmath, intl).',
          'Hộp thoại Tùy chỉnh php.ini: dễ dàng chỉnh memory_limit, upload_max_filesize, post_max_size, max_execution_time và tự động nạp lại dịch vụ.',
          'Hộp thoại Danh sách Extensions: tra cứu, lọc tìm kiếm nhanh tất cả module PHP đã nạp.',
          'Hỗ trợ kiểm tra điều kiện thông minh khi tạo website PHP (báo ngay socket FastCGI hoặc hướng dẫn cài đặt nếu chưa có PHP-FPM).',
        ],
      },
      {
        title: 'Hộp thoại Cài đặt kiểu mới: Thanh tiến trình, ETA & Khung log thu gọn',
        items: [
          'Thay thế màn hình log choáng ngợp bằng giao diện Thanh tiến trình thông minh (Progress Bar) với phần trăm và hiệu ứng chuyển động mượt mà.',
          'Dự tính thời gian hoàn thành (ETA) và đếm thời gian thực thi realtime (vd: "Đã chạy 14s · Còn lại dự tính ~16s").',
          'Theo dõi 4 cột mốc trực quan: Khởi tạo, Tải tài nguyên, Cấu hình dịch vụ, Hoàn tất.',
          'Khung log Console thu nhỏ gọn gàng bên dưới, tự động cuộn xuống cuối, nút sao chép log 1-chạm và nút Mở rộng/Thu gọn tiện lợi.',
        ],
      },
      {
        title: 'Cải tiến Hộp thoại "Có gì mới" (Accordion & Tìm kiếm)',
        items: [
          'Chế độ thu gọn thông minh: Chỉ mở bản mới nhất theo mặc định, tất cả các bản cũ được thu gọn thành dạng Accordion ngăn nắp.',
          'Thao tác 1 chạm: Click vào thẻ phiên bản bất kỳ để mở/đóng, kèm nút "Thu gọn / Mở tất cả bản cũ" tiện lợi.',
          'Tìm kiếm tức thì: Thanh tìm kiếm theo từ khóa (Docker, CPU, Adminer, v.v.), tự động mở và làm nổi bật các phiên bản phù hợp.',
        ],
      },
    ],
  },
  {
    version: '0.5.1',
    date: '2026-10-22',
    highlights: [
      {
        title: 'Sửa hiển thị Tác vụ nền (Desktop & Mobile)',
        items: [
          'Sử dụng React Portal đưa popup ra body, khắc phục triệt để lỗi bị lệch/thụt lên trên do backdrop-filter của thanh header.',
          'Hỗ trợ chế độ Bottom Sheet trên điện thoại và căn giữa màn hình chuẩn xác trên Desktop.',
          'Độ cao cuộn tối đa linh hoạt (max-h-[65vh]), tiêu đề hiển thị số lượng tác vụ đang chạy.',
        ],
      },
      {
        title: 'Tối ưu API Tester cho Mobile & Tablet',
        items: [
          'Thêm thanh chuyển đổi tab [Collections] ↔ [Request & Response] khi xem trên màn hình nhỏ.',
          'Nút thu gọn/mở rộng thanh sidebar tiện lợi trên desktop và tự động chuyển sang tab soạn thảo khi mở request.',
          'Khắc phục hiện tượng tràn ngang màn hình, giúp thao tác chọn và test API trơn tru trên mọi thiết bị.',
        ],
      },
      {
        title: 'Cơ chế bảo vệ dung lượng ổ đĩa (Chống Full Disk)',
        items: [
          'Tự động kiểm tra dung lượng ổ đĩa còn trống trước khi cài đặt ứng dụng App Store (yêu cầu tối thiểu 2.5 GB cho app thường, 4.0 GB cho app AI).',
          'Cảnh báo trực tiếp trong hộp thoại cài đặt nếu ổ đĩa còn ít dung lượng và chặn cài đặt khi dung lượng ở mức báo động (< 1.5 GB).',
          'Banner cảnh báo sớm ngay trên trang Tổng quan khi CPU ≥ 70% hoặc Disk ≥ 85% kèm nút chuyển nhanh tới Dọn dẹp.',
        ],
      },
      {
        title: 'Tab Dọn dẹp hệ thống & Hạ tải CPU (Jupiter Glassmorphism)',
        items: [
          'Quản lý và giải phóng CPU: phát hiện top tiến trình ngốn CPU, tính năng khẩn cấp "Hạ tải CPU tức thì" dừng nhanh các tiến trình ăn > 35% CPU.',
          'Dọn rác Docker toàn diện: Containers đã dừng, Docker Images thừa/dangling, Build cache và Volumes không dùng.',
          'Dọn rác OS & Giải phóng RAM Cache: nhật ký hệ thống journalctl, cache gói APT/DNF, file tạm /tmp và $env:TEMP, thả cache RAM (drop_caches).',
          'Chạy tiến trình dọn dẹp bằng background job có log streaming chi tiết realtime.',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-22',
    highlights: [
      {
        title: 'AI Gateway (giống OpenRouter / 9router)',
        items: [
          'Trang AI Gateway riêng: 1 endpoint chuẩn OpenAI /ai/v1 dùng chung cho ChatGPT, Claude, Gemini, OpenRouter, NVIDIA',
          'Kết nối API key xong tự tải danh sách model, chọn model mặc định ngay trong dropdown',
          'Kho model: tìm kiếm, lọc theo nhà cung cấp, context, giá input/output, chỉ model miễn phí',
          'Playground chat stream realtime, định tuyến model mặc định + tối đa 5 model dự phòng khi lỗi 429/5xx',
          'Nhật ký request, thống kê 24h, code mẫu cURL / Python / Node.js / n8n',
          'Endpoint mới /zen/v1 (vẫn giữ /ai/v1): health, models, models/{id}, providers, key, usage, chat/completions, completions, embeddings',
          'API key dùng chung có prefix tzp_',
        ],
      },
      {
        title: 'API Tester (giống Postman)',
        items: [
          'Gửi request từ chính VPS tới mọi URL, không vướng CORS: Params, Authorization (Bearer / Basic / API Key), Headers, Body (JSON, text, form-data, urlencoded)',
          'Nhiều tab, Collections, Lịch sử, môi trường biến {{var}} (có sẵn {{baseUrl}} và {{apiKey}} của AI Gateway), xuất cURL',
          'Response: status, thời gian, dung lượng, Pretty / Raw / Preview HTML & ảnh, Headers. Ctrl+Enter gửi, Ctrl+S lưu',
        ],
      },
      {
        title: 'Terminal',
        items: ['Gợi ý lệnh khi gõ (lịch sử + thư viện lệnh Linux/Windows/Docker/zenpanel): Tab để điền, ↑↓ chọn, Esc ẩn'],
      },
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
