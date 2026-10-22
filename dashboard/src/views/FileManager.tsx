// ZenPanel - File Manager: duyệt, kéo thả upload, sửa file bằng Monaco Editor, nén/giải nén
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router';
import Editor from '@monaco-editor/react';
import {
  ArrowUp,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  File,
  FileArchive,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  PackageOpen,
  Pencil,
  RefreshCw,
  Save,
  Scissors,
  TextCursorInput,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Button, Card, EmptyState, ErrorBox, IconButton, PageHeader, SearchInput, Select, Spinner, cn, td, th, tr } from '../components/ui';
import { WindowMockup } from '../components/layout/WindowMockup';
import { api, downloadFile, get, post, put } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import type { FileEntry } from '../lib/types';

interface Listing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
}

const LANGUAGES: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', md: 'markdown', php: 'php',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', psm1: 'powershell', bat: 'bat', cmd: 'bat',
  yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', sql: 'sql', ini: 'ini', conf: 'ini', cfg: 'ini', toml: 'ini',
  env: 'ini', dockerfile: 'dockerfile', lua: 'lua', vue: 'html',
};

const ARCHIVES = ['.zip', '.tar', '.tar.gz', '.tgz'];

function languageOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower.startsWith('.env')) return 'ini';
  if (lower === 'nginx.conf' || lower.endsWith('.conf')) return 'ini';
  return LANGUAGES[lower.split('.').pop() ?? ''] ?? 'plaintext';
}

const isArchive = (name: string) => ARCHIVES.some((ext) => name.toLowerCase().endsWith(ext));

