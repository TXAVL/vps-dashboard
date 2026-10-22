// ZenPanel - Phát hiện và xử lý In-App Browser (Facebook, Messenger, Zalo, Instagram, TikTok...)
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Compass,
  Copy,
  Info,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';

function ChromeIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Google Chrome">
      <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.73A11.948 11.948 0 0 0 12 0zm-8.878 6.09A11.944 11.944 0 0 0 0 12c0 5.482 3.676 10.106 8.67 11.543l3.953-6.847a5.454 5.454 0 0 1-5.698-3.328l-.048-.083-3.755-7.195zm14.333 4.455A5.455 5.455 0 0 1 13.91 16.91l-3.953 6.848C10.638 23.917 11.31 24 12 24c6.627 0 12-5.373 12-12 0-.847-.088-1.673-.254-2.47-.042-.204-.09-.406-.145-.605l-6.146.12zM12 7.636a4.364 4.364 0 1 0 0 8.728 4.364 4.364 0 0 0 0-8.728z" />
    </svg>
  );
}

export interface InAppBrowserInfo {
  isInApp: boolean;
  appName: string;
  os: 'android' | 'ios' | 'other';
  rawUa: string;
}

export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isInApp: false, appName: '', os: 'other', rawUa: '' };
  }

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  const rawUa = navigator.userAgent || '';

  // Phát hiện hệ điều hành
  let os: 'android' | 'ios' | 'other' = 'other';
  if (/android/i.test(ua)) {
    os = 'android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'ios';
  }

  // Nhận diện cụ thể từng loại In-App Browser
  let isInApp = false;
  let appName = '';

  if (/fban|fbav|fb_iab|fb4a|fbios/i.test(ua)) {
    isInApp = true;
    appName = /messenger/i.test(ua) ? 'Messenger' : 'Facebook';
  } else if (/messenger|fbss/i.test(ua)) {
    isInApp = true;
    appName = 'Messenger';
  } else if (/instagram/i.test(ua)) {
    isInApp = true;
    appName = 'Instagram';
  } else if (/zalo|zalotheme/i.test(ua)) {
    isInApp = true;
    appName = 'Zalo';
  } else if (/musical_ly|bytelocale|tiktok/i.test(ua)) {
    isInApp = true;
    appName = 'TikTok';
  } else if (/micromessenger/i.test(ua)) {
    isInApp = true;
    appName = 'WeChat';
  } else if (/line\//i.test(ua)) {
    isInApp = true;
    appName = 'Line';
  } else if (/wv|webview/i.test(ua) && !/chrome\/[0-9.]+\s+mobile/i.test(ua)) {
    // Android generic WebView
    isInApp = true;
    appName = 'Ứng dụng di động (In-App WebView)';
  }

  return { isInApp, appName, os, rawUa };
}

