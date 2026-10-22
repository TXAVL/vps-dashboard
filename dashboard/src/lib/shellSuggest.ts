// ZenPanel - Thư viện lệnh & gợi ý thông minh cho Web Terminal
// Hỗ trợ Linux (Bash/Zsh) và Windows (PowerShell) kèm mô tả chi tiết tiếng Việt

const HISTORY_KEY = 'zenpanel.shellHistory';
const MAX_HISTORY = 300;

export interface ShellCommandItem {
  cmd: string;
  desc: string;
  category: 'shell' | 'system' | 'docker' | 'web' | 'net' | 'files';
  windows?: boolean;
}

export const SHELL_CATALOG: ShellCommandItem[] = [
  // --- SHELL & CẤU HÌNH MÔI TRƯỜNG ---
  { cmd: 'source ~/.bashrc', desc: 'Tải lại cấu hình môi trường Bash ngay lập tức (không cần đăng xuất)', category: 'shell' },
  { cmd: 'source ~/.profile', desc: 'Tải lại cấu hình biến môi trường profile người dùng', category: 'shell' },
  { cmd: 'source ~/.zshrc', desc: 'Tải lại cấu hình Zsh shell', category: 'shell' },
  { cmd: 'source /etc/environment', desc: 'Tải lại biến môi trường toàn cục của hệ thống', category: 'shell' },
  { cmd: 'echo $PATH', desc: 'Kiểm tra đường dẫn biến môi trường $PATH hiện tại', category: 'shell' },
  { cmd: 'export PATH=$PATH:/usr/local/bin', desc: 'Thêm đường dẫn mới vào biến môi trường PATH tạm thời', category: 'shell' },
  { cmd: 'alias', desc: 'Xem danh sách các bí danh (alias) lệnh đã được cấu hình', category: 'shell' },
  { cmd: 'cat ~/.bashrc', desc: 'Xem nội dung tệp cấu hình .bashrc', category: 'shell' },
  { cmd: 'nano ~/.bashrc', desc: 'Mở soạn thảo cấu hình .bashrc bằng nano', category: 'shell' },
  { cmd: 'history | tail -25', desc: 'Xem 25 lệnh vừa thực thi gần nhất', category: 'shell' },
  { cmd: 'clear', desc: 'Xóa sạch màn hình dòng lệnh console', category: 'shell' },
  { cmd: 'which bash', desc: 'Tìm đường dẫn thực thi của trình shell Bash', category: 'shell' },

  // --- DỊCH VỤ & HỆ THỐNG (LINUX) ---
  { cmd: 'zenpanel status', desc: 'Kiểm tra trạng thái hoạt động của ZenPanel Agent', category: 'system' },
  { cmd: 'zenpanel restart', desc: 'Khởi động lại toàn bộ dịch vụ ZenPanel', category: 'system' },
  { cmd: 'zenpanel logs', desc: 'Xem nhật ký hoạt động gần nhất của ZenPanel', category: 'system' },
  { cmd: 'zenpanel update', desc: 'Kiểm tra và cập nhật ZenPanel lên phiên bản mới nhất', category: 'system' },
  { cmd: 'journalctl -u zenpanel -f', desc: 'Theo dõi nhật ký trực tiếp (stream log) của ZenPanel', category: 'system' },
  { cmd: 'systemctl status', desc: 'Xem tổng quan trạng thái hệ thống dịch vụ systemd', category: 'system' },
  { cmd: 'systemctl list-units --type=service --state=running', desc: 'Danh sách các dịch vụ đang chạy trên máy chủ', category: 'system' },
  { cmd: 'systemctl restart nginx', desc: 'Khởi động lại máy chủ web Nginx', category: 'system' },
  { cmd: 'systemctl restart mysql', desc: 'Khởi động lại máy chủ cơ sở dữ liệu MySQL / MariaDB', category: 'system' },
  { cmd: 'df -h', desc: 'Kiểm tra dung lượng và % sử dụng các phân vùng ổ đĩa', category: 'system' },
  { cmd: 'free -h', desc: 'Xem dung lượng bộ nhớ RAM và Swap (trống / đang dùng)', category: 'system' },
  { cmd: 'htop', desc: 'Trình quản lý tiến trình và tài nguyên trực quan', category: 'system' },
  { cmd: 'top', desc: 'Xem danh sách các tiến trình chiếm CPU/RAM theo thời gian thực', category: 'system' },
  { cmd: 'uptime', desc: 'Thời gian hoạt động liên tục của máy chủ và mức tải CPU (load average)', category: 'system' },
  { cmd: 'uname -a', desc: 'Xem thông tin nhân hệ điều hành Linux kernel và kiến trúc CPU', category: 'system' },
  { cmd: 'cat /etc/os-release', desc: 'Xem thông tin phân phối Linux (Ubuntu, Debian, CentOS...)', category: 'system' },
  { cmd: 'sync && echo 3 > /proc/sys/vm/drop_caches', desc: 'Giải phóng bộ nhớ đệm PageCache/dentries/inodes để xả RAM', category: 'system' },
  { cmd: 'reboot', desc: 'Khởi động lại máy chủ VPS ngay lập tức', category: 'system' },

  // --- DOCKER & CONTAINER ---
  { cmd: 'docker ps', desc: 'Liệt kê các Docker container đang chạy', category: 'docker' },
  { cmd: 'docker ps -a', desc: 'Liệt kê toàn bộ Docker container (kể cả đã tắt/exit)', category: 'docker' },
  { cmd: 'docker images', desc: 'Xem danh sách các Docker image đã tải về máy', category: 'docker' },
  { cmd: 'docker compose up -d', desc: 'Khởi chạy các container theo file compose ở chế độ nền', category: 'docker' },
  { cmd: 'docker compose down', desc: 'Dừng và gỡ bỏ toàn bộ container trong stack compose', category: 'docker' },
  { cmd: 'docker compose logs -f --tail=100', desc: 'Xem 100 dòng log mới nhất và theo dõi trực tiếp compose', category: 'docker' },
  { cmd: 'docker compose restart', desc: 'Khởi động lại các dịch vụ trong compose', category: 'docker' },
  { cmd: 'docker system prune -af', desc: 'Dọn sạch container đã tắt, network thừa và image không dùng', category: 'docker' },
  { cmd: 'docker stats --no-stream', desc: 'Kiểm tra mức tiêu thụ CPU/RAM của từng container', category: 'docker' },

  // --- WEB SERVER & SSL ---
  { cmd: 'nginx -t', desc: 'Kiểm tra tính hợp lệ của toàn bộ cú pháp cấu hình Nginx', category: 'web' },
  { cmd: 'systemctl reload nginx', desc: 'Tải lại cấu hình Nginx mượt mà không làm rớt kết nối', category: 'web' },
  { cmd: 'certbot renew --dry-run', desc: 'Chạy thử nghiệm gia hạn chứng chỉ SSL Let\'s Encrypt', category: 'web' },
  { cmd: 'certbot certificates', desc: 'Xem danh sách và hạn dùng của tất cả chứng chỉ SSL', category: 'web' },
  { cmd: 'curl -I https://google.com', desc: 'Kiểm tra mã trạng thái HTTP Header phản hồi của trang web', category: 'web' },

  // --- MẠNG & BẢO MẬT ---
  { cmd: 'ss -tulnp', desc: 'Xem tất cả các cổng mạng đang lắng nghe (Listen) và tiến trình sở hữu', category: 'net' },
  { cmd: 'ufw status verbose', desc: 'Xem trạng thái chi tiết của tường lửa UFW và các rule', category: 'net' },
  { cmd: 'ufw allow 80/tcp', desc: 'Mở cổng 80 (HTTP) trên tường lửa', category: 'net' },
  { cmd: 'ufw allow 443/tcp', desc: 'Mở cổng 443 (HTTPS) trên tường lửa', category: 'net' },
  { cmd: 'ip a', desc: 'Xem toàn bộ danh sách card mạng và địa chỉ IP của VPS', category: 'net' },
  { cmd: 'ping -c 4 8.8.8.8', desc: 'Kiểm tra độ trễ mạng và mất gói tin tới DNS Google', category: 'net' },

  // --- QUẢN LÝ TỆP & DỮ LIỆU ---
  { cmd: 'ls -la', desc: 'Liệt kê danh sách tệp, thư mục và quyền chi tiết (bao gồm file ẩn)', category: 'files' },
  { cmd: 'pwd', desc: 'In đường dẫn thư mục hiện tại đang đứng', category: 'files' },
  { cmd: 'du -sh * | sort -h', desc: 'Đo dung lượng từng tệp/thư mục và sắp xếp từ bé đến lớn', category: 'files' },
  { cmd: 'tar -czvf backup.tar.gz ./folder', desc: 'Nén thư mục thành định dạng .tar.gz', category: 'files' },
  { cmd: 'tar -xzvf backup.tar.gz', desc: 'Giải nén tệp .tar.gz vào thư mục hiện tại', category: 'files' },
  { cmd: 'chmod -R 755 /var/www', desc: 'Gán quyền 755 (đọc/thực thi) cho thư mục mã nguồn web', category: 'files' },
  { cmd: 'chown -R www-data:www-data /var/www', desc: 'Gán chủ sở hữu www-data cho thư mục web', category: 'files' },

  // --- LỆNH DÀNH CHO WINDOWS (POWERSHELL) ---
  { cmd: '$PROFILE', desc: 'Xem đường dẫn file cấu hình Profile của PowerShell', category: 'shell', windows: true },
  { cmd: 'notepad $PROFILE', desc: 'Mở chỉnh sửa file cấu hình Profile PowerShell bằng Notepad', category: 'shell', windows: true },
  { cmd: '. $PROFILE', desc: 'Nạp lại file cấu hình PowerShell vừa chỉnh sửa', category: 'shell', windows: true },
  { cmd: 'Clear-Host', desc: 'Xóa sạch màn hình console PowerShell (tương đương cls)', category: 'shell', windows: true },
  { cmd: 'Get-ChildItem -Force', desc: 'Liệt kê tệp và thư mục (gồm cả file hệ thống & file ẩn)', category: 'files', windows: true },
  { cmd: 'Get-Location', desc: 'Xem thư mục làm việc hiện tại (tương đương pwd)', category: 'files', windows: true },
  { cmd: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10', desc: 'Top 10 tiến trình chiếm nhiều CPU nhất', category: 'system', windows: true },
  { cmd: 'Get-Service | Where-Object Status -eq Running', desc: 'Liệt kê các Windows Service đang chạy', category: 'system', windows: true },
  { cmd: 'Restart-Service ZenPanel', desc: 'Khởi động lại dịch vụ ZenPanel trên Windows', category: 'system', windows: true },
  { cmd: 'Get-NetTCPConnection -State Listen', desc: 'Xem danh sách cổng TCP đang mở trên Windows', category: 'net', windows: true },
  { cmd: 'Test-NetConnection -Port 443 google.com', desc: 'Kiểm tra kết nối tới cổng 443 của máy chủ ngoài', category: 'net', windows: true },
  { cmd: 'ipconfig /all', desc: 'Hiển thị đầy đủ thông số card mạng, IP, gateway và DNS', category: 'net', windows: true },
  { cmd: 'systeminfo', desc: 'Xem cấu hình phần cứng, RAM, phiên bản Windows và bản vá', category: 'system', windows: true },
  { cmd: 'winget upgrade --all', desc: 'Cập nhật toàn bộ phần mềm qua Windows Package Manager', category: 'system', windows: true },
  { cmd: 'Restart-Computer', desc: 'Khởi động lại máy chủ Windows ngay lập tức', category: 'system', windows: true },
];

export function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function pushHistory(command: string): void {
  const cmd = command.trim();
  if (!cmd || cmd.length > 500) return;
  const next = [cmd, ...loadHistory().filter((c) => c !== cmd)].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // LocalStorage bị chặn
  }
}

