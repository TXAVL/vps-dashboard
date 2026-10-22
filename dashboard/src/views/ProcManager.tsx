// ZenPanel - Ứng dụng chạy nền (thay PM2): bot / worker 24/24, tự khởi động lại, log realtime, CPU/RAM
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Bot, Download, Eraser, FileText, Import, Pause, Pencil, Play, Plus, RefreshCw, RotateCw, Search, Square, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Select, Spinner, StatusDot, Toggle, cn, td, th, tr, type Tone } from '../components/ui';
import { WindowMockup } from '../components/layout/WindowMockup';
import { del, downloadFile, get, post, put } from '../lib/api';
import { formatBytes, formatDuration, formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';

interface ManagedProc {
  id: string;
  name: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  autostart: boolean;
  restart: 'always' | 'on-failure' | 'never';
  restartDelaySec: number;
  maxMemoryMB: number;
  status: 'running' | 'stopped' | 'errored' | 'restarting';
  pid: number | null;
  uptimeSec: number;
  restarts: number;
  lastExit: { code: number | null; signal: string | null; at: string } | null;
  cpu: number | null;
  memory: number | null;
}

const STATUS: Record<ManagedProc['status'], { tone: Tone; label: string }> = {
  running: { tone: 'green', label: 'Đang chạy' },
  stopped: { tone: 'slate', label: 'Đã dừng' },
  errored: { tone: 'red', label: 'Lỗi' },
  restarting: { tone: 'amber', label: 'Đang khởi động lại' },
};

const envToText = (env: Record<string, string>) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
const textToEnv = (text: string) =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );

function ProcForm({ proc, onClose, onSaved }: { proc?: ManagedProc; onClose: () => void; onSaved: () => void }) {
  const { info } = usePanel();
  const windows = info?.os.family === 'windows';
  const [form, setForm] = useState({
    name: proc?.name ?? '',
    command: proc?.command ?? '',
    cwd: proc?.cwd ?? (windows ? 'C:\\bots\\my-bot' : '/root/my-bot'),
    env: envToText(proc?.env ?? {}),
    autostart: proc?.autostart ?? true,
    restart: proc?.restart ?? 'always',
    restartDelaySec: String(proc?.restartDelaySec ?? 3),
    maxMemoryMB: String(proc?.maxMemoryMB ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const body = { ...form, env: textToEnv(form.env), restartDelaySec: Number(form.restartDelaySec), maxMemoryMB: Number(form.maxMemoryMB) };
    const ok = await run(() => (proc ? put(`/api/procs/${proc.id}`, body) : post('/api/procs', body)), proc ? 'Đã lưu (đang chạy thì đã khởi động lại)' : `Đã tạo và chạy "${form.name}"`);
    setSaving(false);
    if (ok) {
      onSaved();
      onClose();
    }
  };

  const examples = windows
    ? ['node index.js', 'python bot.py', 'npm start', '.\\venv\\Scripts\\python.exe main.py']
    : ['node index.js', 'python3 bot.py', 'npm start', './venv/bin/python main.py', 'bun run index.ts'];

  return (
    <Modal open onClose={onClose} title={proc ? `Sửa "${proc.name}"` : 'Thêm ứng dụng chạy nền'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên">
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="discord-bot" />
          </Field>
          <Field label="Thư mục làm việc (cwd)">
            <input className="input mono" required value={form.cwd} onChange={(e) => setForm({ ...form, cwd: e.target.value })} />
          </Field>
        </div>
        <Field label={`Lệnh chạy (${windows ? 'PowerShell' : 'Bash'})`}>
          <input className="input mono" required value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="node index.js" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button key={ex} type="button" onClick={() => setForm({ ...form, command: ex })} className="mono rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">
              {ex}
            </button>
          ))}
        </div>
        <Field label="Biến môi trường" hint="Mỗi dòng KEY=value (vd BOT_TOKEN=...). Dòng bắt đầu bằng # bị bỏ qua.">
          <textarea className="input mono h-24" value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} placeholder={'NODE_ENV=production\nBOT_TOKEN=...'} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tự khởi động lại">
            <Select value={form.restart} onChange={(e) => setForm({ ...form, restart: e.target.value as ManagedProc['restart'] })}>
              <option value="always">Luôn luôn</option>
              <option value="on-failure">Chỉ khi lỗi (exit ≠ 0)</option>
              <option value="never">Không</option>
            </Select>
          </Field>
          <Field label="Chờ trước khi chạy lại (giây)">
            <input className="input mono" type="number" min={0} max={300} value={form.restartDelaySec} onChange={(e) => setForm({ ...form, restartDelaySec: e.target.value })} />
          </Field>
          <Field label="Giới hạn RAM (MB)" hint="Vượt thì tự khởi động lại, 0 = tắt">
            <input className="input mono" type="number" min={0} value={form.maxMemoryMB} onChange={(e) => setForm({ ...form, maxMemoryMB: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
          <span>
            <span className="block font-semibold text-slate-100">Tự chạy khi khởi động máy chủ</span>
            <span className="block text-xs text-slate-500">VPS khởi động lại, ZenPanel tự chạy lại ứng dụng này</span>
          </span>
          <Toggle checked={form.autostart} onChange={(autostart) => setForm({ ...form, autostart })} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" variant="primary" loading={saving} icon={proc ? Pencil : Play}>
            {proc ? 'Lưu' : 'Tạo & chạy'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Log realtime: cập nhật mỗi 1.5 giây, có tạm dừng, lọc, xoá, tải về */
function LogViewer({ proc, onClose }: { proc: ManagedProc; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [onlyErr, setOnlyErr] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { confirm, run } = useFeedback();

  useEffect(() => {
    if (paused) return;
    let stop = false;
    const tick = async () => {
      const res = await get<{ lines: string[] }>(`/api/procs/${proc.id}/log?lines=1000`).catch(() => null);
      if (stop) return;
      if (res) setLines(res.lines);
      setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [proc.id, paused]);

  useEffect(() => {
    if (box.current && stick.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    return lines.filter((l) => (!onlyErr || l.includes('[err]') || l.includes('[sys]')) && (!q || l.toLowerCase().includes(q)));
  }, [lines, filter, onlyErr]);

  const clear = async () => {
    if (!(await confirm({ title: 'Xoá log', message: `Xoá toàn bộ log của "${proc.name}"?`, danger: true, confirmLabel: 'Xoá log' }))) return;
    await run(() => post(`/api/procs/${proc.id}/clear-log`), 'Đã xoá log');
    setLines([]);
  };

  const download = async () => {
    const res = await run(() => get<{ path: string }>(`/api/procs/${proc.id}/log-path`));
    if (res) await run(() => downloadFile(res.path));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6">
      <WindowMockup
        className="h-full w-full max-w-6xl"
        url={`${proc.name} · pid ${proc.pid ?? '-'}`}
        title={paused ? 'Đã tạm dừng' : 'Realtime'}
        actions={
          <Button size="xs" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        }
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-ink-900/80 px-3 py-2">
            <Button size="xs" variant={paused ? 'success' : 'soft'} icon={paused ? Play : Pause} onClick={() => setPaused(!paused)}>
              {paused ? 'Tiếp tục' : 'Tạm dừng log'}
            </Button>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <Toggle checked={onlyErr} onChange={setOnlyErr} /> Chỉ lỗi
            </label>
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
              <input className="input mono h-8 w-48 py-0 pl-7 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Lọc log..." />
            </div>
            <IconButton icon={Download} title="Tải file log" onClick={() => void download()} />
            <IconButton icon={Eraser} title="Xoá log" className="hover:text-zen-red" onClick={() => void clear()} />
          </div>
          <div
            ref={box}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="mono min-h-0 flex-1 overflow-auto bg-[#0a0e17] p-3 text-xs leading-relaxed"
          >
            {shown.length === 0 ? (
              <span className="text-slate-500">{lines.length ? 'Không có dòng nào khớp bộ lọc.' : 'Chưa có log.'}</span>
            ) : (
              shown.map((line, i) => {
                const m = /^(\S+) \[(out|err|sys)\] (.*)$/.exec(line);
                if (!m) return <div key={i} className="whitespace-pre-wrap break-words text-slate-300">{line}</div>;
                const [, at, stream, text] = m;
                return (
                  <div key={i} className="flex gap-2 whitespace-pre-wrap break-words">
                    <span className="shrink-0 text-slate-600">{new Date(at).toLocaleTimeString('vi-VN')}</span>
                    <span className={cn('min-w-0', stream === 'err' ? 'text-red-300' : stream === 'sys' ? 'text-blue-300' : 'text-slate-200')}>{text}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </WindowMockup>
    </div>
  );
}

function Pm2Import({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const list = useApi<{ name: string; command: string; cwd: string; status: string }[]>('/api/procs/pm2/list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removeFromPm2, setRemove] = useState(true);
  const [busy, setBusy] = useState(false);
  const { run } = useFeedback();

  const submit = async () => {
    setBusy(true);
    const res = await run(() => post<{ imported: string[] }>('/api/procs/pm2/import', { names: [...selected], removeFromPm2 }));
    setBusy(false);
    if (res) {
      onDone();
      onClose();
    }
  };

  return (
    <Modal open onClose={onClose} title="Chuyển ứng dụng từ PM2 sang ZenPanel" size="lg">
      {list.error ? (
        <ErrorBox message={list.error} />
      ) : !list.data ? (
        <Spinner label="Đang đọc pm2 jlist..." />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Bot} title="PM2 không có ứng dụng nào" />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {list.data.map((app) => (
              <label key={app.name} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-zen-blue"
                  checked={selected.has(app.name)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(app.name);
                    else next.delete(app.name);
                    setSelected(next);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-white">
                    {app.name} <Badge tone={app.status === 'online' ? 'green' : 'slate'}>{app.status}</Badge>
                  </span>
                  <span className="mono block truncate text-xs text-slate-400">{app.command}</span>
                  <span className="mono block truncate text-xs text-slate-500">{app.cwd}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-ink-950/50 px-4 py-3 text-sm">
            <span>
              <span className="block font-semibold text-slate-100">Gỡ khỏi PM2 và chạy ngay bằng ZenPanel</span>
              <span className="block text-xs text-slate-500">Tránh chạy 2 bản cùng lúc. Tắt nếu muốn tự dừng PM2 sau.</span>
            </span>
            <Toggle checked={removeFromPm2} onChange={setRemove} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" icon={Import} loading={busy} disabled={!selected.size} onClick={() => void submit()}>
              Chuyển {selected.size || ''} ứng dụng
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function ProcManager() {
  const { data, error, loading, reload } = useApi<ManagedProc[]>('/api/procs', 5000);
  const [editing, setEditing] = useState<ManagedProc | 'new' | null>(null);
  const [logOf, setLogOf] = useState<ManagedProc | null>(null);
  const [pm2, setPm2] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, run } = useFeedback();

  const act = async (proc: ManagedProc, action: 'start' | 'stop' | 'restart', label: string) => {
    setBusy(proc.id);
    await run(() => post(`/api/procs/${proc.id}/${action}`), `${label}: ${proc.name}`);
    setBusy(null);
    await reload();
  };

  const remove = async (proc: ManagedProc) => {
    if (!(await confirm({ title: 'Xoá ứng dụng', message: <>Dừng và xoá <b>{proc.name}</b> khỏi ZenPanel (file của bot không bị xoá)?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/procs/${proc.id}`), 'Đã xoá');
    await reload();
  };

  const running = (data ?? []).filter((p) => p.status === 'running').length;

  return (
    <>
      <PageHeader
        title="Ứng dụng chạy nền"
        description={`Chạy bot / worker 24/24, tự khởi động lại — thay thế PM2 · ${running}/${data?.length ?? 0} đang chạy`}
        icon={Bot}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
              Làm mới
            </Button>
            <Button icon={Import} onClick={() => setPm2(true)}>
              Nhập từ PM2
            </Button>
            <Button icon={Plus} variant="primary" onClick={() => setEditing('new')}>
              Thêm ứng dụng
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Notice>
          Mỗi ứng dụng chạy bằng lệnh của bạn (node, python, bun, npm start...), log lưu tại thư mục dữ liệu ZenPanel (tự xoay vòng 10MB). Ứng dụng chết sẽ được chạy lại, chết liên tục thì
          ZenPanel chờ lâu dần để tránh treo máy. Bật "Tự chạy khi khởi động" để bot tự lên sau khi VPS khởi động lại.
        </Notice>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        !error && <Spinner />
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="Chưa có ứng dụng nào"
            description="Thêm bot Discord/Telegram, worker, API Node.js/Python... hoặc chuyển nguyên các app đang chạy bằng PM2 sang."
            action={
              <div className="flex gap-2">
                <Button icon={Import} onClick={() => setPm2(true)}>
                  Nhập từ PM2
                </Button>
                <Button icon={Plus} variant="primary" onClick={() => setEditing('new')}>
                  Thêm ứng dụng
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Ứng dụng</th>
                  <th className={th}>Trạng thái</th>
                  <th className={th}>Uptime</th>
                  <th className={cn(th, 'text-right')}>CPU</th>
                  <th className={cn(th, 'text-right')}>RAM</th>
                  <th className={cn(th, 'text-right')}>Khởi động lại</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className={cn(tr, busy === p.id && 'opacity-50')}>
                    <td className={cn(td, 'max-w-[340px]')}>
                      <div className="flex items-center gap-2 font-semibold text-slate-100">
                        <StatusDot tone={STATUS[p.status].tone} pulse={p.status === 'running'} />
                        {p.name}
                        {p.autostart && <Badge tone="blue">auto</Badge>}
                      </div>
                      <div className="mono truncate text-xs text-slate-500" data-tip={`${p.cwd}\n${p.command}`}>
                        {p.command}
                      </div>
                    </td>
                    <td className={td}>
                      <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                      {p.lastExit && p.status !== 'running' && (
                        <div className="mt-1 text-xs text-slate-500">
                          exit {p.lastExit.code ?? p.lastExit.signal} · {formatRelative(p.lastExit.at)}
                        </div>
                      )}
                    </td>
                    <td className={cn(td, 'mono text-xs text-slate-400')}>{p.status === 'running' ? formatDuration(p.uptimeSec) : '—'}</td>
                    <td className={cn(td, 'mono text-right text-slate-300')}>{p.cpu !== null ? `${p.cpu.toFixed(1)}%` : '—'}</td>
                    <td className={cn(td, 'mono text-right text-slate-300')}>
                      {p.memory !== null ? formatBytes(p.memory) : '—'}
                      {p.maxMemoryMB > 0 && <div className="text-[10px] text-slate-500">/ {p.maxMemoryMB} MB</div>}
                    </td>
                    <td className={cn(td, 'mono text-right text-slate-400')}>{p.restarts}</td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <IconButton icon={FileText} title="Xem log realtime" onClick={() => setLogOf(p)} />
                      {p.status === 'running' || p.status === 'restarting' ? (
                        <>
                          <IconButton icon={RotateCw} title="Khởi động lại" onClick={() => void act(p, 'restart', 'Đã khởi động lại')} />
                          <IconButton icon={Square} title="Dừng" className="hover:text-zen-red" onClick={() => void act(p, 'stop', 'Đã dừng')} />
                        </>
                      ) : (
                        <IconButton icon={Play} title="Chạy" className="hover:text-zen-green" onClick={() => void act(p, 'start', 'Đã chạy')} />
                      )}
                      <IconButton icon={Pencil} title="Sửa" onClick={() => setEditing(p)} />
                      <IconButton icon={Trash2} title="Xoá" className="hover:text-zen-red" onClick={() => void remove(p)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && <ProcForm proc={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
      {logOf && <LogViewer proc={logOf} onClose={() => setLogOf(null)} />}
      {pm2 && <Pm2Import onClose={() => setPm2(false)} onDone={() => void reload()} />}
    </>
  );
}
