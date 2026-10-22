# CLAUDE.md - ZenPanel (Universal VPS Control Dashboard)

> **TÊN CHÍNH THỨC DỰ ÁN: `ZenPanel`**  
> *Slogan: Quản trị VPS an nhàn, trực quan, không cần nhớ lệnh — Tương thích tuyệt đối mọi Hệ điều hành.*

---

## 📌 Tổng quan dự án (Project Overview)
**ZenPanel** là một **Web Control Panel thế hệ mới** dành cho VPS/Server, kết hợp hoàn hảo tinh hoa từ:
- **vPanel.vn**: Phong cách giao diện Jupiter hiện đại, thanh chuyển đổi GUI $\leftrightarrow$ CLI, phân tách Admin/User, quản lý Website/Domain Isolation, File Manager tích hợp Monaco Code Editor, WAF & Cloudflare Anti-DDoS, Terminal Sandbox.
- **1Panel**: Kiến trúc quản lý Docker Containers, Docker Compose và Kho ứng dụng 1-Click App Store.

### 🌟 Điểm đột phá số 1 của ZenPanel:
- Cả 1Panel và vPanel.vn **chỉ hỗ trợ Linux**.
- **ZenPanel hỗ trợ 100% cả Windows Server lẫn Linux (Ubuntu, Debian, CentOS, Alpine...)** nhờ bộ engine **Auto-Detect OS Adapter**.

Người dùng chỉ cần "vứt" agent ZenPanel vào bất kỳ VPS nào, hệ thống tự động nhận diện hệ điều hành và cung cấp Web Dashboard trực quan để điều khiển mọi thứ bằng chuột mà không cần gõ lệnh.

---

## 🎨 Phong cách thiết kế giao diện (Design Language - Chuẩn vPanel.vn & Jupiter UI)

### 1. Tone màu & Visual Elements:
- **Bảng màu chủ đạo**:
  - Nền & Card: Dark Slate (`#0B0F19`, `#111827`, `#1E293B`) kết hợp Slate Light (`#F8FAFC`, `#F1F5F9`) cho các khối thông tin.
  - Accent Colors: Electric Blue (`#3B82F6`), Emerald Green (`#10B981` cho trạng thái Active/Online), Amber (`#F59E0B` cảnh báo), Rose Red (`#EF4444` nguy hiểm).
  - Khung giả lập trình duyệt / Terminal: Có 3 nút macOS chấm màu (`#EF4444`, `#F59E0B`, `#3B82F6`) và thanh URL bảo mật `https://zenpanel.local:2083`.
- **Typography**: `Inter` hoặc `Plus Jakarta Sans` cho giao diện chính, `JetBrains Mono` cho IP, Port, Terminal và Code Editor.
- **Components bo góc**: `rounded-2xl` cho các Card lớn, `rounded-xl` cho buttons và inputs, viền `border-slate-700/50` tinh tế.
- **Bộ chuyển đổi nhanh chế độ**: Nút toggle **Zen GUI Mode** (trực quan đồ họa cho người không chuyên) $\leftrightarrow$ **Zen CLI Mode** (cho DevOps/SysAdmin).

### 2. Kiến trúc giao diện kép (Dual Panel):
1. **Admin Master Panel (Trang quản trị hạ tầng máy chủ)**:
   - Tổng quan phần cứng: CPU, RAM, Disk I/O, Network Traffic (Live WebSocket).
   - Quản lý Service hệ thống (Windows Services hoặc Systemd Daemons).
   - Quản trị Tường lửa (Firewall Rules, Open Ports, Blocked IPs).
   - Quản lý Docker & Kho ứng dụng 1-click.
2. **User / Site Panel (Giao diện Jupiter quản trị Web & Ứng dụng)**:
   - Danh sách Website / Domain với chế độ **Website Isolation** (mỗi site có thư mục, cấu hình và giới hạn tài nguyên riêng).
   - Cột thống kê tài nguyên thời gian thực bên phải (Disk Quota, Bandwidth, Inodes, RAM).
   - Trình quản lý File Manager kéo thả kèm Monaco Code Editor sửa trực tiếp file config.
   - Quản lý Database (MySQL, PostgreSQL, MariaDB, Redis) kèm nút truy cập phpMyAdmin/Adminer 1-click.
   - WAF & Tích hợp Cloudflare Anti-DDoS.
   - Web Terminal sandbox hỗ trợ PowerShell (Windows) và Bash/Zsh (Linux).

