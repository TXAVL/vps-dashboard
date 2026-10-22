// ZenPanel - Chuẩn hoá toàn bộ format dữ liệu trên website
// Class txaformat hỗ trợ tiện dụng cho UI/Dashboard

export class txaformat {
  /** Format số có 2 chữ số thập phân (hoặc pad 2 chữ số cho số nguyên) */
  static twoDigits(value: number | string | null | undefined, padInt = false): string {
    if (value === null || value === undefined || value === '') return '00';
    const num = Number(value);
    if (Number.isNaN(num)) return '00';
    if (padInt && Number.isInteger(num)) {
      return num < 10 && num >= 0 ? `0${num}` : String(num);
    }
    return num.toLocaleString('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** Format 2 số nguyên với leading zero (01, 02, ..., 59) */
  static pad2(n: number | string): string {
    const num = Math.floor(Number(n) || 0);
    return num < 10 && num >= 0 ? `0${num}` : String(num);
  }

  /** Format dung lượng byte sang B, KB, MB, GB, TB, PB */
  static size(bytes: number | null | undefined, digits = 2): string {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let val = bytes / 1024;
    let u = 0;
    while (val >= 1024 && u < units.length - 1) {
      val /= 1024;
      u++;
    }
    const fixedDigits = val >= 100 ? 1 : digits;
    return `${val.toFixed(fixedDigits)} ${units[u]}`;
  }

  /** Format tốc độ mạng (Bytes/s hoặc bits/s) */
  static speed(bytesPerSecond: number | null | undefined, unit: 'bytes' | 'bits' = 'bytes'): string {
    const val = Math.max(0, Number(bytesPerSecond) || 0);
    const [base, units, start] = unit === 'bits'
      ? [1000, ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'], val * 8]
      : [1024, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'], val];
    let n = start;
    let i = 0;
    while (n >= base && i < units.length - 1) {
      n /= base;
      i++;
    }
    return `${n.toFixed(i === 0 ? 0 : n >= 100 ? 1 : 2)} ${units[i]}`;
  }

  /** Format phần trăm chuẩn, làm tròn tránh chuỗi số float dài ngoằng */
  static percent(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '0%';
    const num = Number(value);
    return `${num.toFixed(digits)}%`;
  }

  /** Format thời gian dự kiến còn lại (ETA / Time Left) */
  static timeLeft(totalSeconds: number | null | undefined): string {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds <= 0 || Number.isNaN(totalSeconds)) {
      return 'sắp xong';
    }
    const s = Math.ceil(totalSeconds);
    if (s < 60) return `~${s}s`;
    const m = Math.floor(s / 60);
    const remS = s % 60;
    if (m < 60) {
      return remS > 0 ? `~${m}p ${remS}s` : `~${m}p`;
    }
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `~${h}h ${remM}p`;
  }

  /** Format số ngày hoặc thời lượng dạng ngày giờ */
  static days(totalDaysOrSeconds: number | null | undefined, isSeconds = false): string {
    if (totalDaysOrSeconds === null || totalDaysOrSeconds === undefined || Number.isNaN(totalDaysOrSeconds)) {
      return '0 ngày';
    }
    const totalDays = isSeconds ? totalDaysOrSeconds / 86400 : totalDaysOrSeconds;
    if (totalDays < 1) {
      const hours = Math.round(totalDays * 24);
      return `${hours} giờ`;
    }
    const d = Math.floor(totalDays);
    const h = Math.round((totalDays - d) * 24);
    if (h > 0) return `${d} ngày ${h} giờ`;
    return `${d} ngày`;
  }

  /** Format thời gian (HH:mm:ss hoặc thời lượng dạng phút/giây) */
  static time(secondsOrDate: number | Date | string | null | undefined): string {
    if (!secondsOrDate) return '00:00';
    if (typeof secondsOrDate === 'number') {
      const s = Math.max(0, Math.floor(secondsOrDate));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) {
        return `${this.pad2(h)}:${this.pad2(m)}:${this.pad2(sec)}`;
      }
      return `${this.pad2(m)}:${this.pad2(sec)}`;
    }
    const d = new Date(secondsOrDate);
    if (Number.isNaN(d.getTime())) return String(secondsOrDate);
    return d.toLocaleTimeString('vi-VN', { hour12: false });
  }

  /** Format ngày giờ hoàn chỉnh */
  static datetime(isoOrDate: string | Date | null | undefined, withTime = true): string {
    if (!isoOrDate) return '—';
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleString('vi-VN', withTime ? { dateStyle: 'short', timeStyle: 'medium' } : { dateStyle: 'medium' });
  }
}

// Export mặc định và alias ngắn gọn
export default txaformat;
