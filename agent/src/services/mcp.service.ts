// ZenPanel - MCP server (Model Context Protocol qua HTTP): cho Claude, Cursor, n8n... xem và quản trị VPS bằng ngôn ngữ tự nhiên.
// Xác thực bằng API token (zpt_...). Công cụ đọc dùng được với mọi token; công cụ thay đổi cần token quyền "Đầy đủ".
// Không có công cụ chạy lệnh shell tuỳ ý.
import type { FastifyInstance } from 'fastify';
import type { OSAdapter, ServiceAction } from '../adapters/base.adapter.js';
import { verifyApiTokenForMcp, type TokenScope } from '../core/apitokens.js';
import type { MetricsCollector } from '../core/metrics.js';
import { clientIp } from '../core/auth.js';
import { addMcpLog } from '../core/mcplog.js';
import { isServiceName } from '../core/validate.js';
import type { AuditService } from './audit.service.js';
import type { BackupService } from './backup.service.js';
import type { CleanService } from './clean.service.js';
import type { DockerService } from './docker.service.js';
import type { LogService } from './logs.service.js';
import type { SiteService } from './site.service.js';

type Json = Record<string, unknown>;
interface Caller {
  client?: string;
  name: string;
  scope: TokenScope;
  ip: string;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Json;
  /** true = thay đổi hệ thống, cần token quyền Đầy đủ */
  write?: boolean;
  run: (args: Json, caller: Caller) => Promise<unknown>;
}

const PROTOCOL = '2025-03-26';
const obj = (properties: Json, required: string[] = []): Json => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description: string, extra: Json = {}): Json => ({ type: 'string', description, ...extra });

export class McpService {
  private tools: Tool[];

