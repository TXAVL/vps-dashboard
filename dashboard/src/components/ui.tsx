// ZenPanel - Bộ component giao diện dùng chung (Jupiter Style + Dark Glassmorphism)
import { useEffect, useState, type ButtonHTMLAttributes, type ComponentType, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertCircle, Check, Copy, Inbox, Loader2, Search, X } from 'lucide-react';
import { levelColor } from '../lib/format';

type IconType = ComponentType<{ className?: string }>;

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ Button

const buttonVariants = {
  primary: 'bg-zen-blue text-white hover:bg-blue-500 shadow-lg shadow-zen-blue/25',
  secondary: 'bg-ink-800/80 text-slate-200 border border-slate-700/60 hover:bg-slate-700/60',
  ghost: 'text-slate-300 hover:bg-slate-800/70 hover:text-white',
  danger: 'bg-zen-red/90 text-white hover:bg-zen-red shadow-lg shadow-zen-red/20',
  success: 'bg-zen-green/90 text-white hover:bg-zen-green shadow-lg shadow-zen-green/20',
  soft: 'bg-zen-blue/10 text-blue-300 border border-zen-blue/30 hover:bg-zen-blue/20',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: 'xs' | 'sm' | 'md';
  icon?: IconType;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  const sizes = { xs: 'h-7 px-2 text-xs gap-1', sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2' };
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className={size === 'md' ? 'size-4' : 'size-3.5'} />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, title, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconType; title: string }) {
  return (
    <button
      data-tip={title}
      aria-label={title}
      className={cn('inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700/60 hover:text-white disabled:opacity-40', className)}
      {...rest}
    >
      <Icon className="size-4" />
    </button>
  );
}

// ------------------------------------------------------------------ Layout blocks

export function Card({ title, icon: Icon, actions, children, className, bodyClassName }: {
  title?: ReactNode;
  icon?: IconType;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('glass flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/40 px-5 py-3.5">
          <h3 className="flex min-w-0 max-w-full items-center gap-2 text-sm font-bold text-slate-100">
            {Icon && <Icon className="size-4 text-zen-blue" />}
            {title}
          </h3>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, icon: Icon, actions }: { title: string; description?: string; icon: IconType; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-zen-blue/30 bg-gradient-to-br from-zen-blue/25 to-zen-green/10 text-blue-300">
          <Icon className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Status & data

const badgeTones = {
  green: 'bg-zen-green/10 text-emerald-300 border-zen-green/30',
  blue: 'bg-zen-blue/10 text-blue-300 border-zen-blue/30',
  amber: 'bg-zen-amber/10 text-amber-300 border-zen-amber/30',
  red: 'bg-zen-red/10 text-red-300 border-zen-red/30',
  slate: 'bg-slate-700/30 text-slate-300 border-slate-600/40',
};

export type Tone = keyof typeof badgeTones;

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold', badgeTones[tone], className)}>{children}</span>;
}

export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  const colors: Record<Tone, string> = { green: 'bg-zen-green', blue: 'bg-zen-blue', amber: 'bg-zen-amber', red: 'bg-zen-red', slate: 'bg-slate-500' };
  return (
    <span className="relative inline-flex size-2.5">
      {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', colors[tone])} />}
      <span className={cn('relative inline-flex size-2.5 rounded-full', colors[tone])} />
    </span>
  );
}

export function Progress({ value, tone, className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const auto = tone ?? levelColor(pct);
  const colors: Record<Tone, string> = {
    green: 'from-emerald-500 to-zen-green',
    blue: 'from-blue-500 to-cyan-400',
    amber: 'from-amber-500 to-yellow-400',
    red: 'from-red-600 to-zen-red',
    slate: 'from-slate-500 to-slate-400',
  };
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-800', className)}>
      <div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', colors[auto])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ResourceBar({ label, value, detail, tone, icon: Icon }: { label: string; value: number; detail: string; tone?: Tone; icon?: IconType }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-slate-300">
          {Icon && <Icon className="size-4 text-slate-500" />}
          {label}
        </span>
        <span className="mono text-xs text-slate-400">{detail}</span>
      </div>
      <Progress value={value} tone={tone} />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-400">
      <Loader2 className="size-5 animate-spin text-zen-blue" />
      {label ?? 'Đang tải...'}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: IconType; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-slate-700/50 bg-ink-800/60 text-slate-500">
        <Icon className="size-7" />
      </div>
      <div>
        <p className="font-semibold text-slate-200">{title}</p>
        {description && <div className="mt-1 max-w-md text-sm text-slate-400">{description}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zen-red/30 bg-zen-red/10 px-4 py-3 text-sm text-red-200">
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1 whitespace-pre-line break-words">{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'blue', children, icon: Icon = AlertCircle }: { tone?: Tone; children: ReactNode; icon?: IconType }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', badgeTones[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 text-slate-300">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Form

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input appearance-none pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:opacity-50',
        checked ? 'border-zen-green/50 bg-zen-green/80' : 'border-slate-600 bg-slate-700/70',
      )}
    >
      <span className={cn('inline-block size-4 rounded-full bg-white shadow transition', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Tìm kiếm...', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
      <input className="input h-10 py-0 pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: IconType; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-700/50 bg-ink-950/60 p-1">
      {tabs.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === id ? 'bg-zen-blue text-white shadow' : 'text-slate-400 hover:text-white',
          )}
        >
          {Icon && <Icon className="size-4" />}
          {label}
          {count !== undefined && <span className={cn('rounded-md px-1.5 text-xs', value === id ? 'bg-white/20' : 'bg-slate-700/60')}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Modal

export function Modal({ open, onClose, title, children, size = 'md', footer }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[96vw]' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={cn('glass flex max-h-[92vh] w-full flex-col rounded-b-none bg-ink-900/95 sm:rounded-b-2xl', widths[size])}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-700/40 px-5 py-4">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <IconButton icon={X} title="Đóng" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-700/40 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Misc

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // HTTP không an toàn: fallback bằng textarea
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} data-tip="Sao chép" className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-slate-400 transition hover:bg-slate-700/60 hover:text-white">
      {copied ? <Check className="size-3.5 text-zen-green" /> : <Copy className="size-3.5" />}
      {label}
    </button>
  );
}

export function Secret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <button className="mono text-slate-200 hover:text-white" onClick={() => setShown(!shown)} data-tip={shown ? 'Ẩn' : 'Hiện'}>
        {shown ? value : '••••••••••'}
      </button>
      <CopyButton value={value} />
    </span>
  );
}

export const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
export const td = 'px-4 py-3 align-middle';
export const tr = 'border-t border-slate-700/40 transition hover:bg-slate-800/40';
