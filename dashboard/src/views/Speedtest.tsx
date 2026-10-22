// ZenPanel - Speedtest thật từ VPS tới Cloudflare toàn cầu (Thiết kế phong cách Speedtest.org)
// Tối ưu chuyển động kim đồng hồ 60fps cực mượt, tăng dần ngay khi bắt đầu và chống giật/rớt về 0
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Gauge,
  Globe,
  History,
  MapPin,
  Play,
  RotateCcw,
  Server,
  Sparkles,
  Timer,
  Wifi,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, PageHeader, Progress, cn, td, th, tr } from '../components/ui';
import { get, post } from '../lib/api';
import { formatDate, formatRate } from '../lib/format';
import { usePanel } from '../lib/panel';
import type { SpeedResult, SpeedState } from '../lib/types';

const PHASE_LABEL: Record<SpeedState['phase'], string> = {
  idle: 'Sẵn sàng đo',
  meta: 'Đang kết nối Cloudflare...',
  ping: 'Đang đo độ trễ (Ping)...',
  download: 'Đang đo Tải xuống (Download)...',
  upload: 'Đang đo Tải lên (Upload)...',
  done: 'Đo hoàn tất',
  error: 'Có lỗi xảy ra',
};

// Thang chia vạch phi tuyến tính chuẩn như Speedtest.org (giúp cả 1 Mbps lẫn 1000 Mbps hiển thị cân đối)
const SCALE_TICKS = [
  { val: 0, label: '0' },
  { val: 1, label: '1' },
  { val: 5, label: '5' },
  { val: 20, label: '20' },
  { val: 50, label: '50' },
  { val: 100, label: '100' },
  { val: 250, label: '250' },
  { val: 500, label: '500' },
  { val: 1000, label: '1G' },
];

function speedToAngle(mbps: number): number {
  if (mbps <= 0) return -120;
  let pct = 0;
  if (mbps <= 1) {
    pct = (mbps / 1) * 0.08;
  } else if (mbps <= 5) {
    pct = 0.08 + ((mbps - 1) / 4) * 0.12;
  } else if (mbps <= 20) {
    pct = 0.20 + ((mbps - 5) / 15) * 0.15;
  } else if (mbps <= 50) {
    pct = 0.35 + ((mbps - 20) / 30) * 0.15;
  } else if (mbps <= 100) {
    pct = 0.50 + ((mbps - 50) / 50) * 0.15;
  } else if (mbps <= 250) {
    pct = 0.65 + ((mbps - 100) / 150) * 0.12;
  } else if (mbps <= 500) {
    pct = 0.77 + ((mbps - 250) / 250) * 0.11;
  } else if (mbps <= 1000) {
    pct = 0.88 + ((mbps - 500) / 500) * 0.12;
  } else {
    pct = 1;
  }
  return -120 + Math.min(1, pct) * 240;
}

