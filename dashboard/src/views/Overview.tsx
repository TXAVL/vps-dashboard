// ZenPanel - Tổng quan máy chủ: CPU, RAM, Disk, Network realtime
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Clock, Cloud, Cpu, Gauge, HardDrive, Info, MemoryStick, Network, ShieldAlert } from 'lucide-react';
import { AreaChart, CoreGrid, RingGauge } from '../components/charts';
import { Badge, Card, CopyButton, Notice, PageHeader, ResourceBar, Spinner } from '../components/ui';
import { ALL_NAV } from '../components/layout/nav';
import { formatBytes, formatDuration, formatPercent, formatRate } from '../lib/format';
import { usePanel } from '../lib/panel';

function StatTile({ title, icon: Icon, children, footer }: { title: string; icon: typeof Cpu; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-3 p-5">
      <div className="flex w-full items-center gap-2 text-sm font-bold text-slate-300">
        <Icon className="size-4 text-zen-blue" />
        {title}
      </div>
      {children}
      <div className="mono w-full truncate text-center text-xs text-slate-400">{footer}</div>
    </div>
  );
}

export default function Overview() {
  const { info, latest, history, tunnel } = usePanel();
  if (!latest || !info) return <Spinner label="Đang thu thập chỉ số máy chủ..." />;

  const memPct = (latest.memory.used / latest.memory.total) * 100;
  const mainDisk = [...latest.disks].sort((a, b) => b.total - a.total)[0];
  const diskPct = mainDisk ? (mainDisk.used / mainDisk.total) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Tổng quan máy chủ"
        description={`${info.os.hostname} · ${info.os.name} · ${info.os.arch}`}
        icon={Gauge}
        actions={<Badge tone="green">Uptime {formatDuration(latest.uptime)}</Badge>}
      />

      {!info.os.isAdmin && (
        <div className="mb-6">
          <Notice tone="amber" icon={ShieldAlert}>
            Agent đang chạy <b>không có quyền {info.os.family === 'windows' ? 'Administrator' : 'root'}</b>. Một số chức năng (dịch vụ, tường lửa, web server) sẽ bị từ
            chối. Hãy chạy lại agent với quyền quản trị.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile title="CPU" icon={Cpu} footer={`${info.os.cpuCores} nhân${latest.load ? ` · load ${latest.load.map((l) => l.toFixed(2)).join(' ')}` : ''}`}>
          <RingGauge value={latest.cpu.usage} label={formatPercent(latest.cpu.usage, 0)} sublabel="đang dùng" />
        </StatTile>
        <StatTile title="RAM" icon={MemoryStick} footer={`${formatBytes(latest.memory.used)} / ${formatBytes(latest.memory.total)}`}>
          <RingGauge value={memPct} label={formatPercent(memPct, 0)} sublabel="đang dùng" />
        </StatTile>
        <StatTile title="Ổ đĩa" icon={HardDrive} footer={mainDisk ? `${mainDisk.mount} · ${formatBytes(mainDisk.used)} / ${formatBytes(mainDisk.total)}` : '—'}>
          <RingGauge value={diskPct} label={formatPercent(diskPct, 0)} sublabel="đã dùng" />
        </StatTile>
        <StatTile title="Mạng" icon={Network} footer={`Tổng ↓ ${formatBytes(latest.network.rxTotal)} · ↑ ${formatBytes(latest.network.txTotal)}`}>
          <div className="flex h-28 flex-col justify-center gap-3">
            <div className="flex items-center gap-2 text-lg font-extrabold text-white">
              <ArrowDown className="size-5 text-zen-green" />
              {formatRate(latest.network.rxRate)}
            </div>
            <div className="flex items-center gap-2 text-lg font-extrabold text-white">
              <ArrowUp className="size-5 text-zen-blue" />
              {formatRate(latest.network.txRate)}
            </div>
          </div>
        </StatTile>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="CPU & RAM (3 phút gần nhất)" icon={Cpu} actions={<Legend items={[['blue', 'CPU'], ['green', 'RAM']]} />}>
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
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Tải từng nhân CPU" icon={Cpu} className="xl:col-span-2">
          <CoreGrid cores={latest.cpu.perCore} />
          <p className="mt-3 truncate text-xs text-slate-500">{info.os.cpuModel}</p>
        </Card>
        <Card title="Truy cập panel" icon={Cloud}>
          <div className="space-y-3 text-sm">
            <AccessRow label="Cloudflare Tunnel" value={tunnel?.status === 'online' ? tunnel.url : null} fallback={tunnel?.status === 'starting' ? 'Đang mở...' : 'Không hoạt động'} />
            <AccessRow label="Cổng panel" value={`${window.location.hostname}:${info.port}`} />
            <p className="text-xs text-slate-500">Domain trycloudflare.com đổi mỗi lần khởi động lại agent.</p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Phân vùng ổ đĩa" icon={HardDrive} className="xl:col-span-2">
          <div className="space-y-4">
            {latest.disks.map((disk) => (
              <ResourceBar
                key={disk.mount}
                label={`${disk.mount}`}
                value={(disk.used / disk.total) * 100}
                detail={`${formatBytes(disk.used)} / ${formatBytes(disk.total)} · ${disk.fs}`}
              />
            ))}
          </div>
        </Card>
        <Card title="Thông tin hệ thống" icon={Info}>
          <dl className="space-y-2.5 text-sm">
            {[
              ['Hệ điều hành', info.os.name],
              ['Kernel', info.os.kernel],
              ['Kiến trúc', info.os.arch],
              ['RAM', formatBytes(info.os.totalMemory)],
              ['ZenPanel Agent', `v${info.version} · chạy ${formatDuration(info.agentUptime)}`],
              ['Quyền', info.os.isAdmin ? 'Quản trị viên' : 'Người dùng thường'],
            ].map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4">
                <dt className="text-slate-500">{key}</dt>
                <dd className="truncate text-right font-medium text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
        <Clock className="size-4" /> Truy cập nhanh
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ALL_NAV.filter((n) => n.to !== '/').map(({ to, label, icon: Icon, description }) => (
          <Link key={to} to={to} className="glass group p-4 transition hover:-translate-y-0.5 hover:border-zen-blue/50">
            <Icon className="mb-2 size-5 text-zen-blue transition group-hover:scale-110" />
            <div className="text-sm font-bold text-white">{label}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{description}</div>
          </Link>
        ))}
      </div>
    </>
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

function AccessRow({ label, value, fallback }: { label: string; value: string | null; fallback?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-ink-950/60 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      {value ? (
        <div className="flex items-center justify-between gap-2">
          <span className="mono truncate text-slate-200">{value}</span>
          <CopyButton value={value} />
        </div>
      ) : (
        <div className="text-slate-400">{fallback}</div>
      )}
    </div>
  );
}