  constructor(
    private readonly deps: {
      adapter: OSAdapter;
      metrics: MetricsCollector;
      docker: DockerService;
      sites: SiteService;
      logs: LogService;
      clean: CleanService;
      backups: BackupService;
      audit: AuditService;
      version: string;
    },
  ) {
    const { adapter, metrics, docker, sites, logs, clean, backups } = deps;
    this.tools = [
      {
        name: 'get_system_status',
        description: 'Tổng quan VPS: hệ điều hành, CPU, RAM, ổ đĩa, mạng, thời gian chạy.',
        inputSchema: obj({}),
        run: async () => {
          const [info, snap] = await Promise.all([adapter.getInfo(), Promise.resolve(metrics.latest())]);
          return {
            os: info,
            cpuPercent: snap?.cpu.usage,
            ram: snap ? { usedGB: +(snap.memory.used / 1073741824).toFixed(2), totalGB: +(snap.memory.total / 1073741824).toFixed(2), usedPercent: +((snap.memory.used / snap.memory.total) * 100).toFixed(1) } : null,
            disks: snap?.disks.map((d) => ({ mount: d.mount, usedPercent: +((d.used / d.total) * 100).toFixed(1), freeGB: +((d.total - d.used) / 1073741824).toFixed(1) })),
            load: snap?.load,
            uptimeSeconds: snap?.uptime,
            zenpanelVersion: deps.version,
          };
        },
      },
      {
        name: 'list_services',
        description: 'Danh sách dịch vụ hệ thống (systemd / Windows Services) kèm trạng thái và RAM. Lọc theo tên hoặc trạng thái.',
        inputSchema: obj({ search: str('Từ khoá trong tên dịch vụ'), state: str('Lọc trạng thái', { enum: ['running', 'stopped', 'failed'] }), limit: { type: 'integer', description: 'Tối đa (mặc định 50)' } }),
        run: async (a) => {
          const q = String(a.search ?? '').toLowerCase();
          const list = (await adapter.listServices())
            .filter((s) => (!q || s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q)) && (!a.state || s.state === a.state))
            .slice(0, Math.min(200, Number(a.limit) || 50));
          return list.map((s) => ({ name: s.name, display: s.displayName, state: s.state, startup: s.startup, memoryMB: s.memory ? Math.round(s.memory / 1048576) : null }));
        },
      },
      {
        name: 'list_processes',
        description: 'Tiến trình đang chạy, sắp xếp theo RAM hoặc CPU.',
        inputSchema: obj({ sortBy: str('Sắp xếp theo', { enum: ['memory', 'cpu'] }), limit: { type: 'integer' } }),
        run: async (a) => {
          const key = a.sortBy === 'cpu' ? 'cpu' : 'memory';
          return (await adapter.listProcesses())
            .sort((x, y) => y[key] - x[key])
            .slice(0, Math.min(50, Number(a.limit) || 15))
            .map((p) => ({ pid: p.pid, name: p.name, cpuPercent: +p.cpu.toFixed(1), memoryMB: Math.round(p.memory / 1048576), user: p.user }));
        },
      },
      {
        name: 'list_containers',
        description: 'Danh sách Docker container và trạng thái.',
        inputSchema: obj({}),
        run: async () => (await docker.containers()).map((c) => ({ id: c.id, name: c.name, image: c.image, state: c.state, status: c.status, ports: c.ports })),
      },
      {
        name: 'list_websites',
        description: 'Các website / domain đang quản lý trong ZenPanel.',
        inputSchema: obj({}),
        run: async () => sites.list().map((s) => ({ domain: s.domain, root: s.root, type: s.type })),
      },
      {
        name: 'firewall_status',
        description: 'Luật tường lửa và các cổng đang lắng nghe.',
        inputSchema: obj({}),
        run: async () => {
          const [status, rules, ports] = await Promise.all([adapter.getFirewallStatus(), adapter.listFirewallRules(), adapter.listListeningPorts()]);
          return { status, rules, listening: ports.slice(0, 80) };
        },
      },
      {
        name: 'list_log_sources',
        description: 'Các nguồn nhật ký đọc được (journal, Event Log, nginx, website, ZenPanel...). Dùng id với read_log.',
        inputSchema: obj({}),
        run: async () => (await logs.sources()).map((s) => ({ id: s.id, label: s.label, group: s.group })),
      },
      {
        name: 'read_log',
        description: 'Đọc N dòng cuối của 1 nguồn nhật ký, có thể lọc theo từ khoá.',
        inputSchema: obj({ id: str('id lấy từ list_log_sources'), lines: { type: 'integer' }, search: str('Chỉ giữ dòng chứa từ này') }, ['id']),
        run: async (a) => {
          const res = await logs.read(String(a.id), Math.min(1000, Number(a.lines) || 150), String(a.search ?? ''));
          return res.content;
        },
      },
      {
        name: 'control_service',
        description: 'Khởi động / dừng / khởi động lại 1 dịch vụ hệ thống. CẦN token quyền Đầy đủ.',
        write: true,
        inputSchema: obj({ name: str('Tên dịch vụ (cột name của list_services)'), action: str('Thao tác', { enum: ['start', 'stop', 'restart'] }) }, ['name', 'action']),
        run: async (a) => {
          const name = String(a.name);
          const action = String(a.action) as ServiceAction;
          if (!isServiceName(name)) throw new Error('Tên dịch vụ không hợp lệ');
          if (!['start', 'stop', 'restart'].includes(action)) throw new Error('action phải là start, stop hoặc restart');
          if (/^zenpanel/i.test(name) && action !== 'start') throw new Error('Không dừng / khởi động lại ZenPanel qua MCP để tránh mất kết nối');
          await adapter.controlService(name, action);
          const after = await adapter.getService(name);
          return { name, action, stateNow: after?.state ?? 'unknown' };
        },
      },
      {
        name: 'container_action',
        description: 'Start / stop / restart 1 Docker container. CẦN token quyền Đầy đủ.',
        write: true,
        inputSchema: obj({ id: str('ID hoặc tên container'), action: str('Thao tác', { enum: ['start', 'stop', 'restart'] }) }, ['id', 'action']),
        run: async (a) => {
          if (!['start', 'stop', 'restart'].includes(String(a.action))) throw new Error('action phải là start, stop hoặc restart');
          await docker.containerAction(String(a.id), String(a.action) as 'start' | 'stop' | 'restart');
          return { id: a.id, action: a.action, ok: true };
        },
      },
      {
        name: 'optimize_ram',
        description: 'Thu hồi cache RAM (an toàn). Trả về job; dùng get_system_status để xem kết quả. CẦN token quyền Đầy đủ.',
        write: true,
        inputSchema: obj({}),
        run: async () => {
          const job = clean.optimizeRam({ dropCache: true, trimWorkingSets: true });
          return { jobId: job.id, note: 'Đang chạy nền, gọi get_system_status sau vài giây' };
        },
      },
      {
        name: 'create_backup',
        description: 'Sao lưu 1 website hoặc cấu hình ZenPanel. CẦN token quyền Đầy đủ.',
        write: true,
        inputSchema: obj({ kind: str('Loại', { enum: ['site', 'panel'] }), domain: str('Domain (khi kind=site)') }, ['kind']),
        run: async (a) => {
          const job = backups.create(a.kind === 'site' ? { kind: 'site', ref: String(a.domain ?? '') } : { kind: 'panel' });
          return { jobId: job.id, note: 'Đang sao lưu nền' };
        },
      },
    ];
  }

  /** Gắn route POST /mcp (JSON-RPC 2.0). Xác thực bằng API token riêng, không dùng phiên đăng nhập. */
  register(app: FastifyInstance): void {
    const handler = async (req: { headers: Record<string, unknown>; ip: string; body: unknown }, reply: { code: (n: number) => { send: (b?: unknown) => unknown }; header: (k: string, v: string) => unknown }) => {
      const auth = String(req.headers.authorization ?? '');
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : String(req.headers['x-api-key'] ?? '');
      const who = verifyApiTokenForMcp(token, clientIp(req as never));
      if ('error' in who) {
        addMcpLog({ token: '(không hợp lệ)', ip: clientIp(req as never), client: String(req.headers['user-agent'] ?? '').slice(0, 80), method: 'auth', tool: null, args: null, ok: false, error: who.error, ms: 0 });
        reply.header('WWW-Authenticate', 'Bearer realm="zenpanel-mcp"');
        return reply.code(401).send({ jsonrpc: '2.0', id: null, error: { code: -32001, message: who.error } });
      }
      const caller: Caller = { name: who.name, scope: who.scope, ip: clientIp(req as never), client: String(req.headers['user-agent'] ?? '').slice(0, 80) };
      const body = req.body as Json | Json[];
      // Batch hoặc 1 message
      if (Array.isArray(body)) {
        const results = (await Promise.all(body.map((m) => this.handle(m, caller)))).filter((r) => r !== null);
        return results.length ? reply.code(200).send(results) : reply.code(202).send();
      }
      const result = await this.handle(body, caller);
      return result === null ? reply.code(202).send() : reply.code(200).send(result);
    };
    app.post('/mcp', handler as never);
    app.post('/zen/mcp', handler as never);
    const notAllowed = async (_req: unknown, reply: { code: (n: number) => { send: (b?: unknown) => unknown } }) => reply.code(405).send({ error: 'MCP endpoint chỉ nhận POST (Streamable HTTP, không dùng SSE)' });
    app.get('/mcp', notAllowed as never);
    app.get('/zen/mcp', notAllowed as never);
  }

  private async handle(msg: Json, caller: Caller): Promise<Json | null> {
    const t0 = Date.now();
    const res = await this.dispatch(msg, caller);
    const method = String(msg.method ?? '');
    if (method !== 'ping' && !method.startsWith('notifications/')) {
      const params = (msg.params ?? {}) as { name?: string; arguments?: Json };
      const r = res as { error?: { message?: string }; result?: { isError?: boolean; content?: { text?: string }[] } } | null;
      const failed = Boolean(r?.error) || Boolean(r?.result?.isError);
      addMcpLog({
        token: caller.name,
        ip: caller.ip,
        client: caller.client ?? '',
        method,
        tool: method === 'tools/call' ? String(params.name ?? '') : null,
        args: method === 'tools/call' ? JSON.stringify(params.arguments ?? {}).slice(0, 300) : null,
        ok: !failed,
        error: failed ? (r?.error?.message ?? r?.result?.content?.[0]?.text ?? 'Lỗi').slice(0, 300) : null,
        ms: Date.now() - t0,
      });
    }
    return res;
  }

  private async dispatch(msg: Json, caller: Caller): Promise<Json | null> {
    const id = (msg.id ?? null) as string | number | null;
    const method = String(msg.method ?? '');
    const ok = (result: unknown): Json => ({ jsonrpc: '2.0', id, result });
    const fail = (code: number, message: string): Json => ({ jsonrpc: '2.0', id, error: { code, message } });
    // Thông báo (không có id) không cần trả lời
    if (msg.id === undefined && method.startsWith('notifications/')) return null;

    switch (method) {
      case 'initialize':
        return ok({
          protocolVersion: PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'zenpanel', version: this.deps.version },
          instructions: `ZenPanel ${this.deps.version}: quản trị VPS. Token "${caller.name}" có quyền ${caller.scope === 'full' ? 'ĐẦY ĐỦ (có thể thay đổi hệ thống)' : 'CHỈ ĐỌC'}.`,
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({
          tools: this.tools
            .filter((t) => caller.scope === 'full' || !t.write)
            .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        });
      case 'tools/call': {
        const params = (msg.params ?? {}) as { name?: string; arguments?: Json };
        const tool = this.tools.find((t) => t.name === params.name);
        if (!tool) return fail(-32602, `Không có công cụ "${params.name}"`);
        if (tool.write && caller.scope !== 'full') {
          return ok({ isError: true, content: [{ type: 'text', text: `Token "${caller.name}" chỉ có quyền đọc. Tạo token quyền "Đầy đủ" trong ZenPanel → Kết nối API & MCP để dùng ${tool.name}.` }] });
        }
        try {
          const data = await tool.run(params.arguments ?? {}, caller);
          if (tool.write) {
            this.deps.audit.record({ user: `mcp:${caller.name}`, ip: caller.ip, method: 'MCP', path: `/mcp/${tool.name}`, status: 200, action: `MCP: ${tool.name} ${JSON.stringify(params.arguments ?? {}).slice(0, 120)}`, ms: 0 });
          }
          const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          return ok({ content: [{ type: 'text', text: text.length > 60_000 ? `${text.slice(0, 60_000)}\n...[cắt bớt]` : text }] });
        } catch (err) {
          if (tool.write) {
            this.deps.audit.record({ user: `mcp:${caller.name}`, ip: caller.ip, method: 'MCP', path: `/mcp/${tool.name}`, status: 500, action: `MCP: ${tool.name} thất bại`, ms: 0 });
          }
          return ok({ isError: true, content: [{ type: 'text', text: `Lỗi: ${(err as Error).message}` }] });
        }
      }
      default:
        return fail(-32601, `Phương thức không hỗ trợ: ${method}`);
    }
  }
}
