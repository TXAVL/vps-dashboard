// ZenPanel - App Repo Modal (Quản lý các nguồn kho ứng dụng bên ngoài)
import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Boxes, Check, Copy, Globe, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Field, IconButton, Modal } from '../components/ui';
import { del, get, post } from '../lib/api';
import type { AppRepo } from '../lib/types';

const SAMPLE_REPO_JSON = `{
  "name": "My Custom VPS Apps",
  "description": "Kho ứng dụng riêng cho dự án và microservices",
  "apps": [
    {
      "id": "my-express-api",
      "name": "My Express API",
      "description": "Dịch vụ backend REST API viết bằng Node.js",
      "category": "web",
      "icon": "Globe",
      "defaultPort": 5000,
      "composeTemplate": "version: '3.8'\\nservices:\\n  api:\\n    image: node:20-alpine\\n    container_name: \${container}\\n    ports:\\n      - \\"\${port}:5000\\"\\n    restart: unless-stopped"
    }
  ]
}`;

export function AppRepoModal({ open, onClose, onReposChanged }: { open: boolean; onClose: () => void; onReposChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const [repos, setRepos] = useState<AppRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [showSample, setShowSample] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const data = await get<AppRepo[]>('/api/apps/repos');
      setRepos(data || []);
    } catch (err: any) {
      toast(err?.message || 'Không thể tải danh sách kho repo', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void fetchRepos();
  }, [open]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast('Vui lòng nhập URL kho repo', 'error');
      return;
    }

    setAdding(true);
    try {
      await post('/api/apps/repos', {
        name: name.trim() || undefined,
        url: url.trim(),
      });
      toast('Đã thêm và đồng bộ kho repo thành công!', 'success');
      setName('');
      setUrl('');
      await fetchRepos();
      onReposChanged();
    } catch (err: any) {
      toast(err?.message || 'Không thể thêm kho repo', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async (repo: AppRepo) => {
    setSyncingId(repo.id);
    try {
      await post(`/api/apps/repos/${repo.id}/sync`);
      toast(`Đã cập nhật kho "${repo.name}"`, 'success');
      await fetchRepos();
      onReposChanged();
    } catch (err: any) {
      toast(err?.message || 'Không thể đồng bộ kho repo', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (repo: AppRepo) => {
    const ok = await confirm({
      title: 'Xóa kho repo',
      message: `Bạn có chắc muốn xóa kho "${repo.name}"? Toàn bộ ứng dụng từ kho này sẽ được gỡ khỏi App Store.`,
      confirmLabel: 'Xóa kho',
      danger: true,
    });
    if (!ok) return;

    try {
      await del(`/api/apps/repos/${repo.id}`);
      toast(`Đã xóa kho "${repo.name}"`, 'success');
      await fetchRepos();
      onReposChanged();
    } catch (err: any) {
      toast(err?.message || 'Không thể xóa kho repo', 'error');
    }
  };

  const copySample = () => {
    navigator.clipboard.writeText(SAMPLE_REPO_JSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Quản lý Kho Repos Ứng Dụng (App Repositories)" size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 text-xs text-indigo-200 leading-relaxed">
          📦 <b>Kho Repos Ngoài:</b> Cho phép bạn kết nối trực tiếp đến các file catalog JSON trên GitHub hoặc server riêng để tự động nhập hàng loạt ứng dụng vào App Store của ZenPanel.
        </div>

        {/* Form thêm Repo mới */}
        <form onSubmit={handleAdd} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Plus className="size-4 text-emerald-400" />
            <span>Thêm kho repo mới:</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên kho (tùy chọn)">
              <input
                className="input"
                placeholder="VD: Kho nội bộ công ty..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="URL Repo JSON" hint="Link raw JSON trên GitHub hoặc HTTP API">
              <input
                className="input mono"
                placeholder="https://raw.githubusercontent.com/.../catalog.json"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowSample(!showSample)}
              className="text-xs font-semibold text-blue-400 hover:underline"
            >
              {showSample ? 'Ẩn mẫu cấu trúc JSON' : 'Xem mẫu cấu trúc JSON để tự tạo kho trên GitHub'}
            </button>

            <Button size="sm" variant="primary" type="submit" loading={adding} icon={Plus}>
              Thêm & Đồng bộ ngay
            </Button>
          </div>

          {showSample && (
            <div className="mt-2 rounded-lg border border-slate-800 bg-black/60 p-3 font-mono text-xs text-slate-300 relative">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-800 text-slate-400">
                <span>catalog.json (Mẫu chuẩn)</span>
                <button
                  type="button"
                  onClick={copySample}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-white"
                >
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  {copied ? 'Đã sao chép' : 'Sao chép mẫu'}
                </button>
              </div>
              <pre className="overflow-x-auto text-[11px] leading-relaxed">{SAMPLE_REPO_JSON}</pre>
            </div>
          )}
        </form>

        {/* Danh sách các Repos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold uppercase tracking-wider text-slate-300">
              Các kho đã kết nối ({repos.length})
            </span>
            <button
              onClick={fetchRepos}
              className="flex items-center gap-1 text-slate-400 hover:text-white"
            >
              <RefreshCw className="size-3.5" />
              Làm mới
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6 text-slate-400">
              <Loader2 className="size-6 animate-spin text-zen-blue" />
            </div>
          ) : repos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 py-8 text-center text-sm text-slate-500">
              Chưa có kho repo ngoài nào được thêm. Bạn có thể thêm link JSON ở trên để nạp thêm lô app!
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/30">
              {repos.map((repo) => {
                const isSyncing = syncingId === repo.id;
                return (
                  <div key={repo.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Boxes className="size-4 text-indigo-400 shrink-0" />
                        <h4 className="font-bold text-white truncate">{repo.name}</h4>
                        <Badge tone="blue">{repo.appCount} ứng dụng</Badge>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 truncate font-mono">
                        <Globe className="size-3 shrink-0 text-slate-500" />
                        <a href={repo.url} target="_blank" rel="noreferrer" className="truncate hover:text-blue-300 hover:underline">
                          {repo.url}
                        </a>
                      </div>

                      {repo.lastSynced && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Đồng bộ lúc: {new Date(repo.lastSynced).toLocaleString()}
                        </div>
                      )}

                      {repo.error && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zen-red">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span className="truncate">{repo.error}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <Button
                        size="sm"
                        variant="soft"
                        icon={RefreshCw}
                        loading={isSyncing}
                        onClick={() => void handleSync(repo)}
                      >
                        Đồng bộ
                      </Button>
                      <IconButton
                        icon={Trash2}
                        title="Xóa kho repo"
                        className="hover:text-zen-red"
                        onClick={() => void handleDelete(repo)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
