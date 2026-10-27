// ZenPanel - Sao lưu & khôi phục: website, thư mục, database, cấu hình panel + lịch tự động
import { useState } from 'react';
import { Archive, CalendarClock, Download, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, PageHeader, Select, Spinner, Toggle, cn, td, th, tr } from '../components/ui';
import { del, post, put } from '../lib/api';
import { formatBytes, formatDate, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Job } from '../lib/types';

type Kind = 'site' | 'directory' | 'database' | 'panel';
interface Target { kind: Kind; ref?: string; database?: string; format?: 'tar.gz' | 'zip' }
interface BackupItem { id: string; name: string; target: Target; file: string; size: number; createdAt: string; durationSec: number; scheduleId: string | null; note: string; exists: boolean }
interface Schedule { id: string; name: string; target: Target; every: 'hours' | 'daily' | 'weekly'; hours: number; time: string; day: number; keep: number; enabled: boolean; lastRunAt: string | null; lastStatus: 'success' | 'error' | null; lastError: string | null }
interface Data {
  items: BackupItem[];
  schedules: Schedule[];
  sources: { sites: { domain: string; root: string }[]; databases: { appId: string; name: string; engine: string; running: boolean }[]; dataDir: string; backupDir: string };
}

const KIND_LABEL: Record<Kind, string> = { site: 'Website', directory: 'Thư mục', database: 'Database', panel: 'Cấu hình ZenPanel' };
const DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function getFormatBadge(file: string) {
  if (file.endsWith('.tar.gz')) return <Badge tone="green">.tar.gz</Badge>;
  if (file.endsWith('.zip')) return <Badge tone="blue">.zip</Badge>;
  if (file.endsWith('.sql.gz')) return <Badge tone="amber">.sql.gz</Badge>;
  if (file.endsWith('.mongo.gz')) return <Badge tone="amber">.mongo.gz</Badge>;
  if (file.endsWith('.rdb')) return <Badge tone="purple">.rdb</Badge>;
  return null;
}

function TargetFields({ value, onChange, sources }: { value: Target; onChange: (t: Target) => void; sources: Data['sources'] }) {
  return (
    <>
      <Field label="Loại sao lưu">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} type="button" onClick={() => onChange({ ...value, kind: k })} className={cn('rounded-xl border px-3 py-2 text-xs font-semibold transition', value.kind === k ? 'border-zen-blue bg-zen-blue/15 text-white' : 'border-slate-700/60 text-slate-400 hover:text-white')}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>
      {value.kind === 'site' && (
        <Field label="Website">
          <Select value={value.ref ?? ''} onChange={(e) => onChange({ ...value, ref: e.target.value })}>
            <option value="">— Chọn website —</option>
            {sources.sites.map((s) => <option key={s.domain} value={s.domain}>{s.domain} ({s.root})</option>)}
          </Select>
        </Field>
      )}
      {value.kind === 'directory' && (
        <Field label="Đường dẫn thư mục" hint="Đường dẫn tuyệt đối, vd /var/www/app hoặc D:\\data">
          <input className="input mono" value={value.ref ?? ''} onChange={(e) => onChange({ ...value, ref: e.target.value })} />
        </Field>
      )}
      {value.kind === 'database' && (
        <>
          <Field label="Database server">
            <Select value={value.ref ?? ''} onChange={(e) => onChange({ ...value, ref: e.target.value })}>
              <option value="">— Chọn server —</option>
              {sources.databases.map((d) => <option key={d.appId} value={d.appId} disabled={!d.running}>{d.name}{d.running ? '' : ' (đang dừng)'}</option>)}
            </Select>
          </Field>
          <Field label="Tên database (tuỳ chọn)" hint="Để trống = sao lưu toàn bộ server">
            <input className="input mono" value={value.database ?? ''} onChange={(e) => onChange({ ...value, database: e.target.value || undefined })} />
          </Field>
        </>
      )}
      {value.kind === 'panel' && <p className="text-xs text-slate-400">Sao lưu {sources.dataDir} (tài khoản, cấu hình app, website, AI key, lịch...) — bỏ qua gói phiên bản và log.</p>}

      {value.kind !== 'database' && (
        <Field label="Định dạng nén" hint="Chọn .tar.gz để bảo toàn phân quyền Linux hoặc .zip để dễ mở ngay trên máy tính">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onChange({ ...value, format: 'tar.gz' })}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition',
                (!value.format || value.format === 'tar.gz')
                  ? 'border-emerald-500 bg-emerald-500/15 text-white ring-1 ring-emerald-500/30'
                  : 'border-slate-700/60 text-slate-400 hover:text-white',
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span>.tar.gz (Gzip)</span>
                <Badge tone="green">Khuyên dùng VPS</Badge>
              </div>
              <span className="text-[11px] text-slate-400">Giữ nguyên 100% quyền file Linux, user & symlink</span>
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, format: 'zip' })}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition',
                value.format === 'zip'
                  ? 'border-sky-500 bg-sky-500/15 text-white ring-1 ring-sky-500/30'
                  : 'border-slate-700/60 text-slate-400 hover:text-white',
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span>.zip (Zip Archive)</span>
                <Badge tone="blue">Tiện tải về máy</Badge>
              </div>
              <span className="text-[11px] text-slate-400">Mở đúp chuột trực tiếp trên Windows / macOS</span>
            </button>
          </div>
        </Field>
      )}
    </>
  );
}

