// ZenPanel - Quản lý dịch vụ hệ thống (Windows Services / systemd / OpenRC)
import { useMemo, useState } from 'react';
import { FileText, ListTree, Play, Power, PowerOff, RefreshCw, RotateCw, Square } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, ErrorBox, IconButton, Modal, PageHeader, SearchInput, Spinner, Tabs, cn, td, th, tr, type Tone } from '../components/ui';
import { get, post } from '../lib/api';
import { useApi } from '../lib/hooks';
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

type Filter = 'all' | 'running' | 'stopped' | 'failed';

export default function Services() {
  const { data, error, loading, reload } = useApi<ServiceInfo[]>('/api/services');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ name: string; content: string | null } | null>(null);
  const { confirm, run } = useFeedback();

  const counts = useMemo(() => {
    const list = data ?? [];
    return { all: list.length, running: list.filter((s) => s.state === 'running').length, stopped: list.filter((s) => s.state === 'stopped').length, failed: list.filter((s) => s.state === 'failed').length };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return (data ?? []).filter(
      (s) => (filter === 'all' || s.state === filter) && (!q || s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    );
  }, [data, query, filter]);

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

  const openLogs = async (service: ServiceInfo) => {
    setLogs({ name: service.displayName, content: null });
    const result = await run(() => get<{ logs: string }>(`/api/services/${encodeURIComponent(service.name)}/logs`));
    setLogs({ name: service.displayName, content: result?.logs || 'Không có log.' });
  };

  return (
    <>
      <PageHeader
        title="Dịch vụ hệ thống"
        description="Khởi động, dừng, bật tự chạy cùng hệ điều hành"
        icon={ListTree}
        actions={
          <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
            Làm mới
          </Button>
        }
      />
      <Card
        bodyClassName="p-0"
        title={
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'all', label: 'Tất cả', count: counts.all },
              { id: 'running', label: 'Đang chạy', count: counts.running },
              { id: 'stopped', label: 'Đã dừng', count: counts.stopped },
              { id: 'failed', label: 'Lỗi', count: counts.failed },
            ]}
          />
        }
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Tìm dịch vụ..." className="w-64 max-w-full" />}
      >
        {error && (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        )}
        {!data && !error ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Dịch vụ</th>
                  <th className={th}>Trạng thái</th>
                  <th className={th}>Khởi động</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.name} className={cn(tr, busy === s.name && 'opacity-50')}>
                    <td className={cn(td, 'max-w-[480px]')}>
                      <div className="font-semibold text-slate-100">{s.displayName}</div>
                      <div className="truncate text-xs text-slate-500" title={s.description}>
                        <span className="mono">{s.name}</span>
                        {s.description && ` · ${s.description}`}
                      </div>
                    </td>
                    <td className={td}>
                      <Badge tone={stateTone[s.state]}>{stateLabel[s.state]}</Badge>
                    </td>
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

      <Modal open={Boolean(logs)} onClose={() => setLogs(null)} title={`Log: ${logs?.name ?? ''}`} size="xl">
        {logs?.content === null ? (
          <Spinner />
        ) : (
          <pre className="mono max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[#0a0e17] p-4 text-xs leading-relaxed text-slate-300">{logs?.content}</pre>
        )}
      </Modal>
    </>
  );
}
