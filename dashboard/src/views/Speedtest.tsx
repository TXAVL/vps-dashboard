// ZenPanel - Speedtest thật đo từ chính VPS (không phải từ máy bạn) tới mạng Cloudflare
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Gauge, History, MapPin, Play, Timer, Wifi } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Progress, cn, td, th, tr } from '../components/ui';
import { get, post } from '../lib/api';
import { formatDate, formatRate } from '../lib/format';
import { usePanel } from '../lib/panel';
import type { SpeedResult, SpeedState } from '../lib/types';

const PHASE_LABEL: Record<SpeedState['phase'], string> = {
  idle: 'Sẵn sàng',
  meta: 'Đang tìm máy chủ đo...',
  ping: 'Đang đo độ trễ...',
  download: 'Đang đo tải xuống...',
  upload: 'Đang đo tải lên...',
  done: 'Hoàn tất',
  error: 'Lỗi',
};

/** Đồng hồ kim tốc độ (thang log để cả 1 Mbps lẫn 1 Gbps đều nhìn rõ) */
function SpeedDial({ value, label, unit }: { value: number; label: string; unit: 'bytes' | 'bits' }) {
  const mbps = (value * 8) / 1_000_000;
  const pct = mbps <= 0 ? 0 : Math.min(1, Math.log10(mbps + 1) / Math.log10(10_001));
  const angle = -120 + pct * 240;
  const r = 90;
  const arc = (from: number, to: number) => {
    const p = (a: number) => [110 + r * Math.cos(((a - 90) * Math.PI) / 180), 110 + r * Math.sin(((a - 90) * Math.PI) / 180)];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 220 180" className="w-full">
        <path d={arc(-120, 120)} fill="none" stroke="rgb(30 41 59)" strokeWidth={14} strokeLinecap="round" />
        {pct > 0 && <path d={arc(-120, angle)} fill="none" stroke="var(--color-zen-blue)" strokeWidth={14} strokeLinecap="round" style={{ transition: 'all 0.3s' }} />}
        <line x1={110} y1={110} x2={110 + 70 * Math.cos(((angle - 90) * Math.PI) / 180)} y2={110 + 70 * Math.sin(((angle - 90) * Math.PI) / 180)} stroke="white" strokeWidth={3} strokeLinecap="round" style={{ transition: 'all 0.3s' }} />
        <circle cx={110} cy={110} r={6} fill="white" />
      </svg>
      <div className="absolute inset-x-0 bottom-2 text-center">
        <div className="mono text-2xl font-extrabold text-white sm:text-3xl">{formatRate(value, unit)}</div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: string; tone: string }) {
  return (
    <div className="glass flex items-center gap-3 p-4">
      <div className={cn('flex size-10 items-center justify-center rounded-xl', tone)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="mono truncate text-lg font-extrabold text-white">{value}</div>
      </div>
    </div>
  );
}

export default function Speedtest() {
  const { prefs } = usePanel();
  const [state, setState] = useState<SpeedState | null>(null);
  const [history, setHistory] = useState<SpeedResult[]>([]);
  const { run } = useFeedback();
  const unit = prefs.networkUnit;

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await get<{ state: SpeedState; history: SpeedResult[] }>('/api/speedtest').catch(() => null);
      if (stop || !res) return;
      setState(res.state);
      setHistory(res.history);
      setTimeout(() => void tick(), res.state.running ? 400 : 3000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, []);

  const start = async () => {
    const next = await run(() => post<SpeedState>('/api/speedtest'));
    if (next) setState(next);
  };

  const running = Boolean(state?.running);
  const last = state?.last;
  const dialValue = running ? (state?.phase === 'download' || state?.phase === 'upload' ? state.liveSpeed : 0) : (last?.download ?? 0);
  const dialLabel = running ? PHASE_LABEL[state!.phase] : last ? 'Tải xuống (lần đo gần nhất)' : 'Chưa đo';

  return (
    <>
      <PageHeader
        title="Speedtest"
        description="Đo băng thông thật của VPS tới mạng Cloudflare toàn cầu"
        icon={Gauge}
        actions={
          <Button variant="primary" icon={Play} loading={running} onClick={() => void start()}>
            {running ? 'Đang đo...' : 'Bắt đầu đo'}
          </Button>
        }
      />
      <div className="mb-4">
        <Notice>Bài đo chạy trên máy chủ (không phải máy tính của bạn): ping 12 lần, tải xuống 10 giây và tải lên 8 giây với 4 luồng song song. Sẽ tốn khoảng vài trăm MB dữ liệu.</Notice>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Kết quả" icon={Wifi}>
          <SpeedDial value={dialValue} label={dialLabel} unit={unit} />
          {running && (
            <div className="mx-auto mt-4 max-w-md space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>{PHASE_LABEL[state!.phase]}</span>
                <span className="mono">{Math.round((state?.progress ?? 0) * 100)}%</span>
              </div>
              <Progress value={(state?.progress ?? 0) * 100} tone="blue" />
            </div>
          )}
          {state?.error && <p className="mt-4 text-center text-sm text-red-300">{state.error}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Timer} label="Ping" value={(running ? state?.pingMs : last?.pingMs) != null ? `${(running ? state!.pingMs! : last!.pingMs).toFixed(1)} ms` : '—'} tone="bg-zen-blue/15 text-blue-300" />
            <Metric icon={Wifi} label="Jitter" value={(running ? state?.jitterMs : last?.jitterMs) != null ? `${(running ? state!.jitterMs! : last!.jitterMs).toFixed(1)} ms` : '—'} tone="bg-violet-500/15 text-violet-300" />
            <Metric icon={ArrowDown} label="Tải xuống" value={(running ? state?.download : last?.download) != null ? formatRate((running ? state!.download : last!.download)!, unit) : '—'} tone="bg-zen-green/15 text-emerald-300" />
            <Metric icon={ArrowUp} label="Tải lên" value={(running ? state?.upload : last?.upload) != null ? formatRate((running ? state!.upload : last!.upload)!, unit) : '—'} tone="bg-zen-amber/15 text-amber-300" />
          </div>
        </Card>
        <Card title="Thông tin kết nối" icon={MapPin}>
          {last ? (
            <dl className="space-y-3 text-sm">
              {[
                ['Máy chủ đo', `Cloudflare ${last.server.colo}${last.server.city ? ` · ${last.server.city}` : ''}`],
                ['Quốc gia', last.server.country || '—'],
                ['IP của VPS', last.client.ip || '—'],
                ['Nhà mạng / ISP', last.client.isp || '—'],
                ['Đo lúc', formatDate(last.at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Bấm "Bắt đầu đo" để kiểm tra tốc độ mạng của VPS.</p>
          )}
        </Card>
      </div>

      <Card title="Lịch sử đo" icon={History} className="mt-4" bodyClassName="p-0">
        {history.length === 0 ? (
          <EmptyState icon={History} title="Chưa có lần đo nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Thời gian</th>
                  <th className={th}>Ping</th>
                  <th className={th}>Tải xuống</th>
                  <th className={th}>Tải lên</th>
                  <th className={th}>Máy chủ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.at} className={tr}>
                    <td className={cn(td, 'text-xs text-slate-400')}>{formatDate(h.at)}</td>
                    <td className={cn(td, 'mono text-slate-200')}>{h.pingMs.toFixed(1)} ms</td>
                    <td className={cn(td, 'mono text-emerald-300')}>{formatRate(h.download, unit)}</td>
                    <td className={cn(td, 'mono text-amber-300')}>{formatRate(h.upload, unit)}</td>
                    <td className={td}>
                      <Badge>{h.server.colo || '—'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
