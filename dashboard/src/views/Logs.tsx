// ZenPanel - Nhật ký: journal / Event Log, log web server, log website, log ZenPanel; lọc, tự làm mới, tải về
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, RefreshCw, ScrollText } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Button, EmptyState, ErrorBox, PageHeader, SearchInput, Select, Spinner, cn } from '../components/ui';
import { get, post } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useApi } from '../lib/hooks';

interface LogSource { id: string; label: string; group: string; kind: string; path?: string }
interface LogRead { content: string; size: number | null; matched: number | null }

const tone = (line: string) =>
  /\b(error|err|fatal|crit|fail(ed)?|emerg|alert|lỗi)\b|\[Error\]|\[Critical\]/i.test(line)
    ? 'text-rose-300'
    : /\b(warn(ing)?)\b|\[Warning\]/i.test(line)
      ? 'text-amber-300'
      : /\b(accepted|success|started)\b/i.test(line)
        ? 'text-emerald-300'
        : 'text-slate-300';

export default function Logs() {
  const sources = useApi<LogSource[]>('/api/logs/sources');
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState(300);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [live, setLive] = useState(false);
  const [data, setData] = useState<LogRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { run } = useFeedback();

  useEffect(() => {
    if (!active && sources.data?.length) setActive(sources.data[0].id);
  }, [sources.data, active]);

  const load = async () => {
    if (!active) return;
    setLoading(true);
    try {
      const res = await get<LogRead>(`/api/logs/read?id=${encodeURIComponent(active)}&lines=${lines}&q=${encodeURIComponent(applied)}`);
      setData(res);
      setError(null);
      setTimeout(() => box.current && (box.current.scrollTop = box.current.scrollHeight), 30);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lines, applied]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, active, lines, applied]);

  const groups = useMemo(() => {
    const map = new Map<string, LogSource[]>();
    for (const s of sources.data ?? []) map.set(s.group, [...(map.get(s.group) ?? []), s]);
    return [...map];
  }, [sources.data]);

  const current = sources.data?.find((s) => s.id === active);
  const shown = (data?.content ?? '').split('\n').filter((l) => !onlyIssues || tone(l) === 'text-rose-300' || tone(l) === 'text-amber-300');

  const download = async () => {
    const res = await run(() => post<{ url: string }>('/api/logs/download', { id: active }));
    if (res) window.open(res.url, '_blank');
  };

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" description="Xem log OS, web server, website và ZenPanel ngay trên web" icon={ScrollText} actions={<Button icon={RefreshCw} onClick={() => void sources.reload()}>Quét lại nguồn</Button>} />
      {sources.error && <ErrorBox message={sources.error} onRetry={sources.reload} />}
      {!sources.data ? (
        !sources.error && <Spinner />
      ) : sources.data.length === 0 ? (
        <EmptyState icon={ScrollText} title="Không tìm thấy nguồn log nào" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="hidden max-h-[75vh] space-y-4 overflow-y-auto rounded-2xl border border-slate-700/50 bg-ink-950/50 p-3 lg:block">
            {groups.map(([group, list]) => (
              <div key={group}>
                <div className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group}</div>
                {list.map((s) => (
                  <button key={s.id} onClick={() => setActive(s.id)} className={cn('block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm', active === s.id ? 'bg-zen-blue/20 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white')} data-tip={s.path}>
                    {s.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select className="lg:hidden" value={active ?? ''} onChange={(e) => setActive(e.target.value)}>
                {groups.map(([group, list]) => (
                  <optgroup key={group} label={group}>{list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
                ))}
              </Select>
              <form className="min-w-[200px] flex-1" onSubmit={(e) => { e.preventDefault(); setApplied(query); }}>
                <SearchInput value={query} onChange={setQuery} placeholder="Lọc theo từ khoá rồi Enter (IP, lỗi, domain...)" className="w-full" />
              </form>
              <Select className="w-32" value={lines} onChange={(e) => setLines(Number(e.target.value))}>
                {[100, 300, 1000, 3000].map((n) => <option key={n} value={n}>{n} dòng</option>)}
              </Select>
              <Button size="sm" variant={onlyIssues ? 'soft' : 'ghost'} onClick={() => setOnlyIssues(!onlyIssues)}>Chỉ lỗi/cảnh báo</Button>
              <Button size="sm" variant={live ? 'primary' : 'ghost'} icon={live ? Pause : Play} onClick={() => setLive(!live)}>{live ? 'Đang theo dõi' : 'Theo dõi'}</Button>
              <Button size="sm" icon={RefreshCw} loading={loading} onClick={() => void load()}>Tải lại</Button>
              {current?.kind === 'file' && <Button size="sm" icon={Download} onClick={() => void download()}>Tải file</Button>}
            </div>
            <div className="flex flex-wrap gap-x-4 text-xs text-slate-500">
              {current?.path && <span className="mono">{current.path}</span>}
              {data?.size != null && <span>{formatBytes(data.size)}</span>}
              {data?.matched != null && <span>{data.matched} dòng khớp "{applied}"</span>}
            </div>
            {error && <ErrorBox message={error} onRetry={() => void load()} />}
            <div ref={box} className="mono h-[65vh] overflow-auto rounded-2xl border border-slate-800 bg-[#070a12] p-3 text-[11.5px] leading-relaxed">
              {shown.filter(Boolean).length === 0 ? <div className="text-slate-500">{loading ? 'Đang đọc...' : 'Không có dòng nào.'}</div> : shown.map((l, i) => <div key={i} className={cn('whitespace-pre-wrap break-all', tone(l))}>{l}</div>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
