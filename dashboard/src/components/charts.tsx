// ZenPanel - Biểu đồ SVG nhẹ cho metrics realtime (không cần thư viện chart)
import { useId } from 'react';
import { levelColor } from '../lib/format';
import { cn } from './ui';

const COLORS = { blue: '#3B82F6', green: '#10B981', amber: '#F59E0B', red: '#EF4444', violet: '#8B5CF6', cyan: '#06B6D4' };
export type ChartColor = keyof typeof COLORS;

interface Series {
  values: number[];
  color: ChartColor;
  label?: string;
}

/** Biểu đồ vùng nhiều chuỗi; max mặc định là giá trị lớn nhất (hoặc 100 cho %) */
export function AreaChart({ series, max, height = 120, className }: { series: Series[]; max?: number; height?: number; className?: string }) {
  const id = useId();
  const width = 300;
  const length = Math.max(2, ...series.map((s) => s.values.length));
  const top = max ?? Math.max(1, ...series.flatMap((s) => s.values)) * 1.15;

  const path = (values: number[]) => {
    const padded = [...Array(Math.max(0, length - values.length)).fill(values[0] ?? 0), ...values];
    return padded.map((v, i) => `${(i / (length - 1)) * width},${height - (Math.min(v, top) / top) * height}`);
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn('w-full', className)} style={{ height, width: '100%' }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke="rgb(51 65 85 / 0.35)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      ))}
      {series.map((s, index) => {
        const points = path(s.values);
        const gradient = `${id}-${index}`;
        return (
          <g key={index}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[s.color]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS[s.color]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={`url(#${gradient})`} />
            <polyline points={points.join(' ')} fill="none" stroke={COLORS[s.color]} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

/** Vòng tròn phần trăm kiểu đồng hồ - Tối ưu responsive trên màn hình mobile nhỏ */
export function RingGauge({ value, size, label, sublabel }: { value: number; size?: number; label: string; sublabel?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 9;
  const viewBoxSize = 100;
  const radius = (viewBoxSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = COLORS[levelColor(pct)];
  return (
    <div
      className="relative inline-flex items-center justify-center size-20 xs:size-24 sm:size-[104px]"
      style={size ? { maxWidth: size, maxHeight: size } : undefined}
    >
      <svg viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} className="-rotate-90 size-full">
        <circle cx={viewBoxSize / 2} cy={viewBoxSize / 2} r={radius} fill="none" stroke="rgb(30 41 59)" strokeWidth={stroke} />
        <circle
          cx={viewBoxSize / 2}
          cy={viewBoxSize / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.7s ease, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1">
        <div className="text-base xs:text-lg sm:text-xl font-extrabold text-white leading-none">{label}</div>
        {sublabel && <div className="mt-0.5 text-[9px] sm:text-[10px] font-medium uppercase tracking-wider text-slate-400">{sublabel}</div>}
      </div>
    </div>
  );
}

/** Lưới ô nhỏ thể hiện tải từng nhân CPU - Tự co giãn theo số nhân và màn hình */
export function CoreGrid({ cores }: { cores: number[] }) {
  const n = cores.length;
  const colsClass =
    n <= 4
      ? 'grid-cols-4'
      : n <= 8
        ? 'grid-cols-4 sm:grid-cols-8'
        : n <= 16
          ? 'grid-cols-6 sm:grid-cols-8 md:grid-cols-16'
          : 'grid-cols-8 sm:grid-cols-12 md:grid-cols-16';

  return (
    <div className={cn('grid gap-1.5 sm:gap-2', colsClass)}>
      {cores.map((value, i) => (
        <div key={i} className="group relative h-8 sm:h-9 overflow-hidden rounded-md bg-slate-800" data-tip={`Core ${i}: ${value.toFixed(0)}%`}>
          <div className="absolute inset-x-0 bottom-0 transition-all duration-700" style={{ height: `${value}%`, background: COLORS[levelColor(value)] }} />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] font-mono font-medium text-slate-300 drop-shadow">
            {value.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}
