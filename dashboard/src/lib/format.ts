import { txaformat } from './txaformat';
export { txaformat };

export type NetworkUnit = 'bytes' | 'bits';

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  return txaformat.size(bytes, digits);
}

/**
 * Tốc độ mạng theo tuỳ chọn trong Cài đặt:
 * - bytes: B/s, KB/s, MB/s, GB/s (cơ số 1024)
 * - bits:  bps, Kbps, Mbps, Gbps (cơ số 1000, như nhà mạng công bố)
 */
export function formatRate(bytesPerSecond: number, unit: NetworkUnit = 'bytes'): string {
  const value = Math.max(0, bytesPerSecond || 0);
  const [base, units, start] = unit === 'bits' ? [1000, ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'], value * 8] : [1024, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'], value];
  let n = start;
  let i = 0;
  while (n >= base && i < units.length - 1) {
    n /= base;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : n >= 100 ? 1 : 2)} ${units[i]}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Thời lượng đầy đủ tới từng giây:
 * 45 giây · 25 phút 02 giây · 01 giờ 01 phút 01 giây · 3 ngày 01 giờ 01 phút 01 giây
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d} ngày ${pad(h)} giờ ${pad(m)} phút ${pad(s)} giây`;
  if (h > 0) return `${pad(h)} giờ ${pad(m)} phút ${pad(s)} giây`;
  if (m > 0) return `${m} phút ${pad(s)} giây`;
  return `${s} giây`;
}

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', withTime ? { dateStyle: 'short', timeStyle: 'medium' } : { dateStyle: 'medium' });
}

/** "3 phút trước", "2 ngày trước"... */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(diff)) return '—';
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

/** Màu theo ngưỡng tải: xanh < 60%, vàng < 85%, đỏ còn lại */
export function levelColor(percent: number): 'green' | 'amber' | 'red' {
  if (percent < 60) return 'green';
  if (percent < 85) return 'amber';
  return 'red';
}
