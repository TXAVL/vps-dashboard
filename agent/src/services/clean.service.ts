import os from 'node:os';
import type { CleanExecutionOptions, DiskUsage, OSAdapter } from '../adapters/base.adapter.js';
import { jobLog, jobProgress } from '../core/jobs.js';
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

export class CleanService {
  constructor(
    private readonly adapter: OSAdapter,
    private readonly docker: DockerService,
  ) {}

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

    jobProgress(100, 'Dọn dẹp hệ thống hoàn tất thành công!');
    jobLog('\n═══════════════════════════════════════════════════');
    jobLog('  ✔ DỌN DẸP HỆ THỐNG HOÀN TẤT THÀNH CÔNG');
    jobLog('═══════════════════════════════════════════════════');
  }
}
