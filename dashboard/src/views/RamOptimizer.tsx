// ZenPanel - Tối ưu RAM thật: phân rã bộ nhớ, thu hồi cache / standby, làm mới swap, thu gọn từng tiến trình,
// tham số kernel (swappiness) và tự tối ưu khi vượt ngưỡng. Mọi con số "đã giải phóng" là đo trước / sau.
import { useState } from 'react';
import { Gauge, MemoryStick, RefreshCw, Scissors, Sparkles, Zap } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, Card, Select, Spinner, Toggle, cn } from '../components/ui';
import { post } from '../lib/api';
import { formatBytes, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { Job } from '../lib/types';

interface MemoryView {
  total: number;
  available: number;
  free: number;
  used: number;
  cache: number;
  buffers: number;
  shared: number;
  swapTotal: number;
  swapUsed: number;
  dirty: number;
  tunables: Record<string, string>;
  topProcesses: { pid: number; name: string; memory: number; cpu: number; user: string | null }[];
  canTrimProcess: boolean;
  lastOptimize: { before: number; after: number; freed: number; at: string; auto: boolean } | null;
}

export function RamOptimizer() {
  const mem = useApi<MemoryView>('/api/system/memory', 10_000);
  const { info, prefs, savePrefs } = usePanel();
  const { runJob } = useJobs();
  const { run, toast } = useFeedback();
  const [opts, setOpts] = useState({ dropCache: true, trimWorkingSets: true, resetSwap: false });
  const [trimming, setTrimming] = useState<number | null>(null);
  const windows = info?.os.family === 'windows';

  if (!mem.data) return <Card title="Tối ưu RAM" icon={MemoryStick}><Spinner /></Card>;
  const m = mem.data;
  const pct = (v: number) => (m.total ? (v / m.total) * 100 : 0);
  const appUsed = Math.max(0, m.used - (windows ? 0 : m.shared));
  const segments = [
    { label: 'Ứng dụng', value: appUsed, color: 'bg-sky-500' },
    { label: windows ? 'Standby (cache)' : 'Cache có thể thu hồi', value: m.cache, color: 'bg-indigo-400' },
    { label: windows ? 'File cache hệ thống' : 'Buffers', value: m.buffers, color: 'bg-violet-400' },
    { label: 'Trống thật', value: m.free, color: 'bg-emerald-500/70' },
  ];

  const optimize = async () => {
    await runJob(
      () => post<Job>('/api/system/memory/optimize', opts),
      (job) => {
        const r = job.result as { freed?: number } | undefined;
        if (r && (r.freed ?? 0) > 0) toast(`RAM trống thật tăng thêm ${formatBytes(r.freed ?? 0)}`, 'success');
        else if (r) toast('Không thu hồi thêm được RAM. Có thể thiếu quyền (cần SYSTEM/root) hoặc cache đã sạch, xem log tác vụ.', 'info');
        void mem.reload();
      },
    );
  };

  const trim = async (pid: number, name: string) => {
    setTrimming(pid);
    const r = await run(() => post<{ ok: boolean; before: number; after: number }>(`/api/system/memory/trim/${pid}`));
    setTrimming(null);
    if (r) toast(r.ok ? `${name}: ${formatBytes(r.before)} → ${formatBytes(r.after)}` : `Không thu gọn được ${name}`, r.ok ? 'success' : 'error');
    void mem.reload();
  };

  const tunable = async (key: string, value: number) => {
    await run(() => post('/api/system/memory/tunable', { key, value }), `Đã đặt ${key} = ${value}`);
    void mem.reload();
  };

  return (
    <Card
      title="Tối ưu RAM"
      icon={MemoryStick}
      actions={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void mem.reload()}>Làm mới</Button>}
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500">RAM khả dụng</div>
              <div className="mono text-3xl font-black text-white">{formatBytes(m.available)}</div>
              <div className="text-xs text-slate-500">/ {formatBytes(m.total)} · đang dùng {pct(m.used).toFixed(0)}%</div>
            </div>
            {m.lastOptimize && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-right text-xs">
                <div className="font-bold text-emerald-300">+{formatBytes(m.lastOptimize.freed)}</div>
                <div className="text-slate-500">
                  {m.lastOptimize.auto ? 'tự tối ưu' : 'lần tối ưu cuối'} {formatRelative(m.lastOptimize.at)}
                </div>
              </div>
            )}
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
            {segments.map((s) => (
              <div key={s.label} className={s.color} style={{ width: `${pct(s.value)}%` }} data-tip={`${s.label}: ${formatBytes(s.value)}`} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-sm', s.color)} />
                <span className="text-slate-400">{s.label}</span>
                <span className="mono ml-auto text-slate-200">{formatBytes(s.value)}</span>
              </div>
            ))}
          </div>
          {m.swapTotal > 0 && (
            <div className="text-xs text-slate-400">
              {windows ? 'Pagefile' : 'Swap'}: <span className="mono text-slate-200">{formatBytes(m.swapUsed)}</span> / {formatBytes(m.swapTotal)}
              {m.dirty > 0 && <> · chờ ghi đĩa {formatBytes(m.dirty)}</>}
            </div>
          )}

          <div className="space-y-2 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
            {[
              ['dropCache', windows ? 'Xả Standby list & ghi Modified list' : 'Thu hồi PageCache / dentries / inodes (drop_caches)'],
              ['trimWorkingSets', windows ? 'Thu gọn working set mọi tiến trình' : 'Gom bộ nhớ phân mảnh (compact_memory)'],
              ...(windows ? [] : [['resetSwap', 'Đưa dữ liệu từ swap về RAM (chỉ khi đủ RAM trống)']]),
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" className="accent-zen-blue size-4" checked={opts[key as keyof typeof opts]} onChange={(e) => setOpts({ ...opts, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <Button variant="primary" icon={Zap} className="mt-1" onClick={() => void optimize()}>
              Tối ưu RAM ngay
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-semibold text-slate-100">Tự tối ưu khi RAM cao</span>
                <span className="block text-xs text-slate-500">Agent kiểm tra mỗi phút, chạy nhẹ (chỉ thu hồi cache)</span>
              </span>
              <Toggle checked={prefs.autoRamOptimize} onChange={(v) => void run(() => savePrefs({ autoRamOptimize: v }), v ? 'Đã bật tự tối ưu RAM' : 'Đã tắt tự tối ưu RAM')} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              Khi vượt
              <Select className="h-8 w-24 py-0 text-xs" value={prefs.autoRamThreshold} disabled={!prefs.autoRamOptimize} onChange={(e) => void run(() => savePrefs({ autoRamThreshold: Number(e.target.value) }))}>
                {[70, 75, 80, 85, 90, 95].map((v) => <option key={v} value={v}>{v}%</option>)}
              </Select>
              tối đa 1 lần mỗi
              <Select className="h-8 w-28 py-0 text-xs" value={prefs.autoRamIntervalMin} disabled={!prefs.autoRamOptimize} onChange={(e) => void run(() => savePrefs({ autoRamIntervalMin: Number(e.target.value) }))}>
                {[5, 15, 30, 60, 180].map((v) => <option key={v} value={v}>{v} phút</option>)}
              </Select>
            </div>
            {!windows && m.tunables['vm.swappiness'] && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400">
                <Gauge className="size-3.5" /> swappiness <Badge tone="slate">{m.tunables['vm.swappiness']}</Badge>
                <Select className="h-8 w-40 py-0 text-xs" value="" onChange={(e) => e.target.value && void tunable('vm.swappiness', Number(e.target.value))}>
                  <option value="">Đổi...</option>
                  <option value="10">10 — ưu tiên RAM (VPS web)</option>
                  <option value="30">30 — cân bằng</option>
                  <option value="60">60 — mặc định Linux</option>
                </Select>
                cache_pressure <Badge tone="slate">{m.tunables['vm.vfs_cache_pressure']}</Badge>
                <Select className="h-8 w-32 py-0 text-xs" value="" onChange={(e) => e.target.value && void tunable('vm.vfs_cache_pressure', Number(e.target.value))}>
                  <option value="">Đổi...</option>
                  <option value="50">50 — giữ cache</option>
                  <option value="100">100 — mặc định</option>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="size-4 text-amber-300" /> Tiến trình ngốn RAM nhất
          </div>
          <div className="space-y-1.5">
            {m.topProcesses.map((p) => (
              <div key={p.pid} className="rounded-xl border border-slate-800 bg-ink-950/40 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{p.name}</span>
                  <span className="mono text-xs text-slate-500">#{p.pid}</span>
                  <span className="mono w-20 text-right text-sm text-white">{formatBytes(p.memory)}</span>
                  {m.canTrimProcess && (
                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-emerald-300 disabled:opacity-40" disabled={trimming === p.pid} onClick={() => void trim(p.pid, p.name)} data-tip="Thu gọn working set">
                      <Scissors className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, pct(p.memory))}%` }} />
                </div>
              </div>
            ))}
          </div>
          {!m.canTrimProcess && <p className="mt-2 text-[11px] text-slate-500">Linux không có thao tác thu gọn từng tiến trình an toàn — hãy khởi động lại dịch vụ hoặc ứng dụng nền đang phình to.</p>}
        </div>
      </div>
    </Card>
  );
}
