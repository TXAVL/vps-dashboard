import os from 'node:os';
import type { CleanExecutionOptions, DiskUsage, MemoryDetail, OSAdapter, RamOptimizeOptions } from '../adapters/base.adapter.js';
import { jobLog, jobProgress, jobResult, jobStep, startJob, type JobView } from '../core/jobs.js';
import { getPrefs } from '../core/prefs.js';
import type { DockerService } from './docker.service.js';

export interface CleanScanResult {
  cpu: {
    usage: number;
    cores: number;
    isOverloaded: boolean;
    topProcesses: { pid: number; name: string; cpu: number; memory: number; user: string | null; command: string | null }[];
  };
  ram: {
    total: number;
    used: number;
    free: number;
    pageCache: number;
  };
  disks: DiskUsage[];
  docker: {
    installed: boolean;
    running: boolean;
    stoppedContainers: number;
    danglingImages: number;
    totalImages: number;
    totalVolumes: number;
    systemDfText: string;
  };
  system: {
    systemLogsBytes: number;
    packageCacheBytes: number;
    tempFilesBytes: number;
  };
  estimatedTotalReclaimableBytes: number;
}

export interface CleanResult {
  diskFreed: number;
  ramFreed: number;
  diskBefore: number;
  diskAfter: number;
  ramBefore: number;
  ramAfter: number;
}

export interface RamOptimizeResult {
  before: number;
  after: number;
  freed: number;
  at: string;
  auto: boolean;
}

export interface MemoryView extends MemoryDetail {
  topProcesses: { pid: number; name: string; memory: number; cpu: number; user: string | null }[];
  canTrimProcess: boolean;
  lastOptimize: RamOptimizeResult | null;
  auto: { enabled: boolean; threshold: number; intervalMin: number };
}

export class CleanService {
  private lastOptimize: RamOptimizeResult | null = null;
  private autoTimer: NodeJS.Timeout | null = null;
  private optimizing = false;

  constructor(
    private readonly adapter: OSAdapter,
    private readonly docker: DockerService,
  ) {}

  private async diskFree(): Promise<number> {
    const disks = await this.adapter.getDisks().catch(() => [] as DiskUsage[]);
    return disks.reduce((n, d) => n + Math.max(0, d.total - d.used), 0);
  }

  private async ramAvailable(): Promise<number> {
    return (await this.adapter.memoryDetail().catch(() => null))?.available ?? os.freemem();
  }

  async memory(): Promise<MemoryView> {
    const [detail, procs] = await Promise.all([this.adapter.memoryDetail(), this.adapter.listProcesses().catch(() => [])]);
    const prefs = getPrefs();
    return {
      ...detail,
      topProcesses: [...procs]
        .sort((a, b) => b.memory - a.memory)
        .slice(0, 12)
        .map((p) => ({ pid: p.pid, name: p.name, memory: p.memory, cpu: p.cpu, user: p.user })),
      canTrimProcess: this.adapter.family === 'windows',
      lastOptimize: this.lastOptimize,
      auto: { enabled: prefs.autoRamOptimize, threshold: prefs.autoRamThreshold, intervalMin: prefs.autoRamIntervalMin },
    };
  }

  /** Tối ưu RAM, đo RAM khả dụng trước / sau để báo con số thật */
  private async doOptimize(options: RamOptimizeOptions, auto: boolean): Promise<RamOptimizeResult> {
    this.optimizing = true;
    try {
      const before = await this.ramAvailable();
      jobLog(`RAM khả dụng trước: ${(before / 1048576).toFixed(0)} MB`);
      await this.adapter.optimizeRam(options, (msg) => jobLog(`  ${msg}`));
      await new Promise((r) => setTimeout(r, 1500));
      const after = await this.ramAvailable();
      const result: RamOptimizeResult = { before, after, freed: Math.max(0, after - before), at: new Date().toISOString(), auto };
      jobLog(`RAM khả dụng sau: ${(after / 1048576).toFixed(0)} MB → giải phóng ${(result.freed / 1048576).toFixed(0)} MB`);
      this.lastOptimize = result;
      return result;
    } finally {
      this.optimizing = false;
    }
  }

  optimizeRam(options: RamOptimizeOptions): JobView {
    return startJob('Tối ưu RAM', 'clean', async () => {
      jobStep('Thu hồi bộ nhớ');
      jobResult(await this.doOptimize(options, false));
    });
  }

  async trimProcess(pid: number): Promise<{ ok: boolean; before: number; after: number }> {
    const find = async () => (await this.adapter.listProcesses()).find((p) => p.pid === pid)?.memory ?? 0;
    const before = await find();
    const ok = await this.adapter.trimProcessMemory(pid);
    await new Promise((r) => setTimeout(r, 800));
    return { ok, before, after: await find() };
  }

