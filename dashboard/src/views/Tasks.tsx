// ZenPanel - Lịch tác vụ: chạy lệnh theo lịch qua cron (Linux) hoặc Task Scheduler (Windows)
import { useState, type FormEvent } from 'react';
import { CalendarClock, Clock, FileText, Pencil, Play, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
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

export interface TaskTemplate {
  id: string;
  name: string;
  desc: string;
  category: 'cleanup' | 'backup' | 'system' | 'web';
  categoryLabel: string;
  schedule: TaskSchedule;
  command: (isWindows: boolean) => string;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'cleanup-temp',
    name: 'Dọn dẹp file rác & thư mục tạm',
    desc: 'Tự động dọn sạch các tệp tin tạm cũ quá 7 ngày để giải phóng dung lượng ổ đĩa.',
    category: 'cleanup',
    categoryLabel: 'Dọn dẹp',
    schedule: { type: 'daily', time: '03:00' },
    command: (win) =>
      win
        ? 'Get-ChildItem -Path "$env:TEMP\\*", "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue'
        : 'find /tmp /var/tmp -type f -mtime +7 -delete 2>/dev/null || true',
  },
  {
    id: 'docker-prune',
    name: 'Dọn dẹp Docker rác (Dangling Containers & Build Cache)',
    desc: 'Giải phóng dung lượng từ các container đã tắt và build cache rác của Docker.',
    category: 'cleanup',
    categoryLabel: 'Dọn dẹp',
    schedule: { type: 'weekly', day: 0, time: '04:00' },
    command: () => 'docker system prune -f --volumes',
  },
  {
    id: 'clear-ram',
    name: 'Tối ưu & Xả RAM Cache hệ thống',
    desc: 'Thu hồi bộ nhớ đệm và trang nhàn rỗi để giảm tải RAM cho máy chủ.',
    category: 'system',
    categoryLabel: 'Hệ thống',
    schedule: { type: 'daily', time: '04:30' },
    command: (win) =>
      win
        ? '[System.GC]::Collect(); Clear-DnsClientCache'
        : 'sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true',
  },
  {
    id: 'backup-mysql',
    name: 'Sao lưu Database MySQL/MariaDB hằng đêm',
    desc: 'Xuất toàn bộ database và nén thành tệp .sql.gz lưu trữ an toàn.',
    category: 'backup',
    categoryLabel: 'Sao lưu',
    schedule: { type: 'daily', time: '02:00' },
    command: (win) =>
      win
        ? '$date = Get-Date -Format "yyyyMMdd"; New-Item -ItemType Directory -Force -Path "C:\\Backups" -ErrorAction SilentlyContinue; docker exec zen-mysql sh -c "mysqldump --all-databases -uroot -p`$MYSQL_ROOT_PASSWORD" > "C:\\Backups\\db_$date.sql"'
        : 'mkdir -p /var/backups/mysql && mysqldump --all-databases 2>/dev/null | gzip > /var/backups/mysql/db_$(date +%Y%m%d).sql.gz || true',
  },
  {
    id: 'backup-web',
    name: 'Nén và Sao lưu mã nguồn Website',
    desc: 'Nén toàn bộ thư mục web thành file lưu trữ định kỳ.',
    category: 'backup',
    categoryLabel: 'Sao lưu',
    schedule: { type: 'daily', time: '02:30' },
    command: (win) =>
      win
        ? '$date = Get-Date -Format "yyyyMMdd"; New-Item -ItemType Directory -Force -Path "C:\\Backups" -ErrorAction SilentlyContinue; Compress-Archive -Path "C:\\www\\*" -DestinationPath "C:\\Backups\\web_$date.zip" -Force'
        : 'mkdir -p /var/backups/web && tar -czf /var/backups/web/web_$(date +%Y%m%d).tar.gz /var/www 2>/dev/null || true',
  },
  {
    id: 'ping-cron',
    name: 'Kích hoạt Webhook / Ping Cron URL',
    desc: 'Gọi định kỳ một URL (ví dụ: WordPress cron, n8n webhook, uptime check).',
    category: 'web',
    categoryLabel: 'Web & Cron',
    schedule: { type: 'minutes', every: 15 },
    command: (win) =>
      win
        ? 'Invoke-WebRequest -Uri "https://example.com/wp-cron.php?doing_wp_cron" -UseBasicParsing -TimeoutSec 30'
        : 'curl -fsS --max-time 30 "https://example.com/wp-cron.php?doing_wp_cron" >/dev/null 2>&1 || true',
  },
  {
    id: 'cert-renew',
    name: 'Tự động Gia hạn SSL & Reload Web Server',
    desc: 'Kiểm tra và tự gia hạn chứng chỉ Let\'s Encrypt SSL định kỳ hằng tuần.',
    category: 'web',
    categoryLabel: 'Web & Cron',
    schedule: { type: 'weekly', day: 1, time: '01:00' },
    command: (win) =>
      win
        ? 'Write-Host "Kiem tra gia han chung chi SSL"'
        : 'certbot renew --quiet && (systemctl reload nginx 2>/dev/null || true)',
  },
  {
    id: 'service-watchdog',
    name: 'Giám sát & Tự khởi động lại Dịch vụ (Watchdog)',
    desc: 'Tự động kiểm tra nếu dịch vụ web bị crash thì lập tức khởi động lại.',
    category: 'system',
    categoryLabel: 'Hệ thống',
    schedule: { type: 'minutes', every: 5 },
    command: (win) =>
      win
        ? 'Get-Process -Name "node" -ErrorAction SilentlyContinue || Start-Service "ZenPanelAgent" -ErrorAction SilentlyContinue'
        : 'systemctl is-active --quiet nginx || systemctl restart nginx',
  },
];

