import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import Editor from '@monaco-editor/react';
import {
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileCode,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  Home,
  Laptop,
  Link2,
  Monitor,
  Music,
  PackageOpen,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Scissors,
  Server,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TextCursorInput,
  Trash2,
  Upload,
  Video,
  X,
  Boxes,
  Layers,
} from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, SearchInput, Select, Spinner, cn } from '../components/ui';
import { WindowMockup } from '../components/layout/WindowMockup';
import { Highlight } from '../components/Highlight';
import { txaformat } from '../lib/txaformat';
import { api, downloadFile, downloadFolder, getDownloadTicket, get, post, put } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { AppView, FileEntry, Job } from '../lib/types';
import { OFFICIAL_REPO_URL } from './AppRepoModal';

export function getFileTypeLabel(name: string, isDirectory: boolean, osStyle: 'windows' | 'ubuntu' | 'macos'): string {
  if (isDirectory) {
    if (osStyle === 'windows') return 'File folder';
    if (osStyle === 'macos') return 'Folder';
    return 'Thư mục';
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (osStyle === 'windows') {
    const map: Record<string, string> = {
      txt: 'Text Document',
      json: 'JSON Document',
      js: 'JavaScript File',
      ts: 'TypeScript File',
      tsx: 'TypeScript JSX File',
      jsx: 'JavaScript JSX File',
      html: 'HTML Document',
      css: 'Cascading Style Sheet',
      scss: 'Sass Stylesheet',
      md: 'Markdown Document',
      png: 'PNG Image',
      jpg: 'JPEG Image',
      jpeg: 'JPEG Image',
      gif: 'GIF Image',
      svg: 'SVG Document',
      webp: 'WebP Image',
      mp4: 'MP4 Video',
      webm: 'WebM Video',
      mp3: 'MP3 Audio',
      wav: 'WAV Audio',
      zip: 'Compressed (zipped) Folder',
      tar: 'TAR Archive',
      gz: 'GZ Archive',
      rar: 'WinRAR Archive',
      '7z': '7-Zip Archive',
      pdf: 'PDF Document',
      sh: 'Shell Script',
      bash: 'Bash Script',
      ps1: 'PowerShell Script',
      bat: 'Windows Batch File',
      cmd: 'Windows Command Script',
      exe: 'Application',
      msi: 'Windows Installer Package',
      log: 'Text Document (Log)',
      conf: 'Configuration File',
      env: 'Environment Config',
      yml: 'YAML Document',
      yaml: 'YAML Document',
      sql: 'SQL Database Script',
    };
    return map[ext] || (ext ? `${ext.toUpperCase()} File` : 'File');
  }
  if (osStyle === 'macos') {
    const map: Record<string, string> = {
      txt: 'Plain Text',
      json: 'JSON File',
      js: 'JavaScript Source',
      ts: 'TypeScript Source',
      html: 'HTML Document',
      css: 'CSS Stylesheet',
      md: 'Markdown Document',
      png: 'PNG image',
      jpg: 'JPEG image',
      zip: 'ZIP archive',
      pdf: 'PDF document',
      sh: 'Shell Script',
      dmg: 'Apple Disk Image',
    };
    return map[ext] || (ext ? `${ext.toUpperCase()} document` : 'Document');
  }
  // Linux / Ubuntu
  const map: Record<string, string> = {
    txt: 'Văn bản (plain text)',
    json: 'Tài liệu JSON',
    js: 'Mã nguồn JavaScript',
    ts: 'Mã nguồn TypeScript',
    html: 'Trang HTML',
    css: 'Bảng kiểu CSS',
    md: 'Tài liệu Markdown',
    png: 'Ảnh PNG',
    jpg: 'Ảnh JPEG',
    zip: 'Tệp nén Zip',
    gz: 'Tệp nén Gzip',
    pdf: 'Tài liệu PDF',
    sh: 'Tập lệnh Shell',
    log: 'Nhật ký Log',
    conf: 'Tệp cấu hình',
  };
  return map[ext] || (ext ? `Tệp ${ext.toUpperCase()}` : 'Tệp tin');
}

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

function MediaPreviewModal({ file, onClose, onShare }: { file: FileEntry; onClose: () => void; onShare?: (file: FileEntry) => void }) {
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
            {onShare && (
              <Button size="xs" variant="soft" icon={Link2} onClick={() => onShare(file)}>
                Link 5 phút
              </Button>
            )}
            <Button size="xs" variant="primary" icon={Download} onClick={() => void downloadFile(file.path)}>
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

  // Gán thời hạn 5 phút vào params của URL
  const handleAttach5MinExpiry = () => {
    if (!url.trim()) {
      toast('Vui lòng nhập URL trước khi gán thời hạn', 'error');
      return;
    }
    try {
      const u = new URL(url.trim());
      const expiresAt = Date.now() + 300_000;
      u.searchParams.set('expires', String(expiresAt));
      setUrl(u.toString());
      toast('Đã gán tham số expires (hạn 5 phút) vào URL!', 'success');
    } catch {
      const expiresAt = Date.now() + 300_000;
      const sep = url.includes('?') ? '&' : '?';
      setUrl(`${url.trim()}${sep}expires=${expiresAt}`);
      toast('Đã gán tham số expires (hạn 5 phút) vào URL!', 'success');
    }
  };

  // Mã hóa Base64 URL để bảo mật
  const handleEncodeBase64 = () => {
    if (!url.trim()) {
      toast('Vui lòng nhập URL trước khi mã hóa', 'error');
      return;
    }
    try {
      const encoded = btoa(unescape(encodeURIComponent(url.trim())));
      setUrl(encoded);
      toast('Đã mã hóa URL thành chuỗi Base64 an toàn!', 'success');
    } catch {
      toast('Không thể mã hóa URL này', 'error');
    }
  };

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
    <Modal open={true} title="Remote Download an toàn (Tải về VPS)" onClose={onClose} size="md">
      <form onSubmit={handleDownload} className="space-y-4">
        <Notice>
          Máy chủ sẽ kết nối trực tiếp để tải file từ liên kết vào: <code className="mono">{currentPath}</code>.
          Được bảo vệ bằng cơ chế <strong>Anti-SSRF</strong> và tải độc lập trên VPS.
        </Notice>

        <Field label="URL file tải về" hint="Hỗ trợ link trực tiếp HTTP/HTTPS, link có gắn params expires (5 phút) hoặc link mã hóa Base64">
          <div className="space-y-2">
            <input
              className="input w-full font-mono text-xs"
              placeholder="https://... hoặc chuỗi Base64"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="soft"
                icon={Clock}
                onClick={handleAttach5MinExpiry}
              >
                Gán hạn 5 phút vào params (?expires=...)
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                icon={Shield}
                onClick={handleEncodeBase64}
              >
                Mã hóa Base64 URL
              </Button>
            </div>
          </div>
        </Field>

        <Field label="Tên file lưu (tuỳ chọn)" hint="Để trống để tự động lấy theo tên file gốc trên URL">
          <input
            className="input w-full"
            placeholder="Tự động"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
        </Field>

        <div className="rounded-2xl border border-slate-700/60 bg-ink-950/70 p-3.5 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <Shield className="size-3.5" />
            <span>Tiêu chuẩn bảo mật Remote Download ZenPanel:</span>
          </div>
          <p>• Tự động kiểm tra thời hạn 5 phút nếu URL có chứa tham số <code className="mono text-slate-300">expires</code>.</p>
          <p>• Chặn triệt để mọi truy cập trái phép tới mạng nội bộ loopback / cloud metadata (Anti-SSRF).</p>
          <p>• Giới hạn thời gian kết nối an toàn tối đa 5 phút (300 giây).</p>
        </div>

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

function ShareDownloadModal({
  file,
  onClose,
}: {
  file: FileEntry;
  onClose: () => void;
}) {
  const [ticketData, setTicketData] = useState<{ url: string; fullUrl: string; expires: number; ttl: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const { toast } = useFeedback();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getDownloadTicket(file.path);
        if (mounted) {
          setTicketData(data);
          setSecondsLeft(Math.max(0, Math.floor((data.expires - Date.now()) / 1000)));
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [file.path]);

  useEffect(() => {
    if (!ticketData) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((ticketData.expires - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [ticketData]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <Modal open={true} title="Liên kết tải an toàn (Hạn 5 phút & Chặn IDM)" onClose={onClose} size="md">
      <div className="space-y-4">
        <Notice tone={secondsLeft > 0 ? 'blue' : 'red'}>
          {secondsLeft > 0 ? (
            <div>
              Liên kết tải này được bảo vệ bằng vé điện tử có <strong>thời hạn 5 phút</strong> (gắn trực tiếp tham số <code className="mono">expires</code> vào URL).
            </div>
          ) : (
            <div>Liên kết tải đã hết hạn (quá 5 phút). Vui lòng đóng và tạo lại liên kết mới.</div>
          )}
        </Notice>

        <div className="rounded-2xl border border-slate-700/60 bg-ink-950/70 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Tệp: <strong className="text-white">{file.name}</strong></span>
            <span>{formatBytes(file.size)}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-900/90 px-3 py-2 border border-slate-800">
            <span className="text-xs text-slate-400">Thời gian còn lại:</span>
            <div className={cn('flex items-center gap-1.5 font-mono text-sm font-bold', secondsLeft > 60 ? 'text-emerald-400' : secondsLeft > 0 ? 'text-amber-400' : 'text-rose-400')}>
              <Clock className="size-4" />
              <span>{timeFormatted}</span>
            </div>
          </div>

          {loading ? (
            <Spinner label="Đang tạo chữ ký tải an toàn..." />
          ) : ticketData ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">URL tải trực tiếp (Đã gắn vé & hạn 5 phút)</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  className="input w-full font-mono text-xs select-all bg-black/40"
                  value={ticketData.fullUrl}
                />
                <Button
                  size="sm"
                  variant="primary"
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard.writeText(ticketData.fullUrl);
                    toast('Đã sao chép liên kết tải an toàn!', 'success');
                  }}
                >
                  Sao chép
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <Shield className="size-3.5" />
            <span>Anti-IDM Protected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            {ticketData && secondsLeft > 0 && (
              <Button
                variant="primary"
                icon={Download}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = ticketData.url;
                  link.download = '';
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }}
              >
                Tải về máy ngay
              </Button>
            )}
          </div>
        </div>
      </div>
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
  isRunning,
  proUrl,
  isUltraInstalled,
  isUltraRunning,
  ultraUrl,
  ultraPort = '8085',
  onClose,
  onStart,
  onStartUltra,
  onSwitchToPro,
  onSwitchToUltra,
}: {
  isInstalled: boolean;
  isRunning: boolean;
  proUrl: string | null;
  isUltraInstalled: boolean;
  isUltraRunning: boolean;
  ultraUrl: string | null;
  ultraPort?: string;
  onClose: () => void;
  onStart?: () => void;
  onStartUltra?: () => void;
  onSwitchToPro?: () => void;
  onSwitchToUltra?: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<'ultra' | 'guide' | 'pro'>('ultra');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [addingRepo, setAddingRepo] = useState(false);

  const copyRepoUrl = () => {
    navigator.clipboard.writeText(OFFICIAL_REPO_URL);
    setCopiedUrl(true);
    toast('Đã sao chép link kho repo vào bộ nhớ tạm!', 'success');
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleAutoAddAndInstall = async () => {
    setAddingRepo(true);
    try {
      await post('/api/apps/repos', {
        name: 'ZenPanel Community & Pro Apps',
        url: OFFICIAL_REPO_URL,
      });
      toast('Đã thêm & đồng bộ kho repo thành công! Đang chuyển đến cài đặt ZenFile Ultra...', 'success');
      onClose();
      navigate('/apps?install=zen-file-ultra');
    } catch (err: any) {
      toast(err?.message || 'Không thể tự động thêm kho, vui lòng làm theo hướng dẫn thủ công', 'error');
      setTab('guide');
    } finally {
      setAddingRepo(false);
    }
  };

  return (
    <Modal open={true} title="Trình Quản Lý Tệp Nâng Cao (File Manager Options)" onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setTab('ultra')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              tab === 'ultra' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <Sparkles className="size-3.5 text-indigo-300" />
            <span>ZenFile Ultra (Kiểu mới khuyên dùng)</span>
            <Badge tone="blue" className="text-[10px]">Mới</Badge>
          </button>
          <button
            type="button"
            onClick={() => setTab('guide')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              tab === 'guide' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <Boxes className="size-3.5 text-amber-300" />
            <span>Hướng dẫn Add Repo App Store</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('pro')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              tab === 'pro' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <FolderOpen className="size-3.5 text-slate-400" />
            <span>FileBrowser (Bản cơ bản cũ)</span>
          </button>
        </div>

        {/* TAB 1: ZENFILE ULTRA (KIỂU MỚI) */}
        {tab === 'ultra' && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-indigo-500/40 bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-ink-950 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-indigo-400 animate-pulse" />
                  <h3 className="text-base font-bold text-white">ZenFile Ultra (Cloud Commander Pro)</h3>
                </div>
                <Badge tone="blue">Kiểu mới nhiều tính năng hơn</Badge>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Được tùy biến và đóng gói độc lập cho hệ sinh thái ZenPanel, giải quyết triệt để sự gò bó và thiếu tính năng của các trình duyệt tệp truyền thống.
              </p>
              <div className="grid gap-2.5 pt-1 text-xs text-slate-200 sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-lg bg-ink-950/50 p-2.5 border border-slate-800/60">
                  <Layers className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                  <span><b>2 cửa sổ song song (Dual-Pane):</b> Sao chép (F5), di chuyển (F6) tệp tin giữa 2 thư mục siêu tốc</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-ink-950/50 p-2.5 border border-slate-800/60">
                  <Terminal className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  <span><b>Web Terminal nhúng sẵn:</b> Chạy bash/sh/PowerShell tương tác ngay trong thư mục đang duyệt (Ctrl + ~)</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-ink-950/50 p-2.5 border border-slate-800/60">
                  <FileCode className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <span><b>Monaco Code Editor chuyên sâu:</b> Tô màu cú pháp, tìm kiếm regex, phím tắt VS Code (F4)</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-ink-950/50 p-2.5 border border-slate-800/60">
                  <FileArchive className="mt-0.5 size-4 shrink-0 text-rose-400" />
                  <span><b>Nén & Giải nén đa định dạng:</b> Hỗ trợ .zip, .tar, .tar.gz, .tgz trực tiếp không cần cài gói phụ trợ</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-ink-950/50 p-2.5 border border-slate-800/60">
                  <Eye className="mt-0.5 size-4 shrink-0 text-cyan-400" />
                  <span><b>Xem trước đa phương tiện & Diff:</b> Ảnh lightbox, video, nhạc, so sánh khác biệt nội dung file (F3)</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-ink-950/50 p-2.5 border border-slate-800/60">
                  <Shield className="mt-0.5 size-4 shrink-0 text-green-400" />
                  <span><b>Toàn quyền Root VPS:</b> Truy cập và chỉnh sửa mọi thư mục hệ thống không bị giới hạn permission</span>
                </div>
              </div>
            </div>

            {/* Trạng thái đã cài đặt hay chưa */}
            {isUltraInstalled ? (
              isUltraRunning ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-emerald-300">
                      <CheckCircle2 className="size-4" /> ZenFile Ultra đã được cài đặt và đang chạy
                    </div>
                    <p className="text-xs text-slate-400">Cổng truy cập: <code className="mono text-white">{ultraPort}</code> (Đầy đủ 2 cửa sổ & Web Terminal)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onSwitchToUltra && (
                      <Button
                        variant="primary"
                        icon={Sparkles}
                        onClick={() => {
                          onSwitchToUltra();
                          onClose();
                        }}
                      >
                        Mở giao diện Ultra
                      </Button>
                    )}
                    {ultraUrl && (
                      <a href={ultraUrl} target="_blank" rel="noreferrer">
                        <Button variant="secondary" icon={ExternalLink}>
                          Tab riêng
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-amber-300">
                      <Play className="size-4" /> ZenFile Ultra đã cài đặt nhưng đang tạm dừng
                    </div>
                    <p className="text-xs text-slate-400">Khởi động container để bắt đầu duyệt tệp với giao diện 2 cửa sổ kiểu mới.</p>
                  </div>
                  {onStartUltra && (
                    <Button
                      variant="primary"
                      icon={Play}
                      onClick={() => {
                        onStartUltra();
                        onClose();
                      }}
                    >
                      Khởi động ngay
                    </Button>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Chuyển sang ZenFile Ultra qua App Store</span>
                  <Badge tone="blue">Repo chính thức</Badge>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  ZenFile Ultra nằm trong kho <b>ZenPanel Community & Pro Apps</b>. Bạn có thể tự động thêm kho và cài đặt nhanh chỉ với 1 click:
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <Button
                    variant="primary"
                    icon={Sparkles}
                    loading={addingRepo}
                    onClick={() => void handleAutoAddAndInstall()}
                    className="w-full sm:flex-1"
                  >
                    ⚡ Tự động thêm kho & Cài đặt ZenFile Ultra ngay
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Boxes}
                    onClick={() => setTab('guide')}
                    className="w-full sm:w-auto"
                  >
                    Xem hướng dẫn Add Repo
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HƯỚNG DẪN THỦ CÔNG ADD REPO */}
        {tab === 'guide' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 leading-relaxed">
              💡 <b>Cách thêm kho repo mở rộng vào App Store:</b> Bạn có thể thêm link catalog JSON từ GitHub repo này để tự động cập nhật ZenFile Ultra và các công cụ mở rộng khác.
            </div>

            <div className="space-y-3 rounded-xl border border-slate-800 bg-ink-950/60 p-4 text-xs text-slate-300">
              <div className="flex items-start gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zen-blue text-xs font-bold text-white">1</div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <span className="font-semibold text-white">Sao chép đường dẫn kho repo chính thức:</span>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2">
                    <code className="mono text-[11px] text-emerald-400 truncate flex-1">{OFFICIAL_REPO_URL}</code>
                    <Button size="xs" variant="soft" icon={Copy} onClick={copyRepoUrl}>
                      {copiedUrl ? 'Đã sao chép!' : 'Sao chép link'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zen-blue text-xs font-bold text-white">2</div>
                <div className="space-y-1 flex-1">
                  <span className="font-semibold text-white">Mở mục Kho Repos tại tab App Store:</span>
                  <p className="text-slate-400">Vào tab <b>App Store</b> trên menu bên trái, sau đó bấm nút <b>"Kho Repos"</b> ở góc trên cùng.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zen-blue text-xs font-bold text-white">3</div>
                <div className="space-y-1 flex-1">
                  <span className="font-semibold text-white">Dán URL và bấm "Thêm & Đồng bộ ngay":</span>
                  <p className="text-slate-400">ZenPanel sẽ tự động tải danh mục ứng dụng từ GitHub và hiển thị thông báo đồng bộ thành công.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zen-blue text-xs font-bold text-white">4</div>
                <div className="space-y-1 flex-1">
                  <span className="font-semibold text-white">Cài đặt ZenFile Ultra:</span>
                  <p className="text-slate-400">Tìm ứng dụng <b>"ZenFile Ultra (Cloud Commander Pro)"</b> trong danh sách App Store và bấm <b>"Cài đặt"</b> (1-Click Docker).</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">5</div>
                <div className="space-y-1 flex-1">
                  <span className="font-semibold text-white">Tận hưởng giao diện kiểu mới:</span>
                  <p className="text-slate-400">Quay lại tab <b>File Manager</b>, ZenPanel sẽ tự động nhận diện và chuyển sang giao diện 2 cửa sổ & Web Terminal!</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="primary"
                icon={Boxes}
                onClick={() => {
                  onClose();
                  navigate('/apps?openRepo=1');
                }}
              >
                Mở mục Kho Repos ở App Store ngay
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: FILEBROWSER (BẢN CŨ) */}
        {tab === 'pro' && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-slate-700/60 bg-ink-950/50 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">FileBrowser (Bản cơ bản truyền thống)</h4>
                <Badge tone="slate">Cơ bản</Badge>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                FileBrowser là trình duyệt tệp giao diện web đơn giản. Nếu bạn không cần 2 cửa sổ hay Web Terminal như ZenFile Ultra, bạn vẫn có thể sử dụng bản này.
              </p>
            </div>

            {isInstalled ? (
              isRunning ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-emerald-300">
                      <CheckCircle2 className="size-4" /> FileBrowser đang chạy
                    </div>
                    <p className="text-xs text-slate-400">Tài khoản mặc định: <code className="mono text-white">admin / admin</code></p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onSwitchToPro && (
                      <Button
                        variant="primary"
                        icon={FolderOpen}
                        onClick={() => {
                          onSwitchToPro();
                          onClose();
                        }}
                      >
                        Mở FileBrowser
                      </Button>
                    )}
                    {proUrl && (
                      <a href={proUrl} target="_blank" rel="noreferrer">
                        <Button variant="secondary" icon={ExternalLink}>
                          Tab riêng
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-amber-300">
                      <Play className="size-4" /> FileBrowser đã cài đặt nhưng đang tạm dừng
                    </div>
                  </div>
                  {onStart && (
                    <Button
                      variant="primary"
                      icon={Play}
                      onClick={() => {
                        onStart();
                        onClose();
                      }}
                    >
                      Khởi động lại
                    </Button>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-3 rounded-xl border border-slate-800 bg-ink-950/40 p-4">
                <p className="text-xs text-slate-400">Bạn có thể cài đặt FileBrowser trực tiếp từ App Store nếu muốn sử dụng giao diện web cổ điển.</p>
                <Button
                  variant="secondary"
                  icon={Download}
                  onClick={() => {
                    onClose();
                    navigate('/apps?install=filebrowser');
                  }}
                  className="w-full"
                >
                  Cài đặt FileBrowser qua App Store
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end border-t border-slate-800 pt-3">
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
  const [shareFile, setShareFile] = useState<FileEntry | null>(null);
  const [proModal, setProModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'dirs' | 'images' | 'media' | 'code' | 'archives'>('all');
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'copy' | 'move' } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [viewMode, setViewMode] = useState<'standard' | 'ultra' | 'pro'>('standard');
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, prompt, run, toast } = useFeedback();
  const { runJob } = useJobs();

  // Nhận diện hệ điều hành của VPS để áp dụng giao diện giống 100%
  const { info } = usePanel();
  const osFamily = info?.os.family || 'linux';
  const osName = (info?.os.name || '').toLowerCase();
  const defaultOsStyle: 'windows' | 'ubuntu' | 'macos' =
    osFamily === 'windows' ? 'windows' : osName.includes('ubuntu') || osName.includes('debian') ? 'ubuntu' : 'ubuntu';

  const [osStyle, setOsStyle] = useState<'windows' | 'ubuntu' | 'macos'>(defaultOsStyle);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setOsStyle(defaultOsStyle);
  }, [defaultOsStyle]);

  const apps = useApi<AppView[]>('/api/apps');
  const proApp = apps.data?.find((a) => a.id === 'filebrowser' || a.id === 'zen-file-explorer' || a.name?.toLowerCase().includes('filebrowser'));
  const isProInstalled = Boolean(proApp?.installed || (proApp && proApp.status !== 'not-installed'));
  const isProRunning = proApp?.status === 'running';
  const proPort = proApp?.installed?.params.port || '8084';
  const proUrl = proApp?.publicLink?.url ?? `http://${window.location.hostname}:${proPort}`;

  const ultraApp = apps.data?.find(
    (a) => a.id.includes('zen-file-ultra') || a.id.includes('cloudcmd') || a.name?.toLowerCase().includes('zenfile ultra') || a.name?.toLowerCase().includes('cloud commander'),
  );
  const isUltraInstalled = Boolean(ultraApp?.installed || (ultraApp && ultraApp.status !== 'not-installed'));
  const isUltraRunning = ultraApp?.status === 'running';
  const ultraPort = ultraApp?.installed?.params.port || '8085';
  const ultraUrl = ultraApp?.publicLink?.url ?? `http://${window.location.hostname}:${ultraPort}`;

  const startPro = async () => {
    await runJob(() => post<Job>('/api/apps/filebrowser/start'));
    await apps.reload();
  };

  const uninstallPro = async () => {
    const ok = await confirm({
      title: 'Gỡ cài đặt ZenFile Pro',
      message: 'Bạn có chắc chắn muốn gỡ cài đặt ZenFile Pro? Sau khi gỡ, ZenPanel sẽ quay về giao diện File Manager tiêu chuẩn ban đầu.',
      danger: true,
      confirmLabel: 'Gỡ cài đặt',
    });
    if (!ok) return;
    await runJob(() => post<Job>('/api/apps/filebrowser/uninstall', { removeData: false }));
    setViewMode('standard');
    await apps.reload();
  };

  const startUltra = async () => {
    if (!ultraApp) return;
    await runJob(() => post<Job>(`/api/apps/${ultraApp.id}/start`));
    await apps.reload();
  };

  const uninstallUltra = async () => {
    if (!ultraApp) return;
    const ok = await confirm({
      title: 'Gỡ cài đặt ZenFile Ultra',
      message: 'Bạn có chắc chắn muốn gỡ cài đặt ZenFile Ultra? Sau khi gỡ, ZenPanel sẽ quay về giao diện File Manager tiêu chuẩn ban đầu.',
      danger: true,
      confirmLabel: 'Gỡ cài đặt',
    });
    if (!ok) return;
    await runJob(() => post<Job>(`/api/apps/${ultraApp.id}/uninstall`, { removeData: false }));
    setViewMode('standard');
    await apps.reload();
  };

  // Tự động nhận diện chế độ xem tối ưu
  useEffect(() => {
    const modeParam = params.get('mode');
    if (modeParam === 'standard') {
      setViewMode('standard');
    } else if (modeParam === 'ultra' && isUltraInstalled) {
      setViewMode('ultra');
    } else if (modeParam === 'pro' && isProInstalled) {
      setViewMode('pro');
    } else if (isUltraInstalled) {
      setViewMode('ultra');
    } else if (isProInstalled) {
      setViewMode('pro');
    } else {
      setViewMode('standard');
    }
  }, [isUltraInstalled, isProInstalled, params]);

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

  const compress = async (format: 'zip' | 'tar.gz', targets: FileEntry[] = selectedEntries) => {
    if (!listing || !targets.length) return;
    const base = targets.length === 1 ? targets[0].name : 'archive';
    const name = await prompt({ title: 'Nén file', label: 'Tên file nén', defaultValue: `${base}.${format}`, confirmLabel: 'Nén' });
    if (!name) return;
    setCompressing(true);
    await run(() => post('/api/files/compress', { paths: targets.map((e) => e.path), destination: joinPath(listing.path, name, sep), format }), `Đã nén thành ${name}`);
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

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const openMenu = (event: React.MouseEvent, entry: FileEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry && !selected.has(entry.path)) setSelected(new Set([entry.path]));
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 380), entry });
  };

  const downloadDir = async (entry: FileEntry) => {
    toast(`Đang nén thư mục ${entry.name} thành zip...`, 'info');
    await run(() => downloadFolder(entry.path), `Đang tải ${entry.name}.zip (file zip trên VPS sẽ tự xoá)`);
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
        description="Quản lý tệp tin thích ứng theo hệ điều hành (Windows / Ubuntu / macOS) · Kéo thả upload · Xem trước ảnh/video/nhạc · Chmod · Monaco Editor"
        icon={FolderOpen}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Bộ chọn phong cách hệ điều hành */}
            <div className="flex items-center rounded-xl border border-slate-700/60 bg-ink-950/70 px-2.5 py-1 text-xs text-slate-300 shadow-sm">
              <span className="text-[11px] text-slate-400 mr-2 flex items-center gap-1">
                {osStyle === 'windows' ? <Laptop className="size-3.5 text-blue-400" /> : osStyle === 'ubuntu' ? <Server className="size-3.5 text-orange-400" /> : <Monitor className="size-3.5 text-purple-400" />}
                <span className="hidden sm:inline">Giao diện:</span>
              </span>
              <select
                value={osStyle}
                onChange={(e) => setOsStyle(e.target.value as typeof osStyle)}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
                title="Chọn phong cách giao diện File Manager theo ý thích"
              >
                <option value="windows" className="bg-slate-900 text-white">Windows 11 Explorer</option>
                <option value="ubuntu" className="bg-slate-900 text-white">Ubuntu Files (Yaru)</option>
                <option value="macos" className="bg-slate-900 text-white">macOS Finder</option>
              </select>
            </div>

            {/* Chuyển đổi giữa Duyệt chuẩn OS, ZenFile Ultra và FileBrowser UI */}
            <div className="flex flex-wrap items-center rounded-xl border border-slate-700/60 bg-ink-950/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setViewMode('standard');
                  setParams((p) => {
                    p.set('mode', 'standard');
                    return p;
                  });
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all',
                  viewMode === 'standard' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <Folder className="size-3.5" />
                <span className="hidden md:inline">{osStyle === 'windows' ? 'Windows Explorer' : osStyle === 'ubuntu' ? 'Ubuntu Files' : 'macOS Finder'}</span>
                <span className="md:hidden">Tiêu chuẩn</span>
              </button>

              {isUltraInstalled && (
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('ultra');
                    setParams((p) => {
                      p.delete('mode');
                      return p;
                    });
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all',
                    viewMode === 'ultra' ? 'bg-indigo-600 text-white shadow' : 'text-indigo-300 hover:text-white',
                  )}
                >
                  <Sparkles className="size-3 text-indigo-300" /> ZenFile Ultra
                  <span className={cn('size-1.5 rounded-full', isUltraRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
                </button>
              )}

              {isProInstalled && (
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('pro');
                    setParams((p) => {
                      p.set('mode', 'pro');
                      return p;
                    });
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all',
                    viewMode === 'pro'
                      ? 'bg-gradient-to-r from-zen-purple to-zen-blue text-white shadow'
                      : 'text-purple-300 hover:text-white',
                  )}
                >
                  <FolderOpen className="size-3 text-amber-300" /> FileBrowser
                  <span className={cn('size-1.5 rounded-full', isProRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setProModal(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-400 hover:text-white transition"
                title="Tùy chọn & Hướng dẫn chuyển đổi kiểu mới"
              >
                <Sparkles className="size-3 text-amber-300" />
                <span className="hidden sm:inline">{!isUltraInstalled ? 'Kiểu mới' : 'Tùy chọn'}</span>
              </button>
            </div>

            {/* Chọn ổ đĩa trên Windows / Multi-roots */}
            {roots && roots.roots.length > 1 && (
              <Select value={roots.roots.find((r) => currentPath?.startsWith(r)) ?? roots.roots[0]} onChange={(e) => navigate(e.target.value)} className="w-28 text-xs">
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

      {/* CHẾ ĐỘ ULTRA: Nhúng trực tiếp giao diện ZenFile Ultra (Cloud Commander Pro) toàn màn hình */}
      {viewMode === 'ultra' && isUltraInstalled ? (
        isUltraRunning && ultraUrl ? (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/40 bg-ink-950/70 px-4 py-2.5 backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2 text-sm text-indigo-200">
                <Sparkles className="size-4 text-indigo-400" />
                <span className="font-semibold text-white">ZenFile Ultra (Cloud Commander Pro)</span>
                <Badge tone="green" className="text-[11px]">Đang chạy (Cổng {ultraPort})</Badge>
                <span className="hidden text-xs text-slate-400 xl:inline">
                  · Phím tắt: <code className="mono text-white">Ctrl + `</code> (Terminal) · <code className="mono text-white">F4</code> (Sửa code) · <code className="mono text-white">F5</code> (Sao chép 2 ô) · <code className="mono text-white">F6</code> (Di chuyển)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  variant="secondary"
                  icon={RefreshCw}
                  onClick={() => {
                    const ifr = document.getElementById('zenfile-ultra-iframe') as HTMLIFrameElement;
                    if (ifr) ifr.src = ifr.src;
                  }}
                >
                  Làm mới
                </Button>
                <a href={ultraUrl} target="_blank" rel="noreferrer">
                  <Button size="xs" variant="secondary" icon={ExternalLink}>
                    Mở tab riêng
                  </Button>
                </a>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-zen-red hover:bg-zen-red/10"
                  icon={Trash2}
                  onClick={() => void uninstallUltra()}
                >
                  Gỡ cài đặt
                </Button>
              </div>
            </div>
            <div className="relative h-[calc(100dvh-10rem)] min-h-[580px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#0c101a] shadow-2xl">
              <iframe
                id="zenfile-ultra-iframe"
                src={ultraUrl}
                className="h-full w-full border-0"
                title="ZenFile Ultra"
              />
            </div>
          </div>
        ) : (
          <Card className="text-center p-8 space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Sparkles className="size-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">ZenFile Ultra đã được cài đặt nhưng container đang tạm dừng</h3>
              <p className="text-sm text-slate-400">Khởi động container để bắt đầu duyệt tệp với 2 cửa sổ & Web Terminal toàn màn hình.</p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <Button variant="primary" icon={Play} onClick={() => void startUltra()}>
                Khởi động ZenFile Ultra ngay
              </Button>
              <Button variant="secondary" onClick={() => setViewMode('standard')}>
                Quay về Duyệt tiêu chuẩn
              </Button>
              <Button variant="ghost" className="text-zen-red hover:bg-zen-red/10" icon={Trash2} onClick={() => void uninstallUltra()}>
                Gỡ cài đặt
              </Button>
            </div>
          </Card>
        )
      ) : viewMode === 'pro' && isProInstalled ? (
        isProRunning && proUrl ? (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zen-purple/40 bg-ink-950/70 px-4 py-2.5 backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2 text-sm text-purple-200">
                <Sparkles className="size-4 text-zen-purple" />
                <span className="font-semibold text-white">ZenFile Explorer Pro</span>
                <Badge tone="green" className="text-[11px]">Đang chạy</Badge>
                <span className="text-xs text-slate-400">
                  · Tài khoản mặc định: <code className="mono text-white">admin</code> / Mật khẩu: <code className="mono text-white">{proApp?.installed?.params.password || 'admin'}</code>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-zen-red hover:bg-zen-red/10"
                  icon={Trash2}
                  onClick={() => void uninstallPro()}
                >
                  Gỡ cài đặt
                </Button>
              </div>
            </div>
            <div className="relative h-[calc(100dvh-10rem)] min-h-[580px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#0c101a] shadow-2xl">
              <iframe
                id="zenfile-pro-iframe"
                src={proUrl}
                className="h-full w-full border-0"
                title="ZenFile Explorer Pro"
              />
            </div>
          </div>
        ) : (
          <Card className="text-center p-8 space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
              <Sparkles className="size-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">ZenFile Pro đã được cài đặt nhưng container đang tạm dừng</h3>
              <p className="text-sm text-slate-400">Khởi động container để bắt đầu duyệt tệp với giao diện Pro toàn màn hình.</p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <Button variant="primary" icon={Play} onClick={() => void startPro()}>
                Khởi động ZenFile Pro ngay
              </Button>
              <Button variant="secondary" onClick={() => setViewMode('standard')}>
                Quay về Duyệt cơ bản
              </Button>
              <Button variant="ghost" className="text-zen-red hover:bg-zen-red/10" icon={Trash2} onClick={() => void uninstallPro()}>
                Gỡ cài đặt
              </Button>
            </div>
          </Card>
        )
      ) : (
        /* GIAO DIỆN DUYỆT TỆP THÍCH ỨNG THEO HỆ ĐIỀU HÀNH */
        <div
          className={cn(
            'overflow-hidden rounded-2xl shadow-2xl transition-all',
            osStyle === 'windows' && 'border border-slate-700/80 bg-[#0b121e]',
            osStyle === 'ubuntu' && 'border border-neutral-700/80 bg-[#1e1e1e]',
            osStyle === 'macos' && 'border border-slate-700/60 bg-[#161a22]',
          )}
        >
          {/* HEADER / TOOLBAR THEO TỪNG HỆ ĐIỀU HÀNH */}
          {osStyle === 'windows' && (
            /* ======================================================== WINDOWS 11 FILE EXPLORER */
            <div className="border-b border-slate-700/60 bg-[#101927]">
              {/* Windows 11 Fluent Command Bar (Ribbon) */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/80 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  <div className="flex items-center gap-1 rounded-lg bg-zen-blue/20 px-2.5 py-1 text-blue-300 hover:bg-zen-blue/30 cursor-pointer font-medium" onClick={() => void create('file')}>
                    <FilePlus className="size-3.5 text-blue-400" /> File mới
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-amber-300 hover:bg-amber-500/25 cursor-pointer font-medium" onClick={() => void create('directory')}>
                    <FolderPlus className="size-3.5 text-amber-400" /> Thư mục mới
                  </div>
                  <div className="mx-1 h-4 w-px bg-slate-700/70" />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-slate-200 hover:bg-slate-800"
                    title="Tải tệp lên"
                  >
                    <Upload className="size-3.5 text-emerald-400" /> Tải lên
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoteModal(true)}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-slate-200 hover:bg-slate-800"
                    title="Tải từ URL"
                  >
                    <Globe className="size-3.5 text-cyan-400" /> Tải URL
                  </button>
                  {selectedEntries.length > 0 && (
                    <>
                      <div className="mx-1 h-4 w-px bg-slate-700/70" />
                      <button
                        type="button"
                        onClick={() => setClipboard({ paths: selectedEntries.map((e) => e.path), mode: 'copy' })}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-200 hover:bg-slate-800"
                        title="Sao chép (Ctrl+C)"
                      >
                        <Copy className="size-3.5 text-blue-400" /> Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => setClipboard({ paths: selectedEntries.map((e) => e.path), mode: 'move' })}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-200 hover:bg-slate-800"
                        title="Cắt (Ctrl+X)"
                      >
                        <Scissors className="size-3.5 text-amber-400" /> Cut
                      </button>
                      {selectedEntries.length === 1 && (
                        <button
                          type="button"
                          onClick={() => void rename(selectedEntries[0])}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-200 hover:bg-slate-800"
                          title="Đổi tên"
                        >
                          <TextCursorInput className="size-3.5 text-slate-300" /> Đổi tên
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void compress('zip')}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-200 hover:bg-slate-800"
                        title="Nén tệp tin .zip"
                      >
                        <FileArchive className="size-3.5 text-purple-400" /> Nén Zip
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(selectedEntries)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-rose-400 hover:bg-rose-950/40"
                        title="Xóa vĩnh viễn"
                      >
                        <Trash2 className="size-3.5" /> Xóa ({selectedEntries.length})
                      </button>
                    </>
                  )}
                  {clipboard && (
                    <button
                      type="button"
                      onClick={() => void paste()}
                      className="flex items-center gap-1 rounded-lg bg-emerald-950/50 px-2.5 py-1 text-emerald-300 hover:bg-emerald-900/60 font-semibold"
                    >
                      <ClipboardPaste className="size-3.5 text-emerald-400" /> Dán ({clipboard.paths.length})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen((v) => !v)}
                    className={cn('rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white', sidebarOpen && 'text-blue-400')}
                    title="Ẩn/hiện thanh Quick Access"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Windows 11 Address Bar kép (This PC > Local Disk (C:) > ...) */}
              <div className="flex items-center gap-2 p-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!listing?.parent}
                    onClick={() => listing?.parent && navigate(listing.parent)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
                    title="Lên thư mục cha"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    title="Làm mới"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>

                {/* Ô địa chỉ chuẩn Windows Explorer */}
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-ink-950/80 px-2.5 py-1 text-xs shadow-inner">
                  <Laptop className="size-3.5 shrink-0 text-blue-400" />
                  <span className="text-slate-400 font-semibold shrink-0">This PC</span>
                  <ChevronRight className="size-3 shrink-0 text-slate-600" />
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                    {breadcrumbs.map((crumb, idx) => (
                      <span key={crumb.path} className="flex shrink-0 items-center gap-1">
                        {idx > 0 && <ChevronRight className="size-3 text-slate-600" />}
                        <button
                          type="button"
                          onClick={() => navigate(crumb.path)}
                          className={cn(
                            'rounded px-1.5 py-0.5 font-medium transition hover:bg-slate-800',
                            idx === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-slate-300',
                          )}
                        >
                          {crumb.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentPath) {
                        navigator.clipboard.writeText(currentPath);
                        toast(`Đã chép: ${currentPath}`);
                      }
                    }}
                    className="rounded p-1 text-slate-500 hover:text-slate-200"
                    title="Sao chép đường dẫn này"
                  >
                    <Copy className="size-3" />
                  </button>
                </div>

                {/* Ô tìm kiếm góc phải */}
                <div className="w-40 sm:w-56 shrink-0">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={`Tìm kiếm trong thư mục`}
                    className="w-full text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {osStyle === 'ubuntu' && (
            /* ======================================================== UBUNTU GNOME FILES (NAUTILUS) */
            <div className="border-b border-neutral-700/80 bg-[#242424] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!listing?.parent}
                    onClick={() => listing?.parent && navigate(listing.parent)}
                    className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-40"
                    title="Lên thư mục cha"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                    title="Tải lại"
                  >
                    <RefreshCw className="size-4" />
                  </button>

                  {/* Pathbar dạng Pill Buttons (viên thuốc) chuẩn Nautilus GNOME */}
                  <div className="flex items-center gap-1 overflow-x-auto rounded-full bg-black/40 p-1">
                    <button
                      type="button"
                      onClick={() => navigate('/')}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition',
                        currentPath === '/' ? 'bg-[#E95420] text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
                      )}
                    >
                      <Home className="size-3 text-orange-300" /> /
                    </button>
                    {breadcrumbs.map((crumb, idx) => (
                      <button
                        key={crumb.path}
                        type="button"
                        onClick={() => navigate(crumb.path)}
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium transition shrink-0',
                          idx === breadcrumbs.length - 1
                            ? 'bg-[#E95420] text-white font-semibold shadow'
                            : 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
                        )}
                      >
                        {crumb.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="xs" variant="primary" icon={Upload} onClick={() => fileInput.current?.click()} className="bg-[#E95420] hover:bg-[#d84819]">
                    Tải lên
                  </Button>
                  <Button size="xs" icon={FilePlus} onClick={() => void create('file')}>
                    File
                  </Button>
                  <Button size="xs" icon={FolderPlus} onClick={() => void create('directory')}>
                    Thư mục
                  </Button>
                  <div className="w-36 sm:w-48 shrink-0">
                    <SearchInput value={query} onChange={setQuery} placeholder="Tìm kiếm..." className="text-xs" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {osStyle === 'macos' && (
            /* ======================================================== MACOS FINDER */
            <div className="border-b border-slate-700/60 bg-[#1e2330]/90 backdrop-blur-md p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* 3 nút Traffic Lights tròn đặc trưng */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 pr-2">
                    <span className="size-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/40" />
                    <span className="size-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/40" />
                    <span className="size-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/40" />
                  </div>

                  <button
                    type="button"
                    disabled={!listing?.parent}
                    onClick={() => listing?.parent && navigate(listing.parent)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40"
                    title="Lên cấp"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                    title="Tải lại"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>

                  <div className="flex items-center gap-1 text-xs font-semibold text-white ml-1">
                    <Folder className="size-3.5 text-blue-400" />
                    <span>{listing?.path.split(sep).filter(Boolean).pop() || (sep === '/' ? 'Macintosh HD' : 'This PC')}</span>
                  </div>
                </div>

                {/* macOS Toolbar Actions */}
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="secondary" icon={FilePlus} onClick={() => void create('file')}>
                    File mới
                  </Button>
                  <Button size="xs" variant="secondary" icon={FolderPlus} onClick={() => void create('directory')}>
                    Thư mục mới
                  </Button>
                  <Button size="xs" variant="primary" icon={Upload} onClick={() => fileInput.current?.click()} className="bg-blue-600 hover:bg-blue-500">
                    Upload
                  </Button>
                  <div className="w-36 sm:w-52">
                    <SearchInput value={query} onChange={setQuery} placeholder="Search" className="rounded-full text-xs" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* THANH BỘ LỌC TỆP TIN NHANH */}
          <div className="flex items-center justify-between border-b border-slate-700/50 bg-black/30 px-3 py-1.5 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lọc:</span>
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'dirs', label: 'Thư mục' },
                { id: 'images', label: 'Hình ảnh' },
                { id: 'media', label: 'Video & Audio' },
                { id: 'code', label: 'Code & Doc' },
                { id: 'archives', label: 'File nén' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTypeFilter(f.id as typeof typeFilter)}
                  className={cn(
                    'rounded-md px-2 py-0.5 font-medium transition',
                    typeFilter === f.id
                      ? osStyle === 'ubuntu'
                        ? 'bg-[#E95420] text-white'
                        : 'bg-zen-blue text-white'
                      : 'hover:bg-slate-800 hover:text-slate-200',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {uploading && (
                <span className="flex items-center gap-1 text-xs text-amber-300 font-semibold animate-pulse">
                  <RefreshCw className="size-3 animate-spin" /> Đang tải file lên...
                </span>
              )}
              {compressing && (
                <span className="flex items-center gap-1 text-xs text-purple-300 font-semibold animate-pulse">
                  <RefreshCw className="size-3 animate-spin" /> Đang xử lý nén/giải nén...
                </span>
              )}
              {selectedEntries.length > 0 && (
                <span className="text-xs text-blue-300 font-semibold shrink-0">
                  Đã chọn {selectedEntries.length} mục
                </span>
              )}
            </div>
          </div>

          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files).then(() => (e.target.value = ''))} />

          {/* VÙNG NỘI DUNG CHÍNH (SIDEBAR + FILE LISTING) */}
          <div className="flex min-h-[460px]">
            {/* SIDEBAR ĐIỀU HƯỚNG THEO PHONG CÁCH HỆ ĐIỀU HÀNH */}
            {sidebarOpen && (
              <div
                className={cn(
                  'w-48 shrink-0 border-r text-xs p-3 space-y-4 select-none hidden md:block',
                  osStyle === 'windows' && 'border-slate-800 bg-[#0d1522]/90',
                  osStyle === 'ubuntu' && 'border-neutral-800 bg-[#1a1a1a]',
                  osStyle === 'macos' && 'border-slate-800/80 bg-[#12161f]/90',
                )}
              >
                {osStyle === 'windows' && (
                  <>
                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quick access</span>
                      <button
                        type="button"
                        onClick={() => navigate(roots?.roots[0] ? `${roots.roots[0]}\\Users` : '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                      >
                        <Laptop className="size-3.5 text-blue-400" /> Desktop
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(currentPath || '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                      >
                        <Download className="size-3.5 text-emerald-400" /> Downloads
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(currentPath || '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                      >
                        <FileText className="size-3.5 text-amber-400" /> Documents
                      </button>
                    </div>

                    <div className="space-y-1 pt-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">This PC</span>
                      {(roots?.roots ?? ['C:\\']).map((drive) => (
                        <button
                          key={drive}
                          type="button"
                          onClick={() => navigate(drive)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 font-medium transition',
                            currentPath?.startsWith(drive) ? 'bg-zen-blue/20 text-blue-300' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                          )}
                        >
                          <HardDrive className="size-3.5 text-cyan-400" /> Local Disk ({drive})
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {osStyle === 'ubuntu' && (
                  <div className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-orange-400/80">Vị trí (Places)</span>
                    <button
                      type="button"
                      onClick={() => navigate('/')}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition font-medium',
                        currentPath === '/' ? 'bg-[#E95420]/20 text-orange-300' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
                      )}
                    >
                      <HardDrive className="size-3.5 text-orange-400" /> Hệ thống tệp (/)
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/var/www')}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
                    >
                      <Globe className="size-3.5 text-blue-400" /> Web Server (/var/www)
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/etc')}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
                    >
                      <Server className="size-3.5 text-amber-400" /> Cấu hình (/etc)
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/var/log')}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
                    >
                      <FileText className="size-3.5 text-purple-400" /> Nhật ký (/var/log)
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/tmp')}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
                    >
                      <Folder className="size-3.5 text-rose-400" /> Tạm (/tmp)
                    </button>
                  </div>
                )}

                {osStyle === 'macos' && (
                  <>
                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Favorites</span>
                      <button
                        type="button"
                        onClick={() => navigate(currentPath || '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                      >
                        <Compass className="size-3.5 text-blue-400" /> Applications
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(currentPath || '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                      >
                        <FileText className="size-3.5 text-cyan-400" /> Documents
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(currentPath || '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                      >
                        <Download className="size-3.5 text-purple-400" /> Downloads
                      </button>
                    </div>

                    <div className="space-y-1 pt-2">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Locations</span>
                      <button
                        type="button"
                        onClick={() => navigate(roots?.roots[0] || '/')}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition font-medium"
                      >
                        <HardDrive className="size-3.5 text-slate-400" /> Macintosh HD
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* BẢNG DANH SÁCH FILE CHÍNH */}
            <div
              className={cn('relative flex-1 transition min-h-[420px]', dragging && 'bg-zen-blue/5 ring-2 ring-inset ring-zen-blue/50')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onContextMenu={(e) => openMenu(e, null)}
            >
              {dragging && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="glass flex items-center gap-3 rounded-2xl px-6 py-4 font-semibold text-blue-200 shadow-2xl">
                    <Upload className="size-6 text-emerald-400 animate-bounce" /> Thả file vào đây để tải lên {listing?.path}
                  </div>
                </div>
              )}

              {error ? (
                <div className="p-6">
                  <ErrorBox message={error} onRetry={load} />
                </div>
              ) : !listing || (loading && !listing) ? (
                <Spinner label="Đang nạp danh sách tệp tin..." />
              ) : entries.length === 0 ? (
                <EmptyState
                  icon={Folder}
                  title="Thư mục trống hoặc không có file phù hợp"
                  description="Kéo thả tệp vào đây, bấm nút Tải lên hoặc chọn bộ lọc Tất cả."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead>
                      <tr className={cn('border-b text-slate-400', osStyle === 'ubuntu' ? 'border-neutral-800 bg-neutral-900/60' : 'border-slate-800 bg-ink-950/60')}>
                        <th className="w-10 px-3 py-2 text-left">
                          <input
                            type="checkbox"
                            className="accent-zen-blue"
                            checked={entries.length > 0 && selectedEntries.length === entries.length}
                            onChange={(e) => setSelected(e.target.checked ? new Set(entries.map((x) => x.path)) : new Set())}
                            aria-label="Chọn tất cả"
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">Tên (Name)</th>
                        {osStyle === 'windows' && <th className="px-3 py-2 text-left font-semibold">Loại (Type)</th>}
                        {osStyle === 'ubuntu' && <th className="px-3 py-2 text-left font-semibold">Quyền (Permissions)</th>}
                        <th className="px-3 py-2 text-right font-semibold">Kích thước (Size)</th>
                        <th className="px-3 py-2 text-left font-semibold">{osStyle === 'windows' ? 'Date modified' : 'Ngày sửa'}</th>
                        {osStyle === 'macos' && <th className="px-3 py-2 text-left font-semibold">Kind</th>}
                        <th className="px-3 py-2 text-right font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {entries.map((entry) => {
                        const isMed = Boolean(mediaTypeOf(entry.name));
                        const isDir = entry.type === 'directory';

                        // Icon màu sắc theo phong cách OS
                        const folderColor = osStyle === 'windows' ? 'text-amber-400' : osStyle === 'ubuntu' ? 'text-[#E95420]' : 'text-blue-400';
                        const Icon = isDir
                          ? Folder
                          : isArchive(entry.name)
                            ? FileArchive
                            : isMed
                              ? mediaTypeOf(entry.name) === 'video'
                                ? Video
                                : mediaTypeOf(entry.name) === 'audio'
                                  ? Music
                                  : Eye
                              : languageOf(entry.name) !== 'plaintext'
                                ? FileCode
                                : File;

                        return (
                          <tr
                            key={entry.path}
                            className={cn(
                              'group transition hover:bg-slate-800/40 cursor-pointer',
                              selected.has(entry.path) && 'bg-zen-blue/15 hover:bg-zen-blue/20',
                            )}
                            onDoubleClick={() => openEntry(entry)}
                            onContextMenu={(e) => openMenu(e, entry)}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="accent-zen-blue"
                                checked={selected.has(entry.path)}
                                onChange={() => toggle(entry.path)}
                                aria-label={`Chọn ${entry.name}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="flex max-w-[380px] items-center gap-2.5 text-left"
                                onClick={() => openEntry(entry)}
                              >
                                <Icon className={cn('size-4 shrink-0', isDir ? folderColor : isMed ? 'text-purple-400' : 'text-slate-400')} />
                                <Highlight text={entry.name} query={query} className="truncate font-medium text-slate-100 group-hover:text-blue-300" />
                              </button>
                            </td>

                            {/* Cột Type theo phong cách Windows */}
                            {osStyle === 'windows' && (
                              <td className="px-3 py-2 text-slate-400 text-[11px] truncate max-w-[160px]">
                                {getFileTypeLabel(entry.name, isDir, 'windows')}
                              </td>
                            )}

                            {/* Cột Quyền theo phong cách Ubuntu */}
                            {osStyle === 'ubuntu' && (
                              <td className="px-3 py-2 mono text-[11px] text-slate-400" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setChmodEntries([entry])}
                                  className="rounded bg-black/40 px-1.5 py-0.5 text-emerald-400 hover:bg-neutral-700 hover:text-white"
                                  title="Bấm để phân quyền Chmod"
                                >
                                  {entry.mode || '0755'}
                                </button>
                              </td>
                            )}

                            <td className="px-3 py-2 text-right mono text-slate-400 text-[11px]">
                              {isDir ? '—' : txaformat.size(entry.size)}
                            </td>

                            <td className="px-3 py-2 text-slate-500 text-[11px] whitespace-nowrap">
                              {formatDate(entry.modified)}
                            </td>

                            {/* Cột Kind theo phong cách macOS */}
                            {osStyle === 'macos' && (
                              <td className="px-3 py-2 text-slate-400 text-[11px] truncate max-w-[140px]">
                                {getFileTypeLabel(entry.name, isDir, 'macos')}
                              </td>
                            )}

                            <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {isMed ? (
                                  <IconButton icon={Eye} title="Xem trước media" onClick={() => setPreviewFile(entry)} />
                                ) : (
                                  !isDir && <IconButton icon={Pencil} title="Sửa code" onClick={() => setEditing(entry)} />
                                )}
                                {isArchive(entry.name) && <IconButton icon={PackageOpen} title="Giải nén" onClick={() => void extract(entry)} />}
                                {isDir && <IconButton icon={Download} title="Tải thư mục (tự nén zip)" onClick={() => void downloadDir(entry)} />}
                                {!isDir && (
                                  <>
                                    <IconButton icon={Download} title="Tải về" onClick={() => void run(() => downloadFile(entry.path))} />
                                    <IconButton icon={Link2} title="Link tải an toàn (5 phút, chặn IDM)" onClick={() => setShareFile(entry)} />
                                  </>
                                )}
                                <IconButton
                                  icon={Copy}
                                  title="Sao chép đường dẫn"
                                  onClick={() => {
                                    navigator.clipboard.writeText(entry.path);
                                    toast(`Đã sao chép: ${entry.path}`);
                                  }}
                                />
                                <IconButton icon={TextCursorInput} title="Đổi tên" onClick={() => void rename(entry)} />
                                <IconButton icon={Trash2} title="Xóa" className="hover:text-zen-red" onClick={() => void remove([entry])} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* STATUS BAR CHÂN TRANG THÍCH ỨNG THEO HỆ ĐIỀU HÀNH */}
          <div
            className={cn(
              'flex flex-wrap items-center justify-between border-t px-3 py-1.5 text-xs text-slate-400 select-none',
              osStyle === 'windows' && 'border-slate-800 bg-[#0c1421] text-slate-400',
              osStyle === 'ubuntu' && 'border-neutral-800 bg-[#161616] text-neutral-400',
              osStyle === 'macos' && 'border-slate-800 bg-[#131722] text-slate-400',
            )}
          >
            <div className="flex items-center gap-3">
              <span>{entries.length} mục</span>
              {selectedEntries.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-blue-300 font-semibold">{selectedEntries.length} mục đã chọn</span>
                  <span>({formatBytes(selectedEntries.reduce((sum, e) => sum + e.size, 0))})</span>
                </>
              )}
            </div>

            {/* Breadcrumb Path bar kiểu macOS Finder ở đáy */}
            {osStyle === 'macos' && (
              <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 overflow-x-auto max-w-[50%]">
                <span>Macintosh HD</span>
                {breadcrumbs.map((b) => (
                  <span key={b.path} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="size-3" />
                    <span>{b.name}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>Đường dẫn:</span>
              <code className="mono text-slate-300 truncate max-w-xs">{listing?.path || '/'}</code>
            </div>
          </div>
        </div>
      )}


      {menu && (() => {
        const e = menu.entry;
        const targets = e ? (selected.has(e.path) && selectedEntries.length > 1 ? selectedEntries : [e]) : [];
        const multi = targets.length > 1;
        const Item = ({ icon: I, label, onClick, danger, disabled }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setMenu(null);
              onClick();
            }}
            className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition disabled:opacity-40', danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-slate-200 hover:bg-zen-blue/20')}
          >
            <I className="size-3.5 shrink-0 text-slate-400" /> {label}
          </button>
        );
        const Sep = () => <div className="my-1 h-px bg-slate-700/60" />;
        return (
          <div
            className="fixed z-[100] w-56 rounded-xl border border-slate-700/70 bg-[#0f1626]/95 p-1.5 shadow-2xl backdrop-blur"
            style={{ left: menu.x, top: menu.y }}
            onClick={(ev) => ev.stopPropagation()}
            onContextMenu={(ev) => ev.preventDefault()}
          >
            {e ? (
              <>
                {!multi && <Item icon={e.type === 'directory' ? FolderOpen : Eye} label={e.type === 'directory' ? 'Mở thư mục' : 'Mở'} onClick={() => openEntry(e)} />}
                {!multi && e.type !== 'directory' && <Item icon={Pencil} label="Sửa bằng Code Editor" onClick={() => setEditing(e)} />}
                {!multi && e.type === 'directory' && <Item icon={Download} label="Tải xuống (tự nén zip)" onClick={() => void downloadDir(e)} />}
                {!multi && e.type !== 'directory' && <Item icon={Download} label="Tải xuống" onClick={() => void run(() => downloadFile(e.path))} />}
                {!multi && e.type !== 'directory' && <Item icon={Link2} label="Link tải 5 phút" onClick={() => setShareFile(e)} />}
                {!multi && isArchive(e.name) && <Item icon={PackageOpen} label="Giải nén tại đây" onClick={() => void extract(e)} />}
                <Sep />
                <Item icon={Copy} label="Sao chép" onClick={() => { setClipboard({ paths: targets.map((t) => t.path), mode: 'copy' }); toast(`Đã sao chép ${targets.length} mục`); }} />
                <Item icon={Scissors} label="Cắt" onClick={() => { setClipboard({ paths: targets.map((t) => t.path), mode: 'move' }); toast(`Đã cắt ${targets.length} mục`); }} />
                <Item icon={ClipboardPaste} label="Dán vào thư mục này" disabled={!clipboard} onClick={() => void paste()} />
                <Sep />
                <Item icon={FileArchive} label="Nén thành .zip" onClick={() => void compress('zip', targets)} />
                <Item icon={FileArchive} label="Nén thành .tar.gz" onClick={() => void compress('tar.gz', targets)} />
                <Sep />
                {!multi && <Item icon={TextCursorInput} label="Đổi tên" onClick={() => void rename(e)} />}
                <Item icon={SlidersHorizontal} label="Phân quyền (chmod)" onClick={() => setChmodEntries(targets)} />
                <Item icon={Copy} label="Sao chép đường dẫn" onClick={() => { void navigator.clipboard.writeText(targets.map((t) => t.path).join('\n')); toast('Đã sao chép đường dẫn'); }} />
                <Sep />
                <Item icon={Trash2} danger label={multi ? `Xoá ${targets.length} mục` : 'Xoá'} onClick={() => void remove(targets)} />
              </>
            ) : (
              <>
                <Item icon={FilePlus} label="Tạo file mới" onClick={() => void create('file')} />
                <Item icon={FolderPlus} label="Tạo thư mục mới" onClick={() => void create('directory')} />
                <Item icon={ClipboardPaste} label="Dán" disabled={!clipboard} onClick={() => void paste()} />
                <Sep />
                <Item icon={Upload} label="Tải lên file" onClick={() => fileInput.current?.click()} />
                <Item icon={RefreshCw} label="Làm mới" onClick={() => void load()} />
                {listing && <Item icon={Copy} label="Sao chép đường dẫn thư mục" onClick={() => { void navigator.clipboard.writeText(listing.path); toast('Đã sao chép đường dẫn'); }} />}
              </>
            )}
          </div>
        );
      })()}

      {editing && <CodeEditorModal file={editing} onClose={() => setEditing(null)} />}
      {previewFile && <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onShare={(f) => setShareFile(f)} />}
      {shareFile && <ShareDownloadModal file={shareFile} onClose={() => setShareFile(null)} />}
      {remoteModal && currentPath && (
        <RemoteDownloadModal currentPath={currentPath} onClose={() => setRemoteModal(false)} onDownloaded={() => void load()} />
      )}
      {chmodEntries && (
        <ChmodModal entries={chmodEntries} onClose={() => setChmodEntries(null)} onSuccess={() => void load()} />
      )}
      {proModal && (
        <ProUpgradeModal
          isInstalled={isProInstalled}
          isRunning={isProRunning}
          proUrl={proUrl}
          isUltraInstalled={isUltraInstalled}
          isUltraRunning={isUltraRunning}
          ultraUrl={ultraUrl}
          ultraPort={ultraPort}
          onClose={() => setProModal(false)}
          onStart={() => void startPro()}
          onStartUltra={() => void startUltra()}
          onSwitchToPro={() => setViewMode('pro')}
          onSwitchToUltra={() => setViewMode('ultra')}
        />
      )}
    </>
  );
}
