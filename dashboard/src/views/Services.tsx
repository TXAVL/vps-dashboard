// ZenPanel - Quản lý dịch vụ hệ thống (Windows Services / systemd / OpenRC): RAM/PID, lọc dịch vụ quan trọng,
// ghim, thao tác hàng loạt, xem log theo số dòng
import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, FileText, ListTree, Play, Power, PowerOff, RefreshCw, RotateCw, Square, Star } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, ErrorBox, IconButton, Modal, PageHeader, SearchInput, Select, Spinner, Tabs, cn, td, th, tr, type Tone } from '../components/ui';
import { get, post } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useApi, useLocalStorage } from '../lib/hooks';
import type { ServiceInfo } from '../lib/types';

const stateTone: Record<ServiceInfo['state'], Tone> = { running: 'green', stopped: 'slate', starting: 'blue', stopping: 'amber', failed: 'red', unknown: 'slate' };
const stateLabel: Record<ServiceInfo['state'], string> = {
  running: 'Đang chạy',
  stopped: 'Đã dừng',
  starting: 'Đang khởi động',
  stopping: 'Đang dừng',
  failed: 'Lỗi',
  unknown: 'Không rõ',
};
const startupLabel: Record<ServiceInfo['startup'], string> = { auto: 'Tự động', manual: 'Thủ công', disabled: 'Vô hiệu', static: 'Static', unknown: '—' };

/** Dịch vụ người quản trị VPS hay đụng tới */
const IMPORTANT = /^(nginx|apache2?|httpd|caddy|w3svc|iis|docker|containerd|com\.docker|mysql|mysqld|mariadb|postgres|redis|mongod|ssh|sshd|openssh|cron|crond|php.*fpm|fail2ban|ufw|firewalld|zenpanel|cloudflared|wsl|winrm|termservice|mpssvc|schedule)/i;

type Filter = 'important' | 'all' | 'running' | 'stopped' | 'failed' | 'pinned';
type Sort = 'name' | 'memory';

