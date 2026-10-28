// ZenPanel - Kết nối API & MCP: tạo API token (chỉ đọc / đầy đủ) và hướng dẫn nối Claude, Cursor, n8n... với VPS
import { useState } from 'react';
import { AlertTriangle, BrainCircuit, Check, Copy, KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, PageHeader, Select, Spinner, cn, td, th, tr } from '../components/ui';
import { del, post } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';
import { McpClients, McpLogs } from './McpClients';
import { useApi } from '../lib/hooks';

interface Token { id: string; name: string; hint: string; scope: 'read' | 'full'; createdAt: string; expiresAt: string | null; lastUsedAt: string | null; lastIp: string | null; uses: number }

const EXPIRY_OPTIONS = [
  { id: 'never', label: 'Không hết hạn' },
  { id: 'h1', label: '1 giờ' },
  { id: 'h6', label: '6 giờ' },
  { id: 'd1', label: '24 giờ' },
  { id: 'd3', label: '3 ngày' },
  { id: 'd7', label: '7 ngày' },
  { id: 'd14', label: '14 ngày' },
  { id: 'd30', label: '30 ngày' },
  { id: 'd60', label: '60 ngày' },
  { id: 'd90', label: '90 ngày' },
  { id: 'd180', label: '180 ngày' },
  { id: 'd365', label: '1 năm' },
  { id: 'days', label: 'Tuỳ chỉnh: số ngày...' },
  { id: 'date', label: 'Tuỳ chỉnh: chọn ngày giờ...' },
];

/** Đổi lựa chọn thời hạn thành tham số gửi API */
function expiryPayload(creating: { expiry: string; customDays: string; customDate: string }): { expiresInDays: number | null; customExpiresAt: string | null } | string {
  const e = creating.expiry;
  if (e === 'never') return { expiresInDays: null, customExpiresAt: null };
  if (e === 'date') {
    const t = new Date(creating.customDate).getTime();
    if (!creating.customDate || !Number.isFinite(t) || t <= Date.now()) return 'Chọn ngày giờ hết hạn ở tương lai';
    return { expiresInDays: null, customExpiresAt: new Date(t).toISOString() };
  }
  if (e === 'days') {
    const d = Number(creating.customDays);
    if (!Number.isFinite(d) || d <= 0 || d > 3650) return 'Số ngày phải từ 1 đến 3650';
    return { expiresInDays: d, customExpiresAt: null };
  }
  if (e.startsWith('h')) return { expiresInDays: null, customExpiresAt: new Date(Date.now() + Number(e.slice(1)) * 3_600_000).toISOString() };
  return { expiresInDays: Number(e.slice(1)), customExpiresAt: null };
}

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
        {label}
        <CopyButton value={code} />
      </div>
      <pre className="mono overflow-x-auto whitespace-pre rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-emerald-200">{code}</pre>
    </div>
  );
}