---

## 🌟 Bảng so sánh tính năng

| Tính năng | 1Panel | vPanel.vn | ZenPanel |
| :--- | :--- | :--- | :--- |
| **Hệ điều hành** | Chỉ Linux | Chỉ Linux | 🤖 **Windows & Linux (Tự Auto-detect 100%)** |
| **Giao diện** | Form truyền thống | Hiện đại kiểu Jupiter SaaS | 🚀 **SaaS Jupiter + Dark Glassmorphic cực ngầu** |
| **Bố cục** | 1 tầng | 2 tầng (Admin & User) | 💎 **Linh hoạt: Admin Master & Site Dashboard** |
| **Docker & App Store** | Mạnh | Hạn chế | 🔥 **Có sẵn App Store 1-Click + Docker Compose** |
| **Website & Domain** | Nginx/OpenResty | OpenLiteSpeed + Cô lập | 🌐 **Nginx/Caddy/IIS (Tự thích ứng theo OS)** |
| **Tường lửa** | UFW / Firewalld | CSF Firewall | 🛡️ **Tự động: Windows Firewall & UFW/iptables** |
| **File Manager** | Web UI cơ bản | Đầy đủ + Code Editor | 📂 **Kéo thả + Monaco Editor + Nén/Giải nén** |
| **Terminal** | Web SSH | Terminal sandbox | 💻 **PowerShell (Win) & Bash (Linux) ngay trên Web** |

---

## 🏗️ Cấu trúc thư mục dự án (Project Structure)

```
vps-dashboard/ (ZenPanel)
├── agent/                         # Core Daemon chạy trên VPS (Node.js + Fastify)
│   ├── src/
│   │   ├── server.ts              # Fastify API Server + phục vụ dashboard/dist
│   │   ├── config.ts              # Đọc biến môi trường ZENPANEL_*
│   │   ├── core/
│   │   │   ├── detector.ts        # Tự nhận diện OS -> nạp adapter
│   │   │   ├── auth.ts            # Mật khẩu scrypt, token HMAC, vé tải file, khóa đăng nhập
│   │   │   ├── metrics.ts         # Thu thập CPU, RAM, Disk, Net + lịch sử
│   │   │   ├── banner.ts          # In Public URL / Local URL / mật khẩu ra console
│   │   │   ├── exec.ts            # Helper chạy lệnh (chỉ adapter được dùng)
│   │   │   ├── store.ts           # Lưu JSON trong ZENPANEL_DATA_DIR
│   │   │   ├── download.ts        # Tìm/tải binary (cloudflared, caddy)
│   │   │   ├── validate.ts        # Kiểm tra input, HttpError
│   │   │   ├── jobs.ts            # Tác vụ nền có log realtime (exec trong job tự ghi log)
│   │   │   ├── prefs.ts           # Tuỳ chọn panel: đơn vị mạng, giao diện, hạn VPS, tự cập nhật
│   │   │   ├── password.ts        # Quy tắc độ mạnh mật khẩu (dashboard có bản giống hệt)
│   │   │   └── context.ts         # AppContext dùng chung cho routes
│   │   ├── adapters/
│   │   │   ├── base.adapter.ts    # Interface quy chuẩn chung
│   │   │   ├── windows.adapter.ts # PowerShell, CIM, Windows Firewall, IIS
│   │   │   ├── linux.adapter.ts   # procfs, systemd/OpenRC, ufw/firewalld/iptables
│   │   │   └── web/               # Driver web server: nginx, caddy, iis
│   │   ├── services/
│   │   │   ├── file.service.ts    # File Manager (đọc/ghi, zip/tar.gz)
│   │   │   ├── site.service.ts    # Website isolation + SSL
│   │   │   ├── docker.service.ts  # Docker CLI
│   │   │   ├── appstore.catalog.ts / appstore.service.ts # App Store 1-click (compose)
│   │   │   ├── database.service.ts# Database trong container App Store
│   │   │   ├── cloudflare.service.ts # Cloudflare API (Anti-DDoS, DNS)
│   │   │   ├── update.service.ts  # Kiểm tra GitHub, tải/xoá/cài các gói phiên bản
│   │   │   ├── task.service.ts    # Lịch tác vụ (cron / Task Scheduler)
│   │   │   └── tunnel.service.ts  # Cloudflare Quick Tunnel -> *.trycloudflare.com
│   │   ├── routes/                # auth, system, files, docker, sites, panel (REST API)
│   │   ├── ws/realtime.ts         # WebSocket metrics + Web Terminal (node-pty)
│   │   └── cli/reset-password.ts  # npm run reset-password
│   └── scripts/
│       ├── install.sh             # Cài 1 dòng cho Linux (systemd/OpenRC), hỗ trợ ZENPANEL_ARCHIVE
│       ├── install.ps1            # Cài 1 dòng cho Windows (Scheduled Task SYSTEM), hỗ trợ ZENPANEL_ARCHIVE
│       └── zenpanel.sh / .cmd     # Lệnh tắt: zenpanel status|restart|logs|url|reset-password|update
│
├── dashboard/                     # Web UI (React + Vite + Tailwind v4 + Lucide)
│   └── src/
│       ├── App.tsx, main.tsx
│       ├── lib/                   # api.ts, types.ts, hooks.ts, format.ts, panel.tsx (WS metrics)
│       ├── components/
│       │   ├── ui.tsx, charts.tsx, feedback.tsx (toast/confirm/prompt), TerminalPanel.tsx
│       │   ├── jobs.tsx           # Cửa sổ log tác vụ nền + nút tác vụ trên header
│       │   ├── TooltipLayer.tsx   # Tooltip tuỳ chỉnh cho mọi phần tử có data-tip
│       │   └── layout/            # Shell, nav, WindowMockup
│       └── views/                 # Login, Overview, Processes, Services, Firewall, Docker,
│                                  # AppStore, Terminal, Websites, FileManager, Databases,
│                                  # Security, Settings, Tasks
├── CLAUDE.md
└── README.md
```

