// ZenPanel - Cấu trúc điều hướng: nhóm theo công việc, có mục con (tab), từ khoá tìm kiếm
import {
  Archive,
  Bot,
  Boxes,
  CalendarClock,
  Cog,
  Cpu,
  Database,
  FolderOpen,
  Gauge,
  Globe,
  LayoutGrid,
  ListTree,
  ScrollText,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Trash2,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

export interface NavChild {
  to: string;
  label: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Từ khoá phụ cho ô tìm kiếm sidebar (không dấu cũng được) */
  keywords?: string;
  children?: NavChild[];
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'monitor',
    title: 'Giám sát',
    items: [
      { to: '/', label: 'Tổng quan', icon: Gauge, description: 'CPU, RAM, Disk, Network realtime', keywords: 'dashboard overview cpu ram disk' },
      { to: '/processes', label: 'Tiến trình', icon: Cpu, description: 'Task Manager - xem và dừng tiến trình', keywords: 'task manager process kill' },
      { to: '/logs', label: 'Nhật ký', icon: ScrollText, description: 'Log hệ thống, web server, ZenPanel và lịch sử đăng nhập', keywords: 'log journal syslog nginx error access' },
    ],
  },
  {
    id: 'system',
    title: 'Hệ thống',
    items: [
      { to: '/cleanup', label: 'Dọn dẹp & RAM', icon: Trash2, description: 'Dọn rác thật, tối ưu RAM, swap, hạ tải CPU', keywords: 'clean ram cache swap toi uu don dep' },
      { to: '/services', label: 'Dịch vụ', icon: ListTree, description: 'Windows Services / systemd', keywords: 'service systemctl daemon' },
      { to: '/procs', label: 'Ứng dụng nền', icon: Bot, description: 'Chạy bot / worker 24/24 thay PM2', keywords: 'pm2 worker bot background' },
      { to: '/tasks', label: 'Cron Job', icon: CalendarClock, description: 'Cron / Task Scheduler - chạy lệnh, sao lưu, gọi URL theo lịch', keywords: 'cron schedule lich tac vu' },
      { to: '/terminal', label: 'Terminal', icon: SquareTerminal, description: 'PowerShell / Bash trên web', keywords: 'ssh shell bash powershell' },
    ],
  },
  {
    id: 'apps',
    title: 'Ứng dụng',
    items: [
      { to: '/apps', label: 'App Store', icon: LayoutGrid, description: 'Cài ứng dụng 1-click', keywords: 'app store install 1-click' },
      {
        to: '/docker',
        label: 'Docker',
        icon: Boxes,
        description: 'Containers, stacks, images, volumes',
        keywords: 'container compose image',
        children: [
          { to: '/docker', label: 'Containers' },
          { to: '/docker?tab=stacks', label: 'Compose Stacks' },
          { to: '/docker?tab=hub', label: 'Docker Hub' },
          { to: '/docker?tab=images', label: 'Images' },
        ],
      },
      { to: '/databases', label: 'Databases', icon: Database, description: 'MySQL, PostgreSQL, Redis... + mở truy cập từ xa', keywords: 'mysql postgres redis mongo mariadb' },
    ],
  },
  {
    id: 'web',
    title: 'Website',
    items: [
      { to: '/websites', label: 'Websites', icon: Globe, description: 'Domain & Website Isolation', keywords: 'domain ssl nginx caddy iis' },
      { to: '/files', label: 'File Manager', icon: FolderOpen, description: 'Quản lý file + Code Editor', keywords: 'file editor upload zip' },
      { to: '/backups', label: 'Sao lưu', icon: Archive, description: 'Sao lưu & khôi phục website, database, cấu hình', keywords: 'backup restore sao luu khoi phuc' },
    ],
  },
  {
    id: 'network',
    title: 'Mạng & Bảo mật',
    items: [
      { to: '/firewall', label: 'Tường lửa', icon: Shield, description: 'Mở cổng, chặn IP, cổng đang lắng nghe', keywords: 'firewall port ufw iptables' },
      { to: '/security', label: 'Bảo mật & WAF', icon: ShieldCheck, description: 'Cloudflare Anti-DDoS, chặn IP', keywords: 'waf cloudflare ddos' },
      { to: '/speedtest', label: 'Speedtest', icon: Wifi, description: 'Đo tốc độ mạng thật của VPS', keywords: 'speed test mang ping' },
    ],
  },
  {
    id: 'ai',
    title: 'AI & Lập trình',
    items: [
      { to: '/ai', label: 'AI Gateway', icon: Sparkles, description: 'ZenPanel AI Gateway: 1 endpoint OpenAI, Anthropic, Ollama API', keywords: 'openai claude gemini openrouter ollama gateway ai' },
      { to: '/api-tester', label: 'API Tester', icon: Send, description: 'Test API kiểu Postman, gửi từ VPS tới mọi URL', keywords: 'postman http request' },
    ],
  },
  {
    id: 'panel',
    title: 'Panel',
    items: [
      {
        to: '/settings',
        label: 'Cài đặt',
        icon: Cog,
        description: 'Tài khoản, giao diện, cập nhật, công cụ hệ thống',
        keywords: 'settings update account cap nhat',
        children: [
          { to: '/settings?tab=account', label: 'Tài khoản' },
          { to: '/settings?tab=update', label: 'Cập nhật' },
          { to: '/settings?tab=tools', label: 'Công cụ hệ thống' },
          { to: '/settings?tab=sessions', label: 'Phiên đăng nhập' },
        ],
      },
    ],
  },
];

export const ALL_NAV = NAV_SECTIONS.flatMap((s) => s.items);

/** Bỏ dấu tiếng Việt để tìm "don dep" ra "Dọn dẹp" */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