/** Ghép đường dẫn theo dấu phân cách của máy chủ */
function joinPath(dir: string, name: string, sep: string): string {
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function CodeEditorModal({ file, onClose }: { file: FileEntry; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { run, confirm } = useFeedback();
  const dirty = content !== null && content !== original;

  useEffect(() => {
    get<{ content: string; binary: boolean }>(`/api/files/content?path=${encodeURIComponent(file.path)}`)
      .then((res) => {
        if (res.binary) setError('File nhị phân, không thể mở trong trình soạn thảo. Hãy tải về.');
        else {
          setContent(res.content);
          setOriginal(res.content);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [file.path]);

  const save = useCallback(async () => {
    if (content === null || content === original) return;
    setSaving(true);
    const ok = await run(() => put('/api/files/content', { path: file.path, content }), `Đã lưu ${file.name}`);
    setSaving(false);
    if (ok) setOriginal(content);
  }, [content, original, file, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const close = async () => {
    if (dirty && !(await confirm({ title: 'Chưa lưu thay đổi', message: 'Đóng trình soạn thảo và bỏ các thay đổi chưa lưu?', danger: true, confirmLabel: 'Bỏ thay đổi' }))) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6">
      <WindowMockup
        className="h-full w-full max-w-7xl"
        url={file.path}
        title={dirty ? 'Chưa lưu' : languageOf(file.name)}
        actions={
          <>
            <Button size="xs" variant="success" icon={Save} onClick={() => void save()} loading={saving} disabled={!dirty}>
              Lưu
            </Button>
            <IconButton icon={X} title="Đóng" onClick={() => void close()} />
          </>
        }
      >
        {error ? (
          <div className="p-6">
            <ErrorBox message={error} />
          </div>
        ) : content === null ? (
          <Spinner label="Đang mở file..." />
        ) : (
          <Editor
            height="100%"
            theme="vs-dark"
            path={file.path}
            language={languageOf(file.name)}
            value={content}
            onChange={(value) => setContent(value ?? '')}
            onMount={(editor) => editor.focus()}
            loading={<Spinner label="Đang tải Monaco Editor..." />}
            options={{
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              fontSize: 13,
              minimap: { enabled: window.innerWidth > 900 },
              smoothScrolling: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        )}
      </WindowMockup>
    </div>
  );
}

export default function FileManager() {
  const [params, setParams] = useSearchParams();
  const [roots, setRoots] = useState<{ roots: string[]; separator: string } | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<FileEntry | null>(null);
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'copy' | 'move' } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, prompt, run, toast } = useFeedback();

  const sep = roots?.separator ?? '/';
  const currentPath = params.get('path') ?? roots?.roots[0] ?? null;

  const navigate = (path: string) => {
    setSelected(new Set());
    setQuery('');
    setParams({ path });
  };

  const load = useCallback(async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      setListing(await get<Listing>(`/api/files?path=${encodeURIComponent(currentPath)}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    get<{ roots: string[]; separator: string }>('/api/files/roots').then(setRoots, (err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ?open=<file> từ trang khác (vd App Store): mở thư mục chứa file và mở editor
  useEffect(() => {
    const open = params.get('open');
    if (!open || !roots) return;
    const dir = open.slice(0, Math.max(open.lastIndexOf(roots.separator), open.indexOf(roots.separator) + 1));
    const name = open.slice(open.lastIndexOf(roots.separator) + 1);
    setParams({ path: dir }, { replace: true });
    setEditing({ name, path: open, type: 'file', size: 0, modified: '', mode: '' });
  }, [params, roots, setParams]);

  const entries = useMemo(() => (listing?.entries ?? []).filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase())), [listing, query]);
  const selectedEntries = entries.filter((e) => selected.has(e.path));

  const breadcrumbs = useMemo(() => {
    if (!listing) return [];
    const parts = listing.path.split(sep).filter(Boolean);
    const isWindows = sep === '\\';
    return parts.map((part, i) => {
      const joined = parts.slice(0, i + 1).join(sep);
      return { name: part, path: isWindows ? (i === 0 ? `${joined}${sep}` : joined) : `${sep}${joined}` };
    });
  }, [listing, sep]);

  const toggle = (path: string) => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelected(next);
  };

  const openEntry = (entry: FileEntry) => {
    if (entry.type === 'directory') navigate(entry.path);
    else setEditing(entry);
  };

  const create = async (type: 'file' | 'directory') => {
    if (!listing) return;
    const name = await prompt({ title: type === 'file' ? 'Tạo file mới' : 'Tạo thư mục mới', label: 'Tên', placeholder: type === 'file' ? 'index.html' : 'public', confirmLabel: 'Tạo' });
    if (!name) return;
    const result = await run(() => post<{ path: string }>('/api/files/create', { path: listing.path, name, type }), `Đã tạo ${name}`);
    await load();
    if (result && type === 'file') setEditing({ name, path: result.path, type: 'file', size: 0, modified: '', mode: '' });
  };

  const rename = async (entry: FileEntry) => {
    const name = await prompt({ title: 'Đổi tên', label: 'Tên mới', defaultValue: entry.name, confirmLabel: 'Đổi tên' });
    if (!name || name === entry.name) return;
    await run(() => post('/api/files/rename', { path: entry.path, name }), 'Đã đổi tên');
    await load();
  };

  const remove = async (targets: FileEntry[]) => {
    if (!targets.length) return;
    const ok = await confirm({
      title: 'Xóa vĩnh viễn',
      message: (
        <>
          Xóa vĩnh viễn {targets.length === 1 ? <b className="mono">{targets[0].name}</b> : <b>{targets.length} mục</b>}? Thư mục sẽ bị xóa kèm toàn bộ nội dung bên trong và
          không thể khôi phục.
        </>
      ),
      danger: true,
      confirmLabel: 'Xóa',
    });
    if (!ok) return;
    await run(() => post('/api/files/delete', { paths: targets.map((t) => t.path) }), `Đã xóa ${targets.length} mục`);
    setSelected(new Set());
    await load();
  };

  const paste = async () => {
    if (!clipboard || !listing) return;
    await run(() => post('/api/files/move', { paths: clipboard.paths, destination: listing.path, mode: clipboard.mode }), clipboard.mode === 'copy' ? 'Đã sao chép' : 'Đã di chuyển');
    if (clipboard.mode === 'move') setClipboard(null);
    await load();
  };

  const compress = async (format: 'zip' | 'tar.gz') => {
    if (!listing || !selectedEntries.length) return;
    const base = selectedEntries.length === 1 ? selectedEntries[0].name : 'archive';
    const name = await prompt({ title: 'Nén file', label: 'Tên file nén', defaultValue: `${base}.${format}`, confirmLabel: 'Nén' });
    if (!name) return;
    setCompressing(true);
    await run(() => post('/api/files/compress', { paths: selectedEntries.map((e) => e.path), destination: joinPath(listing.path, name, sep), format }), `Đã nén thành ${name}`);
    setCompressing(false);
    await load();
  };

  const extract = async (entry: FileEntry) => {
    if (!listing) return;
    const folder = entry.name.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '');
    const name = await prompt({ title: 'Giải nén', label: 'Giải nén vào thư mục', defaultValue: folder, confirmLabel: 'Giải nén' });
    if (!name) return;
    setCompressing(true);
    await run(() => post('/api/files/extract', { path: entry.path, destination: joinPath(listing.path, name, sep) }), `Đã giải nén vào ${name}`);
    setCompressing(false);
    await load();
  };

  const upload = async (files: FileList | File[]) => {
    if (!listing || !files.length) return;
    const form = new FormData();
    for (const file of Array.from(files)) form.append('file', file, file.name);
    setUploading(true);
    await run(() => api(`/api/files/upload?path=${encodeURIComponent(listing.path)}`, { method: 'POST', body: form }), `Đã tải lên ${files.length} file`);
    setUploading(false);
    await load();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
    else toast('Chỉ hỗ trợ kéo thả file (chưa hỗ trợ thư mục)', 'info');
  };

  return (
    <>
      <PageHeader
        title="File Manager"
        description="Kéo thả để tải lên · Nhấp đúp để mở · Ctrl+S để lưu trong trình soạn thảo"
        icon={FolderOpen}
        actions={
          roots &&
          roots.roots.length > 1 && (
            <Select value={roots.roots.find((r) => currentPath?.startsWith(r)) ?? roots.roots[0]} onChange={(e) => navigate(e.target.value)} className="w-28">
              {roots.roots.map((root) => (
                <option key={root} value={root}>
                  {root}
                </option>
              ))}
            </Select>
          )
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/40 p-3">
          <IconButton icon={ArrowUp} title="Lên thư mục cha" disabled={!listing?.parent} onClick={() => listing?.parent && navigate(listing.parent)} />
          <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void load()} />
          <div className="mx-1 hidden h-6 w-px bg-slate-700 sm:block" />
          <Button size="sm" icon={FilePlus} onClick={() => void create('file')}>
            File
          </Button>
          <Button size="sm" icon={FolderPlus} onClick={() => void create('directory')}>
            Thư mục
          </Button>
          <Button size="sm" variant="primary" icon={Upload} loading={uploading} onClick={() => fileInput.current?.click()}>
            Tải lên
          </Button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files).then(() => (e.target.value = ''))} />
          {selectedEntries.length > 0 && (
            <>
              <div className="mx-1 hidden h-6 w-px bg-slate-700 sm:block" />
              <span className="text-xs font-semibold text-slate-400">Đã chọn {selectedEntries.length}</span>
              <Button size="sm" icon={Copy} onClick={() => setClipboard({ paths: selectedEntries.map((e) => e.path), mode: 'copy' })}>
                Sao chép
              </Button>
              <Button size="sm" icon={Scissors} onClick={() => setClipboard({ paths: selectedEntries.map((e) => e.path), mode: 'move' })}>
                Cắt
              </Button>
              <Button size="sm" icon={FileArchive} loading={compressing} onClick={() => void compress('zip')}>
                Nén .zip
              </Button>
              <Button size="sm" icon={FileArchive} onClick={() => void compress('tar.gz')}>
                .tar.gz
              </Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove(selectedEntries)}>
                Xóa
              </Button>
            </>
          )}
          {clipboard && (
            <Button size="sm" variant="success" icon={ClipboardPaste} onClick={() => void paste()}>
              Dán {clipboard.paths.length} mục ({clipboard.mode === 'copy' ? 'sao chép' : 'di chuyển'})
            </Button>
          )}
          <SearchInput value={query} onChange={setQuery} placeholder="Lọc trong thư mục" className="ml-auto w-full sm:w-56" />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-700/40 px-4 py-2.5 text-sm">
          <HardDrive className="size-4 shrink-0 text-slate-500" />
          {sep === '/' && (
            <button className="mono rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-800" onClick={() => navigate('/')}>
              /
            </button>
          )}
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex shrink-0 items-center gap-1">
              {(i > 0 || sep === '/') && <ChevronRight className="size-3.5 text-slate-600" />}
              <button className={cn('mono rounded px-1.5 py-0.5 hover:bg-slate-800', i === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-slate-400')} onClick={() => navigate(crumb.path)}>
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <div
          className={cn('relative min-h-[360px] transition', dragging && 'bg-zen-blue/5 ring-2 ring-inset ring-zen-blue/50')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="glass flex items-center gap-3 px-6 py-4 font-semibold text-blue-200">
                <Upload className="size-5" /> Thả file vào đây để tải lên {listing?.path}
              </div>
            </div>
          )}
          {error ? (
            <div className="p-4">
              <ErrorBox message={error} onRetry={load} />
            </div>
          ) : !listing || (loading && !listing) ? (
            <Spinner />
          ) : entries.length === 0 ? (
            <EmptyState icon={Folder} title="Thư mục trống" description="Kéo thả file vào đây hoặc bấm Tải lên." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-10')}>
                      <input
                        type="checkbox"
                        className="accent-zen-blue"
                        checked={entries.length > 0 && selectedEntries.length === entries.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(entries.map((x) => x.path)) : new Set())}
                        aria-label="Chọn tất cả"
                      />
                    </th>
                    <th className={th}>Tên</th>
                    <th className={cn(th, 'text-right')}>Kích thước</th>
                    <th className={th}>Sửa đổi</th>
                    <th className={th}>Quyền</th>
                    <th className={cn(th, 'text-right')}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const Icon = entry.type === 'directory' ? Folder : isArchive(entry.name) ? FileArchive : languageOf(entry.name) !== 'plaintext' ? FileCode : File;
                    return (
                      <tr key={entry.path} className={cn(tr, selected.has(entry.path) && 'bg-zen-blue/10')} onDoubleClick={() => openEntry(entry)}>
                        <td className={td}>
                          <input type="checkbox" className="accent-zen-blue" checked={selected.has(entry.path)} onChange={() => toggle(entry.path)} aria-label={`Chọn ${entry.name}`} />
                        </td>
                        <td className={td}>
                          <button className="flex max-w-[420px] items-center gap-2.5 text-left" onClick={() => openEntry(entry)}>
                            <Icon className={cn('size-4 shrink-0', entry.type === 'directory' ? 'text-zen-amber' : 'text-slate-400')} />
                            <span className="truncate font-medium text-slate-100 hover:text-blue-300">{entry.name}</span>
                          </button>
                        </td>
                        <td className={cn(td, 'mono text-right text-xs text-slate-400')}>{entry.type === 'directory' ? '—' : formatBytes(entry.size)}</td>
                        <td className={cn(td, 'text-xs text-slate-500')}>{formatDate(entry.modified)}</td>
                        <td className={cn(td, 'mono text-xs text-slate-500')}>{entry.mode}</td>
                        <td className={cn(td, 'whitespace-nowrap text-right')}>
                          {entry.type !== 'directory' && <IconButton icon={Pencil} title="Sửa" onClick={() => setEditing(entry)} />}
                          {isArchive(entry.name) && <IconButton icon={PackageOpen} title="Giải nén" onClick={() => void extract(entry)} />}
                          {entry.type !== 'directory' && <IconButton icon={Download} title="Tải về" onClick={() => void run(() => downloadFile(entry.path))} />}
                          <IconButton icon={TextCursorInput} title="Đổi tên" onClick={() => void rename(entry)} />
                          <IconButton icon={Trash2} title="Xóa" className="hover:text-zen-red" onClick={() => void remove([entry])} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {editing && <CodeEditorModal file={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
