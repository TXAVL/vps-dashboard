// ZenPanel - Kho image Docker Hub: image phổ biến, tìm kiếm, chọn tag, pull hoặc chạy ngay
import { useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, Download, Play, Search, Star } from 'lucide-react';
import { useJobs } from '../components/jobs';
import { Badge, Button, EmptyState, ErrorBox, Modal, Select, Spinner, Tabs, cn } from '../components/ui';
import { get, post } from '../lib/api';
import { formatBytes, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Job } from '../lib/types';

interface HubImage {
  name: string;
  description: string;
  stars: number;
  pulls: number;
  official: boolean;
  category?: string;
}

interface HubTag {
  name: string;
  size: number;
  updated: string;
  archs: string[];
}

const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

function TagModal({ image, onClose, onRun }: { image: HubImage; onClose: () => void; onRun: (ref: string) => void }) {
  const tags = useApi<HubTag[]>(`/api/docker/hub/tags?name=${encodeURIComponent(image.name)}`);
  const [tag, setTag] = useState('latest');
  const { runJob } = useJobs();
  const ref = `${image.name}:${tag}`;
  const selected = tags.data?.find((t) => t.name === tag);

  return (
    <Modal open onClose={onClose} title={image.name} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">{image.description || 'Không có mô tả.'}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {image.official && (
            <Badge tone="blue">
              <BadgeCheck className="size-3.5" /> Chính thức
            </Badge>
          )}
          <Badge>
            <Star className="size-3.5" /> {compact(image.stars)}
          </Badge>
          <Badge>
            <Download className="size-3.5" /> {compact(image.pulls)} lượt pull
          </Badge>
          <a href={`https://hub.docker.com/${image.official ? '_' : 'r'}/${image.name}`} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">
            Xem trên Docker Hub →
          </a>
        </div>
        {tags.error ? (
          <ErrorBox message={tags.error} />
        ) : !tags.data ? (
          <Spinner label="Đang tải danh sách tag..." />
        ) : (
          <>
            <Select value={tag} onChange={(e) => setTag(e.target.value)}>
              {!tags.data.some((t) => t.name === 'latest') && <option value="latest">latest</option>}
              {tags.data.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} · {formatBytes(t.size)} · {formatRelative(t.updated)}
                </option>
              ))}
            </Select>
            {selected && (
              <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                Kiến trúc:
                {selected.archs.map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mono rounded-xl bg-ink-950/80 px-3 py-2 text-sm text-emerald-300">docker pull {ref}</div>
        <div className="flex justify-end gap-2">
          <Button
            icon={Download}
            onClick={() => {
              onClose();
              void runJob(() => post<Job>('/api/docker/images/pull', { image: ref }));
            }}
          >
            Pull image
          </Button>
          <Button
            variant="primary"
            icon={Play}
            onClick={() => {
              onClose();
              onRun(ref);
            }}
          >
            Tạo container
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DockerHubPanel({ onRun }: { onRun: (image: string) => void }) {
  const featured = useApi<HubImage[]>('/api/docker/hub/featured');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HubImage[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [picked, setPicked] = useState<HubImage | null>(null);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await get<{ results: HubImage[]; total: number }>(`/api/docker/hub/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.results);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const categories = useMemo(() => ['all', ...new Set((featured.data ?? []).map((f) => f.category ?? 'Khác'))], [featured.data]);
  const list = results ?? (featured.data ?? []).filter((f) => category === 'all' || f.category === category);

  return (
    <div className="space-y-4 p-4">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input className="input h-10 py-0 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm trên Docker Hub: nginx, n8n, minecraft, ollama..." />
        </div>
        <Button type="submit" variant="primary" icon={Search} loading={searching}>
          Tìm
        </Button>
        {results && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setResults(null);
              setQuery('');
            }}
          >
            Xem image phổ biến
          </Button>
        )}
      </form>
      {!results && featured.data && <Tabs value={category} onChange={setCategory} tabs={categories.map((c) => ({ id: c, label: c === 'all' ? 'Tất cả' : c }))} />}
      {results && <p className="text-xs text-slate-500">{total.toLocaleString('vi-VN')} kết quả cho "{query}"</p>}
      {(error || featured.error) && <ErrorBox message={error ?? featured.error!} />}
      {!results && !featured.data && !featured.error ? (
        <Spinner label="Đang tải image phổ biến..." />
      ) : list.length === 0 ? (
        <EmptyState icon={Search} title="Không tìm thấy image nào" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((img) => (
            <button key={img.name} onClick={() => setPicked(img)} className={cn('glass min-w-0 p-4 text-left transition hover:border-zen-blue/50')}>
              <div className="flex items-center gap-2">
                <span className="mono truncate font-bold text-white">{img.name}</span>
                {img.official && <BadgeCheck className="size-4 shrink-0 text-blue-300" />}
              </div>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-slate-400">{img.description || 'Không có mô tả.'}</p>
              <div className="mt-2 flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Star className="size-3.5" /> {compact(img.stars)}
                </span>
                <span className="flex items-center gap-1">
                  <Download className="size-3.5" /> {compact(img.pulls)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {picked && <TagModal image={picked} onClose={() => setPicked(null)} onRun={onRun} />}
    </div>
  );
}
