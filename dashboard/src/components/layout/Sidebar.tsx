// ZenPanel - Sidebar: tìm nhanh (Ctrl+K), ghim mục hay dùng, nhóm thu gọn được, mục con (tab),
// huy hiệu trạng thái (bản cập nhật, tác vụ đang chạy), chế độ thu nhỏ chỉ còn icon
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { ChevronDown, ChevronsLeft, ChevronsRight, Monitor, Pin, PinOff, Search, X } from 'lucide-react';
import { get } from '../../lib/api';
import { formatPercent } from '../../lib/format';
import { useLocalStorage } from '../../lib/hooks';
import { usePanel } from '../../lib/panel';
import type { Job } from '../../lib/types';
import { useWhatsNew } from '../WhatsNew';
import { cn } from '../ui';
import { ALL_NAV, NAV_SECTIONS, normalize, type NavItem } from './nav';

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zen-blue to-zen-green shadow-lg shadow-zen-blue/30">
        <span className="text-lg">🧘</span>
      </div>
      {!compact && (
        <div>
          <div className="text-lg font-extrabold tracking-tight text-white">ZenPanel</div>
          <div className="text-[11px] font-medium text-slate-500">Quản trị VPS an nhàn</div>
        </div>
      )}
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 font-semibold text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className={cn('h-full rounded-full transition-all duration-700', value < 60 ? 'bg-zen-green' : value < 85 ? 'bg-zen-amber' : 'bg-zen-red')} style={{ width: `${value}%` }} />
      </div>
      <span className="mono w-10 text-right text-slate-400">{formatPercent(value, 0)}</span>
    </div>
  );
}

/** Đếm job đang chạy để gắn huy hiệu (poll nhẹ) */
function useRunningJobs(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let stop = false;
    const tick = () =>
      get<Job[]>('/api/jobs')
        .then((list) => !stop && setCount(list.filter((j) => j.status === 'running').length))
        .catch(() => undefined);
    void tick();
    const timer = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);
  return count;
}

