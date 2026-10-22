// ZenPanel - Tường lửa: bật/tắt, mở cổng, chặn IP, xem cổng đang lắng nghe
import { useMemo, useState, type FormEvent } from 'react';
import { Ban, DoorOpen, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Tabs, Toggle, cn, td, th, tr } from '../components/ui';
import { del, post } from '../lib/api';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { FirewallRule, FirewallStatus, ListeningPort } from '../lib/types';

const backendLabel: Record<FirewallStatus['backend'], string> = {
  ufw: 'UFW',
  firewalld: 'firewalld',
  iptables: 'iptables',
  windows: 'Windows Defender Firewall',
  none: 'Không có',
};

type RuleForm = { mode: 'port' | 'block'; port: string; protocol: 'tcp' | 'udp' | 'any'; source: string; description: string };
const emptyForm: RuleForm = { mode: 'port', port: '', protocol: 'tcp', source: '', description: '' };

export function RuleModal({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: () => void; initial?: Partial<RuleForm> }) {
  const [form, setForm] = useState<RuleForm>({ ...emptyForm, ...initial });
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const body =
      form.mode === 'port'
        ? { action: 'allow', port: form.port, protocol: form.protocol, source: form.source || null, description: form.description }
        : { action: 'deny', port: null, protocol: 'any', source: form.source, description: form.description || `ZenPanel - Chặn ${form.source}` };
    const ok = await run(() => post('/api/firewall/rules', body), form.mode === 'port' ? `Đã mở cổng ${form.port}` : `Đã chặn ${form.source}`);
    setSaving(false);
    if (ok) {
      setForm({ ...emptyForm });
      onSaved();
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Thêm luật tường lửa">
      <form onSubmit={submit} className="space-y-4">
        <Tabs
          value={form.mode}
          onChange={(mode) => setForm({ ...form, mode })}
          tabs={[
            { id: 'port', label: 'Mở cổng', icon: DoorOpen },
            { id: 'block', label: 'Chặn IP', icon: Ban },
          ]}
        />
        {form.mode === 'port' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cổng" hint="Ví dụ 8080 hoặc dải 8000-8100">
              <input className="input mono" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} required placeholder="8080" />
            </Field>
            <Field label="Giao thức">
              <Select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as RuleForm['protocol'] })}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="any">TCP + UDP</option>
              </Select>
            </Field>
            <Field label="Chỉ cho phép từ IP (tùy chọn)" hint="Để trống = mọi nơi">
              <input className="input mono" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="203.0.113.0/24" />
            </Field>
            <Field label="Ghi chú">
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Web app" />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Địa chỉ IP / CIDR">
              <input className="input mono" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} required placeholder="1.2.3.4" />
            </Field>
            <Field label="Lý do">
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brute-force SSH" />
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant={form.mode === 'port' ? 'primary' : 'danger'} loading={saving} icon={form.mode === 'port' ? DoorOpen : Ban}>
            {form.mode === 'port' ? 'Mở cổng' : 'Chặn IP'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Firewall() {
  const { info } = usePanel();
  const firewall = useApi<{ status: FirewallStatus; rules: FirewallRule[] }>('/api/firewall');
  const ports = useApi<ListeningPort[]>('/api/ports');
  const [tab, setTab] = useState<'rules' | 'ports'>('rules');
  const [modal, setModal] = useState<Partial<RuleForm> | null>(null);
  const [query, setQuery] = useState('');
  const [toggling, setToggling] = useState(false);
  const { confirm, run } = useFeedback();

  const status = firewall.data?.status;
  const sortedPorts = useMemo(
    () =>
      (ports.data ?? [])
        .filter((p) => !query || String(p.port).includes(query) || p.process?.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.port - b.port),
    [ports.data, query],
  );

  const toggle = async (enabled: boolean) => {
    const ok = await confirm({
      title: enabled ? 'Bật tường lửa' : 'Tắt tường lửa',
      message: enabled ? (
        <>
          ZenPanel sẽ tự mở cổng <b>{info?.os.family === 'windows' ? '3389 (RDP)' : '22 (SSH)'}</b> và cổng panel <b>{info?.port}</b> trước khi bật để bạn không bị khóa ngoài.
        </>
      ) : (
        'Tắt tường lửa sẽ để mọi cổng trên máy chủ mở ra Internet.'
      ),
      danger: !enabled,
      confirmLabel: enabled ? 'Bật' : 'Tắt',
    });
    if (!ok) return;
    setToggling(true);
    await run(() => post('/api/firewall/toggle', { enabled }), enabled ? 'Đã bật tường lửa' : 'Đã tắt tường lửa');
    setToggling(false);
    await firewall.reload();
  };

  const remove = async (rule: FirewallRule) => {
    const ok = await confirm({
      title: 'Xóa luật',
      message: <>Xóa luật {rule.action === 'allow' ? 'cho phép' : 'chặn'} {rule.port ? `cổng ${rule.port}` : ''} {rule.source ? `từ ${rule.source}` : ''}?</>,
      danger: true,
      confirmLabel: 'Xóa',
    });
    if (!ok) return;
    await run(() => del(`/api/firewall/rules/${encodeURIComponent(rule.id)}`), 'Đã xóa luật');
    await firewall.reload();
  };

  return (
    <>
      <PageHeader
        title="Tường lửa"
        description="Tự động dùng Windows Firewall hoặc UFW / firewalld / iptables theo hệ điều hành"
        icon={Shield}
        actions={
          <>
            <Button icon={Ban} variant="danger" onClick={() => setModal({ mode: 'block' })}>
              Chặn IP
            </Button>
            <Button icon={Plus} variant="primary" onClick={() => setModal({ mode: 'port' })}>
              Mở cổng
            </Button>
          </>
        }
      />

      {firewall.error && <ErrorBox message={firewall.error} onRetry={firewall.reload} />}

      {status && (
        <div className="glass mb-4 flex flex-wrap items-center gap-4 p-5">
          <div className={cn('flex size-12 items-center justify-center rounded-2xl', status.enabled ? 'bg-zen-green/15 text-zen-green' : 'bg-zen-red/15 text-zen-red')}>
            <Shield className="size-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 font-bold text-white">
              {backendLabel[status.backend]}
              <Badge tone={status.enabled ? 'green' : 'red'}>{status.enabled ? 'Đang bật' : 'Đang tắt'}</Badge>
            </div>
            <div className="text-sm text-slate-400">{status.detail}</div>
          </div>
          {status.backend !== 'none' && <Toggle checked={status.enabled} onChange={(v) => void toggle(v)} disabled={toggling} label="Bật tường lửa" />}
        </div>
      )}

      {status?.backend === 'windows' && (
        <div className="mb-4">
          <Notice>Trên Windows, ZenPanel chỉ liệt kê các luật do ZenPanel tạo (nhóm "ZenPanel") để tránh lẫn với hàng trăm luật mặc định của hệ thống.</Notice>
        </div>
      )}

      <Card
        bodyClassName="p-0"
        title={
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'rules', label: 'Luật', count: firewall.data?.rules.length },
              { id: 'ports', label: 'Cổng đang lắng nghe', count: ports.data?.length },
            ]}
          />
        }
        actions={
          <>
            {tab === 'ports' && <SearchInput value={query} onChange={setQuery} placeholder="Cổng hoặc tiến trình" className="w-56" />}
            <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void (tab === 'rules' ? firewall.reload() : ports.reload())} />
          </>
        }
      >
        {tab === 'rules' ? (
          !firewall.data ? (
            <Spinner />
          ) : firewall.data.rules.length === 0 ? (
            <EmptyState icon={Shield} title="Chưa có luật nào" description="Bấm Mở cổng hoặc Chặn IP để thêm luật đầu tiên." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr>
                    <th className={th}>Hành động</th>
                    <th className={th}>Cổng</th>
                    <th className={th}>Giao thức</th>
                    <th className={th}>Nguồn</th>
                    <th className={th}>Ghi chú</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {firewall.data.rules.map((rule) => (
                    <tr key={rule.id} className={tr}>
                      <td className={td}>
                        <Badge tone={rule.action === 'allow' ? 'green' : 'red'}>{rule.action === 'allow' ? 'Cho phép' : 'Chặn'}</Badge>
                      </td>
                      <td className={cn(td, 'mono text-slate-200')}>{rule.port ?? 'Tất cả'}</td>
                      <td className={cn(td, 'uppercase text-slate-400')}>{rule.protocol === 'any' ? 'Tất cả' : rule.protocol}</td>
                      <td className={cn(td, 'mono text-slate-300')}>{rule.source ?? 'Mọi nơi'}</td>
                      <td className={cn(td, 'max-w-[280px] truncate text-slate-500')}>{rule.description}</td>
                      <td className={cn(td, 'text-right')}>
                        <IconButton icon={Trash2} title="Xóa luật" className="hover:text-zen-red" onClick={() => void remove(rule)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !ports.data ? (
          ports.error ? (
            <div className="p-4">
              <ErrorBox message={ports.error} onRetry={ports.reload} />
            </div>
          ) : (
            <Spinner />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Cổng</th>
                  <th className={th}>Giao thức</th>
                  <th className={th}>Địa chỉ</th>
                  <th className={th}>Tiến trình</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {sortedPorts.map((p, i) => (
                  <tr key={`${p.protocol}-${p.address}-${p.port}-${i}`} className={tr}>
                    <td className={cn(td, 'mono font-semibold text-white')}>{p.port}</td>
                    <td className={cn(td, 'uppercase text-slate-400')}>{p.protocol}</td>
                    <td className={cn(td, 'mono text-slate-400')}>
                      {p.address}
                      {['127.0.0.1', '::1'].includes(p.address) && <Badge className="ml-2">chỉ nội bộ</Badge>}
                    </td>
                    <td className={cn(td, 'text-slate-300')}>
                      {p.process ?? '—'} {p.pid !== null && <span className="mono text-xs text-slate-500">#{p.pid}</span>}
                    </td>
                    <td className={cn(td, 'text-right')}>
                      <Button size="xs" variant="soft" onClick={() => setModal({ mode: 'port', port: String(p.port), protocol: p.protocol })}>
                        Mở ra ngoài
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && <RuleModal open initial={modal} onClose={() => setModal(null)} onSaved={() => void firewall.reload()} />}
    </>
  );
}
