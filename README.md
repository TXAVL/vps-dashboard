# 🚀 NexusPanel - Universal VPS Control Dashboard

<p align="center">
  <b>Bảng điều khiển quản trị VPS đa nền tảng thế hệ mới — Tự động nhận diện hệ điều hành (Windows Server & Linux Ubuntu/Debian/CentOS).</b>
  <br />
  <i>Lấy cảm hứng từ sự tiện lợi của 1Panel & vPanel nhưng mang lại giao diện Cyberpunk Dark Glassmorphism cực ngầu và khả năng tương thích 100% mọi loại VPS.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-blue?style=for-the-badge&logo=linux" alt="OS Platform" />
  <img src="https://img.shields.io/badge/Auto--Detect-OS%20Adapter%20Engine-brightgreen?style=for-the-badge" alt="Auto-Detect" />
  <img src="https://img.shields.io/badge/UI-Cyberpunk%20Dark%20Glass-purple?style=for-the-badge" alt="UI" />
  <img src="https://img.shields.io/badge/Zero--Config-1--Click%20Deploy-orange?style=for-the-badge" alt="Deploy" />
</p>

---

## 🌟 Điểm nổi bật (Highlights)

- 🤖 **Auto-Detect OS 100%**: Chỉ cần tải agent về VPS và chạy. Agent tự động phát hiện Windows hay Linux và tự nạp Adapter phù hợp:
  - **Trên Windows**: Tự động dùng PowerShell, WMI/CIM, Windows Services (`sc.exe`), Windows Firewall (`netsh`).
  - **Trên Linux (Ubuntu, Debian, CentOS, Alpine...)**: Tự động dùng `systemctl`, `journalctl`, `ufw/iptables`, Docker native.
- 🎨 **Giao diện Cyberpunk Glassmorphism**: Thiết kế tối giản, hiệu ứng viền neon, kính mờ sang trọng, tối ưu hiển thị mượt mà trên cả máy tính lẫn điện thoại (không dùng form xám cổ lỗ sĩ).
- 🖱️ **Nói không với gõ lệnh (Zero-CLI Management)**:
  - Bật/tắt/khởi động lại VPS hoặc Service chỉ bằng 1 cú click.
  - Xem và kill các tiến trình chiếm RAM/CPU như Task Manager.
  - Mở port tường lửa chỉ cần nhập số port và ấn "Cho phép".
- 📁 **File Manager Web xịn sò**:
  - Kéo thả file để upload, download file nhanh chóng.
  - Nén và giải nén file zip/tar.gz trực tiếp.
  - Chỉnh sửa file `.env`, file cấu hình ngay trên trình duyệt với editor trực quan.
- 🐳 **Docker & 1-Click App Store**:
  - Tự động nhận biết Docker trên máy.
  - Cài đặt các ứng dụng phổ biến (Nginx, WordPress, Redis, MySQL, PostgreSQL, Cloudflare Tunnel...) chỉ với 1 click.
- 💻 **Tích hợp Web Terminal**:
  - Khi cần thao tác chuyên sâu, có sẵn Web Terminal (PowerShell trên Windows, Bash/Zsh trên Linux) không cần mở Putty hay SSH client.

---

## 📊 So sánh với 1Panel & vPanel

| Tính năng | 1Panel truyền thống | vPanel / Cổ điển | NexusPanel (Dự án này) |
| :--- | :--- | :--- | :--- |
| **Hỗ trợ Windows** | ❌ Không hỗ trợ | ❌ Không hỗ trợ | ✅ **Hỗ trợ 100% (Windows Server & Desktop)** |
| **Hỗ trợ Linux** | ✅ Có | ✅ Có | ✅ **Tất cả các bản phân phối Linux** |
| **Nhận diện OS** | Thủ công | Thủ công | 🤖 **Tự động 100% (Auto-detect Adapter)** |
| **Giao diện (UI)** | Element Plus văn phòng | Cũ kỹ, nhiều chữ | 🚀 **Cyberpunk Dark Glassmorphic, Siêu ngầu** |
| **Cài đặt** | Bắt buộc cài Docker | Cài đặt phức tạp | ⚡ **1 File Binary nhẹ < 15MB hoặc Script 1 dòng** |
| **Quản trị Tường lửa**| UFW / Firewalld | iptables | 🛡️ **Tự thích ứng: Windows Firewall & UFW/iptables** |

