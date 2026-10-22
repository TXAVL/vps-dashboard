// ZenPanel - File Manager: duyệt, kéo thả upload, sửa file bằng Monaco Editor, nén/giải nén, xem trước media, tải từ URL, chmod
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import Editor from '@monaco-editor/react';
import {
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  Music,
  PackageOpen,
  Pencil,
  RefreshCw,
  Save,
  Scissors,
  Shield,
  Sparkles,
  TextCursorInput,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, SearchInput, Select, Spinner, cn, td, th, tr } from '../components/ui';
import { WindowMockup } from '../components/layout/WindowMockup';
import { Highlight } from '../components/Highlight';
import { txaformat } from '../lib/txaformat';
import { api, downloadFile, get, post, put } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { AppView, FileEntry } from '../lib/types';

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

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'];
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'];
const VIDEO_EXTS = ['.mp4', '.webm', '.mkv', '.mov'];
const PDF_EXTS = ['.pdf'];

function mediaTypeOf(name: string): 'image' | 'audio' | 'video' | 'pdf' | null {
  const lower = name.toLowerCase();
  if (IMAGE_EXTS.some((ext) => lower.endsWith(ext))) return 'image';
  if (AUDIO_EXTS.some((ext) => lower.endsWith(ext))) return 'audio';
  if (VIDEO_EXTS.some((ext) => lower.endsWith(ext))) return 'video';
  if (PDF_EXTS.some((ext) => lower.endsWith(ext))) return 'pdf';
  return null;
}

