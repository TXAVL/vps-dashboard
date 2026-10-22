// ZenPanel - Dọn dẹp hệ thống & Hạ tải CPU (Docker, RAM Cache, System Logs, File tạm, Tiến trình ngốn CPU)
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  HardDrive,
  Layers,
  MemoryStick,
  PackageCheck,
  RefreshCw,
  Sparkles,
  StopCircle,
  Trash2,
  Zap,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Progress, Spinner, cn } from '../components/ui';
import { get, post } from '../lib/api';
import { formatBytes, formatPercent } from '../lib/format';
import type { CleanExecutionOptions, CleanScanResult, Job } from '../lib/types';

export default function CleanupView() {
  const [data, setData] = useState<CleanScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [killingAllHogs, setKillingAllHogs] = useState(false);

  // Tuỳ chọn dọn dẹp được chọn
  const [opts, setOpts] = useState<CleanExecutionOptions>({
    cleanDockerContainers: true,
    cleanDockerImages: true,
    cleanDockerAllImages: false,
    cleanDockerBuildCache: true,
    cleanDockerVolumes: true,
    cleanSystemLogs: true,
    cleanPackageCache: true,
    cleanTempFiles: true,
    cleanRamCache: true,
  });

  const { confirm, toast } = useFeedback();
  const { runJob } = useJobs();

  const loadScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await get<CleanScanResult>('/api/system/clean/scan');
      setData(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScan();
  }, [loadScan]);

  const executeClean = async (customOpts?: CleanExecutionOptions, _title = 'Dọn dẹp hệ thống') => {
    const payload = customOpts ?? opts;
    const ok = await runJob(
      () => post<Job>('/api/system/clean/execute', payload),
      () => {
        void loadScan();
      },
    );
    if (ok) {
      toast('Đã hoàn tất dọn dẹp hệ thống!', 'success');
      void loadScan();
    }
  };

  const handleQuickSafeClean = async () => {
    if (
      !(await confirm({
        title: 'Dọn dẹp hệ thống an toàn',
        message:
          'Hệ thống sẽ dọn các container Docker đã dừng, dangling image rác, build cache, log hệ thống cũ và giải phóng RAM Cache. Thao tác này an toàn và không xoá dữ liệu ứng dụng đang chạy.',
        confirmLabel: 'Bắt đầu dọn ngay',
      }))
    )
      return;

    await executeClean(
      {
        cleanDockerContainers: true,
        cleanDockerImages: true,
        cleanDockerAllImages: false,
        cleanDockerBuildCache: true,
        cleanDockerVolumes: false,
        cleanSystemLogs: true,
        cleanPackageCache: true,
        cleanTempFiles: true,
        cleanRamCache: true,
      },
      'Dọn dẹp an toàn',
    );
  };

  const handleKillPid = async (pid: number, name: string) => {
    if (
      !(await confirm({
        title: `Dừng tiến trình ${name} (PID: ${pid})`,
        message: 'Bạn có chắc muốn buộc dừng tiến trình này? Nếu là tiến trình dịch vụ hoặc ứng dụng quan trọng, nó có thể bị ngắt kết nối.',
        danger: true,
        confirmLabel: 'Buộc dừng',
      }))
    )
      return;

    setKillingPid(pid);
    try {
      await post(`/api/processes/${pid}/kill`, { force: true });
      toast(`Đã dừng tiến trình ${name} (PID: ${pid})`, 'success');
      await loadScan();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setKillingPid(null);
    }
  };

  const handleKillCpuHogs = async () => {
    if (
      !(await confirm({
        title: 'Hạ tải CPU khẩn cấp',
        message: 'Hệ thống sẽ tự động tìm và buộc dừng tất cả các tiến trình không thuộc ZenPanel đang ngốn từ 35% CPU trở lên.',
        danger: true,
        confirmLabel: 'Dừng tiến trình quá tải',
      }))
    )
      return;

    setKillingAllHogs(true);
    try {
      const res = await post<{ ok: boolean; killedCount: number; killed: { pid: number; name: string; cpu: number }[] }>('/api/system/clean/kill-cpu-hogs', { minCpu: 35 });
      if (res.killedCount > 0) {
        toast(`Đã hạ tải thành công: dừng ${res.killedCount} tiến trình (${res.killed.map((p) => p.name).join(', ')})`, 'success');
      } else {
        toast('Không có tiến trình nào vượt ngưỡng 35% CPU.', 'info');
      }
      await loadScan();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setKillingAllHogs(false);
    }
  };

  if (loading && !data) return <Spinner label="Đang quét tài nguyên máy chủ..." />;

  const isCpuOverloaded = (data?.cpu.usage ?? 0) >= 70;
  const mainDisk = data?.disks?.[0];
  const diskFreeBytes = mainDisk ? mainDisk.total - mainDisk.used : 0;
  const diskUsedPct = mainDisk ? Math.round((mainDisk.used / mainDisk.total) * 100) : 0;
  const ramUsedPct = data ? Math.round((data.ram.used / data.ram.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dọn dẹp hệ thống & Hạ tải CPU"
        description="Giải phóng dung lượng ổ cứng, dọn rác Docker, xoá log cũ, xả RAM Cache và kiểm soát các tiến trình gây quá tải CPU."
        icon={Trash2}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" icon={RefreshCw} onClick={() => void loadScan()} loading={loading}>
              Quét lại
            </Button>
            <Button variant="primary" icon={Sparkles} onClick={() => void handleQuickSafeClean()}>
              ⚡ Dọn dẹp an toàn nhanh
            </Button>
          </div>
        }
      />

      {error && <Notice tone="red">{error}</Notice>}

      {/* Cảnh báo nếu CPU hoặc Ổ đĩa quá tải */}
      {isCpuOverloaded && (
        <div className="flex items-start gap-3 rounded-2xl border border-zen-red/40 bg-zen-red/10 p-4 text-red-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-zen-red" />
          <div className="flex-1">
            <h4 className="font-bold text-red-100">Cảnh báo: CPU đang hoạt động ở mức cao ({data?.cpu.usage}%)</h4>
            <p className="mt-1 text-xs text-red-300">
              Các tiến trình bên dưới đang tiêu tốn nhiều tài nguyên xử lý. Bạn có thể bấm nút &quot;Hạ tải CPU khẩn cấp&quot; hoặc dừng từng tiến trình để máy chủ phản hồi mượt mà hơn.
            </p>
          </div>
          <Button size="sm" variant="danger" icon={Zap} loading={killingAllHogs} onClick={() => void handleKillCpuHogs()}>
            Hạ tải CPU ngay
          </Button>
        </div>
      )}

      {diskUsedPct >= 90 && (
        <div className="flex items-start gap-3 rounded-2xl border border-zen-amber/40 bg-zen-amber/10 p-4 text-amber-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-zen-amber" />
          <div className="flex-1">
            <h4 className="font-bold text-amber-100">Cảnh báo: Ổ đĩa sắp đầy ({diskUsedPct}% - còn {formatBytes(diskFreeBytes)} trống)</h4>
            <p className="mt-1 text-xs text-amber-300">
              Ổ đĩa quá đầy có thể khiến Docker và hệ thống bị treo (full disk freeze). Hãy dọn dẹp Docker images rác và log hệ thống ngay bên dưới.
            </p>
          </div>
        </div>
      )}

      {/* Bảng trạng thái phần cứng 3 cột */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* CPU */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Cpu className="size-4 text-zen-blue" />
              Tải CPU
            </span>
            <Badge tone={isCpuOverloaded ? 'red' : (data?.cpu.usage ?? 0) > 40 ? 'amber' : 'green'}>
              {data?.cpu.usage}% ({data?.cpu.cores} Cores)
            </Badge>
          </div>
          <Progress value={data?.cpu.usage ?? 0} tone={isCpuOverloaded ? 'red' : (data?.cpu.usage ?? 0) > 40 ? 'amber' : 'green'} />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Trạng thái: {isCpuOverloaded ? 'Quá tải' : 'Bình thường'}</span>
            <button onClick={() => void handleKillCpuHogs()} className="font-semibold text-blue-300 hover:underline">
              Hạ tải nhanh
            </button>
          </div>
        </Card>

        {/* RAM */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <MemoryStick className="size-4 text-zen-green" />
              Bộ nhớ RAM
            </span>
            <Badge tone={ramUsedPct > 85 ? 'red' : ramUsedPct > 65 ? 'amber' : 'green'}>{ramUsedPct}%</Badge>
          </div>
          <Progress value={ramUsedPct} tone={ramUsedPct > 85 ? 'red' : ramUsedPct > 65 ? 'amber' : 'green'} />
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              {data ? `${formatBytes(data.ram.used)} / ${formatBytes(data.ram.total)}` : 'Đang tính...'}
            </span>
            <button onClick={() => void executeClean({ cleanRamCache: true }, 'Giải phóng RAM Cache')} className="font-semibold text-zen-green hover:underline">
              Xả Cache RAM
            </button>
          </div>
        </Card>

        {/* Ổ đĩa */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <HardDrive className="size-4 text-purple-400" />
              Ổ đĩa ({mainDisk?.mount ?? '/'})
            </span>
            <Badge tone={diskUsedPct > 90 ? 'red' : diskUsedPct > 75 ? 'amber' : 'blue'}>{diskUsedPct}%</Badge>
          </div>
          <Progress value={diskUsedPct} tone={diskUsedPct > 90 ? 'red' : diskUsedPct > 75 ? 'amber' : 'blue'} />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Trống: {formatBytes(diskFreeBytes)}</span>
            <span>Tổng: {mainDisk ? formatBytes(mainDisk.total) : '0 GB'}</span>
          </div>
        </Card>
      </div>

      {/* KHỐI 1: XỬ LÝ TIẾN TRÌNH QUÁ TẢI CPU */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/50 bg-ink-950/40 p-4">
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-zen-blue" />
            <div>
              <h3 className="font-bold text-white">Tiến trình ngốn CPU cao nhất</h3>
              <p className="text-xs text-slate-400">Xem và dừng các tiến trình đang chiếm dụng tài nguyên xử lý</p>
            </div>
          </div>
          <Button size="xs" variant="danger" icon={StopCircle} loading={killingAllHogs} onClick={() => void handleKillCpuHogs()}>
            Dừng tiến trình ngốn CPU &gt; 35%
          </Button>
        </div>

        {data?.cpu.topProcesses.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Không có tiến trình bất thường" description="Hệ thống đang hoạt động ổn định và tối ưu." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700/40 bg-ink-950/30 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tiến trình</th>
                  <th className="px-4 py-3 font-semibold">PID</th>
                  <th className="px-4 py-3 font-semibold">% CPU</th>
                  <th className="px-4 py-3 font-semibold">RAM</th>
                  <th className="px-4 py-3 font-semibold">Người dùng</th>
                  <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {data?.cpu.topProcesses.map((p) => {
                  const isHigh = p.cpu >= 30;
                  return (
                    <tr key={p.pid} className={cn('transition hover:bg-slate-800/40', isHigh && 'bg-zen-red/5')}>
                      <td className="px-4 py-2.5 font-sans font-semibold text-slate-200">
                        <div className="truncate max-w-[220px] sm:max-w-xs" title={p.command ?? p.name}>
                          {p.name}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{p.pid}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-flex items-center font-bold', p.cpu >= 50 ? 'text-zen-red' : p.cpu >= 25 ? 'text-zen-amber' : 'text-slate-300')}>
                          {formatPercent(p.cpu, 1)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">{formatBytes(p.memory)}</td>
                      <td className="px-4 py-2.5 text-slate-400">{p.user ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300 font-sans"
                          loading={killingPid === p.pid}
                          onClick={() => void handleKillPid(p.pid, p.name)}
                        >
                          Dừng
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* KHỐI 2: DỌN DẸP DOCKER & HỆ ĐIỀU HÀNH */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cột Trái: Dọn dẹp Docker */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
            <div className="flex items-center gap-2">
              <Boxes className="size-5 text-blue-400" />
              <h3 className="font-bold text-white">Dọn dẹp rác Docker</h3>
            </div>
            <Badge tone={data?.docker.running ? 'blue' : 'slate'}>{data?.docker.running ? 'Docker đang chạy' : 'Không có Docker'}</Badge>
          </div>

          <div className="space-y-3 text-xs">
            {/* Containers */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Containers đã dừng</span>
                <p className="text-[11px] text-slate-500">Các container tắt máy không còn sử dụng</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono rounded bg-slate-800 px-2 py-0.5 text-slate-300">{data?.docker.stoppedContainers ?? 0}</span>
                <Button size="xs" variant="ghost" icon={Trash2} onClick={() => void executeClean({ cleanDockerContainers: true }, 'Dọn container đã dừng')}>
                  Dọn
                </Button>
              </div>
            </div>

            {/* Dangling Images */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Image rác (dangling images)</span>
                <p className="text-[11px] text-slate-500">Các image trung gian &lt;none&gt; sau khi build/update</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono rounded bg-slate-800 px-2 py-0.5 text-slate-300">{data?.docker.danglingImages ?? 0}</span>
                <Button size="xs" variant="ghost" icon={Trash2} onClick={() => void executeClean({ cleanDockerImages: true }, 'Dọn dangling images')}>
                  Dọn
                </Button>
              </div>
            </div>

            {/* Build Cache */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Bộ nhớ đệm Build Cache</span>
                <p className="text-[11px] text-slate-500">Dữ liệu cache Docker Builder còn sót lại</p>
              </div>
              <Button size="xs" variant="ghost" icon={Trash2} onClick={() => void executeClean({ cleanDockerBuildCache: true }, 'Dọn build cache')}>
                Dọn cache
              </Button>
            </div>

            {/* Volumes */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Volumes mồ côi</span>
                <p className="text-[11px] text-slate-500">Volume không còn gắn với bất kỳ container nào</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono rounded bg-slate-800 px-2 py-0.5 text-slate-300">{data?.docker.totalVolumes ?? 0}</span>
                <Button size="xs" variant="ghost" icon={Trash2} onClick={() => void executeClean({ cleanDockerVolumes: true }, 'Dọn volumes mồ côi')}>
                  Dọn
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              className="w-full justify-center"
              icon={Boxes}
              onClick={() =>
                void executeClean(
                  {
                    cleanDockerContainers: true,
                    cleanDockerImages: true,
                    cleanDockerBuildCache: true,
                    cleanDockerVolumes: true,
                  },
                  'Dọn toàn bộ rác Docker',
                )
              }
            >
              Dọn sạch toàn bộ rác Docker
            </Button>
          </div>
        </Card>

        {/* Cột Phải: Dọn dẹp OS & Bộ nhớ đệm */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-zen-green" />
              <h3 className="font-bold text-white">Dọn dẹp OS & Cache</h3>
            </div>
            <span className="text-xs text-slate-400">Linux & Windows</span>
          </div>

          <div className="space-y-3 text-xs">
            {/* System Logs */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Log hệ thống (Journalctl / Events)</span>
                <p className="text-[11px] text-slate-500">Thu gọn log cũ hơn 2 ngày và giới hạn dung lượng</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-slate-300">{data ? formatBytes(data.system.systemLogsBytes) : '0 B'}</span>
                <Button size="xs" variant="ghost" icon={FileText} onClick={() => void executeClean({ cleanSystemLogs: true }, 'Dọn log hệ thống')}>
                  Dọn
                </Button>
              </div>
            </div>

            {/* Package Manager Cache */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Cache gói cài đặt (APT / DNF / YUM)</span>
                <p className="text-[11px] text-slate-500">Xoá file .deb / .rpm đã tải về sau khi cài đặt</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-slate-300">{data ? formatBytes(data.system.packageCacheBytes) : '0 B'}</span>
                <Button size="xs" variant="ghost" icon={PackageCheck} onClick={() => void executeClean({ cleanPackageCache: true }, 'Dọn cache gói')}>
                  Dọn
                </Button>
              </div>
            </div>

            {/* Temp Files */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">File tạm hệ thống (/tmp, Temp)</span>
                <p className="text-[11px] text-slate-500">Các file tạm không còn hoạt động</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-slate-300">{data ? formatBytes(data.system.tempFilesBytes) : '0 B'}</span>
                <Button size="xs" variant="ghost" icon={Trash2} onClick={() => void executeClean({ cleanTempFiles: true }, 'Dọn file tạm')}>
                  Dọn
                </Button>
              </div>
            </div>

            {/* RAM Cache */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-ink-950/40 p-3">
              <div>
                <span className="font-semibold text-slate-200">Bộ nhớ đệm RAM (drop_caches)</span>
                <p className="text-[11px] text-slate-500">Giải phóng PageCache và Dentries không hoạt động</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-slate-300">{data?.ram.pageCache ? formatBytes(data.ram.pageCache) : 'Khả dụng'}</span>
                <Button size="xs" variant="ghost" icon={MemoryStick} onClick={() => void executeClean({ cleanRamCache: true }, 'Giải phóng RAM Cache')}>
                  Giải phóng
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              className="w-full justify-center"
              icon={Layers}
              onClick={() =>
                void executeClean(
                  {
                    cleanSystemLogs: true,
                    cleanPackageCache: true,
                    cleanTempFiles: true,
                    cleanRamCache: true,
                  },
                  'Dọn dẹp hệ điều hành & RAM',
                )
              }
            >
              Dọn dẹp toàn bộ OS & Xả RAM Cache
            </Button>
          </div>
        </Card>
      </div>

      {/* KHỐI 3: DỌN DẸP TÙY CHỌN TỔNG HỢP */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-zen-blue" />
            <h3 className="font-bold text-white">Dọn dẹp tùy chỉnh (Batch Cleanup)</h3>
          </div>
          <span className="text-xs text-slate-400">Chọn các mục bạn muốn thực thi cùng lúc</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanDockerContainers}
              onChange={(e) => setOpts({ ...opts, cleanDockerContainers: e.target.checked })}
            />
            <span className="text-slate-200">Container đã dừng</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanDockerImages}
              onChange={(e) => setOpts({ ...opts, cleanDockerImages: e.target.checked })}
            />
            <span className="text-slate-200">Dangling Images rác</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanDockerBuildCache}
              onChange={(e) => setOpts({ ...opts, cleanDockerBuildCache: e.target.checked })}
            />
            <span className="text-slate-200">Build Cache Docker</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanSystemLogs}
              onChange={(e) => setOpts({ ...opts, cleanSystemLogs: e.target.checked })}
            />
            <span className="text-slate-200">Log hệ thống cũ</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanPackageCache}
              onChange={(e) => setOpts({ ...opts, cleanPackageCache: e.target.checked })}
            />
            <span className="text-slate-200">Cache APT / DNF</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanTempFiles}
              onChange={(e) => setOpts({ ...opts, cleanTempFiles: e.target.checked })}
            />
            <span className="text-slate-200">File tạm /tmp</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanRamCache}
              onChange={(e) => setOpts({ ...opts, cleanRamCache: e.target.checked })}
            />
            <span className="text-slate-200">Giải phóng RAM Cache</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 cursor-pointer hover:border-zen-blue/50">
            <input
              type="checkbox"
              className="accent-zen-blue size-4"
              checked={opts.cleanDockerVolumes}
              onChange={(e) => setOpts({ ...opts, cleanDockerVolumes: e.target.checked })}
            />
            <span className="text-slate-200">Volume mồ côi</span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" icon={Sparkles} onClick={() => void executeClean()}>
            Bắt đầu dọn dẹp các mục đã chọn
          </Button>
        </div>
      </Card>
    </div>
  );
}