export default function Backups() {
  const { data, error, reload } = useApi<Data>('/api/backups', 15000);
  const [creating, setCreating] = useState<Target | null>(null);
  const [scheduling, setScheduling] = useState<Partial<Schedule> & { target: Target } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState<{ item: BackupItem; dest: string } | null>(null);
  const { confirm, run } = useFeedback();
  const { runJob } = useJobs();

  const totalSize = (data?.items ?? []).reduce((n, b) => n + (b.exists ? b.size : 0), 0);

  const create = async () => {
    if (!creating) return;
    const t = creating;
    setCreating(null);
    await runJob(() => post<Job>('/api/backups', t), () => void reload());
  };
  const download = async (b: BackupItem) => {
    const res = await run(() => post<{ url: string }>(`/api/backups/${b.id}/download`));
    if (res) window.open(res.url, '_blank');
  };
  const remove = async (b: BackupItem) => {
    if (!(await confirm({ title: 'Xoá bản sao lưu', message: `Xoá vĩnh viễn ${b.name} (${formatBytes(b.size)})?`, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/backups/${b.id}`), 'Đã xoá bản sao lưu');
    await reload();
  };
  const bulkDelete = async () => {
    const list = (data?.items ?? []).filter((b) => picked.has(b.id));
    if (!list.length) return;
    const total = list.reduce((n, b) => n + (b.exists ? b.size : 0), 0);
    if (!(await confirm({ title: `Xoá ${list.length} bản sao lưu`, message: `Giải phóng ${formatBytes(total)}. Không thể khôi phục sau khi xoá.`, danger: true, confirmLabel: 'Xoá tất cả' }))) return;
    await run(() => post('/api/backups/bulk-delete', { ids: [...picked] }), `Đã xoá ${list.length} bản sao lưu`);
    setPicked(new Set());
    await reload();
  };

  const restore = async () => {
    if (!restoring) return;
    const { item, dest } = restoring;
    setRestoring(null);
    await runJob(() => post<Job>(`/api/backups/${item.id}/restore`, { destination: dest || undefined }));
  };
  const saveSchedule = async () => {
    if (!scheduling) return;
    const body = scheduling;
    const ok = await run(() => (body.id ? put(`/api/backups/schedules/${body.id}`, body) : post('/api/backups/schedules', body)), 'Đã lưu lịch sao lưu');
    if (ok !== undefined) {
      setScheduling(null);
      await reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Sao lưu & Khôi phục"
        description="Sao lưu website, database, thư mục và cấu hình ZenPanel; lên lịch tự động, giữ số bản mong muốn"
        icon={Archive}
        actions={
          <div className="flex gap-2">
            <Button icon={CalendarClock} onClick={() => setScheduling({ target: { kind: 'site' }, every: 'daily', time: '02:00', keep: 7, hours: 6, day: 0, enabled: true })}>
              Lịch tự động
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating({ kind: 'site' })}>
              Sao lưu ngay
            </Button>
          </div>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        !error && <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Bản sao lưu', String(data.items.length)],
              ['Tổng dung lượng', formatBytes(totalSize)],
              ['Lịch đang bật', String(data.schedules.filter((s) => s.enabled).length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-slate-700/50 bg-ink-950/50 p-4">
                <div className="text-xs text-slate-500">{k}</div>
                <div className="mono mt-1 text-2xl font-black text-white">{v}</div>
              </div>
            ))}
          </div>

          {data.schedules.length > 0 && (
            <Card title="Lịch sao lưu tự động" icon={CalendarClock} bodyClassName="p-0">
              <div className="divide-y divide-slate-800/80">
                {data.schedules.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <Toggle checked={s.enabled} onChange={(v) => void run(() => post('/api/backups/schedules', { ...s, enabled: v })).then(reload)} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        {s.every === 'hours' ? `Mỗi ${s.hours} giờ` : s.every === 'daily' ? `Hằng ngày ${s.time}` : `${DAYS[s.day]} hằng tuần ${s.time}`} · giữ {s.keep} bản
                        {s.lastRunAt && <> · lần cuối {formatRelative(s.lastRunAt)}</>}
                      </div>
                      {s.lastStatus === 'error' && <div className="text-xs text-red-300">{s.lastError}</div>}
                    </div>
                    {s.lastStatus && <Badge tone={s.lastStatus === 'success' ? 'green' : 'red'}>{s.lastStatus === 'success' ? 'OK' : 'Lỗi'}</Badge>}
                    <IconButton icon={Play} title="Chạy ngay" onClick={() => void runJob(() => post<Job>(`/api/backups/schedules/${s.id}/run`), () => void reload())} />
                    <IconButton icon={CalendarClock} title="Sửa" onClick={() => setScheduling(s)} />
                    <IconButton icon={Trash2} title="Xoá lịch" className="hover:text-zen-red" onClick={() => void run(() => del(`/api/backups/schedules/${s.id}`), 'Đã xoá lịch').then(reload)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card
            title="Các bản sao lưu"
            icon={Archive}
            bodyClassName="p-0"
            actions={picked.size > 0 && <Button size="xs" variant="danger" icon={Trash2} onClick={() => void bulkDelete()}>Xoá {picked.size} bản đã chọn</Button>}
          >
            {data.items.length === 0 ? (
              <EmptyState icon={Archive} title="Chưa có bản sao lưu" description={`File lưu tại ${data.sources.backupDir}`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead><tr><th className={cn(th, 'w-10')}><input type="checkbox" className="accent-zen-blue size-4" checked={picked.size > 0 && picked.size === data.items.length} onChange={(e) => setPicked(e.target.checked ? new Set(data.items.map((b) => b.id)) : new Set())} /></th><th className={th}>Nội dung</th><th className={th}>Dung lượng</th><th className={th}>Thời gian</th><th className={cn(th, 'text-right')}>Thao tác</th></tr></thead>
                  <tbody>
                    {data.items.map((b) => (
                      <tr key={b.id} className={cn(tr, !b.exists && 'opacity-50')}>
                        <td className={td}><input type="checkbox" className="accent-zen-blue size-4" checked={picked.has(b.id)} onChange={() => { const next = new Set(picked); if (next.has(b.id)) next.delete(b.id); else next.add(b.id); setPicked(next); }} /></td>
                        <td className={td}>
                          <div className="flex items-center gap-2 font-semibold text-slate-100">
                            {b.name} <Badge tone="slate">{KIND_LABEL[b.target.kind]}</Badge>
                            {getFormatBadge(b.file)}
                            {b.scheduleId && <Badge tone="blue">Tự động</Badge>}
                            {!b.exists && <Badge tone="red">Mất file</Badge>}
                          </div>
                          <div className="mono truncate text-xs text-slate-500">{b.file}</div>
                        </td>
                        <td className={cn(td, 'mono text-slate-300')}>{formatBytes(b.size)}</td>
                        <td className={cn(td, 'text-xs text-slate-400')}>{formatDate(b.createdAt)}<div className="text-slate-500">{b.durationSec}s</div></td>
                        <td className={cn(td, 'whitespace-nowrap text-right')}>
                          <IconButton icon={Download} title="Tải về" disabled={!b.exists} onClick={() => void download(b)} />
                          <IconButton icon={RotateCcw} title="Khôi phục" disabled={!b.exists} onClick={() => setRestoring({ item: b, dest: '' })} />
                          <IconButton icon={Trash2} title="Xoá" className="hover:text-zen-red" onClick={() => void remove(b)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {data && creating && (
        <Modal open onClose={() => setCreating(null)} title="Sao lưu ngay" footer={<><Button variant="ghost" onClick={() => setCreating(null)}>Huỷ</Button><Button variant="primary" icon={Archive} onClick={() => void create()}>Bắt đầu sao lưu</Button></>}>
          <div className="space-y-4"><TargetFields value={creating} onChange={setCreating} sources={data.sources} /></div>
        </Modal>
      )}

      {data && scheduling && (
        <Modal open onClose={() => setScheduling(null)} title={scheduling.id ? 'Sửa lịch sao lưu' : 'Lịch sao lưu tự động'} footer={<><Button variant="ghost" onClick={() => setScheduling(null)}>Huỷ</Button><Button variant="primary" onClick={() => void saveSchedule()}>Lưu lịch</Button></>}>
          <div className="space-y-4">
            <Field label="Tên lịch (tuỳ chọn)"><input className="input" value={scheduling.name ?? ''} onChange={(e) => setScheduling({ ...scheduling, name: e.target.value })} /></Field>
            <TargetFields value={scheduling.target} onChange={(target) => setScheduling({ ...scheduling, target })} sources={data.sources} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tần suất">
                <Select value={scheduling.every} onChange={(e) => setScheduling({ ...scheduling, every: e.target.value as Schedule['every'] })}>
                  <option value="hours">Mỗi N giờ</option><option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option>
                </Select>
              </Field>
              {scheduling.every === 'hours' ? (
                <Field label="Số giờ"><input type="number" min={1} max={168} className="input" value={scheduling.hours ?? 6} onChange={(e) => setScheduling({ ...scheduling, hours: Number(e.target.value) })} /></Field>
              ) : (
                <Field label="Giờ chạy"><input type="time" className="input" value={scheduling.time ?? '02:00'} onChange={(e) => setScheduling({ ...scheduling, time: e.target.value })} /></Field>
              )}
              {scheduling.every === 'weekly' ? (
                <Field label="Ngày"><Select value={scheduling.day ?? 0} onChange={(e) => setScheduling({ ...scheduling, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
              ) : (
                <Field label="Giữ lại (bản)"><input type="number" min={1} max={100} className="input" value={scheduling.keep ?? 7} onChange={(e) => setScheduling({ ...scheduling, keep: Number(e.target.value) })} /></Field>
              )}
            </div>
          </div>
        </Modal>
      )}

      {restoring && (
        <Modal open onClose={() => setRestoring(null)} title={`Khôi phục ${restoring.item.name}`} size="sm" footer={<><Button variant="ghost" onClick={() => setRestoring(null)}>Huỷ</Button><Button variant="danger" icon={RotateCcw} onClick={() => void restore()}>Khôi phục</Button></>}>
          <div className="space-y-3 text-sm text-slate-300">
            <p>{restoring.item.target.kind === 'database' ? 'Dữ liệu trong database sẽ bị ghi đè bằng bản sao lưu.' : 'File trùng tên ở vị trí gốc sẽ bị ghi đè.'}</p>
            {restoring.item.target.kind !== 'database' && (
              <Field label="Khôi phục vào thư mục khác (tuỳ chọn)" hint="Để trống = về đúng vị trí cũ">
                <input className="input mono" value={restoring.dest} onChange={(e) => setRestoring({ ...restoring, dest: e.target.value })} />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