export function Sidebar({ onNavigate, compact = false, onToggleCompact }: { onNavigate?: () => void; compact?: boolean; onToggleCompact?: () => void }) {
  const { info, latest, update } = usePanel();
  const showWhatsNew = useWhatsNew();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [pinned, setPinned] = useLocalStorage<string[]>('zenpanel.nav.pinned', ['/', '/apps', '/files']);
  const [collapsed, setCollapsed] = useLocalStorage<string[]>('zenpanel.nav.collapsed', []);
  const searchRef = useRef<HTMLInputElement>(null);
  const runningJobs = useRunningJobs();
  const memPct = latest ? (latest.memory.used / latest.memory.total) * 100 : 0;
  const diskPct = latest?.disks?.[0] ? (latest.disks[0].used / latest.disks[0].total) * 100 : 0;

  // Ctrl/Cmd + K: nhảy vào ô tìm kiếm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (compact) onToggleCompact?.();
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, onToggleCompact]);

  const badges: Record<string, { text: string; tone: string } | undefined> = {
    '/settings': update?.available ? { text: 'Mới', tone: 'bg-sky-500 text-white' } : undefined,
    '/cleanup': memPct > 85 || diskPct > 90 ? { text: '!', tone: 'bg-amber-500 text-black' } : undefined,
  };

  const q = normalize(query.trim());
  const results = useMemo(
    () => (q ? ALL_NAV.filter((n) => normalize(`${n.label} ${n.description} ${n.keywords ?? ''} ${n.children?.map((c) => c.label).join(' ') ?? ''}`).includes(q)) : []),
    [q],
  );

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to.split('?')[0]));
  const togglePin = (to: string) => setPinned(pinned.includes(to) ? pinned.filter((p) => p !== to) : [...pinned, to]);
  const toggleSection = (id: string) => setCollapsed(collapsed.includes(id) ? collapsed.filter((c) => c !== id) : [...collapsed, id]);

  const renderItem = (item: NavItem, opts: { pinnable?: boolean } = {}) => {
    const { to, label, icon: Icon, children } = item;
    const active = isActive(to);
    const badge = badges[to];
    const pinnedNow = pinned.includes(to);
    return (
      <div key={to}>
        <div className="group/item relative">
          <NavLink
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            data-tip={compact ? label : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl text-sm font-semibold transition',
              compact ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
              active ? 'bg-gradient-to-r from-zen-blue/25 to-zen-blue/5 text-white shadow-inner ring-1 ring-zen-blue/30' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
            )}
          >
            <span className="relative">
              <Icon className={cn('size-[18px]', active ? 'text-blue-300' : 'text-slate-500 group-hover/item:text-slate-300')} />
              {compact && badge && <span className={cn('absolute -right-1.5 -top-1.5 size-2 rounded-full', badge.tone)} />}
            </span>
            {!compact && <span className="min-w-0 flex-1 truncate">{label}</span>}
            {!compact && badge && <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', badge.tone)}>{badge.text}</span>}
          </NavLink>
          {!compact && opts.pinnable !== false && (
            <button
              type="button"
              onClick={() => togglePin(to)}
              className={cn(
                'absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-700 hover:text-white group-hover/item:block',
                badge && 'group-hover/item:hidden',
              )}
              data-tip={pinnedNow ? 'Bỏ ghim' : 'Ghim lên đầu'}
            >
              {pinnedNow ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
          )}
        </div>
        {!compact && children && active && (
          <div className="ml-[22px] mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-3">
            {children.map((c) => {
              const [path, search] = c.to.split('?');
              const childActive = location.pathname === path && (search ? location.search === `?${search}` : !location.search || location.search === '?tab=account');
              return (
                <button
                  key={c.to}
                  type="button"
                  onClick={() => {
                    navigate(c.to);
                    onNavigate?.();
                  }}
                  className={cn('block w-full truncate rounded-lg px-2 py-1 text-left text-xs transition', childActive ? 'font-semibold text-blue-300' : 'text-slate-500 hover:text-slate-200')}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const pinnedItems = pinned.map((to) => ALL_NAV.find((n) => n.to === to)).filter((n): n is NavItem => Boolean(n));

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center pb-3 pt-5', compact ? 'justify-center px-2' : 'justify-between px-5')}>
        <Logo compact={compact} />
        {onToggleCompact && !compact && (
          <button type="button" onClick={onToggleCompact} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Thu nhỏ sidebar">
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>

      {compact ? (
        <button type="button" onClick={onToggleCompact} className="mx-auto mb-3 rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Mở rộng sidebar (Ctrl+K để tìm)">
          <ChevronsRight className="size-4" />
        </button>
      ) : (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-ink-950/60 px-3 py-2 focus-within:border-zen-blue/60">
            <Search className="size-4 shrink-0 text-slate-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) {
                  navigate(results[0].to);
                  setQuery('');
                  onNavigate?.();
                }
                if (e.key === 'Escape') setQuery('');
              }}
              placeholder="Tìm chức năng..."
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="text-slate-500 hover:text-white">
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="mono hidden rounded border border-slate-700 px-1.5 text-[10px] text-slate-500 lg:block">Ctrl K</kbd>
            )}
          </div>
        </div>
      )}

      <nav className={cn('flex-1 space-y-4 overflow-y-auto pb-4', compact ? 'px-2' : 'px-3')}>
        {q ? (
          <div className="space-y-0.5">
            {results.length === 0 ? <div className="px-3 py-6 text-center text-xs text-slate-500">Không tìm thấy chức năng nào</div> : results.map((item) => renderItem(item, { pinnable: false }))}
          </div>
        ) : (
          <>
            {pinnedItems.length > 0 && (
              <div>
                {!compact && <div className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-400/80">Đã ghim</div>}
                <div className="space-y-0.5">{pinnedItems.map((item) => renderItem(item))}</div>
              </div>
            )}
            {NAV_SECTIONS.map((section) => {
              const items = section.items.filter((i) => !pinned.includes(i.to));
              if (!items.length) return null;
              const closed = collapsed.includes(section.id) && !items.some((i) => isActive(i.to));
              return (
                <div key={section.id}>
                  {compact ? (
                    <div className="mx-auto mb-1.5 h-px w-6 bg-slate-800" />
                  ) : (
                    <button type="button" onClick={() => toggleSection(section.id)} className="mb-1.5 flex w-full items-center justify-between px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-300">
                      {section.title}
                      <ChevronDown className={cn('size-3.5 transition', closed && '-rotate-90')} />
                    </button>
                  )}
                  {(!closed || compact) && <div className="space-y-0.5">{items.map((item) => renderItem(item))}</div>}
                </div>
              );
            })}
          </>
        )}
      </nav>

      {compact ? (
        <div className="mb-3 flex flex-col items-center gap-1 text-[10px] text-slate-500" data-tip={info?.os.hostname}>
          <Monitor className="size-4 text-zen-blue" />
          {latest && <span className="mono">{formatPercent(latest.cpu.usage, 0)}</span>}
        </div>
      ) : (
        <div className="m-3 rounded-2xl border border-slate-700/50 bg-ink-950/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Monitor className="size-4 shrink-0 text-zen-blue" />
            <span className="truncate">{info?.os.hostname ?? '...'}</span>
            {runningJobs > 0 && <span className="ml-auto shrink-0 rounded-md bg-zen-blue/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">{runningJobs} tác vụ</span>}
          </div>
          {latest && (
            <div className="space-y-2 text-xs">
              <MiniBar label="CPU" value={latest.cpu.usage} />
              <MiniBar label="RAM" value={memPct} />
              {diskPct > 0 && <MiniBar label="Disk" value={diskPct} />}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="truncate">{info ? `${info.os.name} · v${info.version}` : 'Đang kết nối...'}</span>
            <button onClick={showWhatsNew} className="shrink-0 font-semibold text-blue-300 hover:underline" data-tip="Xem các tính năng mới">
              Có gì mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
