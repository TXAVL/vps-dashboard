// ZenPanel - API hệ thống: thông tin máy, metrics, tiến trình, dịch vụ, tường lửa, cổng mạng
import type { FastifyInstance } from 'fastify';
import type { CleanExecutionOptions, FirewallRuleInput, ServiceAction, ServiceInfo } from '../adapters/base.adapter.js';
import type { AppContext } from '../core/context.js';
import { config } from '../config.js';
import { startJob } from '../core/jobs.js';
import { badRequest, HttpError, isIpOrCidr, isPortSpec, isServiceName } from '../core/validate.js';
import type { CleanService } from '../services/clean.service.js';
import { VpsDoctorService } from '../services/vpsdoctor.service.js';
import { QuickToolsService } from '../services/quicktools.service.js';

const SERVICE_ACTIONS: ServiceAction[] = ['start', 'stop', 'restart', 'enable', 'disable'];

export async function systemRoutes(app: FastifyInstance, ctx: AppContext, services?: { clean?: CleanService }): Promise<void> {
  const { adapter } = ctx;
  const doctor = new VpsDoctorService(ctx);
  const tools = new QuickToolsService();

  const expected: Record<ServiceAction, (s: ServiceInfo) => boolean> = {
    start: (s) => s.state === 'running',
    restart: (s) => s.state === 'running',
    stop: (s) => s.state === 'stopped',
    enable: (s) => s.startup === 'auto',
    disable: (s) => s.startup === 'disabled',
  };
  const stateLabel: Record<string, string> = { running: 'đang chạy', stopped: 'đã dừng', starting: 'đang khởi động', stopping: 'đang dừng', failed: 'lỗi' };

  async function waitForService(name: string, action: ServiceAction): Promise<ServiceInfo> {
    let last: ServiceInfo | null = null;
    for (let i = 0; i < 20; i++) {
      last = await adapter.getService(name);
      if (last && expected[action](last)) return last;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!last) throw new HttpError(404, `Không tìm thấy dịch vụ ${name}`);
    const now = action === 'enable' || action === 'disable' ? `kiểu khởi động: ${last.startup}` : `trạng thái: ${stateLabel[last.state] ?? last.state}`;
    throw new HttpError(500, `Đã gửi lệnh nhưng dịch vụ "${last.displayName}" không đổi như mong muốn (${now}). Dịch vụ có thể tự dừng ngay, bị hệ thống khởi động lại, hoặc bị chặn bởi dịch vụ phụ thuộc.`);
  }

  app.get('/api/system/info', async () => ({
    os: ctx.osInfo,
    version: ctx.version,
    port: ctx.port,
    dataDir: config.dataDir,
    agentUptime: Math.floor((Date.now() - ctx.startedAt) / 1000),
    tunnel: ctx.tunnel?.getState() ?? { status: 'stopped', url: null, error: null },
    webServers: await Promise.all(
      adapter.webServers().map(async (d) => ({ kind: d.kind, label: d.label, supports: d.supports, installed: Boolean(await d.detect()) })),
    ),
  }));

  app.get('/api/metrics', async () => ({ latest: ctx.metrics.latest(), history: ctx.metrics.getHistory() }));

  // ------------------------------------------------------------ Tiến trình
  app.get('/api/processes', async () => adapter.listProcesses());

  app.post('/api/processes/:pid/kill', async (req) => {
    const pid = Number((req.params as { pid: string }).pid);
    if (!Number.isInteger(pid) || pid <= 0) throw badRequest('PID không hợp lệ');
    if (pid === process.pid) throw badRequest('Không thể dừng chính ZenPanel Agent');
    await adapter.killProcess(pid, Boolean((req.body as { force?: boolean } | undefined)?.force));
    return { ok: true };
  });

  // ------------------------------------------------------------ Dịch vụ
  app.get('/api/services', async () => adapter.listServices());

  app.post('/api/services/:name/:action', async (req) => {
    const { name, action } = req.params as { name: string; action: ServiceAction };
    if (!isServiceName(name)) throw badRequest('Tên dịch vụ không hợp lệ');
    if (!SERVICE_ACTIONS.includes(action)) throw badRequest('Thao tác không hợp lệ');
    await adapter.controlService(name, action);
    // Lệnh trả về OK chưa chắc dịch vụ đã đổi trạng thái (tự dừng ngay, bị khởi động lại...) -> xác minh thật
    const service = await waitForService(name, action);
    return { ok: true, service };
  });

  app.get('/api/services/:name/logs', async (req) => {
    const { name } = req.params as { name: string };
    if (!isServiceName(name)) throw badRequest('Tên dịch vụ không hợp lệ');
    const lines = Math.min(2000, Math.max(20, Number((req.query as { lines?: string }).lines) || 200));
    return { logs: await adapter.serviceLogs(name, lines) };
  });

  // ------------------------------------------------------------ Tường lửa
  app.get('/api/firewall', async () => {
    const [status, rules, persistence] = await Promise.all([adapter.getFirewallStatus(), adapter.listFirewallRules(), adapter.firewallPersistence()]);
    return { status, rules, persistence };
  });

  // Cài iptables-persistent / iptables-services để quy tắc không mất khi khởi động lại VPS
  app.post('/api/firewall/persistence', async () => {
    const current = await adapter.firewallPersistence();
    if (!current.required || current.installed) return { ok: true, skipped: true };
    return startJob(`Cài ${current.tool} để lưu quy tắc tường lửa vĩnh viễn`, 'firewall', () => adapter.installFirewallPersistence());
  });

  app.post('/api/firewall/toggle', async (req) => {
    const enabled = Boolean((req.body as { enabled?: boolean } | undefined)?.enabled);
    await adapter.setFirewallEnabled(enabled, [ctx.port]);
    return adapter.getFirewallStatus();
  });

  app.post('/api/firewall/rules', async (req) => {
    const body = (req.body ?? {}) as Partial<FirewallRuleInput>;
    const rule: FirewallRuleInput = {
      action: body.action === 'deny' ? 'deny' : 'allow',
      port: body.port ? String(body.port).trim() : null,
      protocol: body.protocol === 'tcp' || body.protocol === 'udp' ? body.protocol : 'any',
      source: body.source ? String(body.source).trim() : null,
      description: typeof body.description === 'string' ? body.description.replace(/["'`$\\]/g, '').slice(0, 80) : undefined,
    };
    if (rule.port && !isPortSpec(rule.port)) throw badRequest('Cổng không hợp lệ (ví dụ 80 hoặc 8000-8100)');
    if (rule.source && !isIpOrCidr(rule.source)) throw badRequest('Địa chỉ IP/CIDR không hợp lệ');
    if (!rule.port && !rule.source) throw badRequest('Cần nhập cổng hoặc địa chỉ IP');
    await adapter.addFirewallRule(rule);
    return { ok: true };
  });

  app.delete('/api/firewall/rules/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!/^[\w:{}=.\-/]+$/.test(id)) throw badRequest('Mã luật không hợp lệ');
    await adapter.deleteFirewallRule(id);
    return { ok: true };
  });

  app.get('/api/ports', async () => adapter.listListeningPorts());

  // ------------------------------------------------------------ Dọn dẹp hệ thống & Hạ tải CPU
  app.get('/api/system/clean/scan', async () => services?.clean?.scan());

  app.post('/api/system/clean/execute', async (req) => {
    if (!services?.clean) throw badRequest('Dịch vụ dọn dẹp chưa sẵn sàng');
    const options = (req.body ?? {}) as CleanExecutionOptions;
    return startJob('Dọn dẹp hệ thống', 'clean', () => services.clean!.execute(options));
  });

  app.post('/api/system/clean/kill-cpu-hogs', async (req) => {
    const minCpu = Number((req.body as { minCpu?: number } | undefined)?.minCpu ?? 35);
    const procs = await adapter.listProcesses();
    const hogs = procs.filter((p) => p.cpu >= minCpu && p.pid !== process.pid);
    const killed: { pid: number; name: string; cpu: number }[] = [];
    for (const p of hogs) {
      try {
        await adapter.killProcess(p.pid, true);
        killed.push({ pid: p.pid, name: p.name, cpu: p.cpu });
      } catch {
        // bỏ qua tiến trình không thể dừng
      }
    }
    return { ok: true, killedCount: killed.length, killed };
  });

  // ------------------------------------------------------------ Bác Sĩ VPS & Tương thích đa nền tảng (VPS Doctor)
  app.get('/api/system/public-ip', async () => {
    const publicIp = await doctor.getPublicIp();
    const privateIps = doctor.getPrivateIps();
    const isBehindNat = doctor.isBehindNat(publicIp, privateIps);
    return { publicIp, privateIps, isBehindNat };
  });

  app.get('/api/system/vps-doctor', async () => {
    return doctor.diagnose();
  });

  app.post('/api/system/vps-doctor/create-swap', async (req) => {
    const sizeMb = Number((req.body as { sizeMb?: number } | undefined)?.sizeMb ?? 2048);
    return startJob(`Tạo bộ nhớ ảo Swap (${sizeMb} MB)`, 'vps_doctor', () => doctor.createSwap(sizeMb));
  });

  app.post('/api/system/vps-doctor/enable-bbr', async () => {
    return startJob('Kích hoạt thuật toán Google TCP BBR', 'vps_doctor', () => doctor.enableBbr());
  });

  app.post('/api/system/vps-doctor/fix-firewall', async () => {
    return startJob('Cấu hình tự động tường lửa (ZenPanel & SSH)', 'vps_doctor', () => doctor.fixFirewall());
  });

  // ------------------------------------------------------------ Tiện ích nhanh & Kho tính năng (Quick Tools)
  app.post('/api/system/tools/purge-ram', async () => {
    return tools.purgeRamCache();
  });

  app.post('/api/system/tools/check-port', async (req) => {
    const { host, port, timeoutMs } = req.body as { host: string; port: number; timeoutMs?: number };
    return tools.checkPort(host, Number(port), timeoutMs);
  });

  app.post('/api/system/tools/dns-lookup', async (req) => {
    const { domain } = req.body as { domain: string };
    return tools.lookupDns(domain);
  });

  app.post('/api/system/tools/ssl-check', async (req) => {
    const { domain, port, timeoutMs } = req.body as { domain: string; port?: number; timeoutMs?: number };
    return tools.checkSsl(domain, port ? Number(port) : 443, timeoutMs);
  });

  app.post('/api/system/tools/diagnose-port', async (req) => {
    const { port } = req.body as { port: number };
    return tools.diagnosePort(Number(port));
  });

  app.post('/api/system/tools/disk-benchmark', async (req) => {
    const { testPath } = (req.body as { testPath?: string }) || {};
    return tools.diskBenchmark(testPath);
  });

  app.post('/api/system/tools/fix-permissions', async (req) => {
    const { targetPath } = (req.body as { targetPath?: string }) || {};
    return tools.fixWebPermissions(targetPath);
  });

  app.post('/api/system/tools/ai-latency', async (req) => {
    const { provider } = req.body as { provider: string };
    return tools.testAiLatency(provider);
  });
}
