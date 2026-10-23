// ZenPanel - Khung giao diện chính: Sidebar Jupiter + Header (GUI/CLI toggle) + Terminal dock ở chế độ CLI
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { CalendarClock, ChevronDown, Cloud, Globe, HeartPulse, LogOut, Menu, Monitor, MousePointer2, Sparkles, SquareTerminal, StickyNote, Wrench, X } from 'lucide-react';
import { get, logout } from '../../lib/api';
import { formatPercent } from '../../lib/format';
import { useLocalStorage } from '../../lib/hooks';
import { usePanel } from '../../lib/panel';
import { JobsButton } from '../jobs';
import { useWhatsNew } from '../WhatsNew';
import { TerminalPanel } from '../TerminalPanel';
import { CopyButton, StatusDot, cn } from '../ui';
import { ALL_NAV, NAV_SECTIONS } from './nav';
import { ThemePicker } from './ThemePicker';
import { WindowMockup } from './WindowMockup';
import { ServerNotepadModal } from './ServerNotepadModal';
import { VpsDoctorModal } from '../VpsDoctorModal';
import { RightUtilityPanel } from './RightUtilityPanel';

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-zen-blue to-zen-green shadow-lg shadow-zen-blue/30">
        <span className="text-lg">🧘</span>
      </div>
      <div>
        <div className="text-lg font-extrabold tracking-tight text-white">ZenPanel</div>
        <div className="text-[11px] font-medium text-slate-500">Quản trị VPS an nhàn</div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { info, latest } = usePanel();
  const showWhatsNew = useWhatsNew();
  const memPct = latest ? (latest.memory.used / latest.memory.total) * 100 : 0;
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{section.title}</div>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                      isActive
                        ? 'bg-gradient-to-r from-zen-blue/25 to-zen-blue/5 text-white shadow-inner ring-1 ring-zen-blue/30'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn('size-[18px]', isActive ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300')} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-slate-700/50 bg-ink-950/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Monitor className="size-4 text-zen-blue" />
          <span className="truncate">{info?.os.hostname ?? '...'}</span>
        </div>
        {latest && (
          <div className="space-y-2 text-xs">
            <MiniBar label="CPU" value={latest.cpu.usage} />
            <MiniBar label="RAM" value={memPct} />
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate">{info ? `${info.os.name} · v${info.version}` : 'Đang kết nối...'}</span>
          <button onClick={showWhatsNew} className="shrink-0 font-semibold text-blue-300 hover:underline" data-tip="Xem các tính năng mới">
            Có gì mới
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 font-semibold text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className={cn('h-full rounded-full transition-all duration-700', value < 60 ? 'bg-zen-green' : value < 85 ? 'bg-zen-amber' : 'bg-zen-red')} style={{ width: `${value}%` }} />
      </div>
      <span className="mono w-11 text-right text-slate-400">{formatPercent(value, 0)}</span>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: 'gui' | 'cli'; onChange: (m: 'gui' | 'cli') => void }) {
  return (
    <div className="flex rounded-xl border border-slate-700/60 bg-ink-950/70 p-1">
      {(
        [
          { id: 'gui', label: 'Zen GUI', icon: MousePointer2 },
          { id: 'cli', label: 'Zen CLI', icon: SquareTerminal },
        ] as const
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition',
            mode === id ? (id === 'gui' ? 'bg-zen-blue text-white' : 'bg-zen-green text-white') : 'text-slate-400 hover:text-white',
          )}
          data-tip={id === 'gui' ? 'Giao diện đồ họa cho người không chuyên' : 'Mở terminal song song cho DevOps/SysAdmin'}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function PublicIpChip({ onOpenDoctor }: { onOpenDoctor?: () => void }) {
  const [ipInfo, setIpInfo] = useState<{ publicIp: string | null; isBehindNat: boolean } | null>(null);

  useEffect(() => {
    void get<{ publicIp: string | null; isBehindNat: boolean }>('/api/system/public-ip')
      .then(setIpInfo)
      .catch(() => {});
  }, []);

  if (!ipInfo?.publicIp) return null;

  return (
    <div
      onClick={onOpenDoctor}
      className="hidden cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700/60 bg-ink-950/70 py-1 pl-2.5 pr-1 text-xs transition hover:border-slate-600 md:flex"
      data-tip="Public IPv4 của máy chủ (Bấm để mở Bác Sĩ VPS)"
    >
      <Globe className="size-3.5 text-zen-green" />
      <span className="mono font-semibold text-slate-200">{ipInfo.publicIp}</span>
      <div onClick={(e) => e.stopPropagation()}>
        <CopyButton value={ipInfo.publicIp} />
      </div>
    </div>
  );
}

function TunnelChip() {
  const { tunnel } = usePanel();
  if (!tunnel || tunnel.status === 'stopped' || tunnel.status === 'idle') return null;
  const online = tunnel.status === 'online' && tunnel.url;
  return (
    <div className="hidden items-center gap-2 rounded-xl border border-slate-700/60 bg-ink-950/70 py-1 pl-3 pr-1 text-xs lg:flex">
      <Cloud className={cn('size-4', online ? 'text-orange-400' : 'text-slate-500')} />
      {online ? (
        <>
          <a href={tunnel.url!} target="_blank" rel="noreferrer" className="mono max-w-[260px] truncate text-slate-300 hover:text-white">
            {tunnel.url!.replace('https://', '')}
          </a>
          <CopyButton value={tunnel.url!} />
        </>
      ) : (
        <span className="pr-2 text-slate-400">{tunnel.status === 'starting' ? 'Đang mở tunnel...' : 'Tunnel lỗi'}</span>
      )}
    </div>
  );
}

/** Thông báo bản cập nhật mới (agent tự kiểm tra GitHub định kỳ) */
function UpdateBanner() {
  const { update } = usePanel();
  const [hidden, setHidden] = useState(false);
  if (!update?.available || !update.latest || hidden) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zen-blue/30 bg-zen-blue/10 px-4 py-2 text-sm sm:px-6">
      <Sparkles className="size-4 shrink-0 text-blue-300" />
      <span className="min-w-0 flex-1 text-slate-200">
        Có bản ZenPanel mới <b className="text-white">v{update.latest.version}</b> (đang dùng v{update.current})
        {update.downloadedLatest ? ' — đã tải sẵn, sẵn sàng cài đặt.' : '.'}
      </span>
      <Link to="/settings?tab=update" className="font-semibold text-blue-300 hover:underline">
        Xem & cập nhật
      </Link>
      <button onClick={() => setHidden(true)} className="rounded p-0.5 text-slate-400 hover:text-white" aria-label="Ẩn thông báo">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Cảnh báo VPS sắp hết hạn (ngày hết hạn do admin nhập trong Cài đặt) */
function ExpiryBanner() {
  const { prefs } = usePanel();
  if (!prefs.vpsExpiry) return null;
  const days = Math.ceil((new Date(`${prefs.vpsExpiry}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  if (days > prefs.expiryWarnDays) return null;
  const expired = days < 0;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-6', expired ? 'border-zen-red/40 bg-zen-red/15' : 'border-zen-amber/40 bg-zen-amber/10')}>
      <CalendarClock className={cn('size-4 shrink-0', expired ? 'text-zen-red' : 'text-zen-amber')} />
      <span className="min-w-0 flex-1 text-slate-200">
        {expired ? `VPS đã hết hạn ${-days} ngày trước` : days === 0 ? 'VPS hết hạn hôm nay' : `VPS sẽ hết hạn sau ${days} ngày`}
        {prefs.vpsProvider && ` (${prefs.vpsProvider})`}.
      </span>
      {prefs.vpsRenewUrl && (
        <a href={prefs.vpsRenewUrl} target="_blank" rel="noreferrer" className="font-semibold text-amber-200 hover:underline">
          Gia hạn ngay
        </a>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useLocalStorage<'gui' | 'cli'>('zenpanel.mode', 'gui');
  const [dockOpen, setDockOpen] = useState(true);
  const [notepadOpen, setNotepadOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useLocalStorage<boolean>('zenpanel.rightpanel.open', false);
  const [rightPanelPinned, setRightPanelPinned] = useLocalStorage<boolean>('zenpanel.rightpanel.pinned', false);
  const { info, connected } = usePanel();
  const location = useLocation();
  const current = ALL_NAV.find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)));

  useEffect(() => {
    document.title = current ? `${current.label} · ZenPanel` : 'ZenPanel';
  }, [current]);

  const showDock = mode === 'cli' && location.pathname !== '/terminal';

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800/80 bg-ink-950/70 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-slate-800 bg-ink-950">
            <button className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" onClick={() => setMobileOpen(false)} aria-label="Đóng menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1.5 border-b border-slate-800/80 bg-ink-950/70 px-2.5 backdrop-blur-xl sm:gap-2.5 sm:px-6">
          <button className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Mở menu">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white">{current?.label ?? 'ZenPanel'}</div>
            <div className="hidden truncate text-xs text-slate-500 sm:block">{current?.description}</div>
          </div>
          <PublicIpChip onOpenDoctor={() => setDoctorOpen(true)} />
          <TunnelChip />
          {info && (
            <span className="hidden items-center gap-1.5 rounded-xl border border-slate-700/60 bg-ink-950/70 px-3 py-1.5 text-xs font-semibold text-slate-300 md:flex">
              {info.os.family === 'windows' ? '🪟' : '🐧'} {info.os.family === 'windows' ? 'Windows' : 'Linux'}
            </span>
          )}
          <span className="hidden sm:flex items-center" data-tip={connected ? 'Realtime đang kết nối' : 'Mất kết nối realtime'}>
            <StatusDot tone={connected ? 'green' : 'red'} pulse={connected} />
          </span>
          <div className="hidden md:flex">
            <ModeToggle mode={mode} onChange={setMode} />
          </div>
          <button
            onClick={() => setDoctorOpen(true)}
            className="rounded-lg p-1.5 sm:p-2 text-slate-400 transition hover:bg-slate-800 hover:text-emerald-400"
            data-tip="Bác Sĩ VPS & Tương thích đa nền tảng (VPS Doctor)"
            aria-label="Bác Sĩ VPS"
          >
            <HeartPulse className="size-5" />
          </button>
          <button
            onClick={() => setNotepadOpen(true)}
            className="hidden sm:flex rounded-lg p-1.5 sm:p-2 text-slate-400 transition hover:bg-slate-800 hover:text-amber-400"
            data-tip="Ghi chú máy chủ (Server Notepad)"
            aria-label="Ghi chú máy chủ"
          >
            <StickyNote className="size-5" />
          </button>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className={cn(
              'rounded-lg p-1.5 sm:p-2 transition',
              rightPanelOpen
                ? 'bg-zen-blue/20 text-blue-300 ring-1 ring-zen-blue/40'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white',
            )}
            data-tip="Kho tính năng & Tiện ích nhanh (Panel bên phải)"
            aria-label="Kho tính năng"
          >
            <Wrench className="size-5" />
          </button>
          <ThemePicker />
          <JobsButton />
          <button
            onClick={() => void logout()}
            className="rounded-lg p-1.5 sm:p-2 text-slate-400 transition hover:bg-slate-800 hover:text-zen-red"
            data-tip="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="size-5" />
          </button>
        </header>

        <ServerNotepadModal open={notepadOpen} onClose={() => setNotepadOpen(false)} />
        <VpsDoctorModal open={doctorOpen} onClose={() => setDoctorOpen(false)} />

        <UpdateBanner />
        <ExpiryBanner />

        {!rightPanelOpen && (
          <button
            onClick={() => setRightPanelOpen(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-30 hidden sm:flex flex-col items-center gap-1.5 rounded-l-xl border border-r-0 border-slate-700/80 bg-ink-950/90 py-3 px-1.5 shadow-2xl backdrop-blur-md transition hover:bg-slate-800 text-slate-400 group"
            data-tip="Mở Kho Tính Năng (Panel phải)"
            aria-label="Mở Kho Tính Năng"
          >
            <Wrench className="size-3.5 text-amber-400 transition group-hover:rotate-45" />
            <span className="text-[10px] font-bold uppercase [writing-mode:vertical-rl] tracking-widest text-slate-400 group-hover:text-slate-200">
              Tiện Ích
            </span>
          </button>
        )}

        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full min-w-0 max-w-[1600px] p-3 sm:p-6">{children}</div>
          </main>

          <RightUtilityPanel
            open={rightPanelOpen}
            onClose={() => setRightPanelOpen(false)}
            onOpenDoctor={() => setDoctorOpen(true)}
            pinned={rightPanelPinned}
            onTogglePin={() => setRightPanelPinned(!rightPanelPinned)}
          />
        </div>

        {showDock && (
          <div className="shrink-0 border-t border-slate-800 bg-ink-950/90 p-3">
            <WindowMockup
              title="Zen CLI"
              className={cn(dockOpen ? 'h-[38vh]' : 'h-auto')}
              actions={
                <button onClick={() => setDockOpen(!dockOpen)} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" data-tip={dockOpen ? 'Thu gọn' : 'Mở rộng'}>
                  <ChevronDown className={cn('size-4 transition', !dockOpen && 'rotate-180')} />
                </button>
              }
            >
              {dockOpen && <TerminalPanel className="relative h-full" />}
            </WindowMockup>
          </div>
        )}
      </div>
    </div>
  );
}
