# CLAUDE.md - Universal VPS Dashboard (Lấy cảm hứng từ 1Panel & vPanel)

## 📌 Tổng quan dự án (Project Overview)
Dự án là một **Web Control Panel thế hệ mới** dành cho VPS/Server, kế thừa những ưu điểm vượt trội của **1Panel** và **vPanel** (giao diện hiện đại, quản lý Docker, 1-Click App Store, File Manager trực quan, bảo mật cao) nhưng giải quyết được hạn chế lớn nhất của 1Panel: **Hỗ trợ hoàn hảo cả Windows lẫn Linux (Ubuntu, Debian, CentOS, Alpine...) với cơ chế Auto-Detect OS tự động thích ứng 100%**.

Người dùng chỉ cần thả agent vào bất kỳ VPS nào (kể cả VPS Windows hay VPS Linux), mọi tác vụ quản trị từ xem chỉ số, bật tắt service, mở port, dựng website đến quản lý Docker đều thao tác trực quan bằng chuột qua Web UI xịn sò, không cần gõ lệnh.

---

## 🌟 Điểm nổi bật & So sánh với 1Panel / vPanel

| Tính năng | 1Panel truyền thống | Dự án này (Universal Panel) |
| :--- | :--- | :--- |
| **Hệ điều hành** | Chỉ hỗ trợ Linux | **Cả Windows & Linux (Auto-detect OS)** |
| **Giao diện (UI)** | Web Form chuẩn Element Plus | **Cyberpunk / Dark Glassmorphism, UI cực ngầu** |
| **Cách chạy** | Bắt buộc Docker trên Linux | **Chạy native binary nhẹ < 15MB hoặc Docker** |
| **Quản lý Service** | Chỉ Systemd Linux | **Systemd (Linux) & Windows Service / Task Scheduler** |
| **Quản lý Firewall** | ufw / firewalld | **UFW, iptables (Linux) & Windows Advanced Firewall** |
| **Quản lý File** | Web File Manager | **Web File Manager + Monaco Code Editor + Drag-Drop** |
| **Terminal** | Web SSH Linux | **Web Terminal (Bash/Zsh trên Linux, PowerShell/CMD trên Windows)** |
| **Docker & Apps** | Có Docker Compose | **Có visual Docker & App Store 1-click** |

---

## 🎯 Các Module cốt lõi (Core Modules)

### 1. 📊 Dashboard & Giám sát tài nguyên (Host Monitor)
- **Real-time Metrics**: CPU, RAM, Disk I/O, Network In/Out cập nhật theo mili-giây (WebSocket).
- **Process Manager**: Danh sách tiến trình đang chiếm RAM/CPU, nút Kill / Restart tiến trình 1-click.
- **System Information**: Tự động hiển thị tên OS, Kernel version, Uptime, IP công khai, nhiệt độ (nếu hỗ trợ).

### 2. 🎛️ Bộ điều hợp hệ điều hành (OS Adapter Engine)
- **Detection Module**: Kiểm tra `process.platform`, `/etc/os-release`, WMI/PowerShell để xác định chính xác OS và kiến trúc CPU (x86_64, arm64).
- **Windows Adapter**:
  - Service: `Get-Service`, `sc.exe`, `Restart-Service`.
  - Firewall: `netsh advfirewall` / `New-NetFirewallRule`.
  - Process: `Get-Process`, `Stop-Process`.
  - Terminal: PowerShell 7 / Windows PowerShell.
- **Linux Adapter (Ubuntu/Debian/CentOS...)**:
  - Service: `systemctl status/restart/stop`.
  - Firewall: `ufw status/allow` hoặc `iptables`.
  - Process: `ps aux`, `kill -9`.
  - Terminal: `/bin/bash` hoặc `/bin/sh`.

### 3. 📁 Trình quản lý File Web (Visual File Manager)
- Xem cây thư mục ổ đĩa (C:, D: trên Windows hoặc `/` trên Linux).
- Upload kéo thả (Drag & Drop), Download file dung lượng lớn.
- Nén / Giải nén (.zip, .tar.gz) chỉ bằng 1 click.
- Tích hợp Text/Code Editor sửa trực tiếp file config (.env, .conf, .json, .yaml).