export function InAppBrowserGuard() {
  const [browserInfo, setBrowserInfo] = useState<InAppBrowserInfo>({
    isInApp: false,
    appName: '',
    os: 'other',
    rawUa: '',
  });
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const info = detectInAppBrowser();
    setBrowserInfo(info);

    // Khi phát hiện in-app browser và chưa dismiss, khóa scroll trang
    if (info.isInApp && !dismissed) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [dismissed]);

  if (!browserInfo.isInApp) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const noProto = currentUrl.replace(/^https?:\/\//i, '');
  const isHttps = currentUrl.startsWith('https://');

  // Android Chrome Intent URL để mở thẳng bằng Google Chrome
  const androidChromeIntent = `intent://${noProto}#Intent;scheme=${isHttps ? 'https' : 'http'};package=com.android.chrome;end`;

  // iOS Chrome URL scheme (nếu có cài Chrome trên iPhone)
  const iosChromeUrl = isHttps ? `googlechromes://${noProto}` : `googlechrome://${noProto}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
    } catch {
      const area = document.createElement('textarea');
      area.value = currentUrl;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openExternalBrowser = () => {
    if (browserInfo.os === 'android') {
      window.location.href = androidChromeIntent;
      // Fallback sau 1.5s nếu máy không có Chrome
      setTimeout(() => {
        window.location.href = currentUrl;
      }, 1500);
    } else if (browserInfo.os === 'ios') {
      // Trên iOS thử mở qua Chrome scheme
      window.location.href = iosChromeUrl;
      setTimeout(() => {
        // Nếu không có Chrome, mở window mới hoặc sao chép link
        void copyLink();
      }, 1200);
    } else {
      window.open(currentUrl, '_system');
    }
  };

  // Nếu người dùng chọn thu nhỏ (dismiss) cảnh báo toàn màn hình: hiển thị thanh bar mỏng cố định trên đầu trang
  if (dismissed) {
    return (
      <aside aria-label="Cảnh báo trình duyệt nhúng" className="sticky top-0 z-[99999] flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-gradient-to-r from-amber-950/90 via-slate-900/95 to-slate-900/90 px-4 py-2.5 text-xs text-amber-200 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-amber-400 animate-pulse" />
          <span>
            Bạn đang mở qua <b>{browserInfo.appName}</b>. Một số tính năng như Terminal hay Live Stream có thể bị gián đoạn.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openExternalBrowser}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-xs font-bold text-black transition shadow"
          >
            <ChromeIcon className="size-3.5" />
            <span>Mở bằng Chrome</span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(false)}
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300 hover:text-white transition"
          >
            Xem hướng dẫn
          </button>
        </div>
      </aside>
    );
  }

  // MÀN HÌNH KHÓA & LÀM MỜ (FULL SCREEN BACKDROP BLUR & LOCK OVERLAY)
  return (
    <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center p-4 overflow-y-auto bg-slate-950/85 backdrop-blur-xl animate-fade-in select-none">
      {/* MŨI TÊN CHỈ DẪN LÊN GÓC PHẢI MÀN HÌNH (Dành cho Facebook/Messenger Mobile) */}
      <div className="fixed top-3 right-4 flex items-center gap-2 text-right pointer-events-none animate-bounce">
        <div className="text-xs font-semibold text-amber-300 bg-amber-950/80 border border-amber-400/40 px-3 py-1.5 rounded-xl shadow-lg">
          Bấm vào dấu <b>⋮</b> hoặc <b>⋯</b> ở đây ↗
        </div>
        <div className="flex size-8 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg">
          <ArrowUpRight className="size-5 stroke-[2.5]" />
        </div>
      </div>

      {/* KHỐI NỘI DUNG CẢNH BÁO CHÍNH */}
      <div className="relative w-full max-w-lg rounded-3xl border-2 border-indigo-500/40 bg-gradient-to-b from-slate-900/95 via-ink-950 to-slate-950 p-6 sm:p-8 shadow-2xl text-center space-y-5 ring-1 ring-white/10">
        {/* ICON ĐỒ HỌA SANG TRỌNG */}
        <div className="mx-auto flex size-18 items-center justify-center rounded-3xl bg-gradient-to-tr from-amber-500/20 via-indigo-600/30 to-purple-600/20 border border-indigo-400/30 shadow-inner">
          <div className="relative flex items-center justify-center">
            <Smartphone className="size-10 text-indigo-300" />
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-black font-extrabold text-[10px] ring-2 ring-slate-900">
              !
            </span>
          </div>
        </div>

        {/* TIÊU ĐỀ & HUY HIỆU */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/50 px-3 py-1 text-xs font-bold text-amber-300">
            <ShieldAlert className="size-3.5 text-amber-400" />
            <span>Phát hiện Trình duyệt {browserInfo.appName}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Vui lòng mở bằng Chrome / Safari
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
            Trình duyệt nhúng trong <b>{browserInfo.appName}</b> bị vô hiệu hóa nhiều tính năng quan trọng (chặn WebSocket, Terminal tương tác, tải tệp tin và lưu trữ phiên).
          </p>
        </div>

        {/* HƯỚNG DẪN 2 BƯỚC MỞ TRÌNH DUYỆT NGOÀI */}
        <div className="rounded-2xl border border-slate-700/60 bg-black/50 p-4 text-left space-y-2.5 text-xs">
          <div className="font-bold text-slate-200 flex items-center gap-1.5">
            <Compass className="size-4 text-indigo-400" />
            <span>Cách mở trang này bằng trình duyệt chuẩn:</span>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px] sm:text-xs">
            <li>
              Bấm nút <b>[Mở bằng Chrome]</b> ở bên dưới (dành cho máy Android).
            </li>
            <li>
              Hoặc bấm vào biểu tượng <b>⋮</b> (Android) hoặc <b>⋯</b> (iOS) ở góc trên bên phải màn hình.
            </li>
            <li>
              Chọn <b>"Mở trong trình duyệt ngoài"</b> (<i>Open in external browser / Safari / Chrome</i>).
            </li>
          </ol>
        </div>

        {/* BỘ NÚT HÀNH ĐỘNG 1-CLICK */}
        <div className="space-y-2.5 pt-1">
          {/* NÚT MỞ BẰNG CHROME (ANDROID INTENT) */}
          <button
            type="button"
            onClick={openExternalBrowser}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-extrabold text-sm sm:text-base py-3.5 px-5 shadow-xl shadow-indigo-900/40 transition active:scale-[0.98] cursor-pointer"
          >
            <ChromeIcon className="size-5" />
            <span>Mở bằng Google Chrome / Trình duyệt ngoài</span>
          </button>

          {/* NÚT SAO CHÉP LIÊN KẾT */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-semibold text-xs py-2.5 px-3 transition cursor-pointer"
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4 text-slate-400" />}
              <span>{copied ? 'Đã chép link vào clipboard!' : 'Sao chép liên kết'}</span>
            </button>

            {/* NÚT BỎ QUA TẠM THỜI (XEM LƯỚT) */}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-xl border border-slate-800 bg-black/40 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-xs py-2.5 px-3 transition"
              title="Tiếp tục xem trang dù có thể bị lỗi"
            >
              Xem tạm
            </button>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 flex items-center justify-center gap-1 pt-1">
          <Info className="size-3 text-slate-500" />
          <span>Bảo mật hệ thống ZenPanel • Khuyên dùng Chrome, Safari, Edge hoặc Brave</span>
        </div>
      </div>
    </div>
  );
}
