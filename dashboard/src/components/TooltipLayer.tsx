// ZenPanel - Tooltip tuỳ chỉnh cho mọi phần tử có data-tip (thay tooltip mặc định của trình duyệt)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface TipState {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const rect = el.getBoundingClientRect();
      const placement = rect.top < 56 ? 'bottom' : 'top';
      setTip({ text, x: rect.left + rect.width / 2, y: placement === 'top' ? rect.top - 8 : rect.bottom + 8, placement });
    };

    const onOver = (event: Event) => {
      const el = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
      if (el === current) return;
      current = el;
      if (timer) clearTimeout(timer);
      if (!el) {
        setTip(null);
        return;
      }
      // Trễ nhẹ để tooltip không nháy khi rê chuột lướt qua
      timer = setTimeout(() => show(el), 250);
    };
    const hide = () => {
      current = null;
      if (timer) clearTimeout(timer);
      setTip(null);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('focusin', onOver);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onOver);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[70] max-w-xs rounded-lg border border-slate-600/60 bg-ink-800/95 px-2.5 py-1.5 text-xs font-medium text-slate-100 shadow-xl shadow-black/40 backdrop-blur"
      style={{
        left: Math.min(Math.max(tip.x, 12), window.innerWidth - 12),
        top: tip.y,
        transform: `translate(-50%, ${tip.placement === 'top' ? '-100%' : '0'})`,
        wordBreak: 'break-word',
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