---

## 🤖 Chỉ dẫn quan trọng cho AI phát triển tiếp theo (Instructions for AI)
1. **Dự án tên là `ZenPanel`**. Luôn sử dụng thương hiệu này trên toàn bộ UI, API, comment và tài liệu.
2. **Quy tắc OS Agnostic**: Mọi thao tác hệ thống (đọc RAM, CPU, danh sách tiến trình, mở port tường lửa, chạy service) **bắt buộc** phải thông qua `base.adapter.ts`, phân nhánh thực thi sang `windows.adapter.ts` hoặc `linux.adapter.ts`. Không bao giờ gọi trực tiếp lệnh OS độc lập trong controller hay view.
3. **Truy cập công khai qua Cloudflare Tunnel**: Mỗi lần agent khởi động, `tunnel.service.ts` chạy `cloudflared tunnel --url http://127.0.0.1:<port>` để lấy domain `https://<random>.trycloudflare.com` (không cần tài khoản Cloudflare, không cần mở port). URL **phải được in nổi bật ra console** qua `banner.ts`; nếu tunnel rớt và được cấp domain mới thì in lại. Tìm `cloudflared` theo thứ tự: `ZENPANEL_CLOUDFLARED` → PATH → `~/.zenpanel/bin` → tự tải từ GitHub Releases (tên file theo OS do adapter quyết định). Tắt bằng `ZENPANEL_TUNNEL=0`.
4. **Không dùng hộp thoại / tooltip của trình duyệt**: dùng `useFeedback()` (toast, confirm, prompt), `<Modal>` và thuộc tính `data-tip` thay cho `alert/confirm/prompt/title`. Thao tác lâu (cài app, pull image, cài web server, tải phiên bản) phải chạy bằng `startJob()` để dashboard xem log realtime.
5. **Phong cách giao diện**: Giữ vững ngôn ngữ thiết kế **Jupiter Style** kết hợp **Dark Glassmorphism** (tone nền Dark Slate, bo góc `rounded-2xl`, hiển thị tài nguyên thời gian thực dạng thanh progress bar, hỗ trợ cả Desktop lẫn Mobile).