function MediaPreviewModal({ file, onClose }: { file: FileEntry; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mediaType = mediaTypeOf(file.name);

  useEffect(() => {
    post<{ url: string }>('/api/files/view-ticket', { path: file.path })
      .then((res) => setUrl(res.url))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [file.path]);

  return (
    <Modal open={true} title={`Xem trước: ${file.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {loading && <Spinner label="Đang tải dữ liệu tệp tin..." />}
        {error && <ErrorBox message={error} />}
        {url && (
          <div className="flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-700/50 bg-black/60 p-4">
            {mediaType === 'image' && (
              <img src={url} alt={file.name} className="max-h-[65vh] max-w-full rounded-lg object-contain shadow-2xl" />
            )}
            {mediaType === 'audio' && (
              <div className="w-full max-w-md space-y-4 py-8 text-center">
                <Music className="mx-auto size-14 text-zen-purple animate-pulse" />
                <p className="mono font-semibold text-white">{file.name}</p>
                <audio controls autoPlay src={url} className="w-full" />
              </div>
            )}
            {mediaType === 'video' && (
              <video controls autoPlay src={url} className="max-h-[65vh] w-full rounded-lg bg-black shadow-2xl" />
            )}
            {mediaType === 'pdf' && (
              <iframe src={url} title={file.name} className="h-[65vh] w-full rounded-lg border border-slate-700" />
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Dung lượng: {formatBytes(file.size)} · Sửa đổi: {formatDate(file.modified)}</span>
          <div className="flex items-center gap-2">
            <CopyButton value={file.path} />
            <Button size="xs" variant="soft" icon={Download} onClick={() => void downloadFile(file.path)}>
              Tải về máy
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RemoteDownloadModal({
  currentPath,
  onClose,
  onDownloaded,
}: {
  currentPath: string;
  onClose: () => void;
  onDownloaded: () => void;
}) {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [downloading, setDownloading] = useState(false);
  const { run, toast } = useFeedback();

  const handleDownload = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setDownloading(true);
    const ok = await run(
      () =>
        post<{ path: string; size: number }>('/api/files/download-remote', {
          url: url.trim(),
          destination: currentPath,
          filename: filename.trim() || undefined,
        }),
      'Tải file thành công!',
    );
    setDownloading(false);
    if (ok) {
      toast('Đã lưu file tải về vào máy chủ', 'success');
      onDownloaded();
      onClose();
    }
  };

  return (
    <Modal open={true} title="Tải file từ URL về máy chủ VPS" onClose={onClose}>
      <form onSubmit={handleDownload} className="space-y-4">
        <Notice>
          Máy chủ sẽ tự động kết nối và tải file từ liên kết trực tiếp vào thư mục: <code className="mono">{currentPath}</code>.
        </Notice>
        <Field label="URL file tải về" hint="Link trực tiếp HTTP hoặc HTTPS (ví dụ: https://example.com/source.zip)">
          <input
            className="input w-full"
            placeholder="https://..."
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Tên file lưu (tuỳ chọn)" hint="Để trống để lấy theo tên file trên URL">
          <input
            className="input w-full"
            placeholder="Tự động"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" variant="primary" icon={Download} loading={downloading}>
            Bắt đầu tải về VPS
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChmodModal({
  entries,
  onClose,
  onSuccess,
}: {
  entries: FileEntry[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState(entries[0]?.mode || '0755');
  const [busy, setBusy] = useState(false);
  const { run, toast } = useFeedback();

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    for (const entry of entries) {
      await run(() => post('/api/files/chmod', { path: entry.path, mode }));
    }
    setBusy(false);
    toast(`Đã cập nhật quyền ${mode} cho ${entries.length} mục`, 'success');
    onSuccess();
    onClose();
  };

  return (
    <Modal open={true} title={`Phân quyền tập tin (Chmod) · ${entries.length} mục`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <Field label="Mã phân quyền Octal" hint="Thường dùng: 0755 (thư mục/thực thi), 0644 (file thông thường), 0600 (file nhạy cảm)">
          <input
            className="input mono w-full"
            placeholder="0755"
            required
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => setMode('0755')} className="rounded bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">0755 (Mặc định)</button>
          <button type="button" onClick={() => setMode('0644')} className="rounded bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">0644 (Read/Write)</button>
          <button type="button" onClick={() => setMode('0777')} className="rounded bg-slate-800 px-2 py-1 text-amber-300 hover:bg-slate-700">0777 (Full access)</button>
          <button type="button" onClick={() => setMode('0600')} className="rounded bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">0600 (Private)</button>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" variant="primary" icon={Shield} loading={busy}>
            Lưu quyền
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProUpgradeModal({
  isInstalled,
  proUrl,
  onClose,
}: {
  isInstalled: boolean;
  proUrl: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [copiedCompose, setCopiedCompose] = useState(false);

  const composeTemplate = `# ZenFile Explorer Pro - docker-compose.yml
services:
  app:
    image: filebrowser/filebrowser:latest
    container_name: zen-filebrowser
    restart: unless-stopped
    ports:
      - "8084:80"
    volumes:
      - data:/database
      - /:/srv
    environment:
      - FB_BASEURL=
volumes:
  data:`;

  const copyCompose = () => {
    navigator.clipboard.writeText(composeTemplate);
    setCopiedCompose(true);
    setTimeout(() => setCopiedCompose(false), 2000);
  };

  return (
    <Modal open={true} title="ZenFile Explorer Pro (Bản nâng cấp)" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="space-y-3 rounded-2xl border border-zen-purple/40 bg-gradient-to-br from-zen-purple/15 to-zen-blue/10 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-zen-purple animate-pulse" />
            <h3 className="text-base font-bold text-white">Trình Quản lý Tệp tin Cao cấp ZenFile Pro</h3>
          </div>
          <p className="text-sm text-slate-300">
            ZenFile Explorer Pro (dựa trên FileBrowser) mang đến trải nghiệm duyệt tệp mượt mà, chuyên nghiệp và đầy đủ tính năng cho máy chủ VPS.
          </p>
          <div className="grid gap-2.5 pt-1 text-xs text-slate-200 sm:grid-cols-2">
            <div className="flex items-start gap-2 rounded-lg bg-ink-950/40 p-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>Duyệt toàn bộ thư mục VPS với tốc độ cực nhanh</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-ink-950/40 p-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>Xem trước ảnh gallery lightbox, phát nhạc & video streaming</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-ink-950/40 p-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>Tạo link chia sẻ tệp có mật khẩu bảo vệ & hạn dùng</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-ink-950/40 p-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>Trình đọc PDF, Markdown trực quan và tìm kiếm đệ quy</span>
            </div>
          </div>
        </div>

        {isInstalled ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-300">
                <CheckCircle2 className="size-4" /> ZenFile Pro đã được cài đặt và đang chạy
              </div>
              <p className="text-xs text-slate-400">Tài khoản mặc định: <code className="mono text-white">admin / admin</code></p>
            </div>
            {proUrl && (
              <a href={proUrl} target="_blank" rel="noreferrer">
                <Button variant="success" icon={ExternalLink}>
                  Mở ZenFile Pro
                </Button>
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-3 rounded-xl border border-slate-700/60 bg-ink-950/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Cài đặt tự động qua App Store (Khuyên dùng)</span>
                <Badge tone="blue">1-Click Docker</Badge>
              </div>
              <p className="text-xs text-slate-400">
                ZenFile Pro không kích hoạt sẵn để tiết kiệm tài nguyên VPS. Bạn có thể cài đặt dễ dàng bằng 1 click từ App Store.
              </p>
              <Button
                variant="primary"
                icon={Download}
                onClick={() => {
                  onClose();
                  navigate('/apps?install=filebrowser');
                }}
                className="w-full"
              >
                Cài đặt ZenFile Pro qua App Store ngay
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800 bg-ink-950/30 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>File cài đặt docker-compose.yml mẫu:</span>
                <button
                  type="button"
                  onClick={copyCompose}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                >
                  <Copy className="size-3" /> {copiedCompose ? 'Đã sao chép!' : 'Sao chép YAML'}
                </button>
              </div>
              <pre className="mono max-h-36 overflow-x-auto rounded-lg bg-ink-950 p-2.5 text-[11px] text-slate-400">
                {composeTemplate}
              </pre>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
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
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [remoteModal, setRemoteModal] = useState(false);
  const [chmodEntries, setChmodEntries] = useState<FileEntry[] | null>(null);
  const [proModal, setProModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'dirs' | 'images' | 'media' | 'code' | 'archives'>('all');
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'copy' | 'move' } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [viewMode, setViewMode] = useState<'standard' | 'pro'>('standard');
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, prompt, run, toast } = useFeedback();

  const apps = useApi<AppView[]>('/api/apps');
  const proApp = apps.data?.find((a) => a.id === 'filebrowser');
  const isProRunning = proApp?.status === 'running';
  const proPort = proApp?.installed?.params.port;
  const proUrl = proApp?.publicLink?.url ?? (proPort ? `http://${window.location.hostname}:${proPort}` : null);

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

  const entries = useMemo(() => {
    let list = (listing?.entries ?? []).filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()));
    if (typeFilter === 'dirs') list = list.filter((e) => e.type === 'directory');
    else if (typeFilter === 'images') list = list.filter((e) => mediaTypeOf(e.name) === 'image');
    else if (typeFilter === 'media') list = list.filter((e) => mediaTypeOf(e.name) === 'audio' || mediaTypeOf(e.name) === 'video');
    else if (typeFilter === 'archives') list = list.filter((e) => isArchive(e.name));
    else if (typeFilter === 'code') list = list.filter((e) => e.type !== 'directory' && !mediaTypeOf(e.name) && !isArchive(e.name));
    return list;
  }, [listing, query, typeFilter]);

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
    else if (mediaTypeOf(entry.name)) setPreviewFile(entry);
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
        description="Kéo thả để tải lên · Xem trước ảnh/video/nhạc · Tải từ URL · Chmod · Monaco Editor"
        icon={FolderOpen}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isProRunning && proUrl ? (
              <div className="flex items-center rounded-xl border border-slate-700/60 bg-ink-950/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('standard')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition-all',
                    viewMode === 'standard' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  Duyệt chuẩn
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('pro')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all',
                    viewMode === 'pro'
                      ? 'bg-gradient-to-r from-zen-purple to-zen-blue text-white shadow'
                      : 'text-purple-300 hover:text-white',
                  )}
                >
                  <Sparkles className="size-3 text-amber-300" /> ZenFile Pro UI
                </button>
              </div>
            ) : (
              <Button size="sm" variant="soft" icon={Sparkles} onClick={() => setProModal(true)}>
                ✨ Cài ZenFile Pro
              </Button>
            )}
            {roots && roots.roots.length > 1 && (
              <Select value={roots.roots.find((r) => currentPath?.startsWith(r)) ?? roots.roots[0]} onChange={(e) => navigate(e.target.value)} className="w-28">
                {roots.roots.map((root) => (
                  <option key={root} value={root}>
                    {root}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />

      {/* CHẾ ĐỘ PRO: Nhúng trực tiếp giao diện ZenFile Pro thiết kế mới toàn màn hình */}
      {viewMode === 'pro' && isProRunning && proUrl ? (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zen-purple/40 bg-ink-950/60 px-4 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm text-purple-200">
              <Sparkles className="size-4 text-zen-purple" />
              <span className="font-semibold text-white">Giao diện ZenFile Explorer Pro</span>
              <Badge tone="blue" className="text-[11px]">Docker</Badge>
              <span className="text-xs text-slate-400">· Đăng nhập: <code className="mono text-white">admin / admin</code></span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => {
                  const ifr = document.getElementById('zenfile-pro-iframe') as HTMLIFrameElement;
                  if (ifr) ifr.src = ifr.src;
                }}
              >
                Làm mới
              </Button>
              <a href={proUrl} target="_blank" rel="noreferrer">
                <Button size="xs" variant="secondary" icon={ExternalLink}>
                  Mở tab riêng
                </Button>
              </a>
              <Button size="xs" variant="ghost" onClick={() => setViewMode('standard')}>
                Quay lại Explorer Chuẩn
              </Button>
            </div>
          </div>
          <div className="relative h-[80vh] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#0c101a] shadow-2xl">
            <iframe
              id="zenfile-pro-iframe"
              src={proUrl}
              className="h-full w-full border-0"
              title="ZenFile Explorer Pro"
            />
          </div>
        </div>
      ) : (
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
          <Button size="sm" variant="soft" icon={Globe} onClick={() => setRemoteModal(true)}>
            Tải từ URL
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
              <Button size="sm" icon={Shield} onClick={() => setChmodEntries(selectedEntries)}>
                Đổi quyền
              </Button>
              <Button
                size="sm"
                icon={Copy}
                onClick={() => {
                  navigator.clipboard.writeText(selectedEntries.map((e) => e.path).join('\n'));
                  toast(`Đã sao chép đường dẫn của ${selectedEntries.length} mục`);
                }}
              >
                Chép path
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

        {/* Thanh bộ lọc nhanh */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-700/40 bg-ink-950/40 px-3 py-1.5 text-xs">
          <span className="px-1 text-slate-500 font-medium">Lọc tệp:</span>
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'dirs', label: 'Thư mục' },
            { id: 'images', label: 'Hình ảnh' },
            { id: 'media', label: 'Video & Âm thanh' },
            { id: 'code', label: 'Code & Văn bản' },
            { id: 'archives', label: 'File nén' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id as typeof typeFilter)}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition',
                typeFilter === f.id
                  ? 'bg-zen-blue text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
              )}
            >
              {f.label}
            </button>
          ))}
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
            <EmptyState icon={Folder} title="Thư mục trống hoặc không có file phù hợp" description="Kéo thả file vào đây, tải từ URL hoặc chọn bộ lọc Tất cả." />
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
                    const isMed = Boolean(mediaTypeOf(entry.name));
                    const Icon = entry.type === 'directory' ? Folder : isArchive(entry.name) ? FileArchive : isMed ? (mediaTypeOf(entry.name) === 'video' ? Video : mediaTypeOf(entry.name) === 'audio' ? Music : Eye) : languageOf(entry.name) !== 'plaintext' ? FileCode : File;
                    return (
                      <tr key={entry.path} className={cn(tr, selected.has(entry.path) && 'bg-zen-blue/10')} onDoubleClick={() => openEntry(entry)}>
                        <td className={td}>
                          <input type="checkbox" className="accent-zen-blue" checked={selected.has(entry.path)} onChange={() => toggle(entry.path)} aria-label={`Chọn ${entry.name}`} />
                        </td>
                        <td className={td}>
                          <button className="flex max-w-[420px] items-center gap-2.5 text-left" onClick={() => openEntry(entry)}>
                            <Icon className={cn('size-4 shrink-0', entry.type === 'directory' ? 'text-zen-amber' : isMed ? 'text-zen-purple' : 'text-slate-400')} />
                            <Highlight text={entry.name} query={query} className="truncate font-medium text-slate-100 hover:text-blue-300" />
                          </button>
                        </td>
                        <td className={cn(td, 'mono text-right text-xs text-slate-400')}>{entry.type === 'directory' ? '—' : txaformat.size(entry.size)}</td>
                        <td className={cn(td, 'text-xs text-slate-500')}>{formatDate(entry.modified)}</td>
                        <td className={cn(td, 'mono text-xs text-slate-500')}>
                          <button
                            type="button"
                            onClick={() => setChmodEntries([entry])}
                            className="rounded px-1.5 py-0.5 hover:bg-slate-800 hover:text-blue-300"
                            title="Bấm để đổi quyền"
                          >
                            {entry.mode}
                          </button>
                        </td>
                        <td className={cn(td, 'whitespace-nowrap text-right')}>
                          {isMed ? (
                            <IconButton icon={Eye} title="Xem trước" onClick={() => setPreviewFile(entry)} />
                          ) : (
                            entry.type !== 'directory' && <IconButton icon={Pencil} title="Sửa" onClick={() => setEditing(entry)} />
                          )}
                          {isArchive(entry.name) && <IconButton icon={PackageOpen} title="Giải nén" onClick={() => void extract(entry)} />}
                          {entry.type !== 'directory' && <IconButton icon={Download} title="Tải về" onClick={() => void run(() => downloadFile(entry.path))} />}
                          <IconButton
                            icon={Copy}
                            title="Sao chép đường dẫn tuyệt đối"
                            onClick={() => {
                              navigator.clipboard.writeText(entry.path);
                              toast(`Đã sao chép: ${entry.path}`);
                            }}
                          />
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
      )}

      {editing && <CodeEditorModal file={editing} onClose={() => setEditing(null)} />}
      {previewFile && <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      {remoteModal && currentPath && (
        <RemoteDownloadModal currentPath={currentPath} onClose={() => setRemoteModal(false)} onDownloaded={() => void load()} />
      )}
      {chmodEntries && (
        <ChmodModal entries={chmodEntries} onClose={() => setChmodEntries(null)} onSuccess={() => void load()} />
      )}
      {proModal && (
        <ProUpgradeModal isInstalled={Boolean(isProRunning)} proUrl={proUrl} onClose={() => setProModal(false)} />
      )}
    </>
  );
}
