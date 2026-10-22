// ZenPanel - Bảo mật & WAF: Cloudflare (mức bảo vệ, Under Attack, chặn IP/quốc gia, SSL, DNS, cache) + chặn IP trên tường lửa máy chủ
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  Cloud,
  Eraser,
  ExternalLink,
  Globe,
  KeyRound,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Notice, PageHeader, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, patch, post, put } from '../lib/api';
import { formatDate } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { CfAccessRule, CfPermission, CloudflareZone, DnsRecord, FirewallRule, FirewallStatus } from '../lib/types';
import { RuleModal } from './Firewall';

type Zone = CloudflareZone & { nameServers?: string[] };

const SECURITY_LEVELS = [
  { id: 'essentially_off', label: 'Gần như tắt', desc: 'Chỉ chặn IP cực xấu' },
  { id: 'low', label: 'Thấp', desc: 'Thử thách IP rất đáng ngờ' },
  { id: 'medium', label: 'Trung bình', desc: 'Mặc định, cân bằng' },
  { id: 'high', label: 'Cao', desc: 'Thử thách mọi IP từng có dấu hiệu xấu' },
  { id: 'under_attack', label: 'Under Attack', desc: 'Bắt mọi khách qua thử thách JS — dùng khi đang bị DDoS' },
];

const SSL_MODES = [
  { id: 'off', label: 'Off', desc: 'Không HTTPS (không khuyên dùng)' },
  { id: 'flexible', label: 'Flexible', desc: 'Khách ↔ Cloudflare HTTPS, Cloudflare ↔ VPS HTTP' },
  { id: 'full', label: 'Full', desc: 'HTTPS 2 chiều, chấp nhận chứng chỉ tự ký trên VPS' },
  { id: 'strict', label: 'Full (strict)', desc: 'HTTPS 2 chiều, VPS cần chứng chỉ hợp lệ (Let\'s Encrypt / Origin CA)' },
];

const RULE_MODES: Record<string, { label: string; tone: 'red' | 'amber' | 'green' | 'blue' }> = {
  block: { label: 'Chặn', tone: 'red' },
  managed_challenge: { label: 'Thử thách thông minh', tone: 'amber' },
  challenge: { label: 'Captcha', tone: 'amber' },
  js_challenge: { label: 'Thử thách JS', tone: 'amber' },
  whitelist: { label: 'Cho phép', tone: 'green' },
};

