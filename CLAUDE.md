# CLAUDE.md - Universal VPS Dashboard (Kế thừa tinh hoa 1Panel & vPanel.vn)

## 📌 Tổng quan dự án (Project Overview)
Dự án là một **Web Control Panel thế hệ mới** dành cho VPS/Server, kết hợp hoàn hảo những điểm mạnh nhất từ **1Panel** (quản lý Docker, App Store 1-click) và **vPanel.vn** (phong cách giao diện Jupiter hiện đại, phân tách Admin/User, quản lý Website/Domain Isolation, File Manager tích hợp Code Editor, WAF & Cloudflare Anti-DDoS, Terminal Sandbox).

**Điểm đột phá vượt trội so với cả 1Panel & vPanel.vn:**
- Cả 1Panel và vPanel.vn **chỉ hỗ trợ Linux**.
- Dự án này **hỗ trợ 100% cả Windows Server lẫn Linux (Ubuntu, Debian, CentOS, Alpine...)** nhờ bộ engine **Auto-Detect OS Adapter**.

Người dùng chỉ cần "thả" agent vào VPS, hệ thống tự động nhận diện và cung cấp Web Dashboard trực quan để điều khiển mọi thứ bằng chuột mà không cần nhớ dòng lệnh.

---

## 🎨 Phong cách thiết kế giao diện (UI/UX Inspirations từ vPanel.vn & 1Panel)

### 1. Tone màu & Visual Elements (Chuẩn vPanel.vn):
- **Bảng màu chủ đạo**:
  - Nền & Card: Dark Slate (`#0B0F19`, `#111827`, `#1E293B`) kết hợp Slate Light (`#F8FAFC`, `#F1F5F9`) cho các khối thông tin.
  - Accent Colors: Electric Blue (`#3B82F6`), Emerald Green (`#10B981` cho trạng thái Active/Online), Amber (`#F59E0B` cảnh báo), Rose Red (`#EF4444` nguy hiểm).
  - Khung giả lập trình duyệt / Terminal: Có 3 nút macOS chấm màu (`#EF4444`, `#F59E0B`, `#3B82F6`) và thanh URL bảo mật `https://panel.local:2083`.
- **Typography**: `Inter` hoặc `Plus Jakarta Sans` cho giao diện chính, `JetBrains Mono` cho IP, Port, Terminal và Code Editor.
- **Components bo góc**: `rounded-2xl` cho các Card lớn, `rounded-xl` cho buttons và inputs, viền `border-slate-700/50` tinh tế.
- **Bộ chuyển đổi nhanh chế độ**: Nút toggle **GUI Mode** (trực quan đồ họa cho người không chuyên) $\leftrightarrow$ **CLI Mode** (cho DevOps/SysAdmin).

### 2. Kiến trúc giao diện kép (Dual Panel - Kế thừa từ vPanel.vn):
1. **Admin Panel (Trang quản trị hạ tầng máy chủ)**:
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

| Tính năng | 1Panel | vPanel.vn | Dự án này (Universal Panel) |
| :--- | :--- | :--- | :--- |
| **Hệ điều hành** | Chỉ Linux | Chỉ Linux | 🤖 **Windows & Linux (Tự Auto-detect)** |
| **Giao diện** | Form truyền thống | Hiện đại kiểu Jupiter SaaS | 🚀 **SaaS Jupiter + Cyberpunk Glassmorphism** |
| **Bố cục** | 1 tầng | 2 tầng (Admin & User) | 💎 **Linh hoạt: Admin Master & Site Dashboard** |
| **Docker & App Store** | Mạnh | Hạn chế | 🔥 **Có sẵn App Store 1-Click + Docker Compose** |
| **Website & Domain** | Nginx/OpenResty | OpenLiteSpeed + Cô lập | 🌐 **Nginx/Caddy/IIS (Tự thích ứng theo OS)** |
| **Tường lửa** | UFW / Firewalld | CSF Firewall | 🛡️ **Tự động: Windows Firewall & UFW/iptables** |
| **File Manager** | Web UI cơ bản | Đầy đủ + Code Editor | 📂 **Kéo thả + Monaco Editor + Nén/Giải nén** |
| **Terminal** | Web SSH | Terminal sandbox | 💻 **PowerShell (Win) & Bash (Linux) ngay trên Web** |

---

## 🏗️ Cấu trúc thư mục dự án (Project Structure)

```
vps-dashboard/
├── agent/                       # Core Daemon chạy trên VPS (Siêu nhẹ)
│   ├── src/
│   │   ├── core/
│   │   │   ├── detector.ts      # Engine tự nhận diện OS (Windows vs Linux distro)
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
│   │   │   └── docker.service.ts  # Quản lý Containers & App Store
│   │   ├── ws/                  # WebSocket truyền thông tin Realtime & Web Terminal
│   │   └── server.ts            # Fastify / Express API Server
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
└── CLAUDE.md
```

---

## 🚀 Kế hoạch triển khai (Next Steps)
1. **Module Auto-Detect OS & Realtime Metrics**: Viết Agent tự kiểm tra môi trường đang chạy (Windows / Linux), lấy dữ liệu CPU/RAM/Disk live.
2. **Khởi tạo UI Dashboard**: Setup React + TailwindCSS theo phong cách vPanel.vn (Jupiter UI + Dark Mode hiện đại, các thẻ card bo tròn viền sáng, biểu đồ tài nguyên thời gian thực).
3. **Tích hợp các module chức năng**:
   - File Manager + Monaco Code Editor.
   - Firewall (Mở port 1 click trên cả Windows và Linux).
   - Website / Domain Manager.
   - App Store 1-Click (Docker).
