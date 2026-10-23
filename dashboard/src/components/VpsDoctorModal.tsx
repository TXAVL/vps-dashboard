// ZenPanel - Modal Bác Sĩ VPS (VPS Doctor) & Tương thích đa nền tảng
import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  HardDrive,
  HeartPulse,
  RefreshCw,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react';
import { get, post } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { Job } from '../lib/types';
import { useJobs } from './jobs';
import { CopyButton, Modal, cn } from './ui';

export interface NetworkEndpointCheck {
  name: string;
  host: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface VpsDoctorReport {
  timestamp: string;
  os: {
    family: string;
    name: string;
    kernel: string;
    arch: string;
    hostname: string;
  };
  network: {
    publicIp: string | null;
    privateIps: string[];
    isBehindNat: boolean;
    ispInfo?: string;
  };
  memory: {
    totalRam: number;
    freeRam: number;
    usedRam: number;
    totalSwap: number;
    freeSwap: number;
    usedSwap: number;
    swapRecommended: boolean;
    swapAdvice?: string;
  };
  firewall: {
    backend: string;
    enabled: boolean;
    panelPortAllowed: boolean;
    sshPortAllowed: boolean;
    advice?: string;
  };
  networkConnectivity: NetworkEndpointCheck[];
  kernelOptimizations: {
    bbrEnabled: boolean;
    canEnableBbr: boolean;
  };
  score: number;
  recommendations: Array<{
    id: string;
    level: 'warning' | 'info' | 'success';
    title: string;
    desc: string;
    actionLabel?: string;
    actionEndpoint?: string;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function VpsDoctorModal({ open, onClose }: Props) {
  const [report, setReport] = useState<VpsDoctorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { runJob } = useJobs();

  const fetchDoctor = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<VpsDoctorReport>('/api/system/vps-doctor');
      setReport(data);
    } catch (e) {
      setError((e as Error).message || 'Không thể lấy thông tin chẩn đoán VPS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchDoctor();
    }
  }, [open]);

  const handleCreateSwap = async (sizeMb: number) => {
    await runJob(() => post<Job>('/api/system/vps-doctor/create-swap', { sizeMb }));
    void fetchDoctor();
  };

  const handleEnableBbr = async () => {
    await runJob(() => post<Job>('/api/system/vps-doctor/enable-bbr'));
    void fetchDoctor();
  };

  const handleFixFirewall = async () => {
    await runJob(() => post<Job>('/api/system/vps-doctor/fix-firewall'));
    void fetchDoctor();
  };

  const score = report?.score ?? 100;
  const scoreColor =
    score >= 85 ? 'text-emerald-400' : score >= 65 ? 'text-amber-400' : 'text-rose-400';
  const scoreBg =
    score >= 85
      ? 'bg-emerald-500/10 border-emerald-500/30'
      : score >= 65
        ? 'bg-amber-500/10 border-amber-500/30'
        : 'bg-rose-500/10 border-rose-500/30';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center justify-between pr-8">
          <div className="flex items-center gap-2.5">
            <HeartPulse className="size-5 text-zen-blue" />
            <span className="font-bold text-white">Bác Sĩ VPS & Tương Thích Toàn Diện</span>
            <span className="rounded-full bg-zen-blue/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
              Doctor v1.0
            </span>
          </div>
          <button
            onClick={() => void fetchDoctor()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-ink-950/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin text-zen-blue')} />
            Làm mới
          </button>
        </div>
      }
    >
      <div className="space-y-6 text-slate-200">
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-300">
            <AlertTriangle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !report ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Activity className="size-10 animate-bounce text-zen-blue mb-3" />
            <div className="text-sm font-medium">Đang khám nghiệm & kiểm tra tương thích VPS...</div>
            <div className="text-xs text-slate-500 mt-1">Đo độ trễ quốc tế, cấu hình IP, Swap và Kernel</div>
          </div>
        ) : report ? (
          <>
            {/* Top Score Banner */}
            <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5', scoreBg)}>
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-black/40 ring-1 ring-white/10">
                  <span className={cn('text-2xl font-black', scoreColor)}>{report.score}</span>
                  <span className="text-[10px] font-bold uppercase text-slate-400">/ 100</span>
                </div>
                <div>
                  <div className="text-base font-bold text-white">
                    {report.score >= 90
                      ? 'VPS Của Bạn Đang Ở Trạng Thái Rất Tốt!'
                      : report.score >= 70
                        ? 'VPS Khá Ổn Định - Có Một Số Đề Xuất Tối Ưu'
                        : 'Cần Tối Ưu Cấp Thiết Để Tránh Lỗi Hệ Thống'}
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Hệ điều hành: <b className="text-white">{report.os.name}</b> ({report.os.arch}) · Kernel: {report.os.kernel}
                  </div>
                </div>
              </div>

              {report.recommendations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300">
                    {report.recommendations.length} khuyến nghị
                  </span>
                </div>
              )}
            </div>

