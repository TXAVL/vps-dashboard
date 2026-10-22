# 🚀 NexusPanel - Universal VPS Control Dashboard

<p align="center">
  <b>Bảng điều khiển quản trị VPS thế hệ mới — Tự động nhận diện hệ điều hành (Windows Server & Linux Ubuntu/Debian/CentOS).</b>
  <br />
  <i>Kết hợp tinh hoa thiết kế <b>vPanel.vn</b> (Giao diện Jupiter hiện đại, Website Isolation, File Manager + Code Editor, WAF) và <b>1Panel</b> (Docker Containers, 1-Click App Store).</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-blue?style=for-the-badge&logo=linux" alt="OS Platform" />
  <img src="https://img.shields.io/badge/Auto--Detect-OS%20Adapter%20Engine-brightgreen?style=for-the-badge" alt="Auto-Detect" />
  <img src="https://img.shields.io/badge/UI-vPanel.vn%20Jupiter%20Style-indigo?style=for-the-badge" alt="UI" />
  <img src="https://img.shields.io/badge/Zero--Config-1--Click%20Deploy-orange?style=for-the-badge" alt="Deploy" />
</p>

---

## 🎨 Phong cách thiết kế giao diện (Lấy cảm hứng từ vPanel.vn)

NexusPanel áp dụng ngôn ngữ thiết kế chuẩn từ **vPanel.vn**:
- **Bố cục Jupiter UI**: Phân tách rõ ràng giữa cấu hình hệ thống máy chủ và khu vực vận hành website/ứng dụng.
- **Thanh chuyển đổi GUI $\leftrightarrow$ CLI**: Cho phép người dùng chuyển đổi linh hoạt giữa giao diện đồ họa 1-click hoặc cửa sổ lệnh chuyên sâu.
- **Thẻ Card & Cửa sổ macOS mockup**: Sử dụng bo góc `rounded-2xl`, viền sáng `border-slate-700/50`, dải nút chấm màu điều khiển (`#EF4444`, `#F59E0B`, `#3B82F6`) và thanh trạng thái an toàn `https://...:2083`.
- **Cột giám sát tài nguyên bên phải**: Thanh tiến trình hiển thị trực quan Disk Quota, Bandwidth, CPU, RAM cập nhật theo mili-giây.

---

## 🌟 Điểm nổi bật (Highlights)

- 🤖 **Auto-Detect OS 100%**: Chỉ cần ném agent lên VPS và chạy. Agent tự động phát hiện Windows hay Linux và tự nạp Adapter phù hợp:
  - **Trên Windows**: Tự động dùng PowerShell, WMI/CIM, Windows Services (`sc.exe`), Windows Firewall (`netsh`).
  - **Trên Linux (Ubuntu, Debian, CentOS, Alpine...)**: Tự động dùng `systemctl`, `journalctl`, `ufw/iptables`, Docker native.
- 🌐 **Quản lý Domain & Website Isolation (như vPanel.vn)**:
  - Mỗi website là một không gian độc lập với document root, SSL và phiên bản runtime riêng.
  - Hỗ trợ gắn domain, tự cấp chứng chỉ SSL miễn phí (Let's Encrypt / ZeroSSL), Force HTTPS 1-click.
- 📁 **File Manager Web xịn sò + Monaco Code Editor**:
  - Kéo thả file để upload, download file dung lượng lớn.
  - Nén và giải nén file `.zip`, `.tar.gz` trực tiếp trên web.
  - Trình soạn thảo code tích hợp: Highlight cú pháp, tìm kiếm, sửa file `.env`, `nginx.conf`, file cấu hình ngay trên trình duyệt mà không cần tải về.
- 🐳 **Docker & 1-Click App Store (như 1Panel)**:
  - Tự động nhận diện Docker trên VPS.
  - Kho ứng dụng 1-click: Nginx, WordPress, Redis, MySQL, PostgreSQL, Cloudflare Tunnel, phpMyAdmin...
- 🛡️ **Tường lửa & Bảo mật chủ động**:
  - Xem danh sách cổng mạng đang mở.
  - Mở port hoặc chặn IP độc hại chỉ với 1 cú click (tự gọi Windows Firewall hoặc UFW/iptables tùy theo OS).
- 💻 **Tích hợp Web Terminal Sandbox**:
  - Khi cần thao tác chuyên sâu, có sẵn Web Terminal (PowerShell trên Windows, Bash/Zsh trên Linux) không cần mở Putty hay SSH client.

---

## 📊 Bảng so sánh tính năng

| Tính năng | 1Panel | vPanel.vn | NexusPanel (Dự án này) |
| :--- | :--- | :--- | :--- |
| **Hệ điều hành** | Chỉ Linux | Chỉ Linux | 🤖 **Windows & Linux (Tự Auto-detect)** |
| **Giao diện (UI)** | Element Plus văn phòng | Giao diện Jupiter hiện đại | 🚀 **Jupiter Style + Dark Glassmorphic hiện đại** |
| **Bố cục** | 1 tầng | 2 tầng (Admin & User) | 💎 **Linh hoạt: Admin Master & Site Dashboard** |
| **Docker & App Store** | Mạnh | Hạn chế | 🔥 **Có sẵn App Store 1-Click + Docker Compose** |
| **Website & Domain** | Nginx/OpenResty | OpenLiteSpeed + Cô lập | 🌐 **Tự động cấu hình Web Server theo OS** |
| **Tường lửa** | UFW / Firewalld | CSF Firewall | 🛡️ **Tự động: Windows Firewall & UFW/iptables** |
| **File Manager** | Web UI cơ bản | Đầy đủ + Code Editor | 📂 **Kéo thả + Monaco Editor + Nén/Giải nén** |
| **Terminal** | Web SSH | Terminal sandbox | 💻 **PowerShell (Win) & Bash (Linux) ngay trên Web** |

---

## ⚡ Cài đặt nhanh (Quick Start)

### 1. Trên VPS Linux (Ubuntu / Debian / CentOS / Alpine)
Mở terminal VPS và chạy 1 dòng lệnh duy nhất (tương tự `vpanel.vn`):
```bash
curl -fsSL https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.sh | bash
```

### 2. Trên VPS Windows (Windows Server / Windows 10/11)
Mở PowerShell (Run as Administrator) và chạy:
```powershell
irm https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.ps1 | iex
```

---

## 🛠️ Chạy ở môi trường phát triển (Development)

### Khởi chạy Agent (Backend):
```bash
cd agent
npm install
npm run dev
```

### Khởi chạy Dashboard (Frontend Web):
```bash
cd dashboard
npm install
npm run dev
```
Truy cập giao diện tại: `http://localhost:5173`

---

## 📄 License
Phát hành theo giấy phép [MIT](LICENSE). Tự do sử dụng và tùy biến cho mục đích cá nhân hoặc thương mại.
