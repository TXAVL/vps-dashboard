// ZenPanel - Tuỳ chọn hiển thị & vận hành của panel (đơn vị mạng, giao diện, hạn VPS, tự cập nhật)
import { readJson, writeJson } from './store.js';
import { badRequest } from './validate.js';

export const THEMES = [
  'zen',
  'emerald',
  'violet',
  'cyan',
  'amber',
  'rose',
  'orange',
  'fuchsia',
  'lime',
  'indigo',
  'teal',
  'crimson',
] as const;
export const BASES = [
  'slate',
  'oled',
  'navy',
  'zinc',
  'dracula',
  'nord',
  'forest',
  'mocha',
] as const;
/** 15 mốc tần suất kiểm tra cập nhật (phút): 15 phút → 1 tháng */
export const UPDATE_INTERVALS = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 10080, 20160, 43200] as const;

export interface PanelPrefs {
  /** bytes: KB/s, MB/s, GB/s · bits: Kbps, Mbps, Gbps */
  networkUnit: 'bytes' | 'bits';
  theme: (typeof THEMES)[number];
  base: (typeof BASES)[number];
  /** Ngày hết hạn VPS (YYYY-MM-DD) do admin nhập; nhà cung cấp không công khai thông tin này cho OS */
  vpsExpiry: string | null;
  vpsProvider: string;
  vpsRenewUrl: string;
  vpsPrice: string;
  expiryWarnDays: number;
  /** Tự kiểm tra bản mới trên GitHub và tải sẵn gói cập nhật */
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  /** Tần suất tự kiểm tra cập nhật (phút), 1 trong UPDATE_INTERVALS */
  updateCheckMinutes: number;
  /** Domain / IP public của VPS để hiển thị địa chỉ truy cập app & database (trống = tự lấy IP public) */
  publicHost: string;
  /** Tự tối ưu RAM khi % RAM dùng vượt ngưỡng */
  autoRamOptimize: boolean;
  autoRamThreshold: number;
  /** Khoảng cách tối thiểu giữa 2 lần tự tối ưu (phút) */
  autoRamIntervalMin: number;
}

const FILE = 'prefs.json';

export const DEFAULT_PREFS: PanelPrefs = {
  networkUnit: 'bytes',
  theme: 'zen',
  base: 'slate',
  vpsExpiry: null,
  vpsProvider: '',
  vpsRenewUrl: '',
  vpsPrice: '',
  expiryWarnDays: 7,
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  updateCheckMinutes: 360,
  publicHost: '',
  autoRamOptimize: false,
  autoRamThreshold: 85,
  autoRamIntervalMin: 15,
};

export function getPrefs(): PanelPrefs {
  return { ...DEFAULT_PREFS, ...readJson<Partial<PanelPrefs>>(FILE, {}) };
}

export function updatePrefs(input: Partial<PanelPrefs>): PanelPrefs {
  const next = { ...getPrefs() };
  if (input.networkUnit !== undefined) {
    if (input.networkUnit !== 'bytes' && input.networkUnit !== 'bits') throw badRequest('Đơn vị mạng không hợp lệ');
    next.networkUnit = input.networkUnit;
  }
  if (input.theme !== undefined) {
    if (!THEMES.includes(input.theme)) throw badRequest('Giao diện không hợp lệ');
    next.theme = input.theme;
  }
  if (input.base !== undefined) {
    if (!BASES.includes(input.base)) throw badRequest('Nền giao diện không hợp lệ');
    next.base = input.base;
  }
  if (input.vpsExpiry !== undefined) {
    if (input.vpsExpiry !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(input.vpsExpiry) || Number.isNaN(Date.parse(input.vpsExpiry)))) {
      throw badRequest('Ngày hết hạn phải có dạng YYYY-MM-DD');
    }
    next.vpsExpiry = input.vpsExpiry || null;
  }
  if (input.vpsProvider !== undefined) next.vpsProvider = String(input.vpsProvider).slice(0, 80);
  if (input.vpsPrice !== undefined) next.vpsPrice = String(input.vpsPrice).slice(0, 40);
  if (input.vpsRenewUrl !== undefined) {
    const url = String(input.vpsRenewUrl).trim();
    if (url && !/^https?:\/\//i.test(url)) throw badRequest('Link gia hạn phải bắt đầu bằng http:// hoặc https://');
    next.vpsRenewUrl = url.slice(0, 300);
  }
  if (input.expiryWarnDays !== undefined) next.expiryWarnDays = Math.min(90, Math.max(1, Math.round(Number(input.expiryWarnDays) || 7)));
  if (input.autoCheckUpdate !== undefined) next.autoCheckUpdate = Boolean(input.autoCheckUpdate);
  if (input.autoDownloadUpdate !== undefined) next.autoDownloadUpdate = Boolean(input.autoDownloadUpdate);
  if (input.autoRamOptimize !== undefined) next.autoRamOptimize = Boolean(input.autoRamOptimize);
  if (input.autoRamThreshold !== undefined) next.autoRamThreshold = Math.min(98, Math.max(50, Math.round(Number(input.autoRamThreshold) || 85)));
  if (input.autoRamIntervalMin !== undefined) next.autoRamIntervalMin = Math.min(1440, Math.max(5, Math.round(Number(input.autoRamIntervalMin) || 15)));
  if (input.updateCheckMinutes !== undefined) {
    const minutes = Number(input.updateCheckMinutes);
    if (!(UPDATE_INTERVALS as readonly number[]).includes(minutes)) throw badRequest('Tần suất kiểm tra không hợp lệ');
    next.updateCheckMinutes = minutes;
  }
  if (input.publicHost !== undefined) {
    const host = String(input.publicHost).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (host && !/^[a-z0-9.\-:[\]]{1,253}$/.test(host)) throw badRequest('Domain / IP không hợp lệ');
    next.publicHost = host;
  }
  writeJson(FILE, next);
  return next;
}
