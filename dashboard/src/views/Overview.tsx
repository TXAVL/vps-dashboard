// ZenPanel - Tổng quan máy chủ: CPU, RAM, Disk, Network realtime + thông tin chi tiết, hạn VPS, nguồn
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Clock,
  Cloud,
  Cpu,
  ExternalLink,
  Gauge,
  Globe,
  HardDrive,
  Info,
  MemoryStick,
  Network,
  Power,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AreaChart, CoreGrid, RingGauge } from '../components/charts';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, Notice, PageHeader, ResourceBar, Spinner, cn, td, th, tr } from '../components/ui';
import { ALL_NAV } from '../components/layout/nav';
import { post } from '../lib/api';
import { formatBytes, formatDate, formatDuration, formatPercent, formatRate } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useLiveUptime, useNow, usePanel } from '../lib/panel';
import type { NetworkInfo, ProcessInfo } from '../lib/types';

function StatTile({ title, icon: Icon, children, footer }: { title: string; icon: typeof Cpu; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="glass flex min-w-0 flex-col items-center gap-3 p-4 sm:p-5">
      <div className="flex w-full items-center gap-2 text-sm font-bold text-slate-300">
        <Icon className="size-4 text-zen-blue" />
        {title}
      </div>
      {children}
      <div className="mono w-full truncate text-center text-[11px] text-slate-400 sm:text-xs">{footer}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-200">{children}</dd>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  const colors: Record<string, string> = { blue: 'bg-zen-blue', green: 'bg-zen-green', amber: 'bg-zen-amber' };
  return (
    <div className="flex gap-3 text-xs text-slate-400">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${colors[color]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Đếm ngược tới ngày hết hạn VPS (ngày do admin nhập vì nhà cung cấp không công khai cho hệ điều hành) */
function ExpiryCard() {
  const { prefs } = usePanel();
  const now = useNow();
  if (!prefs.vpsExpiry) {
    return (
      <Card title="Hạn sử dụng VPS" icon={CalendarClock}>
        <p className="text-sm text-slate-400">Chưa đặt ngày hết hạn. Nhà cung cấp VPS không công khai thông tin này cho hệ điều hành, hãy nhập ngày theo hoá đơn để ZenPanel đếm ngược và nhắc gia hạn.</p>
        <Link to="/settings?tab=vps" className="mt-3 inline-block">
          <Button size="sm" variant="soft" icon={CalendarClock}>
            Đặt ngày hết hạn
          </Button>
        </Link>
      </Card>
    );
  }
  const end = new Date(`${prefs.vpsExpiry}T23:59:59`).getTime();
  const left = Math.floor((end - now) / 1000);
  const days = Math.floor(left / 86400);
  const tone = left < 0 ? 'red' : days <= prefs.expiryWarnDays ? 'amber' : 'green';
  return (
    <Card title="Hạn sử dụng VPS" icon={CalendarClock} actions={<Badge tone={tone}>{left < 0 ? 'Đã hết hạn' : `${days} ngày`}</Badge>}>
      <div className={cn('text-center text-2xl font-extrabold sm:text-3xl', tone === 'red' ? 'text-zen-red' : tone === 'amber' ? 'text-zen-amber' : 'text-white')}>
        {left < 0 ? `Quá hạn ${formatDuration(-left)}` : formatDuration(left)}
      </div>
      <dl className="mt-3 divide-y divide-slate-700/40 text-sm">
        <Row label="Ngày hết hạn">{formatDate(`${prefs.vpsExpiry}T00:00:00`, false)}</Row>
        {prefs.vpsProvider && <Row label="Nhà cung cấp">{prefs.vpsProvider}</Row>}
        {prefs.vpsPrice && <Row label="Chi phí">{prefs.vpsPrice}</Row>}
      </dl>
      {prefs.vpsRenewUrl && (
        <a href={prefs.vpsRenewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block">
          <Button size="sm" variant={tone === 'green' ? 'soft' : 'primary'} icon={ExternalLink}>
            Gia hạn
          </Button>
        </a>
      )}
    </Card>
  );
}

function PowerCard() {
  const { info } = usePanel();
  const { confirm, run } = useFeedback();
  const [busy, setBusy] = useState(false);

  const act = async (action: 'reboot' | 'shutdown') => {
    const ok = await confirm({
      title: action === 'reboot' ? 'Khởi động lại máy chủ' : 'Tắt máy chủ',
      message:
        action === 'reboot'
          ? 'Mọi website, container và kết nối sẽ gián đoạn trong lúc khởi động lại. ZenPanel tự chạy lại sau khi máy lên (domain trycloudflare sẽ đổi).'
          : 'Máy chủ sẽ tắt hoàn toàn. Bạn chỉ bật lại được từ trang quản lý của nhà cung cấp VPS.',
      danger: true,
      confirmLabel: action === 'reboot' ? 'Khởi động lại' : 'Tắt máy',
      typeToConfirm: info?.os.hostname,
    });
    if (!ok) return;
    setBusy(true);
    await run(() => post('/api/system/power', { action }), action === 'reboot' ? 'Đã gửi lệnh khởi động lại' : 'Đã gửi lệnh tắt máy');
    setBusy(false);
  };

  return (
    <Card title="Nguồn máy chủ" icon={Power}>
      <p className="mb-3 text-sm text-slate-400">Thao tác ảnh hưởng toàn bộ máy chủ, cần gõ lại hostname để xác nhận.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" icon={RotateCcw} loading={busy} onClick={() => void act('reboot')}>
          Khởi động lại
        </Button>
        <Button variant="danger" icon={Power} disabled={busy} onClick={() => void act('shutdown')}>
          Tắt máy
        </Button>
      </div>
    </Card>
  );
}

export default function Overview() {
  const { info, latest, history, tunnel, prefs } = usePanel();
  const uptime = useLiveUptime();
  const network = useApi<NetworkInfo>('/api/system/network');
  const processes = useApi<ProcessInfo[]>('/api/processes', 20_000);
  const unit = prefs.networkUnit;

  const peaks = useMemo(
    () => ({ rx: Math.max(0, ...history.map((h) => h.network.rxRate)), tx: Math.max(0, ...history.map((h) => h.network.txRate)) }),
    [history],
  );
  const top = useMemo(() => ({
    cpu: [...(processes.data ?? [])].sort((a, b) => b.cpu - a.cpu).slice(0, 5),
    mem: [...(processes.data ?? [])].sort((a, b) => b.memory - a.memory).slice(0, 5),
  }), [processes.data]);

  if (!latest || !info) return <Spinner label="Đang thu thập chỉ số máy chủ..." />;

  const memPct = (latest.memory.used / latest.memory.total) * 100;
  const mainDisk = [...latest.disks].sort((a, b) => b.total - a.total)[0];
  const diskPct = mainDisk ? (mainDisk.used / mainDisk.total) * 100 : 0;
  const diskTotal = latest.disks.reduce((sum, d) => sum + d.total, 0);
  const diskUsed = latest.disks.reduce((sum, d) => sum + d.used, 0);
  const bootTime = new Date(latest.time - latest.uptime * 1000).toISOString();
  const externalIfaces = (network.data?.interfaces ?? []).filter((i) => !i.internal);

  return (
    <>
      <PageHeader
        title="Tổng quan máy chủ"
        description={`${info.os.hostname} · ${info.os.name} · ${info.os.arch}`}
        icon={Gauge}
        actions={
          <Badge tone="green" className="mono text-[11px] sm:text-xs">
            <Clock className="size-3.5" /> Uptime {uptime !== null ? formatDuration(uptime) : '—'}
          </Badge>
        }
      />

      {!info.os.isAdmin && (
        <div className="mb-4">
          <Notice tone="amber" icon={ShieldAlert}>
            Agent đang chạy <b>không có quyền {info.os.family === 'windows' ? 'Administrator' : 'root'}</b>. Một số chức năng (dịch vụ, tường lửa, web server) sẽ bị từ chối.
          </Notice>
        </div>
      )}

      {(latest.cpu.usage >= 70 || diskPct >= 85) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zen-amber/40 bg-zen-amber/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-5 shrink-0 text-zen-amber" />
            <span>
              {latest.cpu.usage >= 70 && diskPct >= 85
                ? `CPU đang quá tải (${latest.cpu.usage}%) và ổ đĩa gần đầy (${diskPct}%).`
                : latest.cpu.usage >= 70
                  ? `CPU đang hoạt động ở mức cao (${latest.cpu.usage}%). Hãy kiểm tra tiến trình để hạ tải.`
                  : `Ổ đĩa máy chủ đang sắp đầy (${diskPct}%). Cần dọn dẹp để tránh đầy ổ đĩa (full disk).`}
            </span>
          </div>
          <Link to="/cleanup">
            <Button size="xs" variant="secondary" className="border-amber-400/40 text-amber-100 hover:bg-amber-400/20">
              Vào tab Dọn dẹp ngay →
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile title="CPU" icon={Cpu} footer={`${info.os.cpuCores} nhân${latest.load ? ` · load ${latest.load.map((l) => l.toFixed(2)).join(' ')}` : ''}`}>
          <RingGauge value={latest.cpu.usage} label={formatPercent(latest.cpu.usage, 0)} sublabel="đang dùng" size={104} />
        </StatTile>
        <StatTile title="RAM" icon={MemoryStick} footer={`${formatBytes(latest.memory.used)} / ${formatBytes(latest.memory.total)}`}>
          <RingGauge value={memPct} label={formatPercent(memPct, 0)} sublabel="đang dùng" size={104} />
        </StatTile>
        <StatTile title="Ổ đĩa" icon={HardDrive} footer={mainDisk ? `${mainDisk.mount} · ${formatBytes(mainDisk.used)} / ${formatBytes(mainDisk.total)}` : '—'}>
          <RingGauge value={diskPct} label={formatPercent(diskPct, 0)} sublabel="đã dùng" size={104} />
        </StatTile>
        <StatTile title="Mạng" icon={Network} footer={`Tổng ↓ ${formatBytes(latest.network.rxTotal)} · ↑ ${formatBytes(latest.network.txTotal)}`}>
          <div className="flex h-[104px] w-full flex-col justify-center gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <ArrowDown className="size-4 text-zen-green" /><span className="hidden 2xl:inline">Tải xuống</span>
              </span>
              <span className="mono text-sm font-extrabold text-white sm:text-base">{formatRate(latest.network.rxRate, unit)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <ArrowUp className="size-4 text-zen-blue" /><span className="hidden 2xl:inline">Tải lên</span>
              </span>
              <span className="mono text-sm font-extrabold text-white sm:text-base">{formatRate(latest.network.txRate, unit)}</span>
            </div>
          </div>
        </StatTile>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="CPU & RAM (3 phút gần nhất)" icon={Activity} actions={<Legend items={[['blue', 'CPU'], ['green', 'RAM']]} />}>
          <AreaChart
            max={100}
            height={160}
            series={[
              { values: history.map((h) => h.cpu.usage), color: 'blue' },
              { values: history.map((h) => (h.memory.used / h.memory.total) * 100), color: 'green' },
            ]}
          />
        </Card>
        <Card title="Lưu lượng mạng" icon={Network} actions={<Legend items={[['green', 'Download'], ['amber', 'Upload']]} />}>
          <AreaChart
            height={160}
            series={[
              { values: history.map((h) => h.network.rxRate), color: 'green' },
              { values: history.map((h) => h.network.txRate), color: 'amber' },
            ]}
          />
          <div className="mono mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <span>Đỉnh ↓ {formatRate(peaks.rx, unit)}</span>
            <span className="text-right">Đỉnh ↑ {formatRate(peaks.tx, unit)}</span>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Thông tin chi tiết" icon={Info}>
          <dl className="divide-y divide-slate-700/40 text-sm">
            <Row label="Uptime">
              <span className="mono">{uptime !== null ? formatDuration(uptime) : '—'}</span>
            </Row>
            <Row label="Khởi động lúc">{formatDate(bootTime)}</Row>
            <Row label="Hệ điều hành">{info.os.name}</Row>
            <Row label="Kernel">
              <span className="mono">{info.os.kernel}</span>
            </Row>
            <Row label="CPU">{info.os.cpuModel}</Row>
            <Row label="Số nhân / RAM">{`${info.os.cpuCores} nhân · ${formatBytes(info.os.totalMemory)}`}</Row>
            <Row label="Tổng dung lượng đĩa">{`${formatBytes(diskUsed)} / ${formatBytes(diskTotal)}`}</Row>
            <Row label="Tiến trình">{processes.data ? processes.data.length : '...'}</Row>
            {latest.load && <Row label="Load average">{latest.load.map((l) => l.toFixed(2)).join(' · ')}</Row>}
            <Row label="ZenPanel Agent">{`v${info.version} · chạy ${formatDuration(info.agentUptime)}`}</Row>
          </dl>
        </Card>

        <Card title="Mạng & truy cập" icon={Globe}>
          <div className="space-y-3 text-sm">
            <AccessRow label="IP public (IPv4)" value={network.data?.publicIpv4 ?? null} fallback={network.loading ? 'Đang lấy...' : 'Không xác định'} />
            {network.data?.publicIpv6 && <AccessRow label="IP public (IPv6)" value={network.data.publicIpv6} />}
            <AccessRow label="Cloudflare Tunnel" value={tunnel?.status === 'online' ? tunnel.url : null} fallback={tunnel?.status === 'starting' ? 'Đang mở...' : 'Không hoạt động'} />
            <AccessRow label="Cổng panel" value={`${window.location.hostname}:${info.port}`} />
            {externalIfaces.length > 0 && (
              <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
                <div className="mb-1 text-xs text-slate-500">Card mạng</div>
                {externalIfaces.map((iface) => (
                  <div key={iface.name} className="py-1">
                    <div className="truncate text-xs font-semibold text-slate-300">{iface.name}</div>
                    {iface.addresses.map((a) => (
                      <div key={a.address} className="mono truncate text-xs text-slate-400">
                        {a.cidr ?? a.address}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <ExpiryCard />
          <PowerCard />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TopProcesses title="Top CPU" icon={Zap} rows={top.cpu} metric={(p) => `${p.cpu.toFixed(1)}%`} />
        <TopProcesses title="Top RAM" icon={MemoryStick} rows={top.mem} metric={(p) => formatBytes(p.memory)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Tải từng nhân CPU" icon={Cpu} className="xl:col-span-1">
          <CoreGrid cores={latest.cpu.perCore} />
          <p className="mt-3 truncate text-xs text-slate-500">{info.os.cpuModel}</p>
        </Card>
        <Card title="Phân vùng ổ đĩa" icon={HardDrive} className="xl:col-span-2">
          <div className="space-y-4">
            {latest.disks.map((disk) => (
              <ResourceBar
                key={disk.mount}
                label={disk.mount}
                value={(disk.used / disk.total) * 100}
                detail={`${formatBytes(disk.used)} / ${formatBytes(disk.total)} · còn ${formatBytes(disk.total - disk.used)} · ${disk.fs}`}
              />
            ))}
          </div>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
        <Cloud className="size-4" /> Truy cập nhanh
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ALL_NAV.filter((n) => n.to !== '/').map(({ to, label, icon: Icon, description }) => (
          <Link key={to} to={to} className="glass group min-w-0 p-4 transition hover:-translate-y-0.5 hover:border-zen-blue/50">
            <Icon className="mb-2 size-5 text-zen-blue transition group-hover:scale-110" />
            <div className="truncate text-sm font-bold text-white">{label}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{description}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

function TopProcesses({ title, icon, rows, metric }: { title: string; icon: typeof Cpu; rows: ProcessInfo[]; metric: (p: ProcessInfo) => string }) {
  return (
    <Card
      title={title}
      icon={icon}
      bodyClassName="p-0"
      actions={
        <Link to="/processes" className="text-xs font-semibold text-blue-300 hover:underline">
          Xem tất cả
        </Link>
      }
    >
      {rows.length === 0 ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Tiến trình</th>
                <th className={cn(th, 'text-right')}>PID</th>
                <th className={cn(th, 'text-right')}>Mức dùng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.pid} className={tr}>
                  <td className={cn(td, 'max-w-[220px] truncate font-semibold text-slate-100')}>{p.name}</td>
                  <td className={cn(td, 'mono text-right text-slate-500')}>{p.pid}</td>
                  <td className={cn(td, 'mono text-right text-slate-200')}>{metric(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AccessRow({ label, value, fallback }: { label: string; value: string | null; fallback?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      {value ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="mono truncate text-slate-200">{value}</span>
          <CopyButton value={value} />
        </div>
      ) : (
        <div className="text-slate-400">{fallback}</div>
      )}
    </div>
  );
}