/** Đồng hồ đo tốc độ cao cấp phong cách Speedtest.org */
function SpeedometerGauge({
  value,
  phase,
  running,
  unit,
  onStart,
}: {
  value: number;
  phase: SpeedState['phase'];
  running: boolean;
  unit: 'bytes' | 'bits';
  onStart: () => void;
}) {
  const mbps = (value * 8) / 1_000_000;
  const angle = speedToAngle(mbps);

  // Tâm và bán kính của đồng hồ
  const cx = 150;
  const cy = 150;
  const r = 110;

  // Tính toạ độ cung tròn
  const pointOnCircle = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };

  const createArc = (fromDeg: number, toDeg: number, radius: number) => {
    const [x1, y1] = pointOnCircle(fromDeg, radius);
    const [x2, y2] = pointOnCircle(toDeg, radius);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  // Tính toạ độ đầu kim
  const [needleX, needleY] = pointOnCircle(angle, 92);
  const [needleBaseL_X, needleBaseL_Y] = pointOnCircle(angle - 90, 6);
  const [needleBaseR_X, needleBaseR_Y] = pointOnCircle(angle + 90, 6);

  const phaseColor =
    phase === 'download'
      ? 'text-emerald-400'
      : phase === 'upload'
      ? 'text-amber-400'
      : phase === 'ping'
      ? 'text-cyan-400'
      : 'text-blue-400';

  return (
    <div className="relative mx-auto flex w-full max-w-[360px] flex-col items-center select-none">
      <svg viewBox="0 0 300 270" className="w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]">
        <defs>
          {/* Gradient màu dải đo chuẩn Ookla/Speedtest */}
          <linearGradient id="speedArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="35%" stopColor="#10B981" />
            <stop offset="70%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>

          {/* Hiệu ứng phát sáng neon */}
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Kim đồng hồ gradient */}
          <linearGradient id="needleGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        {/* Vòng nền mờ phía sau */}
        <path
          d={createArc(-120, 120, r)}
          fill="none"
          stroke="rgba(30, 41, 59, 0.7)"
          strokeWidth={14}
          strokeLinecap="round"
        />

        {/* Các vạch chia độ và số vạch đo */}
        {SCALE_TICKS.map((t) => {
          const a = speedToAngle(t.val);
          const [xInner, yInner] = pointOnCircle(a, r - 12);
          const [xOuter, yOuter] = pointOnCircle(a, r + 2);
          const [xText, yText] = pointOnCircle(a, r - 26);
          const isActive = a <= angle;
          return (
            <g key={t.val}>
              <line
                x1={xInner}
                y1={yInner}
                x2={xOuter}
                y2={yOuter}
                stroke={isActive ? 'rgba(56, 189, 248, 0.9)' : 'rgba(71, 85, 105, 0.6)'}
                strokeWidth={t.val === 0 || t.val === 100 || t.val === 1000 ? 2.5 : 1.5}
                strokeLinecap="round"
              />
              <text
                x={xText}
                y={yText + 4}
                textAnchor="middle"
                fontSize={9}
                fontFamily="'JetBrains Mono', Consolas, monospace"
                fontWeight="bold"
                fill={isActive ? '#38BDF8' : '#64748B'}
              >
                {t.label}
              </text>
            </g>
          );
        })}

        {/* Cung tốc độ phát sáng đang hoạt động */}
        {angle > -120 && (
          <path
            d={createArc(-120, angle, r)}
            fill="none"
            stroke="url(#speedArcGrad)"
            strokeWidth={14}
            strokeLinecap="round"
            filter="url(#neonGlow)"
          />
        )}

        {/* Đốm sáng đỉnh cung */}
        {angle > -120 && (
          <circle
            cx={pointOnCircle(angle, r)[0]}
            cy={pointOnCircle(angle, r)[1]}
            r={5}
            fill="#FFFFFF"
            filter="url(#neonGlow)"
          />
        )}

        {/* Kim đồng hồ dạng mũi nhọn khí động học (chuyển động siêu mượt) */}
        <polygon
          points={`${needleBaseL_X},${needleBaseL_Y} ${needleX},${needleY} ${needleBaseR_X},${needleBaseR_Y} ${cx},${cy + 4}`}
          fill="url(#needleGrad)"
          filter="url(#neonGlow)"
        />

        {/* Trục kim trung tâm */}
        <circle cx={cx} cy={cy} r={10} fill="#0A0E17" stroke="#38BDF8" strokeWidth={2.5} />
        <circle cx={cx} cy={cy} r={4} fill="#FFFFFF" />
      </svg>

      {/* Nút GO kiểu Speedtest.org khi rảnh rỗi hoặc Bộ đọc số lớn khi đang chạy */}
      <div className="absolute inset-x-0 bottom-4 text-center">
        {!running && phase === 'idle' ? (
          <button
            onClick={onStart}
            className="group relative inline-flex items-center justify-center rounded-full transition-transform active:scale-95"
          >
            {/* Vòng xung điện radar toả ra */}
            <span className="absolute -inset-3 rounded-full bg-zen-blue/20 animate-ping opacity-75" />
            <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 opacity-60 blur" />
            <div className="relative flex size-20 items-center justify-center rounded-full border-2 border-cyan-400 bg-ink-950/90 text-white shadow-2xl transition group-hover:scale-105 group-hover:border-white">
              <span className="text-xl font-black tracking-widest text-cyan-300 group-hover:text-white">GO</span>
            </div>
          </button>
        ) : (
          <div className="space-y-0.5 animate-fade-in">
            <div className="font-mono text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-4xl">
              {formatRate(value, unit)}
            </div>
            <div className={cn('text-xs font-bold uppercase tracking-wider', phaseColor)}>
              {PHASE_LABEL[phase]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Biểu đồ sóng tốc độ thời gian thực dạng Area Curve giống Speedtest.org */
function LiveWaveGraph({ samples, maxSpeed }: { samples: number[]; maxSpeed: number }) {
  if (samples.length < 2) return null;
  const width = 320;
  const height = 48;
  const max = Math.max(maxSpeed, ...samples, 100_000);

  const points = samples.map((s, i) => {
    const x = (i / (samples.length - 1)) * width;
    const y = height - (s / max) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

  return (
    <div className="mx-auto mt-2 w-full max-w-[320px] overflow-hidden rounded-xl border border-slate-800 bg-ink-950/50 p-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10 overflow-visible">
        <defs>
          <linearGradient id="waveFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#waveFillGrad)" />
        <path d={linePath} fill="none" stroke="#22D3EE" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between px-2 text-[10px] text-slate-500 font-mono">
        <span>Bắt đầu</span>
        <span className="text-cyan-400 font-semibold">Biểu đồ đường truyền thời gian thực</span>
        <span>Hiện tại</span>
      </div>
    </div>
  );
}

/** Thẻ chỉ số đo phong cách Speedtest.org */
function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  active,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub?: string;
  active?: boolean;
  tone: 'blue' | 'violet' | 'green' | 'amber';
}) {
  const borderStyles = {
    blue: active ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)] bg-cyan-950/30' : 'border-slate-800/80 bg-ink-950/70',
    violet: active ? 'border-violet-400 shadow-[0_0_15px_rgba(168,85,247,0.3)] bg-violet-950/30' : 'border-slate-800/80 bg-ink-950/70',
    green: active ? 'border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-950/30' : 'border-slate-800/80 bg-ink-950/70',
    amber: active ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-amber-950/30' : 'border-slate-800/80 bg-ink-950/70',
  };

  const textColors = {
    blue: 'text-cyan-400',
    violet: 'text-violet-400',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  return (
    <div className={cn('relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-300', borderStyles[tone])}>
      {active && (
        <span className="absolute right-3 top-3 flex size-2">
          <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-75', tone === 'green' ? 'bg-emerald-400' : 'bg-amber-400')} />
          <span className={cn('relative inline-flex size-2 rounded-full', tone === 'green' ? 'bg-emerald-500' : 'bg-amber-500')} />
        </span>
      )}
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Icon className={cn('size-4', textColors[tone])} />
        <span>{label}</span>
      </div>
      <div className="my-2">
        <div className={cn('font-mono text-2xl font-black text-white sm:text-3xl', value === '—' && 'text-slate-600')}>
          {value}
        </div>
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function Speedtest() {
  const { prefs } = usePanel();
  const [state, setState] = useState<SpeedState | null>(null);
  const [history, setHistory] = useState<SpeedResult[]>([]);
  const { run } = useFeedback();
  const unit = prefs.networkUnit;

  // Trạng thái hoạt họa kim đồng hồ siêu mượt 60fps
  const [smoothSpeed, setSmoothSpeed] = useState(0);
  const currentSpeedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const lastValidSpeedRef = useRef(0);

  // Mẫu sóng biểu đồ thời gian thực
  const [waveSamples, setWaveSamples] = useState<number[]>([]);
  const waveTimerRef = useRef<number | null>(null);

  // Polling kết quả đo từ backend
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await get<{ state: SpeedState; history: SpeedResult[] }>('/api/speedtest').catch(() => null);
      if (stop || !res) return;
      setState(res.state);
      setHistory(res.history);
      setTimeout(() => void tick(), res.state.running ? 250 : 3000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, []);

  // Cập nhật targetSpeed dựa theo phase để KHÔNG BAO GIỜ bị nhảy về 0
  useEffect(() => {
    if (!state) return;

    if (state.running) {
      if (state.phase === 'download' || state.phase === 'upload') {
        const live = state.liveSpeed;
        if (live > 0) {
          targetSpeedRef.current = live;
          lastValidSpeedRef.current = live;
        } else if (lastValidSpeedRef.current > 0) {
          // Nếu backend tạm ngắt quãng gói tin, không nhảy về 0 mà giữ tốc độ đang có
          targetSpeedRef.current = lastValidSpeedRef.current;
        }
      }
    } else {
      // Khi đã hoàn tất bài đo: giữ nguyên giá trị tải xuống lần đo vừa xong
      if (state.last?.download) {
        targetSpeedRef.current = state.last.download;
      }
    }
  }, [state?.running, state?.phase, state?.liveSpeed, state?.last]);

  // Vòng lặp hoạt họa requestAnimationFrame 60fps
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      let target = targetSpeedRef.current;

      // Khi vừa bấm "Bắt đầu đo" (giai đoạn meta/ping):
      // Nhích kim đồng hồ tăng dần nhẹ (revving up) tạo cảm giác động cơ bắt đầu chạy
      if (state?.running) {
        if (state.phase === 'meta' || state.phase === 'ping') {
          const progress = state.progress || 0.1;
          // Tăng dần nhẹ nhàng từ 5 Mbps lên 25 Mbps
          target = (progress * 20_000_000 + 5_000_000);
        }
      }

      // Nội suy lerp mượt mà
      const smoothingFactor = state?.running ? 8.5 : 5.0;
      const diff = target - currentSpeedRef.current;
      currentSpeedRef.current += diff * Math.min(1, dt * smoothingFactor);

      // Ngăn số âm
      if (currentSpeedRef.current < 0) currentSpeedRef.current = 0;

      setSmoothSpeed(currentSpeedRef.current);
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [state?.running, state?.phase, state?.progress]);

  // Ghi nhận mẫu cho biểu đồ sóng real-time
  useEffect(() => {
    if (state?.running && (state.phase === 'download' || state.phase === 'upload')) {
      if (!waveTimerRef.current) {
        waveTimerRef.current = window.setInterval(() => {
          if (currentSpeedRef.current > 0) {
            setWaveSamples((prev) => [...prev.slice(-35), currentSpeedRef.current]);
          }
        }, 200);
      }
    } else if (!state?.running) {
      if (waveTimerRef.current) {
        clearInterval(waveTimerRef.current);
        waveTimerRef.current = null;
      }
    }
    return () => {
      if (waveTimerRef.current) {
        clearInterval(waveTimerRef.current);
        waveTimerRef.current = null;
      }
    };
  }, [state?.running, state?.phase]);

  const start = async () => {
    setWaveSamples([]);
    currentSpeedRef.current = 0;
    lastValidSpeedRef.current = 0;
    targetSpeedRef.current = 5_000_000; // Tăng dần ngay từ lúc kích hoạt
    const next = await run(() => post<SpeedState>('/api/speedtest'));
    if (next) setState(next);
  };

  const running = Boolean(state?.running);
  const currentPhase = state?.phase ?? 'idle';
  const last = state?.last;

  const pingVal = (running ? state?.pingMs : last?.pingMs);
  const jitterVal = (running ? state?.jitterMs : last?.jitterMs);
  const downVal = (running ? state?.download : last?.download);
  const upVal = (running ? state?.upload : last?.upload);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Speedtest"
        description="Đo kiểm băng thông thực tế từ máy chủ VPS tới mạng Cloudflare toàn cầu"
        icon={Gauge}
        actions={
          <Button
            variant="primary"
            icon={running ? RotateCcw : Play}
            loading={running}
            onClick={() => void start()}
          >
            {running ? 'Đang thực hiện đo...' : 'Bắt đầu đo lại'}
          </Button>
        }
      />

      {/* 4 Thẻ chỉ số chính phong cách Speedtest.org */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Timer}
          label="Ping"
          value={pingVal != null ? `${pingVal.toFixed(1)} ms` : '—'}
          sub="Độ trễ tới máy chủ"
          active={running && currentPhase === 'ping'}
          tone="blue"
        />
        <MetricCard
          icon={Wifi}
          label="Jitter"
          value={jitterVal != null ? `${jitterVal.toFixed(1)} ms` : '—'}
          sub="Độ ổn định đường truyền"
          active={running && currentPhase === 'ping'}
          tone="violet"
        />
        <MetricCard
          icon={ArrowDown}
          label="Tải xuống (Download)"
          value={downVal != null ? formatRate(downVal, unit) : '—'}
          sub="Tốc độ nhận dữ liệu"
          active={running && currentPhase === 'download'}
          tone="green"
        />
        <MetricCard
          icon={ArrowUp}
          label="Tải lên (Upload)"
          value={upVal != null ? formatRate(upVal, unit) : '—'}
          sub="Tốc độ gửi dữ liệu"
          active={running && currentPhase === 'upload'}
          tone="amber"
        />
      </div>

      {/* Khung trung tâm: Đồng hồ đo Speedometer & Thông tin máy chủ */}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* Đồng hồ kim tốc độ lớn */}
        <Card className="flex flex-col items-center justify-center p-6 text-center">
          <SpeedometerGauge
            value={smoothSpeed}
            phase={currentPhase}
            running={running}
            unit={unit}
            onStart={() => void start()}
          />

          {/* Biểu đồ sóng thời gian thực dưới đồng hồ */}
          {running && waveSamples.length > 2 && (
            <LiveWaveGraph samples={waveSamples} maxSpeed={Math.max(...waveSamples)} />
          )}

          {/* Thanh tiến trình phần trăm */}
          {running && (
            <div className="mt-5 w-full max-w-md space-y-1.5 animate-fade-in">
              <div className="flex justify-between text-xs text-slate-400">
                <span className="font-semibold">{PHASE_LABEL[currentPhase]}</span>
                <span className="font-mono font-bold text-cyan-400">
                  {Math.round((state?.progress ?? 0) * 100)}%
                </span>
              </div>
              <Progress value={(state?.progress ?? 0) * 100} tone="blue" />
            </div>
          )}

          {state?.error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              {state.error}
            </div>
          )}
        </Card>

        {/* Thông tin kết nối và mạng ISP */}
        <div className="space-y-4">
          <Card title="Thông tin máy chủ & Mạng" icon={Server}>
            {last ? (
              <dl className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-xs">
                    <Server className="size-3.5 text-cyan-400" /> Máy chủ đo
                  </dt>
                  <dd className="font-semibold text-white text-right">
                    Cloudflare {last.server.colo} {last.server.city ? `(${last.server.city})` : ''}
                  </dd>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-xs">
                    <Globe className="size-3.5 text-blue-400" /> Quốc gia
                  </dt>
                  <dd className="font-semibold text-slate-200 text-right">{last.server.country || '—'}</dd>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-xs">
                    <Activity className="size-3.5 text-emerald-400" /> IP máy chủ VPS
                  </dt>
                  <dd className="font-mono font-semibold text-emerald-300 text-right">{last.client.ip || '—'}</dd>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-xs">
                    <MapPin className="size-3.5 text-purple-400" /> Nhà mạng / ISP
                  </dt>
                  <dd className="font-semibold text-slate-200 text-right truncate max-w-[200px]" title={last.client.isp}>
                    {last.client.isp || '—'}
                  </dd>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                  <dt>Lần đo gần nhất</dt>
                  <dd>{formatDate(last.at)}</dd>
                </div>
              </dl>
            ) : (
              <div className="py-8 text-center text-sm text-slate-500 space-y-2">
                <Globe className="mx-auto size-8 text-slate-600" />
                <p>Chưa có dữ liệu kiểm tra kết nối.</p>
                <p className="text-xs text-slate-600">Bấm nút "GO" để bắt đầu đo lường.</p>
              </div>
            )}
          </Card>

          <div className="rounded-2xl border border-slate-800/80 bg-ink-950/60 p-4 text-xs text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
              <Sparkles className="size-3.5" />
              <span>Tiêu chuẩn đo Speedtest VPS:</span>
            </div>
            <p>• Đo trực tiếp từ máy chủ VPS ra backbone Cloudflare toàn cầu.</p>
            <p>• Tải xuống 10s và tải lên 8s với 4 luồng song song TCP.</p>
            <p>• Bỏ qua 1 giây đầu (TCP slow-start) để tính toán băng thông thực chính xác nhất.</p>
          </div>
        </div>
      </div>

      {/* Lịch sử các lần đo trước đó */}
      <Card title="Lịch sử đo tốc độ" icon={History} bodyClassName="p-0">
        {history.length === 0 ? (
          <EmptyState icon={History} title="Chưa có lần đo nào" description="Kết quả các lần đo trước sẽ được lưu lại ở đây." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Thời gian</th>
                  <th className={th}>Ping & Jitter</th>
                  <th className={th}>Tải xuống (Download)</th>
                  <th className={th}>Tải lên (Upload)</th>
                  <th className={th}>Máy chủ Cloudflare</th>
                  <th className={th}>IP VPS</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.at} className={tr}>
                    <td className={cn(td, 'text-xs text-slate-400')}>{formatDate(h.at)}</td>
                    <td className={cn(td, 'mono text-slate-200')}>
                      <span className="text-cyan-300 font-semibold">{h.pingMs.toFixed(1)} ms</span>
                      <span className="text-xs text-slate-500 ml-1.5">(±{h.jitterMs.toFixed(1)})</span>
                    </td>
                    <td className={cn(td, 'mono font-bold text-emerald-400')}>
                      {formatRate(h.download, unit)}
                    </td>
                    <td className={cn(td, 'mono font-bold text-amber-400')}>
                      {formatRate(h.upload, unit)}
                    </td>
                    <td className={td}>
                      <Badge tone="blue">Cloudflare {h.server.colo || 'PoP'}</Badge>
                    </td>
                    <td className={cn(td, 'mono text-xs text-slate-400')}>{h.client.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