export default function ApiAccess() {
  const tokens = useApi<Token[]>('/api/tokens');
  const [creating, setCreating] = useState<{ name: string; scope: 'read' | 'full'; expiry: string; customDays: string; customDate: string } | null>(null);
  const [created, setCreated] = useState<{ token: string; info: Token } | null>(null);
  const [copied, setCopied] = useState(false);
  const { run, confirm, toast } = useFeedback();
  const origin = window.location.origin;
  const sample = created?.token ?? 'zpt_<TOKEN_CỦA_BẠN>';

  const create = async () => {
    if (!creating) return;
    const exp = expiryPayload(creating);
    if (typeof exp === 'string') {
      toast(exp, 'error');
      return;
    }
    const res = await run(() => post<{ token: string; info: Token }>('/api/tokens', { name: creating.name, scope: creating.scope, ...exp }));
    if (res) {
      setCreated(res);
      setCreating(null);
      await tokens.reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Kết nối API & MCP"
        description="Điều khiển VPS từ Claude, Cursor, n8n hoặc script của bạn bằng API token, không cần đưa mật khẩu panel"
        icon={BrainCircuit}
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating({ name: '', scope: 'read', expiry: 'd30', customDays: '14', customDate: '' })}>Tạo token</Button>}
      />

      <div className="space-y-4">
        <Card title="API token" icon={KeyRound} bodyClassName="p-0">
          {tokens.error ? (
            <div className="p-4"><ErrorBox message={tokens.error} onRetry={tokens.reload} /></div>
          ) : !tokens.data ? (
            <Spinner />
          ) : tokens.data.length === 0 ? (
            <EmptyState icon={KeyRound} title="Chưa có API token" description="Tạo token để Claude / Cursor / n8n đọc trạng thái VPS, hoặc (nếu bạn cho phép) khởi động lại dịch vụ." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr><th className={th}>Tên</th><th className={th}>Quyền</th><th className={th}>Lần dùng cuối</th><th className={th}>Hết hạn</th><th className={cn(th, 'text-right')} /></tr></thead>
                <tbody>
                  {tokens.data.map((t) => (
                    <tr key={t.id} className={tr}>
                      <td className={td}>
                        <div className="font-semibold text-slate-100">{t.name}</div>
                        <div className="mono text-xs text-slate-500">{t.hint} · tạo {formatRelative(t.createdAt)}</div>
                      </td>
                      <td className={td}><Badge tone={t.scope === 'full' ? 'amber' : 'green'}>{t.scope === 'full' ? 'Đầy đủ' : 'Chỉ đọc'}</Badge></td>
                      <td className={cn(td, 'text-xs text-slate-400')}>{t.lastUsedAt ? <>{formatRelative(t.lastUsedAt)}<div className="mono text-slate-500">{t.lastIp} · {t.uses} lần</div></> : 'Chưa dùng'}</td>
                      <td className={cn(td, 'text-xs text-slate-400')}>{t.expiresAt ? formatDate(t.expiresAt) : 'Không hết hạn'}</td>
                      <td className={cn(td, 'text-right')}>
                        <IconButton icon={Trash2} title="Thu hồi" className="hover:text-zen-red" onClick={async () => {
                          if (!(await confirm({ title: `Thu hồi token "${t.name}"`, message: 'Mọi ứng dụng đang dùng token này sẽ mất quyền truy cập ngay lập tức.', danger: true, confirmLabel: 'Thu hồi' }))) return;
                          await run(() => del(`/api/tokens/${t.id}`), 'Đã thu hồi token');
                          await tokens.reload();
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <McpClients origin={origin} token={sample} />

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Kết nối AI qua MCP" icon={BrainCircuit}>
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-slate-400">
                MCP (Model Context Protocol) cho phép AI hỏi trực tiếp VPS của bạn: <i>"RAM đang bị tiến trình nào ngốn?"</i>, <i>"đọc 100 dòng log nginx lỗi"</i>, <i>"khởi động lại docker"</i>. Địa chỉ MCP:
              </p>
              <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
                <code className="mono min-w-0 flex-1 truncate text-sm text-emerald-300">{origin}/mcp</code>
                <CopyButton value={`${origin}/mcp`} />
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
                Nếu bạn truy cập panel qua link <b>trycloudflare.com</b>, link này đổi mỗi lần máy chủ khởi động lại — nên dùng IP hoặc domain cố định cho MCP.
              </div>
            </div>
          </Card>

          <Card title="Công cụ AI được dùng" icon={ShieldCheck}>
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 flex items-center gap-2 font-bold text-emerald-300"><Badge tone="green">Chỉ đọc</Badge> mọi token</div>
                <p className="leading-relaxed text-slate-400">Tổng quan hệ thống · dịch vụ · tiến trình · Docker container · website · tường lửa & cổng · đọc nhật ký (journal, Event Log, nginx, ZenPanel).</p>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 font-bold text-amber-300"><Badge tone="amber">Thay đổi</Badge> chỉ token "Đầy đủ"</div>
                <p className="leading-relaxed text-slate-400">Khởi động / dừng / khởi động lại dịch vụ và container · tối ưu RAM · sao lưu website. Mọi thao tác đều ghi vào <b>Nhật ký thao tác</b> kèm tên token.</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-ink-950/40 p-3 text-slate-400">
                <div className="mb-1 flex items-center gap-1.5 font-bold text-slate-200"><AlertTriangle className="size-3.5 text-slate-400" /> Giới hạn an toàn</div>
                Không có công cụ chạy lệnh shell tuỳ ý. Token không đổi được mật khẩu, không quản lý token khác, không tắt / khởi động lại máy chủ, không dừng ZenPanel.
              </div>
              <Snippet label="Dùng REST API trực tiếp (cùng token)" code={`curl ${origin}/api/system/info \\\n  -H "Authorization: Bearer ${sample}"`} />
            </div>
          </Card>
        </div>

        <McpLogs />
      </div>

      {creating && (
        <Modal open onClose={() => setCreating(null)} title="Tạo API token" size="sm" footer={<><Button variant="ghost" onClick={() => setCreating(null)}>Huỷ</Button><Button variant="primary" icon={KeyRound} disabled={!creating.name.trim()} onClick={() => void create()}>Tạo token</Button></>}>
          <div className="space-y-4">
            <Field label="Tên (để nhớ dùng cho việc gì)"><input className="input" autoFocus value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="Claude Code, n8n, script backup..." /></Field>
            <Field label="Quyền" hint={creating.scope === 'full' ? 'Có thể khởi động lại dịch vụ, container, tối ưu RAM, sao lưu. Chỉ cấp cho thứ bạn tin tưởng.' : 'Chỉ xem trạng thái và log. An toàn nhất.'}>
              <Select value={creating.scope} onChange={(e) => setCreating({ ...creating, scope: e.target.value as 'read' | 'full' })}>
                <option value="read">Chỉ đọc (khuyên dùng)</option>
                <option value="full">Đầy đủ (có thể thay đổi hệ thống)</option>
              </Select>
            </Field>
            <Field label="Thời hạn" hint={creating.expiry === 'never' ? 'Token sống mãi tới khi bạn thu hồi. Chỉ nên dùng cho thiết bị tin cậy.' : 'Hết hạn là tự mất hiệu lực, AI sẽ bị từ chối.'}>
              <Select value={creating.expiry} onChange={(e) => setCreating({ ...creating, expiry: e.target.value })}>
                {EXPIRY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
            {creating.expiry === 'days' && (
              <Field label="Số ngày (1 – 3650)">
                <input type="number" min={1} max={3650} className="input" value={creating.customDays} onChange={(e) => setCreating({ ...creating, customDays: e.target.value })} />
              </Field>
            )}
            {creating.expiry === 'date' && (
              <Field label="Hết hạn vào lúc">
                <input type="datetime-local" className="input" value={creating.customDate} onChange={(e) => setCreating({ ...creating, customDate: e.target.value })} />
              </Field>
            )}
          </div>
        </Modal>
      )}

      {created && (
        <Modal open onClose={() => setCreated(null)} title="Token đã tạo" size="md" footer={<Button variant="primary" onClick={() => setCreated(null)}>Tôi đã lưu token</Button>}>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Sao chép token ngay bây giờ. ZenPanel chỉ lưu bản băm nên <b>không thể hiển thị lại</b>.
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2">
              <code className="mono min-w-0 flex-1 break-all text-sm text-emerald-300">{created.token}</code>
              <button type="button" className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-700" onClick={async () => { await navigator.clipboard.writeText(created.token); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">Các đoạn lệnh ở trang này đã tự điền token vừa tạo cho đến khi bạn đóng hộp thoại.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
