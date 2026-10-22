// ZenPanel - API hệ thống: thông tin máy, metrics, tiến trình, dịch vụ, tường lửa, cổng mạng
import type { FastifyInstance } from 'fastify';
import type { FirewallRuleInput, ServiceAction, ServiceInfo } from '../adapters/base.adapter.js';
import type { AppContext } from '../core/context.js';
import { config } from '../config.js';
import { startJob } from '../core/jobs.js';
import { badRequest, HttpError, isIpOrCidr, isPortSpec, isServiceName } from '../core/validate.js';

const SERVICE_ACTIONS: ServiceAction[] = ['start', 'stop', 'restart', 'enable', 'disable'];

export async function systemRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { adapter } = ctx;

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
    return { logs: await adapter.serviceLogs(name, 200) };
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
}
