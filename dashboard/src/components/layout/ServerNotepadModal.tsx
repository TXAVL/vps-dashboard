// ZenPanel - Server Sticky Notepad (Ghi chú nhanh cho quản trị viên VPS)
import { useEffect, useState, useRef } from 'react';
import { Check, Copy, Eye, FileText, Loader2, Save, X } from 'lucide-react';
import { get, put } from '../../lib/api';

interface ServerNotes {
  content: string;
  updatedAt: string;
}

export function ServerNotepadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const saveTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    get<ServerNotes>('/api/system/notes')
      .then((data: ServerNotes) => {
        setContent(data.content || '');
        setUpdatedAt(data.updatedAt || null);
      })
      .catch((err: unknown) => {
        console.error('Không thể tải ghi chú server:', err);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async (textToSave?: string) => {
    const val = textToSave !== undefined ? textToSave : content;
    setSaving(true);
    try {
      const res = await put<ServerNotes>('/api/system/notes', { content: val });
      setUpdatedAt(res.updatedAt);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: unknown) {
      console.error('Lỗi khi lưu ghi chú server:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setContent(newVal);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(newVal);
    }, 1200);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700/80 bg-ink-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <FileText className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-bold text-white">
                Server Sticky Notepad
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  Auto-save
                </span>
              </div>
              <div className="text-xs text-slate-400">
                {saving ? (
                  <span className="text-amber-400">Đang lưu thay đổi...</span>
                ) : savedSuccess ? (
                  <span className="text-emerald-400">Đã lưu tự động</span>
                ) : updatedAt ? (
                  <span>Lần lưu gần nhất: {new Date(updatedAt).toLocaleTimeString()} {new Date(updatedAt).toLocaleDateString()}</span>
                ) : (
                  <span>Ghi chú riêng bảo mật lưu trữ tại VPS</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPreview(!preview)}
              className={`rounded-lg p-2 text-xs font-semibold transition ${preview ? 'bg-zen-blue/20 text-blue-300' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              title="Chế độ xem trước"
            >
              <Eye className="size-4" />
            </button>
            <button
              onClick={handleCopy}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Sao chép toàn bộ"
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </button>
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Lưu
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 className="size-6 animate-spin text-zen-blue" />
            </div>
          ) : preview ? (
            <div className="h-full overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 font-mono text-sm leading-relaxed text-slate-300">
              {content ? content : <span className="italic text-slate-600">Chưa có nội dung ghi chú nào...</span>}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="Nhập ghi chú máy chủ, TODO, tài khoản nháp, cổng port cần nhớ hoặc thông tin cấu hình... (Tự động lưu vào VPS)"
              className="h-full w-full resize-none rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800/80 px-5 py-3 text-xs text-slate-500">
          <div>
            Ký tự: <span className="font-semibold text-slate-400">{content.length}</span> | Dòng: <span className="font-semibold text-slate-400">{content ? content.split('\n').length : 0}</span>
          </div>
          <div className="text-[11px]">
            Được lưu mã hóa cục bộ trong máy chủ (`server-notes.json`)
          </div>
        </div>
      </div>
    </div>
  );
}
