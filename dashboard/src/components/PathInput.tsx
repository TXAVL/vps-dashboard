// ZenPanel - Ô nhập đường dẫn thư mục: gợi ý tự hoàn thành theo thư mục thật trên VPS + nút duyệt chọn thư mục
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Folder, FolderOpen, HardDrive } from 'lucide-react';
import { get } from '../lib/api';
import { Button, Modal, Spinner, cn } from './ui';

interface Listing {
  path: string;
  parent: string | null;
  entries: { name: string; path: string; type: string }[];
}

let sepCache: string | null = null;
let rootsCache: string[] | null = null;

async function loadRoots(): Promise<{ roots: string[]; sep: string }> {
  if (sepCache && rootsCache) return { roots: rootsCache, sep: sepCache };
  const res = await get<{ roots: string[]; separator: string }>('/api/files/roots');
  sepCache = res.separator;
  rootsCache = res.roots;
  return { roots: res.roots, sep: res.separator };
}

const dirsOf = (l: Listing) => l.entries.filter((e) => e.type === 'directory').sort((a, b) => a.name.localeCompare(b.name));

/** Hộp thoại duyệt thư mục trên VPS */
export function FolderBrowser({ start, onPick, onClose }: { start?: string; onPick: (path: string) => void; onClose: () => void }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (dir?: string) => {
    setError(null);
    try {
      const r = await loadRoots();
      setRoots(r.roots);
      const target = dir || r.roots[0] || '/';
      setListing(await get<Listing>(`/api/files?path=${encodeURIComponent(target)}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void open(start && start.trim() ? start.trim() : undefined);
  }, [open, start]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Chọn thư mục"
      size="md"
      footer={
        <>
          <span className="mono mr-auto max-w-[55%] truncate text-xs text-slate-500">{listing?.path}</span>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={!listing} onClick={() => listing && onPick(listing.path)}>Chọn thư mục này</Button>
        </>
      }
    >
      <div className="space-y-2">
        {roots.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {roots.map((r) => (
              <button key={r} type="button" onClick={() => void open(r)} className="flex items-center gap-1 rounded-lg border border-slate-700 bg-ink-950/60 px-2 py-1 text-xs text-slate-300 hover:border-zen-blue">
                <HardDrive className="size-3" /> {r}
              </button>
            ))}
          </div>
        )}
        {error ? (
          <div className="text-sm text-rose-300">{error}</div>
        ) : !listing ? (
          <Spinner />
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-700/50 bg-ink-950/50">
            {listing.parent && (
              <button type="button" onClick={() => void open(listing.parent!)} className="flex w-full items-center gap-2 border-b border-slate-800/70 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/60">
                <ArrowUp className="size-4 text-slate-400" /> Lên thư mục cha
              </button>
            )}
            {dirsOf(listing).length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">Không có thư mục con</div>
            ) : (
              dirsOf(listing).map((d) => (
                <button key={d.path} type="button" onClick={() => void open(d.path)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/60">
                  <Folder className="size-4 shrink-0 text-amber-400" /> <span className="truncate">{d.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function PathInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  suggestions = [],
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  /** Đường dẫn gợi ý sẵn (vd gốc các website) */
  suggestions?: string[];
  className?: string;
}) {
  const [items, setItems] = useState<string[]>([]);
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const [browse, setBrowse] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { sep } = await loadRoots();
        const v = value.trim();
        if (!v) {
          if (!cancelled) setItems(suggestions.slice(0, 8));
          return;
        }
        const cut = Math.max(v.lastIndexOf('/'), v.lastIndexOf('\\'));
        if (cut < 0) {
          if (!cancelled) setItems(suggestions.filter((s) => s.toLowerCase().includes(v.toLowerCase())).slice(0, 8));
          return;
        }
        const dir = v.slice(0, cut + 1) || sep;
        const prefix = v.slice(cut + 1).toLowerCase();
        const listing = await get<Listing>(`/api/files?path=${encodeURIComponent(dir)}`);
        const base = listing.path.endsWith(sep) ? listing.path : listing.path + sep;
        const found = dirsOf(listing)
          .filter((d) => d.name.toLowerCase().startsWith(prefix))
          .slice(0, 8)
          .map((d) => base + d.name);
        const extra = suggestions.filter((s) => s.toLowerCase().startsWith(v.toLowerCase()) && !found.includes(s));
        if (!cancelled) {
          setItems([...found, ...extra].slice(0, 8));
          setActive(0);
        }
      } catch {
        if (!cancelled) setItems(suggestions.filter((s) => s.toLowerCase().startsWith(value.trim().toLowerCase())).slice(0, 8));
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, focus, suggestions]);

  const pick = async (path: string) => {
    const { sep } = await loadRoots();
    onChange(path.endsWith(sep) ? path : path + sep);
  };

  return (
    <div className={cn('relative flex items-center gap-2', className)} ref={box}>
      <div className="relative min-w-0 flex-1">
        <input
          className="input mono w-full"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (focus && items.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => (a + 1) % items.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a - 1 + items.length) % items.length);
              } else if (e.key === 'Tab' && items[active] && items[active] !== value) {
                e.preventDefault();
                void pick(items[active]);
                return;
              }
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (focus && items[active] && items[active] !== value.trim() && value.trim() && !items.includes(value.trim())) void pick(items[active]);
              else onSubmit?.();
            }
          }}
        />
        {focus && items.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-slate-700/70 bg-[#0f1626] p-1 shadow-2xl">
            {items.map((it, i) => (
              <button
                key={it}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(it);
                }}
                className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs', i === active ? 'bg-zen-blue/20 text-white' : 'text-slate-300 hover:bg-slate-800')}
              >
                <Folder className="size-3.5 shrink-0 text-amber-400" />
                <span className="mono truncate">{it}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Button variant="soft" icon={FolderOpen} onClick={() => setBrowse(true)}>Duyệt...</Button>
      {browse && (
        <FolderBrowser
          start={value.trim().startsWith('/') || /^[a-z]:/i.test(value.trim()) ? value.trim() : undefined}
          onClose={() => setBrowse(false)}
          onPick={(p) => {
            onChange(p);
            setBrowse(false);
          }}
        />
      )}
    </div>
  );
}
