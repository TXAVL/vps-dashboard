// ZenPanel - Cảnh báo chủ động (Telegram / Discord / Webhook) + Nhật ký thao tác trên panel
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bell, ClipboardList, Cpu, HardDrive, MemoryStick, Save, Send, Trash2, CalendarClock, ListTree, CheckCircle2, XCircle, Wifi, UserSearch, BadgeCheck, ChevronDown } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, PageHeader, SearchInput, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, post, put } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Config {
  telegram: { enabled: boolean; botToken: string; chatId: string; apiBase: string; hasToken: boolean };
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
interface ChannelCheck { channel: 'telegram' | 'discord'; host: string; reachable: boolean; ms: number | null; detail: string }
interface AlertEvent { at: string; rule: string; level: 'warn' | 'recovered' | 'test'; message: string; sent: string[]; errors: string[] }
interface AuditEntry { at: string; user: string; ip: string; method: string; path: string; status: number; action: string; ms: number }

function Steps({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <details className="group rounded-xl border border-slate-700/50 bg-ink-950/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-300">
        <ChevronDown className="size-3.5 transition group-open:rotate-180" /> {title}
      </summary>
      <ol className="space-y-1.5 px-3 pb-3 text-xs leading-relaxed text-slate-400">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function AlertsTab() {
  const data = useApi<{ config: Config; history: AlertEvent[] }>('/api/alerts', 30_000);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [services, setServices] = useState('');
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<ChannelCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [bot, setBot] = useState<{ username: string; name: string } | null>(null);
  const [chats, setChats] = useState<{ id: string; type: string; title: string }[] | null>(null);
  const { run, toast } = useFeedback();

  const checkNet = async () => {
    setChecking(true);
    setChecks(await get<ChannelCheck[]>('/api/alerts/connectivity').catch(() => null));
    setChecking(false);
  };

  useEffect(() => {
    void checkNet();
  }, []);

  // ---- Tự động lưu: mọi thay đổi được lưu sau ~1 giây không gõ thêm, không cần bấm nút
  const [saveState, setSaveState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; at?: number; message?: string }>({ status: 'idle' });
  const lastSaved = useRef('');
  const buildBody = (c: Config, svc: string) => ({ ...c, rules: { ...c.rules, services: { ...c.rules.services, names: svc.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean) } } });
  const persist = async (c: Config, svc: string): Promise<boolean> => {
    const body = buildBody(c, svc);
    setSaveState((prev) => ({ ...prev, status: 'saving' }));
    try {
      await put('/api/alerts', body);
      lastSaved.current = JSON.stringify(body);
      setSaveState({ status: 'saved', at: Date.now() });
      return true;
    } catch (err) {
      // Lỗi nhập dở dang (token chưa đủ ký tự...) hiện cạnh nút lưu, không bật toast liên tục khi đang gõ
      setSaveState({ status: 'error', message: (err as Error).message });
      return false;
    }
  };

  useEffect(() => {
    if (data.data) {
      setCfg(data.data.config);
      setServices(data.data.config.rules.services.names.join(', '));
      lastSaved.current = JSON.stringify(buildBody(data.data.config, data.data.config.rules.services.names.join(', ')));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data]);

  useEffect(() => {
    if (!cfg || JSON.stringify(buildBody(cfg, services)) === lastSaved.current) return;
    setSaveState((prev) => (prev.status === 'saving' ? prev : { status: 'idle', message: 'Có thay đổi, sắp tự lưu...' }));
    const timer = setTimeout(() => void persist(cfg, services), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, services]);

  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data || !cfg) return <Spinner />;

  const save = async () => {
    setSaving(true);
    const ok = await persist(cfg, services);
    setSaving(false);
    if (ok) toast('Đã lưu cấu hình cảnh báo', 'success');
    await data.reload();
  };

  const verifyBot = async () => {
    const res = await run(() => post<{ username: string; name: string }>('/api/alerts/telegram/verify', { botToken: cfg!.telegram.botToken }));
    if (res) setBot(res);
  };

  const detectChats = async () => {
    const res = await run(() => post<{ id: string; type: string; title: string }[]>('/api/alerts/telegram/chats', { botToken: cfg!.telegram.botToken }));
    if (res) {
      setChats(res);
      if (res.length === 1) setCfg({ ...cfg!, telegram: { ...cfg!.telegram, chatId: res[0].id } });
    }
  };

  const test = async (channel: 'telegram' | 'discord' | 'webhook') => {
    if (!(await persist(cfg, services))) {
      toast(`Chưa lưu được cấu hình: ${saveState.message ?? 'kiểm tra lại các ô đã nhập'}`, 'error');
      return;
    }
    try {
      await post(`/api/alerts/test/${channel}`);
      const label = channel === 'telegram' ? 'Telegram' : channel === 'discord' ? 'Discord' : 'Webhook';
      if (!cfg[channel].enabled) {
        // Gửi thử được nghĩa là cấu hình đúng: tự bật kênh để cảnh báo thật cũng về đây (trước đây công tắc vẫn tắt)
        const next = { ...cfg, [channel]: { ...cfg[channel], enabled: true } } as Config;
        setCfg(next);
        await persist(next, services);
        toast(`Gửi thử ${label} OK. Đã tự bật và lưu kênh ${label}, từ giờ cảnh báo thật sẽ về đây.`, 'success');
      } else {
        toast(`Gửi thử ${label} OK. Kênh đã được lưu.`, 'success');
      }
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
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
        <Wifi className="size-5 text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">Đường mạng từ VPS ra Telegram / Discord</div>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {!checks ? (
              <span className="text-slate-500">{checking ? 'Đang kiểm tra...' : 'Chưa kiểm tra'}</span>
            ) : (
              checks.map((c) => (
                <span key={c.channel} className={cn('flex items-start gap-1.5', c.reachable ? 'text-emerald-300' : 'text-rose-300')}>
                  {c.reachable ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <XCircle className="mt-0.5 size-3.5 shrink-0" />}
                  <span>{c.detail}</span>
                </span>
              ))
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={Wifi} loading={checking} onClick={() => void checkNet()}>Kiểm tra lại</Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Telegram" icon={Send} actions={<Toggle checked={cfg.telegram.enabled} onChange={(v) => setCfg({ ...cfg, telegram: { ...cfg.telegram, enabled: v } })} />}>
          <div className="space-y-3">
            <Steps
              title="Hướng dẫn cấu hình (3 bước, 2 phút)"
              steps={[
                <>Mở Telegram, chat với <b className="text-slate-200">@BotFather</b> → gửi <code className="mono">/newbot</code> → đặt tên → nhận <b className="text-slate-200">Bot token</b> dạng <code className="mono">123456789:AAF...</code>, dán vào ô bên dưới rồi bấm "Xác thực".</>,
                <>Mở bot vừa tạo (link <code className="mono">t.me/tên_bot</code>) và bấm <b className="text-slate-200">Start</b>. Muốn nhận trong nhóm: thêm bot vào nhóm rồi nhắn 1 tin bất kỳ.</>,
                <>Bấm <b className="text-slate-200">"Tự lấy Chat ID"</b>: ZenPanel tìm cuộc trò chuyện của bạn, chọn là xong. Cuối cùng bấm "Gửi thử".</>,
              ]}
            />
            <Field label="Bot token" hint="Tạo bot qua @BotFather">
              <div className="flex gap-2">
                <input className="input mono min-w-0 flex-1" value={cfg.telegram.botToken} onChange={(e) => { setBot(null); setCfg({ ...cfg, telegram: { ...cfg.telegram, botToken: e.target.value } }); }} placeholder="123456789:AAF..." />
                <Button size="sm" variant="soft" icon={BadgeCheck} disabled={!cfg.telegram.botToken} onClick={() => void verifyBot()}>Xác thực</Button>
              </div>
              {bot && <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 className="size-3.5" /> Đúng bot: {bot.name} (@{bot.username})</div>}
            </Field>
            <Field label="Chat ID" hint="Số ID của bạn / nhóm (nhóm thường bắt đầu bằng -100...)">
              <div className="flex gap-2">
                <input className="input mono min-w-0 flex-1" value={cfg.telegram.chatId} onChange={(e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, chatId: e.target.value } })} placeholder="123456789" />
                <Button size="sm" variant="soft" icon={UserSearch} disabled={!cfg.telegram.botToken} onClick={() => void detectChats()}>Tự lấy Chat ID</Button>
              </div>
              {chats && chats.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chats.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setCfg({ ...cfg, telegram: { ...cfg.telegram, chatId: c.id } }); setChats(null); }} className="rounded-lg border border-slate-700 bg-ink-950/60 px-2 py-1 text-left text-xs text-slate-300 hover:border-zen-blue">
                      <b>{c.title}</b> <span className="text-slate-500">{c.type} · {c.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-400">Nâng cao: VPS bị chặn Telegram?</summary>
              <div className="mt-2 space-y-1">
                <input className="input mono" value={cfg.telegram.apiBase} onChange={(e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, apiBase: e.target.value } })} placeholder="https://api.telegram.org (để trống = mặc định)" />
                <p>Nếu mục kiểm tra mạng ở trên báo Telegram không kết nối được, hãy nhập địa chỉ relay (Cloudflare Worker / reverse proxy của <code className="mono">api.telegram.org</code>) hoặc dùng Discord / Webhook thay thế.</p>
              </div>
            </details>
            <Button size="sm" variant="soft" icon={Send} onClick={() => void test('telegram')}>Gửi thử</Button>
          </div>
        </Card>
        <Card title="Discord" icon={Send} actions={<Toggle checked={cfg.discord.enabled} onChange={(v) => setCfg({ ...cfg, discord: { ...cfg.discord, enabled: v } })} />}>
          <div className="space-y-3">
            <Steps
              title="Hướng dẫn cấu hình (3 bước)"
              steps={[
                <>Trong server Discord, bấm biểu tượng bánh răng cạnh kênh nhận tin → <b className="text-slate-200">Tích hợp (Integrations)</b> → <b className="text-slate-200">Webhooks</b> → <b className="text-slate-200">Webhook mới</b>.</>,
                <>Đặt tên (vd ZenPanel), chọn kênh, bấm <b className="text-slate-200">Sao chép URL Webhook</b>.</>,
                <>Dán URL vào ô bên dưới, bấm "Gửi thử" (cấu hình tự lưu, gửi OK thì kênh tự bật). Cần quyền <i>Quản lý Webhook</i> trong server.</>,
              ]}
            />
            <Field label="Webhook URL" hint="Dạng https://discord.com/api/webhooks/số/mã"><input className="input mono" value={cfg.discord.webhookUrl} onChange={(e) => setCfg({ ...cfg, discord: { ...cfg.discord, webhookUrl: e.target.value } })} placeholder="https://discord.com/api/webhooks/..." /></Field>
            <Button size="sm" variant="soft" icon={Send} onClick={() => void test('discord')}>Gửi thử</Button>
          </div>
        </Card>
        <Card title="Webhook tuỳ ý" icon={Send} actions={<Toggle checked={cfg.webhook.enabled} onChange={(v) => setCfg({ ...cfg, webhook: { ...cfg.webhook, enabled: v } })} />}>
          <div className="space-y-3">
            <Steps
              title="Hướng dẫn cấu hình (Slack, Google Chat, n8n, Make, server của bạn)"
              steps={[
                <>Tạo một <b className="text-slate-200">URL nhận tin (Incoming Webhook)</b> ở nơi bạn muốn nhận cảnh báo, URL phải bắt đầu bằng <code className="mono">https://</code>:
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li><b className="text-slate-300">Slack</b>: api.slack.com/apps → Incoming Webhooks → Add New Webhook to Workspace.</li>
                    <li><b className="text-slate-300">Google Chat</b>: vào Space → Apps &amp; integrations → Webhooks → Add webhook.</li>
                    <li><b className="text-slate-300">Mattermost / Rocket.Chat</b>: Integrations → Incoming Webhook.</li>
                    <li><b className="text-slate-300">n8n / Make / Zapier</b>: thêm node/module <i>Webhook</i> (phương thức POST), sao chép URL, rồi nối tiếp sang Zalo, email, SMS...</li>
                  </ul></>,
                <>Dán URL vào ô bên dưới, bấm <b className="text-slate-200">"Gửi thử"</b>. Cấu hình tự lưu, gửi OK thì kênh tự bật.</>,
                <>ZenPanel gửi <b className="text-slate-200">POST JSON</b> như mẫu dưới đây. Slack / Google Chat / Mattermost hiển thị luôn nội dung trường <code className="mono">text</code>; n8n / Make đọc được mọi trường. Máy chủ của bạn cần trả về mã 2xx.</>,
              ]}
            />
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-400">Xem mẫu dữ liệu gửi đi</summary>
              <pre className="mono mt-1.5 overflow-x-auto rounded-lg bg-black/40 p-2.5 text-[11px] leading-relaxed text-emerald-200">{`POST <URL của bạn>
Content-Type: application/json

{
  "text": "⚠️ ZenPanel · vps-01\nỔ đĩa gần đầy (ngưỡng 90%): / 94% (còn 6.0 GB)...",
  "source": "zenpanel",
  "host": "vps-01",
  "at": "2026-10-28T09:30:00.000Z"
}`}</pre>
              <p className="mt-1.5">Microsoft Teams yêu cầu định dạng riêng (Adaptive Card) nên chưa nhận trực tiếp được: hãy đi qua n8n / Make để chuyển đổi.</p>
            </details>
            <Field label="URL nhận POST JSON" hint="Bắt buộc https://"><input className="input mono" value={cfg.webhook.url} onChange={(e) => setCfg({ ...cfg, webhook: { ...cfg.webhook, url: e.target.value } })} placeholder="https://..." /></Field>
            <Button size="sm" variant="soft" icon={Send} onClick={() => void test('webhook')}>Gửi thử</Button>
          </div>
        </Card>
      </div>

      <Card title="Khi nào báo?" icon={Bell} actions={
        <div className="flex items-center gap-3">
          <span className={cn('text-xs', saveState.status === 'error' ? 'max-w-[280px] truncate text-rose-300' : saveState.status === 'saved' ? 'text-emerald-300' : 'text-slate-500')} data-tip={saveState.message}>
            {saveState.status === 'saving' ? 'Đang lưu...' : saveState.status === 'saved' ? `✓ Đã tự động lưu lúc ${new Date(saveState.at ?? Date.now()).toLocaleTimeString('vi-VN')}` : saveState.status === 'error' ? `⚠ Chưa lưu: ${saveState.message}` : (saveState.message ?? 'Tự động lưu khi bạn thay đổi')}
          </span>
          <Button size="sm" variant="soft" icon={Save} loading={saving} onClick={() => void save()}>Lưu ngay</Button>
        </div>
      }>
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
        <div className="mt-4 space-y-1.5 rounded-xl border border-slate-700/50 bg-ink-950/40 p-3 text-sm text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            Nếu sự cố chưa hết, nhắc lại sau
            <Select className="h-9 w-44 py-0 text-xs" value={cfg.cooldownMinutes} onChange={(e) => setCfg({ ...cfg, cooldownMinutes: Number(e.target.value) })}>
              <option value={0}>Không nhắc lại (báo 1 lần)</option>
              {[[60, '1 giờ'], [360, '6 giờ (khuyên dùng)'], [720, '12 giờ'], [1440, '24 giờ']].map(([m, l]) => <option key={m} value={m}>{l}</option>)}
              {![0, 60, 360, 720, 1440].includes(cfg.cooldownMinutes) && <option value={cfg.cooldownMinutes}>{cfg.cooldownMinutes} phút</option>}
            </Select>
          </div>
          <p className="text-xs text-slate-500">
            Mỗi sự cố chỉ báo ngay <b>1 lần</b>. Nếu chưa hết, tin nhắc lại thưa dần (gấp đôi mỗi lần, tối đa 24 giờ, VPS hết hạn tối đa 1 tin/ngày) nên không bị spam. Báo "đã phục hồi" khi đã xuống hẳn dưới ngưỡng (thấp hơn ngưỡng 3–5%), và nhớ trạng thái kể cả khi ZenPanel khởi động lại.
          </p>
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
