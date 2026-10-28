// ZenPanel - Hướng dẫn + prompt kết nối MCP cho các AI agent / IDE phổ biến, và nhật ký các lần AI gọi MCP
import { useState } from 'react';
import { ScrollText, Sparkles, Terminal, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Notice, SearchInput, Select, Spinner, cn, td, th, tr } from '../components/ui';
import { del } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Client {
  id: string;
  name: string;
  /** nơi dán cấu hình */
  where: string;
  lang: 'bash' | 'json' | 'toml' | 'text';
  config: (url: string, token: string) => string;
  note?: string;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const CLIENTS: Client[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    where: 'Chạy trong terminal (thêm cho mọi dự án: --scope user)',
    lang: 'bash',
    config: (url, t) => `claude mcp add --transport http --scope user zenpanel ${url} \\\n  --header "Authorization: Bearer ${t}"\n\n# Kiểm tra\nclaude mcp list`,
  },
  {
    id: 'claude-cli',
    name: 'Claude CLI (file .mcp.json)',
    where: '.mcp.json ở thư mục dự án (hoặc ~/.claude.json)',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { type: 'http', url, headers: bearer(t) } } }),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    where: 'claude_desktop_config.json (Settings → Developer → Edit Config). Dùng cầu nối mcp-remote',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', `Authorization:Bearer ${t}`] } } }),
  },
  {
    id: 'codex',
    name: 'OpenAI Codex (CLI / IDE)',
    where: '~/.codex/config.toml (hoặc .codex/config.toml trong dự án tin cậy)',
    lang: 'toml',
    config: (url, t) => `# Cách 1 (khuyên dùng): token đọc từ biến môi trường
# export ZENPANEL_TOKEN=${t}
[mcp_servers.zenpanel]
url = "${url}"
bearer_token_env_var = "ZENPANEL_TOKEN"

# Cách 2: ghi thẳng header vào file
# [mcp_servers.zenpanel]
# url = "${url}"
# http_headers = { Authorization = "Bearer ${t}" }

# Kiểm tra: codex mcp list`,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT (Connector)',
    where: 'Settings → Connectors → Advanced → Developer mode → Create',
    lang: 'text',
    config: (url) => `MCP server URL: ${url}
Xác thực: ChatGPT chỉ hỗ trợ OAuth hoặc No Authentication, không gửi được header "Authorization: Bearer".
ZenPanel MCP dùng API token (Bearer) nên ChatGPT chưa kết nối trực tiếp được.
Dùng Codex (cùng tài khoản OpenAI) hoặc các client khác trong danh sách để thay thế.`,
  },
  {
    id: 'antigravity-ide',
    name: 'Google Antigravity IDE',
    where: '~/.gemini/config/mcp_config.json (Agent panel → … → Manage MCP Servers → View raw config)',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { serverUrl: url, headers: bearer(t) } } }),
  },
  {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    where: '~/.gemini/config/mcp_config.json (dùng chung với IDE). Kiểm tra: chạy agy rồi gõ /mcp',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { serverUrl: url, headers: bearer(t) } } }),
  },
  {
    id: 'zed',
    name: 'Zed',
    where: 'settings.json (Cmd/Ctrl + , → Open Settings)',
    lang: 'json',
    config: (url, t) => json({ context_servers: { zenpanel: { url, headers: bearer(t) } } }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where: '~/.cursor/mcp.json (toàn cục) hoặc .cursor/mcp.json (dự án)',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { url, headers: bearer(t) } } }),
  },
  {
    id: 'vscode',
    name: 'VS Code (GitHub Copilot)',
    where: '.vscode/mcp.json hoặc lệnh "MCP: Add Server"',
    lang: 'json',
    config: (url, t) => json({ servers: { zenpanel: { type: 'http', url, headers: bearer(t) } } }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    where: '~/.codeium/windsurf/mcp_config.json',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { serverUrl: url, headers: bearer(t) } } }),
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    where: '~/.gemini/settings.json',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { httpUrl: url, headers: bearer(t) } } }),
  },
  {
    id: 'cline',
    name: 'Cline / Roo Code',
    where: 'MCP Servers → Configure → cline_mcp_settings.json',
    lang: 'json',
    config: (url, t) => json({ mcpServers: { zenpanel: { type: 'streamableHttp', url, headers: bearer(t), disabled: false } } }),
  },
  {
    id: 'n8n',
    name: 'n8n / Dify / công cụ khác',
    where: 'Node "MCP Client" → HTTP Streamable',
    lang: 'text',
    config: (url, t) => `Endpoint: ${url}\nTransport: HTTP Streamable (POST, không dùng SSE)\nHeader: Authorization: Bearer ${t}`,
  },
];

/** Prompt dán cho AI agent để nó tự cấu hình + biết cách dùng ZenPanel an toàn */
export function agentPrompt(client: Client, url: string, token: string): string {
  return `Hãy kết nối MCP server "ZenPanel" (quản trị VPS) vào ${client.name} của tôi.

Thông tin:
- URL (HTTP Streamable, JSON-RPC qua POST, KHÔNG dùng SSE): ${url}
- Xác thực: header "Authorization: Bearer ${token}"
- Tên server: zenpanel

Việc cần làm:
1. Thêm cấu hình MCP vào đúng nơi ${client.name} lưu (${client.where}). Nếu đã có mục "zenpanel" thì cập nhật chứ đừng tạo trùng. Giữ nguyên các server MCP khác.
2. Cấu hình mẫu tham khảo:
${client.config(url, token)}
3. Khởi động lại / tải lại MCP rồi gọi công cụ get_system_status để kiểm tra kết nối, và báo kết quả cho tôi.

Quy tắc khi dùng ZenPanel MCP:
- Ưu tiên công cụ chỉ đọc (get_system_status, list_services, list_processes, list_containers, list_websites, firewall_status, list_log_sources, read_log) để chẩn đoán trước.
- Công cụ thay đổi (control_service, container_action, optimize_ram, create_backup) chỉ gọi khi tôi yêu cầu rõ; luôn nói rõ sẽ làm gì trước khi gọi.
- Không dừng hay khởi động lại dịch vụ ZenPanel. Không in token ra màn hình hoặc commit token vào git.
- Trả lời bằng tiếng Việt.`;
}