export interface CustomAlias {
  name: string;
  command: string;
  source: string;
}

let loadedCustomAliases: CustomAlias[] = [];

export function setCustomAliases(aliases: CustomAlias[]): void {
  loadedCustomAliases = aliases;
}

export function getCustomAliases(): CustomAlias[] {
  return loadedCustomAliases;
}

export interface SuggestResult {
  cmd: string;
  desc: string;
  category: 'history' | 'alias' | 'shell' | 'system' | 'docker' | 'web' | 'net' | 'files';
}

/** Gợi ý cho dòng đang gõ:
 * 1. Alias từ ~/.bashrc / Profile (ưu tiên cao nhất)
 * 2. Lịch sử đã gõ (khớp tiền tố)
 * 3. Thư viện lệnh (khớp tiền tố & từ khoá)
 * 4. Tìm theo cả phần mô tả tiếng Việt
 */
export function suggest(line: string, windows: boolean, limit = 8): SuggestResult[] {
  if (!line.trim() || line.length < 1) return [];
  const lower = line.trim().toLowerCase();
  const history = loadHistory();
  const catalog = SHELL_CATALOG.filter((item) => (windows ? item.windows : !item.windows));

  const results: SuggestResult[] = [];
  const seen = new Set<string>();

  // 1. Alias đọc trực tiếp từ ~/.bashrc hoặc PowerShell Profile
  for (const a of loadedCustomAliases) {
    if (results.length >= limit) break;
    const aName = a.name.toLowerCase();
    if (aName.startsWith(lower) && !seen.has(aName)) {
      seen.add(aName);
      results.push({
        cmd: a.name,
        desc: `Alias (${a.source}): ${a.command}`,
        category: 'alias',
      });
    }
  }

  // 2. Lịch sử đã gõ (khớp tiền tố)
  for (const h of history) {
    if (results.length >= limit) break;
    const hLow = h.toLowerCase();
    if (hLow.startsWith(lower) && !seen.has(hLow)) {
      seen.add(hLow);
      results.push({ cmd: h, desc: 'Lịch sử dòng lệnh đã gõ', category: 'history' });
    }
  }

  // 3. Thư viện lệnh: Khớp chính xác tiền tố của lệnh (cmd.startsWith)
  for (const item of catalog) {
    if (results.length >= limit) break;
    const k = item.cmd.toLowerCase();
    if (k.startsWith(lower) && !seen.has(k)) {
      seen.add(k);
      results.push({ cmd: item.cmd, desc: item.desc, category: item.category });
    }
  }

  // 4. Thư viện lệnh: Khớp từ khoá bên trong lệnh (k.includes)
  for (const item of catalog) {
    if (results.length >= limit) break;
    const k = item.cmd.toLowerCase();
    if (!seen.has(k) && k.includes(lower)) {
      seen.add(k);
      results.push({ cmd: item.cmd, desc: item.desc, category: item.category });
    }
  }

  // 5. Khớp theo mô tả tiếng Việt
  for (const item of catalog) {
    if (results.length >= limit) break;
    const k = item.cmd.toLowerCase();
    if (!seen.has(k) && item.desc.toLowerCase().includes(lower)) {
      seen.add(k);
      results.push({ cmd: item.cmd, desc: item.desc, category: item.category });
    }
  }

  return results;
}