---

## 🏗️ Cấu trúc thư mục (Project Structure)

```text
vps-dashboard/
├── agent/                       # Daemon chạy ngầm trên VPS (Siêu nhẹ, không tốn RAM)
│   ├── src/
│   │   ├── core/
│   │   │   ├── detector.ts      # Engine tự nhận diện OS, kiến trúc CPU, Init system
│   │   │   └── metrics.ts       # Thu thập chỉ số CPU, RAM, Disk, Net thời gian thực
│   │   ├── adapters/
│   │   │   ├── base.adapter.ts  # Bộ khung Interface OS chuẩn hóa
│   │   │   ├── windows.adapter.ts # Adapter riêng cho Windows (PowerShell/WMI)
│   │   │   └── linux.adapter.ts   # Adapter riêng cho Linux (Systemd/Procfs)
│   │   ├── services/
│   │   │   ├── process.service.ts # Quản lý tiến trình (Kill/Monitor)
│   │   │   ├── file.service.ts    # File Manager API (Upload/Download/Edit/Zip)
│   │   │   ├── firewall.service.ts# Mở/đóng port, chặn IP
│   │   │   └── docker.service.ts  # Điều khiển Docker containers
│   │   ├── ws/                  # WebSocket truyền dữ liệu thời gian thực
│   │   └── server.ts            # REST API Backend
│   └── scripts/
│       ├── install.sh           # Cài đặt 1 dòng cho Linux
│       └── install.ps1          # Cài đặt 1 dòng cho Windows
│
├── dashboard/                   # Web Dashboard UI
│   ├── src/
│   │   ├── components/          # Thẻ Card thông số, Biểu đồ Live, Modals
│   │   ├── views/               # Overview, Files, Processes, Services, Docker, Firewall
│   │   └── App.tsx
│
├── .gitignore
├── CLAUDE.md                    # Bản thiết kế chi tiết
└── README.md                    # Tài liệu hướng dẫn sử dụng
```

---

## ⚡ Cài đặt nhanh (Quick Start)

### 1. Trên VPS Linux (Ubuntu / Debian / CentOS / Alpine)
Mở terminal VPS và chạy 1 dòng lệnh duy nhất:
```bash
curl -fsSL https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.sh | bash
```
> *Hệ thống sẽ tự nhận diện bản Linux, cấu hình Systemd service và in ra đường link Dashboard kèm mật khẩu đăng nhập an toàn.*

### 2. Trên VPS Windows (Windows Server / Windows 10/11)
Mở PowerShell (Run as Administrator) và chạy:
```powershell
irm https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.ps1 | iex
```
> *Hệ thống sẽ tự động đăng ký Windows Service, tự mở cổng Firewall và cung cấp link truy cập Web.*

---

## 🛠️ Chạy ở môi trường phát triển (Development)

### Yêu cầu:
- Node.js >= 18 hoặc Bun / Go

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

## 🛡️ Bảo mật (Security)
- Xác thực bằng Token / JWT mã hóa 256-bit.
- Có cơ chế chống Brute-Force (Tự động khóa IP nếu nhập sai mật khẩu nhiều lần).
- Xác nhận 2 bước đối với các hành động nguy hiểm (Kill Task hệ thống, Reboot VPS, Xóa thư mục gốc).

---

## 📄 License
Phát hành theo giấy phép [MIT](LICENSE). Tự do sử dụng và tùy biến cho mục đích cá nhân hoặc thương mại.