export default function Services() {
  const { data, error, loading, reload } = useApi<ServiceInfo[]>('/api/services');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('important');
  const [sort, setSort] = useState<Sort>('name');
  const [pinned, setPinned] = useLocalStorage<string[]>('zenpanel.services.pinned', []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ service: ServiceInfo; lines: number; content: string | null } | null>(null);
  const { confirm, run } = useFeedback();

  const counts = useMemo(() => {
    const list = data ?? [];
    return {
      important: list.filter((s) => IMPORTANT.test(s.name) || pinned.includes(s.name)).length,
      all: list.length,
      running: list.filter((s) => s.state === 'running').length,
      stopped: list.filter((s) => s.state === 'stopped').length,
      failed: list.filter((s) => s.state === 'failed').length,
      pinned: pinned.length,
    };
  }, [data, pinned]);

  const totalMem = useMemo(() => (data ?? []).reduce((n, s) => n + (s.memory ?? 0), 0), [data]);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const list = (data ?? []).filter((s) => {
      if (filter === 'important' && !IMPORTANT.test(s.name) && !pinned.includes(s.name)) return false;
      if (filter === 'pinned' && !pinned.includes(s.name)) return false;
      if ((filter === 'running' || filter === 'stopped' || filter === 'failed') && s.state !== filter) return false;
      return !q || s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    });
    return list.sort((a, b) => Number(pinned.includes(b.name)) - Number(pinned.includes(a.name)) || (sort === 'memory' ? (b.memory ?? 0) - (a.memory ?? 0) : a.displayName.localeCompare(b.displayName)));
  }, [data, query, filter, pinned, sort]);

  const act = async (service: ServiceInfo, action: string, label: string) => {
    if (action === 'stop' || action === 'disable') {
      const ok = await confirm({ title: `${label} dịch vụ`, message: <>Bạn chắc chắn muốn {label.toLowerCase()} <b>{service.displayName}</b>?</>, danger: true, confirmLabel: label });
      if (!ok) return;
    }
    setBusy(service.name);
    await run(() => post(`/api/services/${encodeURIComponent(service.name)}/${action}`), `${label}: ${service.displayName}`);
    setBusy(null);
    await reload();
  };

  const bulk = async (action: string, label: string) => {
    const list = (data ?? []).filter((s) => selected.has(s.name));
    if (!list.length) return;
    if (!(await confirm({ title: `${label} ${list.length} dịch vụ`, message: list.map((s) => s.displayName).join(', '), danger: action === 'stop', confirmLabel: label }))) return;
    for (const s of list) {
      setBusy(s.name);
      await run(() => post(`/api/services/${encodeURIComponent(s.name)}/${action}`));
    }
    setBusy(null);
    setSelected(new Set());
    await reload();
  };

  const openLogs = async (service: ServiceInfo, lines = 200) => {
    setLogs({ service, lines, content: null });
    const result = await run(() => get<{ logs: string }>(`/api/services/${encodeURIComponent(service.name)}/logs?lines=${lines}`));
    setLogs({ service, lines, content: result?.logs || 'Không có log.' });
  };

  const togglePin = (name: string) => setPinned(pinned.includes(name) ? pinned.filter((p) => p !== name) : [...pinned, name]);
  const toggleSelect = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  return (
    <>
      <PageHeader
        title="Dịch vụ hệ thống"
        description="Khởi động, dừng, bật tự chạy cùng hệ điều hành · xem RAM và log từng dịch vụ"
        icon={ListTree}
        actions={
          <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
            Làm mới
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ['Đang chạy', counts.running, 'text-emerald-300'],
          ['Đã dừng', counts.stopped, 'text-slate-300'],
          ['Lỗi', counts.failed, counts.failed ? 'text-rose-300' : 'text-slate-300'],
          ['RAM dịch vụ', formatBytes(totalMem), 'text-sky-300'],
        ].map(([label, value, color]) => (
          <div key={label as string} className="rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={cn('mono mt-1 text-2xl font-black', color as string)}>{value}</div>
          </div>
        ))}
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'important', label: 'Quan trọng', count: counts.important },
              { id: 'pinned', label: 'Đã ghim', count: counts.pinned },
              { id: 'running', label: 'Đang chạy', count: counts.running },
              { id: 'failed', label: 'Lỗi', count: counts.failed },
              { id: 'stopped', label: 'Đã dừng', count: counts.stopped },
              { id: 'all', label: 'Tất cả', count: counts.all },
            ]}
          />
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-9 w-40 py-0 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="name">Sắp xếp theo tên</option>
              <option value="memory">Sắp xếp theo RAM</option>
            </Select>
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm dịch vụ..." className="w-56 max-w-full" />
          </div>
        }
      >
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/40 bg-zen-blue/10 px-4 py-2 text-sm">
            <span className="font-semibold text-white">Đã chọn {selected.size}</span>
            <Button size="xs" variant="soft" icon={Play} onClick={() => void bulk('start', 'Khởi động')}>Khởi động</Button>
            <Button size="xs" variant="soft" icon={RotateCw} onClick={() => void bulk('restart', 'Khởi động lại')}>Khởi động lại</Button>
            <Button size="xs" variant="ghost" icon={Square} onClick={() => void bulk('stop', 'Dừng')}>Dừng</Button>
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
          </div>
        )}
        {error && (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        )}
        {!data && !error ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'w-10')} />
                  <th className={th}>Dịch vụ</th>
                  <th className={th}>Trạng thái</th>
                  <th className={th}>
                    <button type="button" className="flex items-center gap-1 uppercase" onClick={() => setSort(sort === 'memory' ? 'name' : 'memory')}>
                      RAM <ArrowDownWideNarrow className={cn('size-3', sort === 'memory' && 'text-blue-300')} />
                    </button>
                  </th>
                  <th className={th}>Khởi động</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      Không có dịch vụ nào khớp. {filter === 'important' && 'Thử tab "Tất cả".'}
                    </td>
                  </tr>
                )}
                {rows.map((s) => (
                  <tr key={s.name} className={cn(tr, busy === s.name && 'opacity-50')}>
                    <td className={cn(td, 'pr-0')}>
                      <div className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-zen-blue size-4" checked={selected.has(s.name)} onChange={() => toggleSelect(s.name)} />
                        <button type="button" onClick={() => togglePin(s.name)} data-tip={pinned.includes(s.name) ? 'Bỏ ghim' : 'Ghim lên đầu'}>
                          <Star className={cn('size-3.5', pinned.includes(s.name) ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-slate-300')} />
                        </button>
                      </div>
                    </td>
                    <td className={cn(td, 'max-w-[440px]')}>
                      <div className="font-semibold text-slate-100">{s.displayName}</div>
                      <div className="truncate text-xs text-slate-500" data-tip={s.description}>
                        <span className="mono">{s.name}</span>
                        {s.pid ? <span className="mono"> · PID {s.pid}</span> : null}
                        {s.description && ` · ${s.description}`}
                      </div>
                    </td>
                    <td className={td}>
                      <Badge tone={stateTone[s.state]}>{stateLabel[s.state]}</Badge>
                    </td>
                    <td className={cn(td, 'mono text-xs text-slate-300')}>{s.memory ? formatBytes(s.memory) : '—'}</td>
                    <td className={cn(td, 'text-slate-400')}>{startupLabel[s.startup]}</td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      {s.state === 'running' ? (
                        <>
                          <IconButton icon={RotateCw} title="Khởi động lại" onClick={() => void act(s, 'restart', 'Khởi động lại')} />
                          <IconButton icon={Square} title="Dừng" className="hover:text-zen-red" onClick={() => void act(s, 'stop', 'Dừng')} />
                        </>
                      ) : (
                        <IconButton icon={Play} title="Khởi động" className="hover:text-zen-green" onClick={() => void act(s, 'start', 'Khởi động')} />
                      )}
                      {s.startup === 'auto' ? (
                        <IconButton icon={PowerOff} title="Tắt tự khởi động" onClick={() => void act(s, 'disable', 'Tắt tự khởi động')} />
                      ) : (
                        <IconButton icon={Power} title="Bật tự khởi động" onClick={() => void act(s, 'enable', 'Bật tự khởi động')} />
                      )}
                      <IconButton icon={FileText} title="Xem log" onClick={() => void openLogs(s)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(logs)}
        onClose={() => setLogs(null)}
        title={`Log: ${logs?.service.displayName ?? ''}`}
        size="xl"
        footer={
          logs && (
            <div className="flex w-full items-center justify-between gap-2">
              <Select className="h-9 w-32 py-0 text-xs" value={logs.lines} onChange={(e) => void openLogs(logs.service, Number(e.target.value))}>
                {[100, 200, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} dòng</option>)}
              </Select>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void openLogs(logs.service, logs.lines)}>Tải lại</Button>
                <Button size="sm" onClick={() => setLogs(null)}>Đóng</Button>
              </div>
            </div>
          )
        }
      >
        {logs?.content === null ? (
          <Spinner />
        ) : (
          <div className="mono max-h-[65vh] overflow-auto rounded-xl bg-[#0a0e17] p-4 text-xs leading-relaxed">
            {(logs?.content ?? '').split('\n').map((line, i) => (
              <div key={i} className={cn('whitespace-pre-wrap break-all', /(error|failed|fatal|lỗi)/i.test(line) ? 'text-rose-300' : /warn/i.test(line) ? 'text-amber-300' : 'text-slate-300')}>
                {line}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
