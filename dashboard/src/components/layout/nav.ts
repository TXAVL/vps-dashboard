// ZenPanel - Cấu trúc điều hướng 2 tầng: Admin Master & Site Panel
import {
  Bot,
  Boxes,
  CalendarClock,
  Cog,
  Cpu,
  Database,
  FolderOpen,
  Gauge,
  Globe,
  Send,
  Wifi,
  LayoutGrid,
  ListTree,
  Shield,
  Sparkles,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Admin Master',
    items: [
      { to: '/', label: 'Tổng quan', icon: Gauge, description: 'CPU, RAM, Disk, Network realtime' },
      { to: '/processes', label: 'Tiến trình', icon: Cpu, description: 'Task Manager - xem và dừng tiến trình' },
      { to: '/procs', label: 'Ứng dụng nền', icon: Bot, description: 'Chạy bot / worker 24/24 thay PM2' },
      { to: '/services', label: 'Dịch vụ', icon: ListTree, description: 'Windows Services / systemd' },
      { to: '/firewall', label: 'Tường lửa', icon: Shield, description: 'Mở cổng, chặn IP, cổng đang lắng nghe' },
      { to: '/docker', label: 'Docker', icon: Boxes, description: 'Containers, images, volumes' },
      { to: '/ai', label: 'AI Gateway', icon: Sparkles, description: 'ChatGPT, Claude, Gemini, OpenRouter, NVIDIA qua 1 endpoint' },
      { to: '/api-tester', label: 'API Tester', icon: Send, description: 'Test API kiểu Postman, gửi từ VPS tới mọi URL' },
      { to: '/apps', label: 'App Store', icon: LayoutGrid, description: 'Cài ứng dụng 1-click' },
      { to: '/terminal', label: 'Terminal', icon: SquareTerminal, description: 'PowerShell / Bash trên web' },
      { to: '/speedtest', label: 'Speedtest', icon: Wifi, description: 'Đo tốc độ mạng thật của VPS' },
      { to: '/tasks', label: 'Lịch tác vụ', icon: CalendarClock, description: 'Cron / Task Scheduler - chạy lệnh theo lịch' },
    ],
  },
  {
    title: 'Site Panel',
    items: [
      { to: '/websites', label: 'Websites', icon: Globe, description: 'Domain & Website Isolation' },
      { to: '/files', label: 'File Manager', icon: FolderOpen, description: 'Quản lý file + Code Editor' },
      { to: '/databases', label: 'Databases', icon: Database, description: 'MySQL, PostgreSQL, Redis...' },
      { to: '/security', label: 'Bảo mật & WAF', icon: ShieldCheck, description: 'Cloudflare Anti-DDoS, chặn IP' },
    ],
  },
  {
    title: 'Hệ thống',
    items: [{ to: '/settings', label: 'Cài đặt', icon: Cog, description: 'Tài khoản, tunnel, thông tin agent' }],
  },
];

export const ALL_NAV = NAV_SECTIONS.flatMap((s) => s.items);