interface FormState {
  name: string;
  command: string;
  type: TaskSchedule['type'];
  every: string;
  minute: string;
  time: string;
  day: string;
}

function toForm(task?: ScheduledTask | Partial<ScheduledTask>): FormState {
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

function TaskModal({
  task,
  initialTemplate,
  onClose,
  onSaved,
}: {
  task?: ScheduledTask;
  initialTemplate?: TaskTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { info } = usePanel();
  const windows = info?.os.family === 'windows';

  const [form, setForm] = useState<FormState>(() => {
    if (task) return toForm(task);
    if (initialTemplate) {
      return toForm({
        name: initialTemplate.name,
        command: initialTemplate.command(windows),
        schedule: initialTemplate.schedule,
      });
    }
    return toForm();
  });

  const [selectedTemplate, setSelectedTemplate] = useState<string>(initialTemplate?.id ?? '');
  const [saving, setSaving] = useState(false);
  const { run, toast } = useFeedback();

  const applyTemplate = (tplId: string) => {
    setSelectedTemplate(tplId);
    if (!tplId) return;
    const tpl = TASK_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    setForm(
      toForm({
        name: tpl.name,
        command: tpl.command(windows),
        schedule: tpl.schedule,
      }),
    );
    toast(`Đã áp dụng mẫu: "${tpl.name}"`);
  };

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
        {!task && (
          <div className="rounded-xl border border-zen-blue/30 bg-zen-blue/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 mb-1.5">
              <Sparkles className="size-3.5 text-amber-300" />
              <span>Cấu hình mẫu có sẵn (Điền nhanh):</span>
            </div>
            <Select value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value)} className="w-full text-xs">
              <option value="">-- Chọn một tác vụ mẫu để tự điền lệnh & lịch --</option>
              {TASK_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.categoryLabel}] {t.name} ({scheduleLabel(t.schedule)})
                </option>
              ))}
            </Select>
          </div>
        )}

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
        <div className="flex justify-end gap-2 pt-2">
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

function TemplateLibraryModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (tpl: TaskTemplate) => void;
}) {
  const { info } = usePanel();
  const windows = info?.os.family === 'windows';
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'Tất cả mẫu' },
    { id: 'cleanup', label: 'Dọn dẹp' },
    { id: 'backup', label: 'Sao lưu' },
    { id: 'system', label: 'Hệ thống' },
    { id: 'web', label: 'Web & Cron' },
  ];

  const filtered = TASK_TEMPLATES.filter((t) => activeCategory === 'all' || t.category === activeCategory);

  return (
    <Modal open={open} onClose={onClose} title="Thư viện Mẫu Cron Job Phổ biến" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Chọn một cấu hình mẫu dưới đây để thiết lập nhanh lịch chạy tự động cho VPS (lệnh được tối ưu riêng cho {windows ? 'Windows PowerShell' : 'Linux Bash'}).
        </p>

        {/* Danh mục */}
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                activeCategory === c.id ? 'bg-zen-blue text-white shadow' : 'bg-ink-950/60 text-slate-400 hover:text-white hover:bg-slate-800',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Danh sách thẻ mẫu */}
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((tpl) => (
            <div key={tpl.id} className="flex flex-col rounded-2xl border border-slate-700/60 bg-ink-950/70 p-4 transition hover:border-zen-blue/50">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-white text-sm">{tpl.name}</h4>
                <Badge tone={tpl.category === 'cleanup' ? 'amber' : tpl.category === 'backup' ? 'blue' : tpl.category === 'system' ? 'slate' : 'green'}>
                  {tpl.categoryLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-400 line-clamp-2">{tpl.desc}</p>
              
              <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-300 font-semibold">
                <Clock className="size-3.5" />
                <span>{scheduleLabel(tpl.schedule)}</span>
              </div>

              <div className="mt-2.5 rounded-xl bg-black/40 p-2 font-mono text-[11px] text-slate-400 truncate border border-slate-800">
                {tpl.command(windows)}
              </div>

              <div className="mt-auto pt-4 flex justify-end">
                <Button
                  size="xs"
                  variant="primary"
                  icon={Sparkles}
                  onClick={() => {
                    onSelect(tpl);
                    onClose();
                  }}
                >
                  Sử dụng mẫu này
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function Tasks() {
  const { info } = usePanel();
  const { data, error, loading, reload } = useApi<ScheduledTask[]>('/api/tasks');
  const [editing, setEditing] = useState<ScheduledTask | 'new' | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | undefined>(undefined);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [log, setLog] = useState<{ task: ScheduledTask; content: string | null } | null>(null);
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
    setLog({ task, content: null });
    const result = await get<{ log: string }>(`/api/tasks/${task.id}/log`).catch(() => null);
    setLog({
      task,
      content: result?.log || 'Chưa có log. Tác vụ chưa chạy lần nào hoặc chưa sinh output. Bạn có thể bấm "Chạy ngay" phía trên để kích hoạt thử tác vụ.',
    });
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
            <Button icon={Sparkles} variant="secondary" onClick={() => setTemplateLibraryOpen(true)}>
              Mẫu tác vụ
            </Button>
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => {
                setSelectedTemplate(undefined);
                setEditing('new');
              }}
            >
              Tạo tác vụ
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Notice icon={Sparkles}>
          Bấm <b>"Mẫu tác vụ"</b> để chọn nhanh các tác vụ phổ biến như sao lưu database MySQL hằng đêm, dọn rác temp, xả RAM cache, dọn Docker rác hoặc gọi webhook URL định kỳ.
        </Notice>
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
              <div className="flex gap-2">
                <Button icon={Sparkles} variant="secondary" onClick={() => setTemplateLibraryOpen(true)}>
                  Chọn từ mẫu có sẵn
                </Button>
                <Button
                  icon={Plus}
                  variant="primary"
                  onClick={() => {
                    setSelectedTemplate(undefined);
                    setEditing('new');
                  }}
                >
                  Tạo tác vụ mới
                </Button>
              </div>
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
                        onClick={() =>
                          void runJob(
                            () => post<Job>(`/api/tasks/${task.id}/run`),
                            async () => {
                              await reload();
                              if (log?.task.id === task.id) {
                                await showLog(task);
                              }
                            },
                          )
                        }
                      />
                      <IconButton icon={FileText} title="Xem nhật ký chạy (Log)" onClick={() => void showLog(task)} />
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

      {editing && (
        <TaskModal
          task={editing === 'new' ? undefined : editing}
          initialTemplate={selectedTemplate}
          onClose={() => {
            setEditing(null);
            setSelectedTemplate(undefined);
          }}
          onSaved={() => void reload()}
        />
      )}

      {templateLibraryOpen && (
        <TemplateLibraryModal
          open={templateLibraryOpen}
          onClose={() => setTemplateLibraryOpen(false)}
          onSelect={(tpl) => {
            setSelectedTemplate(tpl);
            setEditing('new');
          }}
        />
      )}

      <Modal open={Boolean(log)} onClose={() => setLog(null)} title={`Nhật ký (Log): ${log?.task.name ?? ''}`} size="xl">
        <div className="space-y-3">
          {log?.task && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-ink-950/70 p-3 text-xs">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-mono text-emerald-400 truncate max-w-full" title={log.task.command}>
                  $ {log.task.command}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-slate-400">
                  <span>Lịch: {scheduleLabel(log.task.schedule)}</span>
                  {log.task.lastRunAt && (
                    <>
                      <span>·</span>
                      <span>Chạy gần nhất: {formatRelative(log.task.lastRunAt)}</span>
                      <Badge tone={log.task.lastExitCode === 0 ? 'green' : 'red'}>exit {log.task.lastExitCode}</Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="primary"
                  icon={Play}
                  onClick={() => {
                    const currentTask = log.task;
                    void runJob(
                      () => post<Job>(`/api/tasks/${currentTask.id}/run`),
                      async () => {
                        await reload();
                        await showLog(currentTask);
                      },
                    );
                  }}
                >
                  Chạy ngay
                </Button>
                <Button size="xs" variant="secondary" icon={RefreshCw} onClick={() => void showLog(log.task)}>
                  Làm mới
                </Button>
              </div>
            </div>
          )}

          {log?.content === null ? (
            <Spinner />
          ) : (
            <pre className="mono max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[#0a0e17] p-4 text-xs leading-relaxed text-slate-300 border border-slate-800/80">
              {log?.content}
            </pre>
          )}
        </div>
      </Modal>
    </>
  );
}
