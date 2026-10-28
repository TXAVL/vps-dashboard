// ZenPanel - SecureFolder: khoá thư mục chống sửa / xoá / thêm file trái phép (kể cả khi website bị hack)
import { useState } from 'react';
import { Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, IconButton, Notice, Select, Spinner } from '../components/ui';
import { del, post } from '../lib/api';
import { formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { PathInput } from '../components/PathInput';

type LockMode = 'full' | 'content' | 'top';
const MODES: Record<LockMode, { label: string; desc: string }> = {
  full: { label: 'Khoá toàn bộ (khuyên dùng)', desc: 'Không sửa, xoá hay thêm bất kỳ file / thư mục nào bên trong' },
  content: { label: 'Chỉ khoá file có sẵn', desc: 'File hiện có không sửa / xoá được; vẫn tạo được file mới (hợp với cache, log)' },
  top: { label: 'Chỉ khoá thư mục gốc', desc: 'Chặn thêm / xoá file ở cấp ngoài cùng; file bên trong vẫn sửa được' },
};

interface Folder {
  id: string;
  path: string;
  mode?: LockMode;
  excludes?: string[];
  note: string;
  createdAt: string;
  lockedAt: string | null;
  exists: boolean;
  locked: boolean | null;
}

export function SecureFolders({ sites }: { sites: { path: string; site: string | null }[] }) {
  const folders = useApi<Folder[]>('/api/security/secure-folders');
  const [path, setPath] = useState('');
  const [mode, setMode] = useState<LockMode>('full');
  const [excludes, setExcludes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { run, confirm } = useFeedback();

  const add = async (target: string) => {
    const ok = await confirm({
      title: 'Khoá thư mục chống sửa',
      message: (
        <>
          Khoá <b className="mono">{target}</b> theo chế độ <b>{MODES[mode].label}</b>: {MODES[mode].desc}. Áp dụng cả với website bị hack lẫn chính bạn cho tới khi mở khoá.{excludes.trim() && <> Các thư mục vẫn cho ghi: <b className="mono">{excludes.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).join(', ')}</b>.</>}
        </>
      ),
      confirmLabel: 'Khoá',
    });
    if (!ok) return;
    setBusy('add');
    const res = await run(() => post('/api/security/secure-folders', { path: target, mode, excludes: excludes.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) }), 'Đã khoá thư mục');
    setBusy(null);
    if (res !== undefined) {
      setPath('');
      await folders.reload();
    }
  };

  const toggle = async (f: Folder) => {
    setBusy(f.id);
    await run(() => post(`/api/security/secure-folders/${f.id}/${f.locked ? 'unlock' : 'lock'}`), f.locked ? 'Đã mở khoá, nhớ khoá lại sau khi cập nhật code' : 'Đã khoá');
    setBusy(null);
    await folders.reload();
  };

  const free = sites.filter((s) => !folders.data?.some((f) => f.path.toLowerCase() === s.path.toLowerCase()));

  return (
    <Card title="Khoá chống sửa file (SecureFolder)" icon={Lock} bodyClassName="p-0">
      <div className="space-y-3 border-b border-slate-800/80 p-4">
        <p className="text-xs leading-relaxed text-slate-400">
          Khoá mã nguồn website ở chế độ chỉ đọc ngay tại hệ điều hành (Linux: <code className="mono">chattr +i</code>, Windows: luật DENY). Dù webshell chạy được, nó cũng không ghi hay sửa được file. Cần cập nhật code: <b>mở khoá → deploy → khoá lại</b>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PathInput className="min-w-[260px] flex-1" value={path} onChange={setPath} onSubmit={() => path.trim() && void add(path.trim())} suggestions={sites.map((x) => x.path)} placeholder="Đường dẫn thư mục cần khoá (gõ để gợi ý hoặc bấm Duyệt)" />
          <Button variant="primary" icon={Plus} loading={busy === 'add'} disabled={!path.trim()} onClick={() => void add(path.trim())}>
            Khoá thư mục
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-300">Chế độ khoá</div>
            <Select value={mode} onChange={(e) => setMode(e.target.value as LockMode)}>
              {(Object.keys(MODES) as LockMode[]).map((m) => <option key={m} value={m}>{MODES[m].label}</option>)}
            </Select>
            <p className="mt-1 text-[11px] text-slate-500">{MODES[mode].desc}</p>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-300">Thư mục con vẫn cho ghi (tuỳ chọn)</div>
            <input className="input mono" value={excludes} onChange={(e) => setExcludes(e.target.value)} placeholder="wp-content/uploads, wp-content/cache" />
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
              {['wp-content/uploads', 'wp-content/cache', 'storage', 'cache', 'tmp'].map((x) => (
                <button key={x} type="button" className="rounded-md border border-slate-700 px-1.5 py-0.5 text-slate-400 hover:text-white" onClick={() => setExcludes((cur) => (cur.split(/[\n,]/).map((v) => v.trim()).includes(x) ? cur : cur ? `${cur}, ${x}` : x))}>+ {x}</button>
              ))}
            </div>
          </div>
        </div>
        {mode !== 'full' && <Notice tone="amber">Chế độ này để lại khe hở: kẻ tấn công vẫn có thể thêm hoặc sửa một phần. Chỉ chọn khi website cần ghi file.</Notice>}
        {free.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            Chọn nhanh website:
            {free.map((s) => (
              <button key={s.path} type="button" onClick={() => setPath(s.path)} className="rounded-lg border border-slate-700 bg-ink-950/60 px-2 py-1 text-slate-300 hover:border-zen-blue">
                {s.site ?? s.path}
              </button>
            ))}
          </div>
        )}
      </div>
      {folders.error ? (
        <div className="p-4">
          <ErrorBox message={folders.error} onRetry={folders.reload} />
        </div>
      ) : !folders.data ? (
        <Spinner />
      ) : folders.data.length === 0 ? (
        <EmptyState icon={Lock} title="Chưa khoá thư mục nào" description="Khuyên dùng cho website ít thay đổi (WordPress đã hoàn thiện, web tĩnh, mã nguồn ứng dụng)." />
      ) : (
        <div className="divide-y divide-slate-800/80">
          {folders.data.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              {f.locked ? <Lock className="size-5 text-emerald-400" /> : <LockOpen className="size-5 text-amber-400" />}
              <div className="min-w-0 flex-1">
                <div className="mono truncate text-slate-100">{f.path}</div>
                <div className="text-xs text-slate-500">
                  {MODES[f.mode ?? 'full'].label} · {f.exists ? (f.lockedAt ? `khoá ${formatRelative(f.lockedAt)}` : 'chưa khoá') : 'thư mục không còn tồn tại'}
                  {f.excludes?.length ? ` · cho ghi: ${f.excludes.join(', ')}` : ''}
                  {f.note && ` · ${f.note}`}
                </div>
              </div>
              <Badge tone={f.locked ? 'green' : f.locked === null ? 'slate' : 'amber'}>{f.locked ? 'Đang khoá' : f.locked === null ? 'Không đọc được' : 'Đang mở'}</Badge>
              <Button size="xs" variant={f.locked ? 'ghost' : 'primary'} icon={f.locked ? LockOpen : Lock} loading={busy === f.id} disabled={!f.exists} onClick={() => void toggle(f)}>
                {f.locked ? 'Mở khoá' : 'Khoá'}
              </Button>
              <IconButton
                icon={Trash2}
                title="Gỡ khỏi danh sách (tự mở khoá)"
                className="hover:text-zen-red"
                onClick={async () => {
                  if (!(await confirm({ title: 'Gỡ khỏi SecureFolder', message: 'Thư mục sẽ được mở khoá và không còn được bảo vệ.', danger: true, confirmLabel: 'Gỡ' }))) return;
                  await run(() => del(`/api/security/secure-folders/${f.id}`), 'Đã gỡ');
                  await folders.reload();
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
