// ZenPanel - Cảnh báo chủ động (Telegram / Discord / Webhook) + Nhật ký thao tác trên panel
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bell, ClipboardList, Cpu, HardDrive, MemoryStick, Save, Send, Trash2, CalendarClock, ListTree } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, PageHeader, SearchInput, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, post, put } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Config {
  telegram: { enabled: boolean; botToken: string; chatId: string; hasToken: boolean };
  discord: { enabled: boolean; webhookUrl: string; hasUrl: boolean };
  webhook: { enabled: boolean; url: string; hasUrl: boolean };
  rules: {
    cpu: { enabled: boolean; threshold: number; minutes: number };
    ram: { enabled: boolean; threshold: number; minutes: number };
    disk: { enabled: boolean; threshold: number };
    services: { enabled: boolean; names: string[] };
    vpsExpiry: { enabled: boolean };
  };
  cooldownMinutes: number;
}
interface AlertEvent { at: string; rule: string; level: 'warn' | 'recovered' | 'test'; message: string; sent: string[]; errors: string[] }
interface AuditEntry { at: string; user: string; ip: string; method: string; path: string; status: number; action: string; ms: number }

function AlertsTab() {
  const data = useApi<{ config: Config; history: AlertEvent[] }>('/api/alerts', 30_000);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [services, setServices] = useState('');
  const [saving, setSaving] = useState(false);
  const { run, toast } = useFeedback();

  useEffect(() => {
    if (data.data) {
      setCfg(data.data.config);
      setServices(data.data.config.rules.services.names.join(', '));
    }
  }, [data.data]);

  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data || !cfg) return <Spinner />;

  const save = async () => {
    setSaving(true);
    const body = { ...cfg, rules: { ...cfg.rules, services: { ...cfg.rules.services, names: services.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) } } };
    await run(() => put('/api/alerts', body), 'Đã lưu cấu hình cảnh báo');
    setSaving(false);
    await data.reload();
  };

  const test = async (channel: 'telegram' | 'discord' | 'webhook') => {
    await save();
    try {
      await post(`/api/alerts/test/${channel}`);
      toast('Đã gửi tin nhắn thử, hãy kiểm tra kênh của bạn', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    await data.reload();
  };

  const rule = (icon: typeof Cpu, title: string, enabled: boolean, onToggle: (v: boolean) => void, body: React.ReactNode) => {
    const Icon = icon;
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
        <div className="flex items-center gap-3">
          <Icon className="size-5 text-sky-300" />
          <span className="flex-1 font-semibold text-white">{title}</span>
          <Toggle checked={enabled} onChange={onToggle} />
        </div>
        {enabled && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">{body}</div>}
      </div>
    );
  };

  const num = (value: number, onChange: (n: number) => void, w = 'w-20') => <input type="number" className={cn('input h-9 py-0 text-center', w)} value={value} onChange={(e) => onChange(Number(e.target.value))} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Telegram" icon={Send} actions={<Toggle checked={cfg.telegram.enabled} onChange={(v) => setCfg({ ...cfg, telegram: { ...cfg.telegram, enabled: v } })} />}>
          <div className="space-y-3">
            <Field label="Bot token" hint="Tạo bot qua @BotFather"><input className="input mono" value={cfg.telegram.botToken} onChange={(e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, botToken: e.target.value } })} placeholder="123456:ABC-DEF..." /></Field>
            <Field label="Chat ID" hint="ID của bạn hoặc nhóm (dùng @userinfobot để lấy)"><input className="input mono" value={cfg.telegram.chatId} onChange={(e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, chatId: e.target.value } })} /></Field>
            <Button size="sm" variant="soft" icon={Send} onClick={() => void test('telegram')}>Gửi thử</Button>
          </div>
        </Card>
        <Card title="Discord" icon={Send} actions={<Toggle checked={cfg.discord.enabled} onChange={(v) => setCfg({ ...cfg, discord: { ...cfg.discord, enabled: v } })} />}>
          <div className="space-y-3">
            <Field label="Webhook URL" hint="Kênh → Cài đặt → Tích hợp → Webhook"><input className="input mono" value={cfg.discord.webhookUrl} onChange={(e) => setCfg({ ...cfg, discord: { ...cfg.discord, webhookUrl: e.target.value } })} placeholder="https://discord.com/api/webhooks/..." /></Field>
            <Button size="sm" variant="soft" icon={Send} onClick={() => void test('discord')}>Gửi thử</Button>
          </div>
        </Card>
        <Card title="Webhook tuỳ ý" icon={Send} actions={<Toggle checked={cfg.webhook.enabled} onChange={(v) => setCfg({ ...cfg, webhook: { ...cfg.webhook, enabled: v } })} />}>
          <div className="space-y-3">
            <Field label="URL nhận POST JSON" hint="Slack, Zalo bot, n8n, Make...; body: {text, source, host, at}"><input className="input mono" value={cfg.webhook.url} onChange={(e) => setCfg({ ...cfg, webhook: { ...cfg.webhook, url: e.target.value } })} placeholder="https://..." /></Field>
            <Button size="sm" variant="soft" icon={Send} onClick={() => void test('webhook')}>Gửi thử</Button>
          </div>
        </Card>
      </div>

      <Card title="Khi nào báo?" icon={Bell} actions={<Button size="sm" variant="primary" icon={Save} loading={saving} onClick={() => void save()}>Lưu cấu hình</Button>}>
        <div className="grid gap-3 lg:grid-cols-2">
          {rule(Cpu, 'CPU cao', cfg.rules.cpu.enabled, (v) => setCfg({ ...cfg, rules: { ...cfg.rules, cpu: { ...cfg.rules.cpu, enabled: v } } }), <>
            Vượt {num(cfg.rules.cpu.threshold, (n) => setCfg({ ...cfg, rules: { ...cfg.rules, cpu: { ...cfg.rules.cpu, threshold: n } } }))} % trong {num(cfg.rules.cpu.minutes, (n) => setCfg({ ...cfg, rules: { ...cfg.rules, cpu: { ...cfg.rules.cpu, minutes: n } } }))} phút liên tục</>)}
          {rule(MemoryStick, 'RAM cao', cfg.rules.ram.enabled, (v) => setCfg({ ...cfg, rules: { ...cfg.rules, ram: { ...cfg.rules.ram, enabled: v } } }), <>
            Vượt {num(cfg.rules.ram.threshold, (n) => setCfg({ ...cfg, rules: { ...cfg.rules, ram: { ...cfg.rules.ram, threshold: n } } }))} % trong {num(cfg.rules.ram.minutes, (n) => setCfg({ ...cfg, rules: { ...cfg.rules, ram: { ...cfg.rules.ram, minutes: n } } }))} phút liên tục</>)}
          {rule(HardDrive, 'Ổ đĩa gần đầy', cfg.rules.disk.enabled, (v) => setCfg({ ...cfg, rules: { ...cfg.rules, disk: { ...cfg.rules.disk, enabled: v } } }), <>
            Dung lượng dùng ≥ {num(cfg.rules.disk.threshold, (n) => setCfg({ ...cfg, rules: { ...cfg.rules, disk: { ...cfg.rules.disk, threshold: n } } }))} %</>)}
          {rule(CalendarClock, 'VPS sắp hết hạn', cfg.rules.vpsExpiry.enabled, (v) => setCfg({ ...cfg, rules: { ...cfg.rules, vpsExpiry: { enabled: v } } }), <>Dùng ngày hết hạn đặt trong Cài đặt → Hạn VPS</>)}
          <div className="lg:col-span-2">
            {rule(ListTree, 'Dịch vụ bị dừng / lỗi', cfg.rules.services.enabled, (v) => setCfg({ ...cfg, rules: { ...cfg.rules, services: { ...cfg.rules.services, enabled: v } } }), (
              <div className="w-full space-y-1">
                <input className="input mono w-full" value={services} onChange={(e) => setServices(e.target.value)} placeholder="nginx, docker, mysql, sshd (tên dịch vụ, cách nhau bằng dấu phẩy)" />
                <span className="text-xs text-slate-500">Tên lấy ở cột nhỏ phía dưới tên dịch vụ trong tab Dịch vụ.</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          Không lặp lại cùng 1 cảnh báo trong {num(cfg.cooldownMinutes, (n) => setCfg({ ...cfg, cooldownMinutes: n }), 'w-20')} phút · tự báo "đã phục hồi" khi hết sự cố
        </div>
      </Card>

      <Card title="Lịch sử cảnh báo" icon={Bell} bodyClassName="p-0" actions={data.data.history.length > 0 && <IconButton icon={Trash2} title="Xoá lịch sử" onClick={async () => { await run(() => del('/api/alerts/history')); await data.reload(); }} />}>
        {data.data.history.length === 0 ? (
          <EmptyState icon={Bell} title="Chưa có cảnh báo nào" description="Khi có sự cố, cảnh báo sẽ hiện ở đây và được gửi tới các kênh đã bật." />
        ) : (
          <div className="divide-y divide-slate-800/80">
            {data.data.history.slice(0, 40).map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                <Badge tone={e.level === 'warn' ? 'amber' : e.level === 'recovered' ? 'green' : 'blue'}>{e.level === 'warn' ? 'Cảnh báo' : e.level === 'recovered' ? 'Phục hồi' : 'Thử'}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-slate-200">{e.message}</div>
                  <div className="text-xs text-slate-500">{formatRelative(e.at)} · {e.sent.length ? `đã gửi ${e.sent.join(', ')}` : 'chưa gửi kênh nào'}</div>
                  {e.errors.length > 0 && <div className="text-xs text-red-300">{e.errors.join(' · ')}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditTab() {
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);
  const data = useApi<{ total: number; items: AuditEntry[] }>(`/api/audit?limit=300&failed=${failed ? 1 : 0}&q=${encodeURIComponent(q)}`);
  const { confirm, run } = useFeedback();

  return (
    <Card
      title={`Nhật ký thao tác${data.data ? ` (${data.data.total})` : ''}`}
      icon={ClipboardList}
      bodyClassName="p-0"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Lọc theo thao tác, IP, người dùng..." className="w-64 max-w-full" />
          <Select className="h-9 w-36 py-0 text-xs" value={failed ? '1' : '0'} onChange={(e) => setFailed(e.target.value === '1')}>
            <option value="0">Tất cả</option>
            <option value="1">Chỉ bị lỗi</option>
          </Select>
          <IconButton icon={Trash2} title="Xoá toàn bộ nhật ký" className="hover:text-zen-red" onClick={async () => {
            if (!(await confirm({ title: 'Xoá nhật ký thao tác', message: 'Toàn bộ lịch sử thao tác trên panel sẽ bị xoá vĩnh viễn.', danger: true, confirmLabel: 'Xoá' }))) return;
            await run(() => del('/api/audit'), 'Đã xoá nhật ký');
            await data.reload();
          }} />
        </div>
      }
    >
      {data.error ? (
        <div className="p-4"><ErrorBox message={data.error} onRetry={data.reload} /></div>
      ) : !data.data ? (
        <Spinner />
      ) : data.data.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Chưa có thao tác nào" description="Mọi thao tác thay đổi (khởi động dịch vụ, cài app, sửa cấu hình...) sẽ được ghi lại kèm IP." />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><th className={th}>Thời gian</th><th className={th}>Thao tác</th><th className={th}>Người dùng</th><th className={th}>IP</th><th className={th}>Kết quả</th></tr></thead>
            <tbody>
              {data.data.items.map((e, i) => (
                <tr key={i} className={tr}>
                  <td className={cn(td, 'whitespace-nowrap text-xs text-slate-400')}>{formatDate(e.at)}</td>
                  <td className={td}>
                    <div className="font-semibold text-slate-100">{e.action}</div>
                    <div className="mono truncate text-[11px] text-slate-500"><span className="text-slate-400">{e.method}</span> {e.path}</div>
                  </td>
                  <td className={cn(td, 'text-slate-300')}>{e.user}</td>
                  <td className={cn(td, 'mono text-xs text-slate-400')}>{e.ip}</td>
                  <td className={td}><Badge tone={e.status < 400 ? 'green' : 'red'}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function Alerts() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'alerts' | 'audit' | null) ?? 'alerts';
  return (
    <>
      <PageHeader title="Cảnh báo & Nhật ký thao tác" description="Nhận tin Telegram / Discord khi VPS có sự cố, xem ai đã làm gì trên panel" icon={Bell} />
      <div className="mb-5">
        <Tabs value={tab} onChange={(next) => setParams({ tab: next })} tabs={[{ id: 'alerts', label: 'Cảnh báo', icon: Bell }, { id: 'audit', label: 'Nhật ký thao tác', icon: ClipboardList }]} />
      </div>
      {tab === 'alerts' ? <AlertsTab /> : <AuditTab />}
    </>
  );
}
