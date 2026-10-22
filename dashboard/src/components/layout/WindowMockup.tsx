// ZenPanel - Khung cửa sổ kiểu macOS (3 chấm màu + thanh URL bảo mật) bao quanh Terminal / Code Editor
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../ui';

export function WindowMockup({ title, url, actions, children, className }: {
  title?: string;
  url?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const address = url ?? `${window.location.protocol}//${window.location.host}`;
  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0a0e17] shadow-2xl shadow-black/40', className)}>
      <div className="flex items-center gap-3 border-b border-slate-800 bg-ink-900/90 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#EF4444]" />
          <span className="size-3 rounded-full bg-[#F59E0B]" />
          <span className="size-3 rounded-full bg-[#3B82F6]" />
        </div>
        <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-700/50 bg-ink-950/80 px-3 py-1 text-xs text-slate-400">
          <Lock className="size-3 shrink-0 text-zen-green" />
          <span className="mono truncate">{address}</span>
          {title && <span className="hidden truncate text-slate-500 sm:inline">— {title}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