/** Hướng dẫn tạo API Token từng bước (thay cho 1 dòng khó hiểu) */
function TokenGuide() {
  const perms = [
    ['Zone', 'Zone', 'Read', 'Xem danh sách domain'],
    ['Zone', 'Zone Settings', 'Edit', 'Mức bảo mật, Under Attack, SSL, HTTPS'],
    ['Zone', 'DNS', 'Edit', 'Quản lý bản ghi DNS'],
    ['Zone', 'Firewall Services', 'Edit', 'Chặn / cho phép IP, quốc gia'],
    ['Zone', 'Cache Purge', 'Purge', 'Xoá cache'],
  ];
  const steps: ReactNode[] = [
    <>
      Mở{' '}
      <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="font-semibold text-blue-300 underline">
        dash.cloudflare.com → My Profile → API Tokens
      </a>
      .
    </>,
    <>
      Bấm <b>Create Token</b> → kéo xuống cuối chọn <b>Create Custom Token</b> → <b>Get started</b>.
    </>,
    <>Đặt tên, ví dụ "ZenPanel".</>,
    <>
      Ở mục <b>Permissions</b>, bấm "+ Add more" để thêm đủ 5 dòng trong bảng bên dưới.
    </>,
    <>
      Ở mục <b>Zone Resources</b>: chọn <b>Include → All zones</b> (hoặc "Specific zone" để chỉ cho 1 domain).
    </>,
    <>
      Bấm <b>Continue to summary</b> → <b>Create Token</b>, copy token (chỉ hiện 1 lần) rồi dán vào ô bên dưới.
    </>,
  ];
  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-300">
            <span className="mono flex size-6 shrink-0 items-center justify-center rounded-full bg-zen-blue/15 text-xs font-bold text-blue-300">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr>
              <th className={th}>Nhóm</th>
              <th className={th}>Quyền</th>
              <th className={th}>Mức</th>
              <th className={th}>Dùng cho</th>
            </tr>
          </thead>
          <tbody>
            {perms.map(([group, perm, level, use]) => (
              <tr key={perm} className={tr}>
                <td className={cn(td, 'text-slate-400')}>{group}</td>
                <td className={cn(td, 'font-semibold text-white')}>{perm}</td>
                <td className={td}>
                  <Badge tone="blue">{level}</Badge>
                </td>
                <td className={cn(td, 'text-xs text-slate-500')}>{use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice tone="amber">Dùng "API Token", không dùng "Global API Key" hay "Origin CA Key". Domain phải đã được thêm vào Cloudflare và đổi nameserver.</Notice>
    </div>
  );
}

function ConnectCard({ onConnected }: { onConnected: () => void }) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(() => put('/api/cloudflare/token', { token }), 'Đã kết nối Cloudflare');
    setSaving(false);
    if (ok) {
      setToken('');
      onConnected();
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card title="Cách tạo Cloudflare API Token" icon={ListChecks}>
        <TokenGuide />
      </Card>
      <Card title="Kết nối Cloudflare" icon={Cloud}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Cloudflare API Token">
            <input className="input mono" type="password" required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="Dán token vào đây" />
          </Field>
          <Button type="submit" variant="primary" icon={KeyRound} loading={saving} className="w-full">
            Kết nối & kiểm tra quyền
          </Button>
        </form>
      </Card>
    </div>
  );
}

function PermissionsCard({ onReconnect }: { onReconnect: () => void }) {
  const perms = useApi<{ zones: number; checks: CfPermission[] }>('/api/cloudflare/permissions');
  const [showGuide, setShowGuide] = useState(false);
  const missing = perms.data?.checks.filter((c) => !c.ok && c.id !== 'analytics') ?? [];
  return (
    <Card
      title="Quyền của API Token"
      icon={ShieldCheck}
      actions={
        <>
          <IconButton icon={RefreshCw} title="Kiểm tra lại" onClick={() => void perms.reload()} />
          <Button size="sm" variant="ghost" onClick={() => setShowGuide(!showGuide)}>
            {showGuide ? 'Ẩn hướng dẫn' : 'Hướng dẫn tạo token'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onReconnect}>
            Đổi token
          </Button>
        </>
      }
    >
      {!perms.data ? (
        perms.error ? <ErrorBox message={perms.error} onRetry={perms.reload} /> : <Spinner label="Đang kiểm tra quyền token..." />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {perms.data.checks.map((c) => (
              <div key={c.id} className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5', c.ok ? 'border-zen-green/30 bg-zen-green/5' : 'border-zen-red/30 bg-zen-red/5')}>
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zen-green" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-zen-red" />}
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-slate-100">{c.label}</div>
                  <div className="mono text-[11px] text-slate-500">{c.required}</div>
                  {!c.ok && <div className="mt-0.5 break-words text-xs text-red-300">{c.message}</div>}
                </div>
              </div>
            ))}
          </div>
          {missing.length > 0 && (
            <Notice tone="amber">
              Token còn thiếu {missing.length} quyền. Vào Cloudflare → API Tokens → bấm <b>Edit</b> token hiện tại, thêm đúng các quyền màu đỏ ở trên rồi bấm Kiểm tra lại (không cần đổi token).
            </Notice>
          )}
          {showGuide && <TokenGuide />}
        </div>
      )}
    </Card>
  );
}

function SettingToggle({ title, desc, checked, onChange, danger }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', danger && checked ? 'border-zen-red/50 bg-zen-red/10' : 'border-slate-700/50 bg-ink-950/50')}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function ProtectionTab({ zone, set }: { zone: Zone; set: (setting: string, value: string, label: string) => Promise<void> }) {
  const level = zone.settings.security_level ?? 'medium';
  const underAttack = level === 'under_attack';
  return (
    <div className="space-y-4">
      <div className={cn('flex flex-wrap items-center gap-4 rounded-2xl border p-5', underAttack ? 'border-zen-red/60 bg-zen-red/10' : 'border-slate-700/50 bg-ink-950/50')}>
        <ShieldAlert className={cn('size-10', underAttack ? 'text-zen-red' : 'text-slate-500')} />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold text-white">Chế độ chống DDoS (Under Attack)</div>
          <div className="text-sm text-slate-400">Mọi khách phải qua thử thách 5 giây trước khi vào web. Bật khi website đang bị tấn công, tắt khi đã ổn.</div>
        </div>
        <Button variant={underAttack ? 'success' : 'danger'} icon={underAttack ? ShieldCheck : ShieldAlert} onClick={() => void set('security_level', underAttack ? 'medium' : 'under_attack', underAttack ? 'Tắt Under Attack' : 'Bật Under Attack')}>
          {underAttack ? 'Tắt Under Attack' : 'Bật Under Attack'}
        </Button>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Mức bảo mật</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {SECURITY_LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => void set('security_level', l.id, `Mức bảo mật: ${l.label}`)}
              className={cn(
                'rounded-xl border p-3 text-left transition',
                level === l.id ? (l.id === 'under_attack' ? 'border-zen-red/70 bg-zen-red/10' : 'border-zen-blue/70 bg-zen-blue/10 ring-2 ring-zen-blue/20') : 'border-slate-700/50 bg-ink-950/50 hover:border-slate-500',
              )}
            >
              <div className="text-sm font-bold text-white">{l.label}</div>
              <div className="text-xs text-slate-500">{l.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <SettingToggle title="Browser Integrity Check" desc="Chặn bot/trình duyệt giả dùng header bất thường" checked={zone.settings.browser_check === 'on'} onChange={(v) => void set('browser_check', v ? 'on' : 'off', 'Browser Integrity Check')} />
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-100">Thời hạn vượt thử thách</div>
            <div className="text-xs text-slate-500">Khách đã qua thử thách được miễn trong bao lâu</div>
          </div>
          <Select className="h-9 w-32 py-0 text-xs" value={zone.settings.challenge_ttl ?? '1800'} onChange={(e) => void set('challenge_ttl', e.target.value, 'Thời hạn thử thách')}>
            {[
              ['300', '5 phút'],
              ['1800', '30 phút'],
              ['3600', '1 giờ'],
              ['14400', '4 giờ'],
              ['86400', '1 ngày'],
              ['604800', '1 tuần'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <SettingToggle title="Email Obfuscation" desc="Ẩn địa chỉ email trên trang khỏi bot thu thập" checked={zone.settings.email_obfuscation === 'on'} onChange={(v) => void set('email_obfuscation', v ? 'on' : 'off', 'Email Obfuscation')} />
        <SettingToggle title="Hotlink Protection" desc="Chặn website khác nhúng trực tiếp ảnh của bạn" checked={zone.settings.hotlink_protection === 'on'} onChange={(v) => void set('hotlink_protection', v ? 'on' : 'off', 'Hotlink Protection')} />
      </div>
    </div>
  );
}

function SslTab({ zone, set }: { zone: Zone; set: (setting: string, value: string, label: string) => Promise<void> }) {
  const mode = zone.settings.ssl ?? 'off';
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {SSL_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => void set('ssl', m.id, `SSL: ${m.label}`)}
            className={cn('rounded-xl border p-3 text-left transition', mode === m.id ? 'border-zen-blue/70 bg-zen-blue/10 ring-2 ring-zen-blue/20' : 'border-slate-700/50 bg-ink-950/50 hover:border-slate-500')}
          >
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Lock className="size-4 text-zen-blue" />
              {m.label}
            </div>
            <div className="mt-1 text-xs text-slate-500">{m.desc}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <SettingToggle title="Always Use HTTPS" desc="Tự chuyển mọi truy cập HTTP sang HTTPS" checked={zone.settings.always_use_https === 'on'} onChange={(v) => void set('always_use_https', v ? 'on' : 'off', 'Always Use HTTPS')} />
        <SettingToggle title="Automatic HTTPS Rewrites" desc="Sửa link http:// trong trang thành https:// để tránh lỗi mixed content" checked={zone.settings.automatic_https_rewrites === 'on'} onChange={(v) => void set('automatic_https_rewrites', v ? 'on' : 'off', 'HTTPS Rewrites')} />
        <SettingToggle title="TLS 1.3" desc="Giao thức mã hoá mới nhất, nhanh và an toàn hơn" checked={zone.settings.tls_1_3 === 'on' || zone.settings.tls_1_3 === 'zrt'} onChange={(v) => void set('tls_1_3', v ? 'on' : 'off', 'TLS 1.3')} />
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-100">TLS tối thiểu</div>
            <div className="text-xs text-slate-500">Từ chối kết nối dùng phiên bản TLS cũ</div>
          </div>
          <Select className="h-9 w-28 py-0 text-xs" value={zone.settings.min_tls_version ?? '1.0'} onChange={(e) => void set('min_tls_version', e.target.value, `TLS tối thiểu ${e.target.value}`)}>
            {['1.0', '1.1', '1.2', '1.3'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}

function AccessRulesTab({ zone }: { zone: Zone }) {
  const rules = useApi<CfAccessRule[]>(`/api/cloudflare/zones/${zone.id}/access-rules`);
  const [form, setForm] = useState({ mode: 'block', target: 'ip', value: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const { confirm, run } = useFeedback();

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(() => post(`/api/cloudflare/zones/${zone.id}/access-rules`, form), `Đã thêm quy tắc cho ${form.value}`);
    setSaving(false);
    if (ok) {
      setForm({ ...form, value: '', notes: '' });
      await rules.reload();
    }
  };

  const remove = async (rule: CfAccessRule) => {
    if (!(await confirm({ title: 'Xoá quy tắc', message: <>Xoá quy tắc {RULE_MODES[rule.mode]?.label ?? rule.mode} <b className="mono">{rule.value}</b>?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/cloudflare/zones/${zone.id}/access-rules/${rule.id}`), 'Đã xoá quy tắc');
    await rules.reload();
  };

  const placeholder = { ip: '1.2.3.4', ip_range: '1.2.3.0/24', country: 'CN', asn: 'AS12345' }[form.target];

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-3 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4 sm:grid-cols-2 xl:grid-cols-[180px_150px_1fr_1fr_auto] xl:items-end">
        <Field label="Hành động">
          <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {Object.entries(RULE_MODES).map(([id, m]) => (
              <option key={id} value={id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Đối tượng">
          <Select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
            <option value="ip">IP</option>
            <option value="ip_range">Dải IP (CIDR)</option>
            <option value="country">Quốc gia</option>
            <option value="asn">ASN (nhà mạng)</option>
          </Select>
        </Field>
        <Field label="Giá trị">
          <input className="input mono" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={placeholder} />
        </Field>
        <Field label="Ghi chú">
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Spam / brute force..." />
        </Field>
        <Button type="submit" variant="primary" icon={Plus} loading={saving}>
          Thêm
        </Button>
      </form>
      {rules.error ? (
        <ErrorBox message={rules.error} onRetry={rules.reload} />
      ) : !rules.data ? (
        <Spinner />
      ) : rules.data.length === 0 ? (
        <EmptyState icon={Shield} title="Chưa có quy tắc nào" description="Chặn IP đang tấn công, chặn cả quốc gia, hoặc cho phép IP văn phòng vượt mọi thử thách." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className={th}>Hành động</th>
                <th className={th}>Đối tượng</th>
                <th className={th}>Ghi chú</th>
                <th className={th}>Tạo lúc</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rules.data.map((rule) => (
                <tr key={rule.id} className={tr}>
                  <td className={td}>
                    <Badge tone={RULE_MODES[rule.mode]?.tone ?? 'slate'}>{RULE_MODES[rule.mode]?.label ?? rule.mode}</Badge>
                  </td>
                  <td className={cn(td, 'mono text-slate-100')}>
                    <span className="mr-2 text-xs text-slate-500">{rule.target}</span>
                    {rule.value}
                  </td>
                  <td className={cn(td, 'max-w-[240px] truncate text-slate-500')}>{rule.notes}</td>
                  <td className={cn(td, 'text-xs text-slate-500')}>{formatDate(rule.createdAt)}</td>
                  <td className={cn(td, 'text-right')}>
                    <IconButton icon={Trash2} title="Xoá quy tắc" className="hover:text-zen-red" onClick={() => void remove(rule)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DnsTab({ zone }: { zone: Zone }) {
  const records = useApi<DnsRecord[]>(`/api/cloudflare/zones/${zone.id}/dns`);
  const [form, setForm] = useState({ type: 'A', name: '', content: '', proxied: true });
  const [saving, setSaving] = useState(false);
  const { confirm, run } = useFeedback();

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(() => post(`/api/cloudflare/zones/${zone.id}/dns`, form), 'Đã thêm bản ghi DNS');
    setSaving(false);
    if (ok) {
      setForm({ ...form, name: '', content: '' });
      await records.reload();
    }
  };

  const toggleProxy = async (record: DnsRecord) => {
    await run(() => patch(`/api/cloudflare/zones/${zone.id}/dns/${record.id}`, { proxied: !record.proxied }), record.proxied ? 'Đã tắt proxy (DNS only)' : 'Đã bật proxy Cloudflare');
    await records.reload();
  };

  const remove = async (record: DnsRecord) => {
    if (!(await confirm({ title: 'Xoá bản ghi DNS', message: <>Xoá {record.type} <b className="mono">{record.name}</b>?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/cloudflare/zones/${zone.id}/dns/${record.id}`), 'Đã xoá bản ghi');
    await records.reload();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-3 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4 sm:grid-cols-2 xl:grid-cols-[110px_1fr_1fr_auto_auto] xl:items-end">
        <Field label="Loại">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'CAA', 'SRV'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tên">
          <input className="input mono" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={`@ hoặc www`} />
        </Field>
        <Field label="Nội dung">
          <input className="input mono" required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="IP máy chủ" />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm text-slate-300">
          <Toggle checked={form.proxied} onChange={(proxied) => setForm({ ...form, proxied })} /> Proxy
        </label>
        <Button type="submit" variant="primary" icon={Plus} loading={saving}>
          Thêm
        </Button>
      </form>
      {records.error ? (
        <ErrorBox message={records.error} onRetry={records.reload} />
      ) : !records.data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className={th}>Loại</th>
                <th className={th}>Tên</th>
                <th className={th}>Nội dung</th>
                <th className={th}>Proxy</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {records.data.map((record) => (
                <tr key={record.id} className={tr}>
                  <td className={td}>
                    <Badge tone="blue">{record.type}</Badge>
                  </td>
                  <td className={cn(td, 'mono text-slate-100')}>{record.name}</td>
                  <td className={cn(td, 'mono max-w-[260px] truncate text-slate-400')} data-tip={record.content}>
                    {record.content}
                  </td>
                  <td className={td}>
                    {['A', 'AAAA', 'CNAME'].includes(record.type) ? (
                      <button onClick={() => void toggleProxy(record)} data-tip={record.proxied ? 'Đang qua proxy Cloudflare (ẩn IP, chống DDoS). Bấm để tắt.' : 'DNS only (lộ IP). Bấm để bật proxy.'}>
                        {record.proxied ? <Cloud className="size-5 text-orange-400" /> : <Cloud className="size-5 text-slate-600" />}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <IconButton icon={Trash2} title="Xoá" className="hover:text-zen-red" onClick={() => void remove(record)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CacheTab({ zone, set }: { zone: Zone; set: (setting: string, value: string, label: string) => Promise<void> }) {
  const [urls, setUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, run } = useFeedback();
  const purge = async (all: boolean) => {
    const list = urls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (all && !(await confirm({ title: 'Xoá toàn bộ cache', message: <>Xoá cache Cloudflare của <b>{zone.name}</b>? Lượt truy cập tiếp theo sẽ tải lại từ máy chủ.</>, confirmLabel: 'Purge tất cả' }))) return;
    setBusy(true);
    await run(() => post(`/api/cloudflare/zones/${zone.id}/purge`, all ? {} : { urls: list }), all ? 'Đã xoá toàn bộ cache' : `Đã xoá cache ${list.length} URL`);
    setBusy(false);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
        <div className="font-semibold text-white">Xoá cache</div>
        <Field label="URL cần xoá (mỗi dòng 1 URL, tối đa 30)">
          <textarea className="input mono h-24" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={`https://${zone.name}/style.css`} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Eraser} loading={busy} disabled={!urls.trim()} onClick={() => void purge(false)}>
            Xoá các URL
          </Button>
          <Button size="sm" variant="danger" icon={Eraser} disabled={busy} onClick={() => void purge(true)}>
            Purge tất cả
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        <SettingToggle title="Development Mode" desc="Tạm tắt cache 3 giờ khi đang sửa giao diện website" checked={zone.settings.development_mode === 'on'} onChange={(v) => void set('development_mode', v ? 'on' : 'off', 'Development Mode')} />
        <SettingToggle title="IPv6" desc="Cho phép khách truy cập qua IPv6" checked={zone.settings.ipv6 === 'on'} onChange={(v) => void set('ipv6', v ? 'on' : 'off', 'IPv6')} />
      </div>
    </div>
  );
}

function CloudflarePanel() {
  const status = useApi<{ configured: boolean }>('/api/cloudflare');
  const zones = useApi<Zone[]>(status.data?.configured ? '/api/cloudflare/zones' : null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [tab, setTab] = useState<'protect' | 'ssl' | 'rules' | 'dns' | 'cache'>('protect');
  const [reconnect, setReconnect] = useState(false);
  const { confirm, run } = useFeedback();
  const zone = zones.data?.find((z) => z.id === zoneId) ?? zones.data?.[0] ?? null;

  useEffect(() => {
    if (!zoneId && zones.data?.[0]) setZoneId(zones.data[0].id);
  }, [zones.data, zoneId]);

  const set = async (setting: string, value: string, label: string) => {
    if (!zone) return;
    const ok = await run(() => patch(`/api/cloudflare/zones/${zone.id}/settings/${setting}`, { value }), `${zone.name}: ${label}`);
    if (ok) zones.setData(zones.data!.map((z) => (z.id === zone.id ? { ...z, settings: { ...z.settings, [setting]: value } } : z)));
  };

  const disconnect = async () => {
    if (!(await confirm({ title: 'Ngắt kết nối Cloudflare', message: 'Xoá API Token đã lưu khỏi ZenPanel? Thiết lập trên Cloudflare vẫn giữ nguyên.', danger: true, confirmLabel: 'Ngắt kết nối' }))) return;
    await run(() => put('/api/cloudflare/token', { token: '' }), 'Đã xoá API Token');
    zones.setData(null);
    await status.reload();
  };

  if (!status.data) return <Spinner />;
  if (!status.data.configured || reconnect) {
    return (
      <ConnectCard
        onConnected={() => {
          setReconnect(false);
          void status.reload();
          void zones.reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PermissionsCard onReconnect={() => setReconnect(true)} />
      {zones.error ? (
        <ErrorBox message={zones.error} onRetry={zones.reload} />
      ) : !zones.data ? (
        <Spinner label="Đang tải danh sách domain từ Cloudflare..." />
      ) : zones.data.length === 0 ? (
        <Card>
          <EmptyState icon={Globe} title="Token chưa được gán domain nào" description='Sửa token, mục "Zone Resources" chọn "All zones" hoặc domain cụ thể.' />
        </Card>
      ) : (
        zone && (
          <Card
            title={
              <span className="flex min-w-0 items-center gap-2">
                <Globe className="size-4 shrink-0 text-orange-400" />
                {zones.data.length > 1 ? (
                  <Select className="h-9 max-w-[220px] py-0 text-sm" value={zone.id} onChange={(e) => setZoneId(e.target.value)}>
                    {zones.data.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="mono truncate">{zone.name}</span>
                )}
                <Badge tone={zone.status === 'active' ? 'green' : 'amber'}>{zone.status === 'active' ? 'Đang hoạt động' : zone.status}</Badge>
                <Badge>{zone.plan}</Badge>
              </span>
            }
            actions={
              <>
                <a href={`https://dash.cloudflare.com/?to=/:account/${zone.name}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost" icon={ExternalLink}>
                    Mở Cloudflare
                  </Button>
                </a>
                <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void zones.reload()} />
                <Button size="sm" variant="ghost" onClick={() => void disconnect()}>
                  Ngắt kết nối
                </Button>
              </>
            }
          >
            {zone.status !== 'active' && zone.nameServers?.length ? (
              <div className="mb-4">
                <Notice tone="amber">
                  Domain chưa hoạt động trên Cloudflare. Đổi nameserver tại nhà đăng ký domain thành: <b className="mono">{zone.nameServers.join(', ')}</b>
                </Notice>
              </div>
            ) : null}
            <div className="mb-5">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'protect', label: 'Bảo vệ', icon: ShieldAlert },
                  { id: 'ssl', label: 'SSL/TLS', icon: Lock },
                  { id: 'rules', label: 'Chặn IP/Quốc gia', icon: Ban },
                  { id: 'dns', label: 'DNS', icon: Globe },
                  { id: 'cache', label: 'Cache', icon: Zap },
                ]}
              />
            </div>
            {tab === 'protect' && <ProtectionTab zone={zone} set={set} />}
            {tab === 'ssl' && <SslTab zone={zone} set={set} />}
            {tab === 'rules' && <AccessRulesTab key={zone.id} zone={zone} />}
            {tab === 'dns' && <DnsTab key={zone.id} zone={zone} />}
            {tab === 'cache' && <CacheTab zone={zone} set={set} />}
          </Card>
        )
      )}
    </div>
  );
}

function BlockedIps() {
  const firewall = useApi<{ status: FirewallStatus; rules: FirewallRule[] }>('/api/firewall');
  const [blocking, setBlocking] = useState(false);
  const { confirm, run } = useFeedback();
  const blocked = (firewall.data?.rules ?? []).filter((r) => r.action === 'deny' && r.source);

  const unblock = async (rule: FirewallRule) => {
    if (!(await confirm({ title: 'Bỏ chặn IP', message: <>Cho phép <b className="mono">{rule.source}</b> truy cập lại?</>, confirmLabel: 'Bỏ chặn' }))) return;
    await run(() => del(`/api/firewall/rules/${encodeURIComponent(rule.id)}`), `Đã bỏ chặn ${rule.source}`);
    await firewall.reload();
  };

  return (
    <Card
      title="IP bị chặn trên tường lửa máy chủ"
      icon={Ban}
      actions={
        <Button size="sm" variant="danger" icon={Ban} onClick={() => setBlocking(true)}>
          Chặn IP
        </Button>
      }
    >
      {firewall.data && !firewall.data.status.enabled && (
        <div className="mb-4">
          <Notice tone="amber">Tường lửa đang tắt nên các luật chặn IP chưa có hiệu lực. Bật trong mục Tường lửa.</Notice>
        </div>
      )}
      {firewall.error ? (
        <ErrorBox message={firewall.error} onRetry={firewall.reload} />
      ) : !firewall.data ? (
        <Spinner />
      ) : blocked.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Chưa chặn IP nào" description="Chặn trên máy chủ có tác dụng cả khi truy cập thẳng bằng IP, không qua Cloudflare." />
      ) : (
        <div className="space-y-2">
          {blocked.map((rule) => (
            <div key={rule.id} className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-2.5">
              <Ban className="size-4 text-zen-red" />
              <span className="mono font-semibold text-white">{rule.source}</span>
              <span className="flex-1 truncate text-xs text-slate-500">{rule.description}</span>
              <Button size="xs" variant="ghost" onClick={() => void unblock(rule)}>
                Bỏ chặn
              </Button>
            </div>
          ))}
        </div>
      )}
      {blocking && <RuleModal open initial={{ mode: 'block' }} onClose={() => setBlocking(false)} onSaved={() => void firewall.reload()} />}
    </Card>
  );
}

export default function Security() {
  const [tab, setTab] = useState<'cloudflare' | 'server'>('cloudflare');
  return (
    <>
      <PageHeader title="Bảo mật & WAF" description="Cloudflare WAF chống DDoS, chặn IP/quốc gia, SSL, DNS + chặn IP ngay trên máy chủ" icon={ShieldCheck} />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'cloudflare', label: 'Cloudflare WAF', icon: Cloud },
            { id: 'server', label: 'Máy chủ', icon: Shield },
          ]}
        />
      </div>
      {tab === 'cloudflare' ? (
        <CloudflarePanel />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <BlockedIps />
          <Card title="Lớp bảo vệ của ZenPanel" icon={ShieldCheck}>
            <ul className="space-y-2.5 text-sm text-slate-300">
              {[
                'Đăng nhập bằng mật khẩu băm scrypt, token ký HMAC hết hạn sau 7 ngày',
                'Khoá đăng nhập 5 phút sau 5 lần sai mật khẩu (theo IP thật qua Cloudflare)',
                'Đổi mật khẩu / "Đăng xuất mọi thiết bị" vô hiệu hoá mọi phiên khác',
                'Link tải file dùng vé 60 giây, không đặt token đăng nhập vào URL',
                'Truy cập công khai qua Cloudflare Tunnel, không cần mở cổng panel ra Internet',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-zen-green" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
