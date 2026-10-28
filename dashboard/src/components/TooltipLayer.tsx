// ZenPanel - Tooltip tuỳ chỉnh cho mọi phần tử có data-tip hoặc title (triệt tiêu hoàn toàn tooltip mặc định của trình duyệt)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface TipState {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
  align: 'center' | 'left' | 'right';
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const show = (el: HTMLElement) => {
      const text = el.dataset.tip || el.getAttribute('data-zen-title');
      if (!text) return;
      const rect = el.getBoundingClientRect();
      const placement = rect.top < 56 ? 'bottom' : 'top';
      const isRightEdge = rect.right > window.innerWidth - 80;
      const isLeftEdge = rect.left < 80;

      let align: 'center' | 'left' | 'right' = 'center';
      let x = rect.left + rect.width / 2;

      if (isRightEdge) {
        align = 'right';
        x = rect.right;
      } else if (isLeftEdge) {
        align = 'left';
        x = rect.left;
      }

      setTip({
        text,
        x,
        y: placement === 'top' ? rect.top - 8 : rect.bottom + 8,
        placement,
        align,
      });
    };

    const onOver = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Tìm phần tử gần nhất có data-tip, title hoặc data-zen-title
      const el = target.closest<HTMLElement>('[data-tip], [title], [data-zen-title]');

      // Bóc tách và gỡ bỏ ngay lập tức thuộc tính title của trình duyệt để không bị hiện tooltip hệ thống
      if (el?.hasAttribute('title')) {
        const val = el.getAttribute('title')?.trim();
        if (val) {
          el.setAttribute('data-zen-title', val);
          if (!el.dataset.tip) el.dataset.tip = val;
        }
        el.removeAttribute('title'); // Gỡ bỏ vĩnh viễn title gốc
      }

      if (el === current) return;
      current = el;
      if (timer) clearTimeout(timer);
      if (!el || (!el.dataset.tip && !el.getAttribute('data-zen-title'))) {
        setTip(null);
        return;
      }
      // Trễ nhẹ để tooltip không nháy khi rê chuột lướt qua
      timer = setTimeout(() => show(el), 180);
    };

    const hide = () => {
      current = null;
      if (timer) clearTimeout(timer);
      setTip(null);
    };

    // Tự động quét và triệt tiêu tất cả thuộc tính title mặc định trên toàn bộ trang
    const sanitizeTitles = () => {
      document.querySelectorAll<HTMLElement>('[title]').forEach((el) => {
        const val = el.getAttribute('title')?.trim();
        if (val) {
          el.setAttribute('data-zen-title', val);
          if (!el.dataset.tip) el.dataset.tip = val;
        }
        el.removeAttribute('title');
      });
    };

    sanitizeTitles();
    const observer = new MutationObserver(() => sanitizeTitles());
    observer.observe(document.body, { childList: true, subtree: true, attributeFilter: ['title'] });

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('focusin', onOver, true);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('focusin', onOver, true);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-max max-w-[calc(100vw-2rem)] sm:max-w-xs rounded-lg border border-slate-600/70 bg-ink-900/95 px-2.5 py-1.5 text-xs font-medium text-slate-100 shadow-xl shadow-black/60 backdrop-blur whitespace-pre text-left transition-opacity duration-150 animate-in fade-in"
      style={{
        ...(tip.align === 'right'
          ? { right: `${Math.max(12, window.innerWidth - tip.x)}px` }
          : tip.align === 'left'
            ? { left: `${Math.max(12, tip.x)}px` }
            : {
                left: `${tip.x}px`,
              }),
        top: `${tip.y}px`,
        transform:
          tip.align === 'center'
            ? `translate(-50%, ${tip.placement === 'top' ? '-100%' : '0'})`
            : `translate(0, ${tip.placement === 'top' ? '-100%' : '0'})`,
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