### 4. 🐳 Docker & 1-Click App Store
- Kiểm tra tự động xem VPS đã có Docker chưa. Nếu chưa, hỗ trợ 1-click tự cài Docker tương ứng với OS.
- Quản lý Container, Images, Volumes, Compose Stacks.
- Kho ứng dụng 1-click (App Store): Nginx, Redis, MySQL, PostgreSQL, WordPress, Uptime Kuma, Cloudflare Tunnel...

### 5. 🛡️ Firewall & Bảo mật mạng
- Xem danh sách các port đang Mở/Lắng nghe (Listening Ports).
- Nút bấm thêm Rule mở Port (TCP/UDP) hoặc chặn IP độc hại mà không cần nhớ cú pháp lệnh tường lửa.

### 6. 💻 Web Terminal (Dự phòng)
- Tích hợp terminal xterm.js trên trình duyệt, sẵn sàng khi người dùng chuyên nghiệp muốn can thiệp sâu.

---

## 🏗️ Kiến trúc kỹ thuật (Tech Architecture)

```
vps-dashboard/
├── agent/                       # Core Daemon chạy trên VPS
│   ├── src/
│   │   ├── core/
│   │   │   ├── detector.ts      # Detect OS, distro, init system (Systemd/OpenRC/Windows)
│   │   │   └── metrics.ts       # Thu thập CPU, RAM, Disk, Net bằng native calls
│   │   ├── adapters/
│   │   │   ├── base.adapter.ts  # Interface chuẩn hóa mọi thao tác OS
│   │   │   ├── windows.adapter.ts
│   │   │   └── linux.adapter.ts
│   │   ├── services/
│   │   │   ├── process.service.ts
│   │   │   ├── file.service.ts
│   │   │   ├── firewall.service.ts
│   │   │   └── docker.service.ts
│   │   ├── ws/                  # Real-time WebSocket Hub (Terminal & Metrics)
│   │   └── server.ts            # Fastify / Express API Server
│   └── package.json
│
├── dashboard/                   # Frontend Web UI (Chạy độc lập hoặc Serve từ Agent)
│   ├── src/
│   │   ├── components/          # Glassmorphic Cards, Real-time Charts, Modals
│   │   ├── views/
│   │   │   ├── Overview.tsx     # Dashboard tổng quan
│   │   │   ├── FileManager.tsx  # Quản lý file
│   │   │   ├── ProcessList.tsx  # Tiến trình & Task Manager
│   │   │   ├── Services.tsx     # Services Windows / Daemons Linux
│   │   │   ├── DockerApps.tsx   # Docker & App Store
│   │   │   ├── Firewall.tsx     # Mở port & Security
│   │   │   └── Terminal.tsx     # Xterm console
│   │   ├── hooks/
│   │   └── App.tsx
│   └── package.json
│
└── CLAUDE.md                    # Tài liệu kiến trúc chuẩn hóa
```

---

## 🚀 Kế hoạch triển khai (Roadmap)
- [ ] **Giai đoạn 1**: Xây dựng Agent Core + OS Auto-Detection (thử nghiệm nhận diện Windows & Linux, đọc CPU/RAM/Disk).
- [ ] **Giai đoạn 2**: Thiết kế giao diện Dashboard Web siêu đẹp (Dark Glassmorphism, biểu đồ mượt, phong cách hiện đại như 1Panel nhưng ngầu hơn).
- [ ] **Giai đoạn 3**: Hoàn thiện các Adapter tính năng: Services, Process Manager, File Manager, Firewall.
- [ ] **Giai đoạn 4**: Tích hợp Docker Manager & Web Terminal.
- [ ] **Giai đoạn 5**: Đóng gói thành 1-file binary duy nhất / Docker container để deploy lên mọi VPS trong 30 giây.
