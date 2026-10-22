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
├── agent/                       # Core Daemon chạy trên VPS (Siêu nhẹ < 15MB)
│   ├── src/
│   │   ├── core/
│   │   │   ├── detector.ts      # Engine tự nhận diện OS (Windows vs Linux distro)
│   │   │   ├── banner.ts        # In Public URL / Local URL ra console khi khởi động
│   │   │   └── metrics.ts       # Thu thập chỉ số CPU, RAM, Disk, Net realtime
│   │   ├── adapters/
│   │   │   ├── base.adapter.ts  # Interface quy chuẩn chung
│   │   │   ├── windows.adapter.ts # PowerShell, WMI/CIM, sc.exe, netsh
│   │   │   └── linux.adapter.ts   # Systemctl, procfs, ufw, iptables
│   │   ├── services/
│   │   │   ├── process.service.ts # Quản lý tiến trình & Task Manager
│   │   │   ├── file.service.ts    # File Manager API (Upload, Download, Edit)
│   │   │   ├── site.service.ts    # Quản lý Domain & Website isolation
│   │   │   ├── firewall.service.ts# Quản lý port & firewall rules
│   │   │   ├── docker.service.ts  # Quản lý Containers & App Store
│   │   │   └── tunnel.service.ts  # Cloudflare Quick Tunnel -> domain *.trycloudflare.com
│   │   ├── ws/                  # WebSocket truyền thông tin Realtime & Web Terminal
│   │   ├── config.ts            # Đọc biến môi trường ZENPANEL_*
│   │   └── server.ts            # Fastify API Server
│   └── scripts/
│       ├── install.sh           # Script 1 dòng cho Linux (như vpanel.vn)
│       └── install.ps1          # Script 1 dòng cho Windows
│
├── dashboard/                   # Web Dashboard UI (React + Tailwind + Lucide)
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/          # Header, Sidebar kiểu Jupiter, WindowMockup
│   │   │   ├── cards/           # StatCard, ResourceProgress, ServiceCard
│   │   │   └── modals/          # Modal xác nhận, Add Domain, Open Port
│   │   ├── views/
│   │   │   ├── Overview.tsx     # Dashboard tổng quan chỉ số máy chủ
│   │   │   ├── Websites.tsx     # Quản lý Domain & Website isolation
│   │   │   ├── FileManager.tsx  # Trình quản lý file + Code Editor
│   │   │   ├── Databases.tsx    # MySQL / MariaDB / Redis GUI
│   │   │   ├── AppStore.tsx     # Kho ứng dụng 1-click
│   │   │   ├── Firewall.tsx     # Quản lý Tường lửa & Port
│   │   │   └── Terminal.tsx     # Web Terminal mô phỏng xterm.js
│   │   ├── hooks/
│   │   └── App.tsx
│   └── package.json
│
├── .gitignore
├── CLAUDE.md                    # Bản thiết kế chi tiết (Dành cho AI & Developer)
└── README.md                    # Tài liệu hướng dẫn sử dụng chính thức
```

---

## 🤖 Chỉ dẫn quan trọng cho AI phát triển tiếp theo (Instructions for AI)
1. **Dự án tên là `ZenPanel`**. Luôn sử dụng thương hiệu này trên toàn bộ UI, API, comment và tài liệu.
2. **Quy tắc OS Agnostic**: Mọi thao tác hệ thống (đọc RAM, CPU, danh sách tiến trình, mở port tường lửa, chạy service) **bắt buộc** phải thông qua `base.adapter.ts`, phân nhánh thực thi sang `windows.adapter.ts` hoặc `linux.adapter.ts`. Không bao giờ gọi trực tiếp lệnh OS độc lập trong controller hay view.
3. **Truy cập công khai qua Cloudflare Tunnel**: Mỗi lần agent khởi động, `tunnel.service.ts` chạy `cloudflared tunnel --url http://127.0.0.1:<port>` để lấy domain `https://<random>.trycloudflare.com` (không cần tài khoản Cloudflare, không cần mở port). URL **phải được in nổi bật ra console** qua `banner.ts`; nếu tunnel rớt và được cấp domain mới thì in lại. Tìm `cloudflared` theo thứ tự: `ZENPANEL_CLOUDFLARED` → PATH → `~/.zenpanel/bin` → tự tải từ GitHub Releases (tên file theo OS do adapter quyết định). Tắt bằng `ZENPANEL_TUNNEL=0`.
4. **Phong cách giao diện**: Giữ vững ngôn ngữ thiết kế **Jupiter Style** kết hợp **Dark Glassmorphism** (tone nền Dark Slate, bo góc `rounded-2xl`, hiển thị tài nguyên thời gian thực dạng thanh progress bar, hỗ trợ cả Desktop lẫn Mobile).