const LANG_LABEL = { bash: 'Terminal', json: 'JSON', toml: 'TOML', text: 'Thông tin nhập' } as const;

function Code({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
        {label}
        <CopyButton value={code} />
      </div>
      <pre className="mono max-h-72 overflow-auto whitespace-pre rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-emerald-200">{code}</pre>
    </div>
  );
}

export function McpClients({ origin, token }: { origin: string; token: string }) {
  const [active, setActive] = useState(CLIENTS[0].id);
  const client = CLIENTS.find((c) => c.id === active) ?? CLIENTS[0];
  const url = `${origin}/mcp`;
  return (
    <Card title="Kết nối cho từng AI / IDE" icon={Terminal}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', active === c.id ? 'bg-zen-blue text-white shadow' : 'bg-ink-950/60 text-slate-400 hover:bg-slate-800 hover:text-white')}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge tone="blue">{LANG_LABEL[client.lang]}</Badge>
            <span>Dán vào: <b className="text-slate-200">{client.where}</b></span>
          </div>
          <Code label="Cấu hình" code={client.config(url, token)} />
          {client.note && <Notice tone="amber">{client.note}</Notice>}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Sparkles className="size-3.5 text-amber-300" /> Prompt để AI tự cấu hình giúp bạn
            </div>
            <Code label="Dán nguyên văn cho AI agent" code={agentPrompt(client, url, token)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

interface McpLog { id: string; at: string; token: string; ip: string; client: string; method: string; tool: string | null; args: string | null; ok: boolean; error: string | null; ms: number }

export function McpLogs() {
  const logs = useApi<McpLog[]>('/api/mcp/logs?limit=300', 5000);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'ok' | 'fail'>('all');
  const { run, confirm } = useFeedback();
  const list = (logs.data ?? []).filter((l) => (status === 'all' || (status === 'ok') === l.ok) && (!q || `${l.token} ${l.tool ?? ''} ${l.method} ${l.ip} ${l.client} ${l.args ?? ''} ${l.error ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card
      title="Nhật ký gọi MCP"
      icon={ScrollText}
      bodyClassName="p-0"
      actions={
        <Button
          size="xs"
          variant="ghost"
          icon={Trash2}
          disabled={!logs.data?.length}
          onClick={async () => {
            if (!(await confirm({ title: 'Xoá nhật ký MCP', message: 'Xoá toàn bộ lịch sử các lần AI gọi MCP?', danger: true, confirmLabel: 'Xoá' }))) return;
            await run(() => del('/api/mcp/logs'), 'Đã xoá nhật ký');
            await logs.reload();
          }}
        >
          Xoá log
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Lọc theo token, công cụ, IP, client..." className="w-72 max-w-full" />
        <Select className="h-9 w-40 py-0 text-xs" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Mọi kết quả</option>
          <option value="ok">Thành công</option>
          <option value="fail">Thất bại</option>
        </Select>
        <span className="ml-auto text-xs text-slate-500">Tự làm mới mỗi 5 giây · giữ 500 lần gần nhất</span>
      </div>
      {logs.error ? (
        <div className="p-4"><ErrorBox message={logs.error} onRetry={logs.reload} /></div>
      ) : !logs.data ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon={ScrollText} title="Chưa có lần gọi MCP nào" description="Khi AI (Claude, Cursor, Codex...) kết nối và gọi công cụ, từng lần gọi sẽ hiện ở đây." />
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr><th className={th}>Thời gian</th><th className={th}>Token / Client</th><th className={th}>Yêu cầu</th><th className={th}>Kết quả</th><th className={cn(th, 'text-right')}>ms</th></tr></thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className={tr}>
                  <td className={cn(td, 'whitespace-nowrap text-xs text-slate-400')} data-tip={formatDate(l.at)}>{formatRelative(l.at)}</td>
                  <td className={td}>
                    <div className="font-semibold text-slate-100">{l.token}</div>
                    <div className="mono truncate text-[11px] text-slate-500" data-tip={l.client}>{l.ip}{l.client ? ` · ${l.client}` : ''}</div>
                  </td>
                  <td className={td}>
                    <div className="mono text-xs text-slate-200">{l.tool ?? l.method}</div>
                    {l.tool && l.args && l.args !== '{}' && <div className="mono max-w-[320px] truncate text-[11px] text-slate-500" data-tip={l.args}>{l.args}</div>}
                  </td>
                  <td className={td}>
                    <Badge tone={l.ok ? 'green' : 'red'}>{l.ok ? 'OK' : 'Lỗi'}</Badge>
                    {l.error && <div className="mt-0.5 max-w-[280px] truncate text-[11px] text-rose-300" data-tip={l.error}>{l.error}</div>}
                  </td>
                  <td className={cn(td, 'mono text-right text-xs text-slate-400')}>{l.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