  setTunable(key: 'vm.swappiness' | 'vm.vfs_cache_pressure', value: number): Promise<void> {
    return this.adapter.setMemoryTunable(key, value);
  }

  /** Tự tối ưu RAM khi vượt ngưỡng (bật trong trang Dọn dẹp) */
  startAuto(): void {
    let lastRun = 0;
    this.autoTimer = setInterval(async () => {
      const prefs = getPrefs();
      if (!prefs.autoRamOptimize || this.optimizing) return;
      if (Date.now() - lastRun < prefs.autoRamIntervalMin * 60_000) return;
      const detail = await this.adapter.memoryDetail().catch(() => null);
      if (!detail || (detail.used / detail.total) * 100 < prefs.autoRamThreshold) return;
      lastRun = Date.now();
      startJob(`Tự tối ưu RAM (vượt ${prefs.autoRamThreshold}%)`, 'clean', async () => {
        jobResult(await this.doOptimize({ dropCache: true }, true));
      });
    }, 60_000);
  }

  stop(): void {
    if (this.autoTimer) clearInterval(this.autoTimer);
  }

  async scan(): Promise<CleanScanResult> {
    const [disks, processes, osCleanScan, dockerInfo] = await Promise.all([
      this.adapter.getDisks().catch(() => [] as DiskUsage[]),
      this.adapter.listProcesses().catch(() => []),
      this.adapter.cleanScan().catch(() => ({ systemLogsBytes: 0, packageCacheBytes: 0, tempFilesBytes: 0, pageCacheBytes: 0 })),
      this.docker.info().catch(() => ({ installed: false, running: false, version: null, error: null })),
    ]);

    // Lọc và sắp xếp các tiến trình ngốn CPU nhất
    const sortedProcs = [...processes].sort((a, b) => b.cpu - a.cpu);
    const topProcesses = sortedProcs.slice(0, 10).map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: Math.round(p.cpu * 10) / 10,
      memory: p.memory,
      user: p.user,
      command: p.command,
    }));

    const cpuUsage = sortedProcs.reduce((acc, p) => acc + p.cpu, 0);
    const cores = os.cpus().length || 1;
    // Chuẩn hóa usage về khoảng 0 - 100%
    const normalizedCpuUsage = Math.min(100, Math.round(cpuUsage));
    const isOverloaded = normalizedCpuUsage >= 70;

    let stoppedContainers = 0;
    let danglingImages = 0;
    let totalImages = 0;
    let totalVolumes = 0;
    let systemDfText = '';

    if (dockerInfo.running) {
      const [containers, images, volumes, df] = await Promise.all([
        this.docker.containers().catch(() => []),
        this.docker.images().catch(() => []),
        this.docker.volumes().catch(() => []),
        this.docker.systemDf().catch(() => ''),
      ]);
      stoppedContainers = containers.filter((c) => c.state !== 'running').length;
      totalImages = images.length;
      danglingImages = images.filter((i) => i.repository === '<none>' || i.tag === '<none>').length;
      totalVolumes = volumes.length;
      systemDfText = df;
    }

    const ramTotal = os.totalmem();
    const ramFree = os.freemem();
    const ramUsed = ramTotal - ramFree;

    const estimatedTotalReclaimableBytes =
      osCleanScan.systemLogsBytes +
      osCleanScan.packageCacheBytes +
      osCleanScan.tempFilesBytes +
      (osCleanScan.pageCacheBytes > 200 * 1024 * 1024 ? osCleanScan.pageCacheBytes : 0);

    return {
      cpu: {
        usage: normalizedCpuUsage,
        cores,
        isOverloaded,
        topProcesses,
      },
      ram: {
        total: ramTotal,
        used: ramUsed,
        free: ramFree,
        pageCache: osCleanScan.pageCacheBytes,
      },
      disks,
      docker: {
        installed: dockerInfo.installed,
        running: dockerInfo.running,
        stoppedContainers,
        danglingImages,
        totalImages,
        totalVolumes,
        systemDfText,
      },
      system: {
        systemLogsBytes: osCleanScan.systemLogsBytes,
        packageCacheBytes: osCleanScan.packageCacheBytes,
        tempFilesBytes: osCleanScan.tempFilesBytes,
      },
      estimatedTotalReclaimableBytes,
    };
  }

  async execute(options: CleanExecutionOptions): Promise<void> {
    const [diskBefore, ramBefore] = await Promise.all([this.diskFree(), this.ramAvailable()]);
    jobProgress(5, 'Bắt đầu chuẩn bị dọn dẹp hệ thống...');
    jobLog('═══════════════════════════════════════════════════');
    jobLog('  ZENPANEL - BẮT ĐẦU DỌN DẸP HỆ THỐNG');
    jobLog('═══════════════════════════════════════════════════\n');

    // 1. Docker Cleanup
    const dockerInfo = await this.docker.info().catch(() => ({ installed: false, running: false }));
    if (dockerInfo.running) {
      if (options.cleanDockerContainers) {
        jobProgress(15, 'Đang dọn dẹp container Docker đã dừng...');
        jobLog('➜ [Docker] Dọn dẹp container đã dừng...');
        try {
          const out = await this.docker.prune('containers');
          jobLog(out.trim() ? out.trim() : 'Không có container nào cần xoá.');
        } catch (err) {
          jobLog(`Lỗi dọn container: ${(err as Error).message}`);
        }
      }

      if (options.cleanDockerAllImages) {
        jobProgress(30, 'Đang dọn dẹp toàn bộ Docker images không dùng...');
        jobLog('➜ [Docker] Dọn dẹp tất cả images không sử dụng...');
        try {
          const out = await this.docker.prune('all-images');
          jobLog(out.trim() ? out.trim() : 'Không có image nào cần xoá.');
        } catch (err) {
          jobLog(`Lỗi dọn images: ${(err as Error).message}`);
        }
      } else if (options.cleanDockerImages) {
        jobProgress(30, 'Đang dọn dẹp Docker images rác (dangling)...');
        jobLog('➜ [Docker] Dọn dẹp image rác (dangling images)...');
        try {
          const out = await this.docker.prune('images');
          jobLog(out.trim() ? out.trim() : 'Không có dangling image nào.');
        } catch (err) {
          jobLog(`Lỗi dọn images: ${(err as Error).message}`);
        }
      }

      if (options.cleanDockerBuildCache) {
        jobProgress(45, 'Đang dọn dẹp Docker Build Cache...');
        jobLog('➜ [Docker] Dọn dẹp bộ nhớ đệm Build Cache...');
        try {
          const out = await this.docker.prune('builder');
          jobLog(out.trim() ? out.trim() : 'Build cache đã sạch.');
        } catch (err) {
          jobLog(`Lỗi dọn build cache: ${(err as Error).message}`);
        }
      }

      if (options.cleanDockerVolumes) {
        jobProgress(55, 'Đang dọn dẹp Docker Volumes mồ côi...');
        jobLog('➜ [Docker] Dọn dẹp volume mồ côi...');
        try {
          const out = await this.docker.prune('volumes');
          jobLog(out.trim() ? out.trim() : 'Không có volume mồ côi nào.');
        } catch (err) {
          jobLog(`Lỗi dọn volume: ${(err as Error).message}`);
        }
      }
    } else {
      jobLog('➜ [Docker] Docker chưa cài đặt hoặc không chạy, bỏ qua dọn dẹp Docker.');
    }

    // 2. Hệ điều hành & RAM Cache
    jobProgress(70, 'Đang dọn dẹp Thùng rác, file tạm và nhật ký log hệ điều hành...');
    jobLog('\n➜ [Hệ điều hành] Dọn dẹp tạp vụ OS...');
    await this.adapter.cleanSystem(options, (msg) => {
      if (msg.includes('RAM') || msg.includes('WorkingSet')) {
        jobProgress(88, 'Đang kích hoạt thu hồi bộ nhớ RAM...');
      }
      jobLog(`  ${msg}`);
    });

    jobProgress(95, 'Đo lại dung lượng & RAM sau khi dọn...');
    await new Promise((r) => setTimeout(r, 1000));
    const [diskAfter, ramAfter] = await Promise.all([this.diskFree(), this.ramAvailable()]);
    const result: CleanResult = {
      diskBefore,
      diskAfter,
      ramBefore,
      ramAfter,
      diskFreed: Math.max(0, diskAfter - diskBefore),
      ramFreed: Math.max(0, ramAfter - ramBefore),
    };
    jobResult(result);
    jobLog(`\n➜ Ổ đĩa trống thêm: ${(result.diskFreed / 1048576).toFixed(1)} MB · RAM khả dụng thêm: ${(result.ramFreed / 1048576).toFixed(1)} MB`);
    jobProgress(100, 'Dọn dẹp hệ thống hoàn tất thành công!');
    jobLog('\n═══════════════════════════════════════════════════');
    jobLog('  ✔ DỌN DẸP HỆ THỐNG HOÀN TẤT THÀNH CÔNG');
    jobLog('═══════════════════════════════════════════════════');
  }
}
