// ZenPanel - Task Manager: danh sách tiến trình, sắp xếp, dừng tiến trình
import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, Cpu, RefreshCw, Skull, Square } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, ErrorBox, IconButton, PageHeader, SearchInput, Spinner, Toggle, cn, td, th, tr } from '../components/ui';
import { post } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { ProcessInfo } from '../lib/types';

type SortKey = 'cpu' | 'memory' | 'name' | 'pid';

export default function Processes() {
  const [auto, setAuto] = useState(true);
  const { data, error, loading, reload } = useApi<ProcessInfo[]>('/api/processes', auto ? 5000 : 0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('cpu');
  const { confirm, run } = useFeedback();

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = (data ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q) || p.command?.toLowerCase().includes(q) || p.user?.toLowerCase().includes(q),
    );
    return filtered.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'pid' ? a.pid - b.pid : b[sort] - a[sort])).slice(0, 300);
  }, [data, query, sort]);

  const totals = useMemo(() => ({ cpu: (data ?? []).reduce((s, p) => s + p.cpu, 0), mem: (data ?? []).reduce((s, p) => s + p.memory, 0) }), [data]);

  const kill = async (p: ProcessInfo, force: boolean) => {
    const ok = await confirm({
      title: force ? 'Buộc dừng tiến trình' : 'Dừng tiến trình',
      message: (
        <>
          Dừng <b className="mono">{p.name}</b> (PID {p.pid})? {force && 'Tiến trình sẽ bị kill ngay, dữ liệu chưa lưu có thể mất.'}
        </>
      ),
      danger: true,
      confirmLabel: force ? 'Kill' : 'Dừng',
    });
    if (!ok) return;
    await run(() => post(`/api/processes/${p.pid}/kill`, { force }), `Đã gửi lệnh dừng ${p.name}`);
    setTimeout(() => void reload(), 800);
  };

  const SortHeader = ({ id, label, className }: { id: SortKey; label: string; className?: string }) => (
    <th className={cn(th, 'cursor-pointer select-none hover:text-slate-300', className)} onClick={() => setSort(id)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sort === id && <ArrowDownWideNarrow className="size-3.5 text-zen-blue" />}
      </span>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Tiến trình"
        description="Task Manager của máy chủ"
        icon={Cpu}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <Toggle checked={auto} onChange={setAuto} label="Tự làm mới" /> Tự làm mới 5s
            </label>
            <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
              Làm mới
            </Button>
          </>
        }
      />
      <Card
        bodyClassName="p-0"
        title={
          <span className="flex items-center gap-2">
            {data?.length ?? 0} tiến trình <Badge tone="blue">CPU {totals.cpu.toFixed(0)}%</Badge> <Badge tone="green">RAM {formatBytes(totals.mem)}</Badge>
          </span>
        }
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Tên, PID, lệnh..." className="w-64 max-w-full" />}
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
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <SortHeader id="pid" label="PID" />
                  <SortHeader id="name" label="Tên" />
                  <th className={th}>User</th>
                  <SortHeader id="cpu" label="CPU" className="text-right" />
                  <SortHeader id="memory" label="RAM" className="text-right" />
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.pid} className={tr}>
                    <td className={cn(td, 'mono text-slate-400')}>{p.pid}</td>
                    <td className={cn(td, 'max-w-[420px]')}>
                      <div className="font-semibold text-slate-100">{p.name}</div>
                      {p.command && <div className="mono truncate text-xs text-slate-500" data-tip={p.command}>{p.command}</div>}
                    </td>
                    <td className={cn(td, 'text-slate-400')}>{p.user ?? '—'}</td>
                    <td className={cn(td, 'mono text-right', p.cpu > 50 ? 'text-zen-red' : p.cpu > 10 ? 'text-zen-amber' : 'text-slate-300')}>{p.cpu.toFixed(1)}%</td>
                    <td className={cn(td, 'mono text-right text-slate-300')}>{formatBytes(p.memory)}</td>
                    <td className={cn(td, 'text-right')}>
                      <IconButton icon={Square} title="Dừng" onClick={() => void kill(p, false)} />
                      <IconButton icon={Skull} title="Buộc dừng (kill)" className="hover:text-zen-red" onClick={() => void kill(p, true)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 300 && <p className="p-4 text-center text-xs text-slate-500">Chỉ hiển thị 300 tiến trình đầu tiên. Hãy dùng ô tìm kiếm để lọc.</p>}
          </div>
        )}
      </Card>
    </>
  );
}
