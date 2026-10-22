// ZenPanel - Lịch tác vụ: chạy lệnh theo lịch qua cron (Linux) hoặc Task Scheduler (Windows)
import { useState, type FormEvent } from 'react';
import { CalendarClock, FileText, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, PageHeader, Select, Spinner, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, post, put } from '../lib/api';
import { formatRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { Job, ScheduledTask, TaskSchedule } from '../lib/types';

const DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function scheduleLabel(schedule: TaskSchedule): string {
  switch (schedule.type) {
    case 'minutes':
      return `Mỗi ${schedule.every} phút`;
    case 'hourly':
      return `Mỗi giờ, phút ${String(schedule.minute).padStart(2, '0')}`;
    case 'daily':
      return `Hằng ngày lúc ${schedule.time}`;
    case 'weekly':
      return `${DAYS[schedule.day]} hằng tuần lúc ${schedule.time}`;
    case 'startup':
      return 'Khi máy chủ khởi động';
  }
}

interface FormState {
  name: string;
  command: string;
  type: TaskSchedule['type'];
  every: string;
  minute: string;
  time: string;
  day: string;
}

function toForm(task?: ScheduledTask): FormState {
  const s = task?.schedule;
  return {
    name: task?.name ?? '',
    command: task?.command ?? '',
    type: s?.type ?? 'daily',
    every: s?.type === 'minutes' ? String(s.every) : '15',
    minute: s?.type === 'hourly' ? String(s.minute) : '0',
    time: s?.type === 'daily' || s?.type === 'weekly' ? s.time : '03:00',
    day: s?.type === 'weekly' ? String(s.day) : '0',
  };
}

function toSchedule(f: FormState): TaskSchedule {
  switch (f.type) {
    case 'minutes':
      return { type: 'minutes', every: Number(f.every) };
    case 'hourly':
      return { type: 'hourly', minute: Number(f.minute) };
    case 'daily':
      return { type: 'daily', time: f.time };
    case 'weekly':
      return { type: 'weekly', day: Number(f.day), time: f.time };
    case 'startup':
      return { type: 'startup' };
  }
}

function TaskModal({ task, onClose, onSaved }: { task?: ScheduledTask; onClose: () => void; onSaved: () => void }) {
  const { info } = usePanel();
  const [form, setForm] = useState<FormState>(() => toForm(task));
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();
  const windows = info?.os.family === 'windows';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const body = { name: form.name, command: form.command, schedule: toSchedule(form) };
    const ok = await run(() => (task ? put(`/api/tasks/${task.id}`, body) : post('/api/tasks', body)), task ? 'Đã cập nhật tác vụ' : 'Đã tạo tác vụ');
    setSaving(false);
    if (ok) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal open onClose={onClose} title={task ? `Sửa "${task.name}"` : 'Tạo tác vụ định kỳ'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tên tác vụ">
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sao lưu database hằng đêm" />
        </Field>
        <Field label={`Lệnh (${windows ? 'PowerShell' : 'Bash'})`} hint="Lệnh chạy với quyền của ZenPanel Agent (SYSTEM / root). Output được ghi vào log của tác vụ.">
          <textarea
            className="input mono h-28"
            required
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder={windows ? 'Remove-Item C:\\Temp\\* -Recurse -Force' : 'find /tmp -type f -mtime +7 -delete'}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Lịch chạy">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}>
              <option value="minutes">Mỗi N phút</option>
              <option value="hourly">Mỗi giờ</option>
              <option value="daily">Hằng ngày</option>
              <option value="weekly">Hằng tuần</option>
              <option value="startup">Khi khởi động máy</option>
            </Select>
          </Field>
          {form.type === 'minutes' && (
            <Field label="Mỗi (phút)">
              <input className="input mono" type="number" min={1} max={59} value={form.every} onChange={(e) => setForm({ ...form, every: e.target.value })} />
            </Field>
          )}
          {form.type === 'hourly' && (
            <Field label="Vào phút thứ">
              <input className="input mono" type="number" min={0} max={59} value={form.minute} onChange={(e) => setForm({ ...form, minute: e.target.value })} />
            </Field>
          )}
          {form.type === 'weekly' && (
            <Field label="Ngày">
              <Select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {(form.type === 'daily' || form.type === 'weekly') && (
            <Field label="Giờ chạy">
              <input className="input mono" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {task ? 'Lưu' : 'Tạo tác vụ'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Tasks() {
  const { info } = usePanel();
  const { data, error, loading, reload } = useApi<ScheduledTask[]>('/api/tasks');
  const [editing, setEditing] = useState<ScheduledTask | 'new' | null>(null);
  const [log, setLog] = useState<{ name: string; content: string | null } | null>(null);
  const { confirm, run } = useFeedback();
  const { runJob } = useJobs();

  const toggle = async (task: ScheduledTask, enabled: boolean) => {
    await run(() => post(`/api/tasks/${task.id}/toggle`, { enabled }), enabled ? `Đã bật "${task.name}"` : `Đã tắt "${task.name}"`);
    await reload();
  };

  const remove = async (task: ScheduledTask) => {
    if (!(await confirm({ title: 'Xoá tác vụ', message: <>Xoá tác vụ <b>{task.name}</b> khỏi lịch chạy của hệ thống?</>, danger: true, confirmLabel: 'Xoá' }))) return;
    await run(() => del(`/api/tasks/${task.id}`), 'Đã xoá tác vụ');
    await reload();
  };

  const showLog = async (task: ScheduledTask) => {
    setLog({ name: task.name, content: null });
    const result = await run(() => get<{ log: string }>(`/api/tasks/${task.id}/log`));
    setLog({ name: task.name, content: result?.log || 'Chưa có log. Tác vụ chưa chạy theo lịch lần nào.' });
  };

  return (
    <>
      <PageHeader
        title="Lịch tác vụ"
        description={info?.os.family === 'windows' ? 'Chạy lệnh PowerShell theo lịch bằng Windows Task Scheduler' : 'Chạy lệnh Bash theo lịch bằng cron'}
        icon={CalendarClock}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
              Làm mới
            </Button>
            <Button icon={Plus} variant="primary" onClick={() => setEditing('new')}>
              Tạo tác vụ
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Notice>Ví dụ: sao lưu database lúc 3h sáng, dọn file tạm hằng tuần, khởi động lại dịch vụ mỗi đêm, chạy script khi máy khởi động.</Notice>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Card bodyClassName="p-0">
        {!data ? (
          !error && <Spinner />
        ) : data.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Chưa có tác vụ nào"
            action={
              <Button icon={Plus} variant="primary" onClick={() => setEditing('new')}>
                Tạo tác vụ đầu tiên
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Tác vụ</th>
                  <th className={th}>Lịch chạy</th>
                  <th className={th}>Lần chạy từ panel</th>
                  <th className={th}>Bật</th>
                  <th className={cn(th, 'text-right')}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.map((task) => (
                  <tr key={task.id} className={tr}>
                    <td className={cn(td, 'max-w-[360px]')}>
                      <div className="font-semibold text-slate-100">{task.name}</div>
                      <div className="mono truncate text-xs text-slate-500" data-tip={task.command}>
                        {task.command}
                      </div>
                    </td>
                    <td className={cn(td, 'text-slate-300')}>{scheduleLabel(task.schedule)}</td>
                    <td className={td}>
                      {task.lastRunAt ? (
                        <span className="flex items-center gap-2 text-xs text-slate-400">
                          <Badge tone={task.lastExitCode === 0 ? 'green' : 'red'}>exit {task.lastExitCode}</Badge>
                          {formatRelative(task.lastRunAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Toggle checked={task.enabled} onChange={(v) => void toggle(task, v)} label="Bật tác vụ" />
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <IconButton
                        icon={Play}
                        title="Chạy ngay và xem log"
                        className="hover:text-zen-green"
                        onClick={() => void runJob(() => post<Job>(`/api/tasks/${task.id}/run`), () => void reload())}
                      />
                      <IconButton icon={FileText} title="Log các lần chạy theo lịch" onClick={() => void showLog(task)} />
                      <IconButton icon={Pencil} title="Sửa" onClick={() => setEditing(task)} />
                      <IconButton icon={Trash2} title="Xoá" className="hover:text-zen-red" onClick={() => void remove(task)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <TaskModal task={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
      <Modal open={Boolean(log)} onClose={() => setLog(null)} title={`Log: ${log?.name ?? ''}`} size="xl">
        {log?.content === null ? (
          <Spinner />
        ) : (
          <pre className="mono max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[#0a0e17] p-4 text-xs leading-relaxed text-slate-300">{log?.content}</pre>
        )}
      </Modal>
    </>
  );
}