            {/* Recommendations Section */}
            {report.recommendations.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Sparkles className="size-4 text-amber-400" />
                  Đề xuất tối ưu hóa tức thì (1-Click)
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {report.recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className={cn(
                        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition',
                        rec.level === 'warning'
                          ? 'border-amber-500/30 bg-amber-500/10'
                          : 'border-blue-500/30 bg-blue-500/10',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle
                          className={cn(
                            'size-5 shrink-0 mt-0.5',
                            rec.level === 'warning' ? 'text-amber-400' : 'text-blue-400',
                          )}
                        />
                        <div>
                          <div className="text-sm font-bold text-white">{rec.title}</div>
                          <div className="text-xs text-slate-300 mt-0.5">{rec.desc}</div>
                        </div>
                      </div>

                      {rec.actionLabel && (
                        <div className="shrink-0">
                          {rec.id === 'create_swap' && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void handleCreateSwap(2048)}
                                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400 shadow-md"
                              >
                                +2GB Swap
                              </button>
                              <button
                                onClick={() => void handleCreateSwap(4096)}
                                className="rounded-xl border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/30"
                              >
                                +4GB
                              </button>
                            </div>
                          )}
                          {rec.id === 'enable_bbr' && (
                            <button
                              onClick={() => void handleEnableBbr()}
                              className="rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-400 shadow-md"
                            >
                              {rec.actionLabel}
                            </button>
                          )}
                          {rec.id === 'fix_firewall' && (
                            <button
                              onClick={() => void handleFixFirewall()}
                              className="rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-400 shadow-md"
                            >
                              {rec.actionLabel}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grid 2 Columns: Network & IP, Memory & Swap */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Network & NAT Detection */}
              <div className="rounded-2xl border border-slate-700/60 bg-ink-950/70 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Globe className="size-4 text-zen-blue" />
                    Địa Chỉ Mạng & Định Tuyến
                  </div>
                  {report.network.isBehindNat ? (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      Sau NAT / Cloud 1:1
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      Public IP Trực Tiếp
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-xl bg-ink-900/60 p-2.5">
                    <span className="text-slate-400">Public IPv4:</span>
                    <div className="flex items-center gap-2">
                      <span className="mono font-bold text-emerald-400">
                        {report.network.publicIp ?? 'Chưa xác định'}
                      </span>
                      {report.network.publicIp && <CopyButton value={report.network.publicIp} />}
                    </div>
                  </div>

                  <div className="rounded-xl bg-ink-900/60 p-2.5">
                    <div className="text-slate-400 mb-1">Private IPs mạng nội bộ:</div>
                    <div className="flex flex-wrap gap-1">
                      {report.network.privateIps.length > 0 ? (
                        report.network.privateIps.map((ip) => (
                          <span
                            key={ip}
                            className="mono rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300"
                          >
                            {ip}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500">Không có</span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    💡 Khi tạo domain hoặc trỏ webhook, hãy luôn trỏ về <b>Public IPv4</b> ở trên để truy cập được từ bên ngoài Internet.
                  </p>
                </div>
              </div>

              {/* Card 2: Memory & Swap Anti-OOM */}
              <div className="rounded-2xl border border-slate-700/60 bg-ink-950/70 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <HardDrive className="size-4 text-purple-400" />
                    Bộ Nhớ RAM & Swap (Chống OOM)
                  </div>
                  {report.memory.swapRecommended ? (
                    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                      Nguy cơ tràn RAM
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      An toàn
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-xl bg-ink-900/60 p-2.5">
                    <span className="text-slate-400">RAM vật lý:</span>
                    <span className="font-semibold text-slate-200">
                      {formatBytes(report.memory.usedRam)} / {formatBytes(report.memory.totalRam)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-ink-900/60 p-2.5">
                    <span className="text-slate-400">Bộ nhớ ảo (Swap):</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'font-semibold',
                          report.memory.totalSwap === 0 ? 'text-amber-400' : 'text-slate-200',
                        )}
                      >
                        {report.memory.totalSwap > 0
                          ? `${formatBytes(report.memory.usedSwap)} / ${formatBytes(report.memory.totalSwap)}`
                          : 'Chưa có Swap (0 MB)'}
                      </span>
                    </div>
                  </div>

                  {report.memory.totalSwap === 0 && report.os.family === 'linux' && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
                      <span className="text-[11px] text-amber-200">Chưa có Swap chống sập VPS</span>
                      <button
                        onClick={() => void handleCreateSwap(2048)}
                        className="rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-400"
                      >
                        Tạo 2GB Swap
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    🛡️ Swap hoạt động như bộ đệm an toàn, ngăn tiến trình nặng (MySQL, Docker, Node) bị hệ điều hành cưỡng chế kill khi RAM đạt 100%.
                  </p>
                </div>
              </div>

              {/* Card 3: Kernel BBR & Tường Lửa */}
              <div className="rounded-2xl border border-slate-700/60 bg-ink-950/70 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Zap className="size-4 text-amber-400" />
                    Tối Ưu Kernel TCP BBR & Tường Lửa
                  </div>
                  {report.kernelOptimizations.bbrEnabled ? (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      BBR Active 🚀
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      Cubic / Chuẩn
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-xl bg-ink-900/60 p-2.5">
                    <div>
                      <div className="font-semibold text-slate-200">Google TCP BBR</div>
                      <div className="text-[11px] text-slate-400">Giảm packet loss & tăng tốc độ tải mạng 20-50%</div>
                    </div>
                    {report.kernelOptimizations.bbrEnabled ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="size-4" /> Đã bật
                      </span>
                    ) : report.kernelOptimizations.canEnableBbr ? (
                      <button
                        onClick={() => void handleEnableBbr()}
                        className="rounded-lg bg-blue-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-400"
                      >
                        Bật ngay
                      </button>
                    ) : (
                      <span className="text-slate-500">Không hỗ trợ</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-ink-900/60 p-2.5">
                    <div>
                      <div className="font-semibold text-slate-200">Tường lửa (Firewall): {report.firewall.backend}</div>
                      <div className="text-[11px] text-slate-400">
                        SSH (22): {report.firewall.sshPortAllowed ? 'Mở ✅' : 'Chưa rõ ⚠️'} · ZenPanel: {report.firewall.panelPortAllowed ? 'Mở ✅' : 'Chưa rõ ⚠️'}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleFixFirewall()}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
                    >
                      Mở cổng an toàn
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 4: Network Latency Kiểm tra kết nối quốc tế */}
              <div className="rounded-2xl border border-slate-700/60 bg-ink-950/70 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Wifi className="size-4 text-emerald-400" />
                    Kết Nối Mạng Quốc Tế (Latency)
                  </div>
                  <span className="text-[11px] text-slate-400">TCP Ping</span>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  {report.networkConnectivity.map((ep) => (
                    <div
                      key={ep.name}
                      className="flex items-center justify-between rounded-xl bg-ink-900/60 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2 rounded-full',
                            ep.ok ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500',
                          )}
                        />
                        <span className="font-medium text-slate-200">{ep.name}</span>
                        <span className="mono text-[11px] text-slate-500">({ep.host})</span>
                      </div>
                      <span
                        className={cn(
                          'mono font-bold',
                          !ep.ok
                            ? 'text-rose-400'
                            : ep.latencyMs < 60
                              ? 'text-emerald-400'
                              : ep.latencyMs < 150
                                ? 'text-amber-400'
                                : 'text-slate-400',
                        )}
                      >
                        {ep.ok ? `${ep.latencyMs} ms` : 'Lỗi'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
