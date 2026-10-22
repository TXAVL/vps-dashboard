// ZenPanel - Quản lý Docker: containers, images, volumes, networks
import { useState, type FormEvent } from 'react';
import { Boxes, Store, Download, FileText, HardDrive, Layers, Network, Pause, Play, Plus, RefreshCw, RotateCw, Square, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Modal, PageHeader, Select, Spinner, Tabs, cn, td, th, tr, type Tone } from '../components/ui';
import { del, get, post } from '../lib/api';
import { useApi } from '../lib/hooks';
import { usePanel } from '../lib/panel';
import type { DockerContainer, DockerImage, DockerInfo, Job } from '../lib/types';
import { useJobs } from '../components/jobs';
import { StacksPanel } from './Stacks';
import { DockerHubPanel } from './DockerHub';

type Tab = 'containers' | 'stacks' | 'hub' | 'images' | 'volumes' | 'networks';
type Stats = Record<string, { cpu: string; memory: string; memPerc: string; net: string }>;

const stateTone = (state: string): Tone => (state === 'running' ? 'green' : state === 'paused' ? 'amber' : state === 'restarting' ? 'blue' : state === 'dead' ? 'red' : 'slate');

export function DockerMissing({ info }: { info: DockerInfo }) {
  const { info: panel } = usePanel();
  const linux = panel?.os.family === 'linux';
  return (
    <Card>
      <EmptyState
        icon={Boxes}
        title={info.installed ? 'Docker daemon chưa chạy' : 'Chưa cài Docker'}
        description={
          info.installed ? (
            <>{info.error ?? 'Hãy khởi động dịch vụ Docker trong mục Dịch vụ.'}</>
          ) : linux ? (
            <>
              Cài Docker bằng 1 lệnh trong Terminal:
              <code className="mono mt-2 block rounded-lg bg-ink-950 px-3 py-2 text-left text-xs text-emerald-300">curl -fsSL https://get.docker.com | sh</code>
            </>
          ) : (
            <>
              Trên Windows Server hãy cài Docker Engine / Docker Desktop:{' '}
              <a className="text-blue-400 underline" href="https://docs.docker.com/engine/install/" target="_blank" rel="noreferrer">
                hướng dẫn cài đặt
              </a>
            </>
          )
        }
      />
    </Card>
  );
}

function RunContainerModal({ open, onClose, onDone, initialImage }: { open: boolean; onClose: () => void; onDone: () => void; initialImage?: string }) {
  const [form, setForm] = useState({ image: initialImage ?? '', name: '', ports: '', env: '', volumes: '', restart: 'unless-stopped' });
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();
  const lines = (value: string) => value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(
      () => post('/api/docker/containers', { image: form.image, name: form.name || undefined, ports: lines(form.ports), env: form.env.split('\n').map((v) => v.trim()).filter(Boolean), volumes: lines(form.volumes), restart: form.restart }),
      `Đã tạo container từ ${form.image}`,
    );
    setSaving(false);
    if (ok) {
      onDone();
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tạo container mới" size="lg">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Image" hint="Ví dụ nginx:alpine, redis:7">
          <input className="input mono" required value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        </Field>
        <Field label="Tên container (tùy chọn)">
          <input className="input mono" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Cổng" hint="hostPort:containerPort, phân cách bằng dấu phẩy">
          <input className="input mono" value={form.ports} onChange={(e) => setForm({ ...form, ports: e.target.value })} placeholder="8080:80, 8443:443" />
        </Field>
        <Field label="Restart policy">
          <Select value={form.restart} onChange={(e) => setForm({ ...form, restart: e.target.value })}>
            <option value="unless-stopped">unless-stopped</option>
            <option value="always">always</option>
            <option value="on-failure">on-failure</option>
            <option value="no">no</option>
          </Select>
        </Field>
        <Field label="Biến môi trường" hint="Mỗi dòng KEY=value">
          <textarea className="input mono h-24" value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} />
        </Field>
        <Field label="Volumes" hint="volume:/path hoặc /host/path:/path, mỗi dòng 1 mục">
          <textarea className="input mono h-24" value={form.volumes} onChange={(e) => setForm({ ...form, volumes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" icon={Play} loading={saving}>
            Tạo & chạy
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Docker() {
  const info = useApi<DockerInfo>('/api/docker/info');
  const ready = Boolean(info.data?.running);
  const [tab, setTab] = useState<Tab>('containers');
  const containers = useApi<DockerContainer[]>(ready ? '/api/docker/containers' : null, 10000);
  const stats = useApi<Stats>(ready && tab === 'containers' ? '/api/docker/stats' : null, 15000);
  const images = useApi<DockerImage[]>(ready && tab === 'images' ? '/api/docker/images' : null);
  const volumes = useApi<{ name: string; driver: string }[]>(ready && tab === 'volumes' ? '/api/docker/volumes' : null);
  const networks = useApi<{ id: string; name: string; driver: string; scope: string }[]>(ready && tab === 'networks' ? '/api/docker/networks' : null);
  const [logs, setLogs] = useState<{ name: string; content: string | null } | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, prompt, run } = useFeedback();
  const { runJob } = useJobs();

  const act = async (c: DockerContainer, action: string, label: string) => {
    if (action === 'remove' || action === 'stop') {
      const ok = await confirm({ title: `${label} container`, message: <>{label} <b className="mono">{c.name}</b>?</>, danger: true, confirmLabel: label });
      if (!ok) return;
    }
    setBusy(c.id);
    await run(() => post(`/api/docker/containers/${c.id}/${action}`), `${label}: ${c.name}`);
    setBusy(null);
    await containers.reload();
  };

  const showLogs = async (c: DockerContainer) => {
    setLogs({ name: c.name, content: null });
    const result = await run(() => get<{ logs: string }>(`/api/docker/containers/${c.id}/logs`));
    setLogs({ name: c.name, content: result?.logs || 'Không có log.' });
  };

  const pull = async () => {
    const image = await prompt({ title: 'Pull image', label: 'Tên image', placeholder: 'nginx:alpine', confirmLabel: 'Tải về' });
    if (!image) return;
    setPulling(true);
    await runJob(() => post<Job>('/api/docker/images/pull', { image }));
    setPulling(false);
    await images.reload();
  };

  const removeImage = async (image: DockerImage) => {
    const ok = await confirm({ title: 'Xóa image', message: <>Xóa image <b className="mono">{image.repository}:{image.tag}</b>?</>, danger: true, confirmLabel: 'Xóa' });
    if (!ok) return;
    await run(() => del(`/api/docker/images/${encodeURIComponent(image.id)}`), 'Đã xóa image');
    await images.reload();
  };

  if (info.loading && !info.data) return <Spinner />;
  if (info.error) return <ErrorBox message={info.error} onRetry={info.reload} />;

  return (
    <>
      <PageHeader
        title="Docker"
        description={info.data?.version ? `Docker Engine ${info.data.version}` : 'Quản lý container'}
        icon={Boxes}
        actions={
          ready && (
            <>
              <Button icon={Download} onClick={() => void pull()} loading={pulling}>
                Pull image
              </Button>
              <Button icon={Plus} variant="primary" onClick={() => setCreating('')}>
                Tạo container
              </Button>
            </>
          )
        }
      />

      {!ready && info.data ? (
        <DockerMissing info={info.data} />
      ) : (
        <Card
          bodyClassName="p-0"
          title={
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'containers', label: 'Containers', icon: Boxes, count: containers.data?.length },
                { id: 'stacks', label: 'Compose', icon: Layers },
                { id: 'hub', label: 'Kho image', icon: Store },
                { id: 'images', label: 'Images', icon: Layers },
                { id: 'volumes', label: 'Volumes', icon: HardDrive },
                { id: 'networks', label: 'Networks', icon: Network },
              ]}
            />
          }
          actions={
            <IconButton
              icon={RefreshCw}
              title="Làm mới"
              onClick={() => void (tab === 'stacks' || tab === 'hub' ? Promise.resolve() : { containers, images, volumes, networks }[tab].reload())}
            />
          }
        >
          {tab === 'containers' &&
            (!containers.data ? (
              <Spinner />
            ) : containers.data.length === 0 ? (
              <EmptyState icon={Boxes} title="Chưa có container nào" description="Tạo container mới hoặc cài ứng dụng từ App Store." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Container</th>
                      <th className={th}>Trạng thái</th>
                      <th className={th}>Cổng</th>
                      <th className={th}>CPU / RAM</th>
                      <th className={cn(th, 'text-right')}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.data.map((c) => {
                      const s = stats.data?.[c.id];
                      return (
                        <tr key={c.id} className={cn(tr, busy === c.id && 'opacity-50')}>
                          <td className={td}>
                            <div className="flex items-center gap-2 font-semibold text-slate-100">
                              {c.name}
                              {c.project && <Badge tone="blue">{c.project}</Badge>}
                            </div>
                            <div className="mono text-xs text-slate-500">
                              {c.image} · {c.id}
                            </div>
                          </td>
                          <td className={td}>
                            <Badge tone={stateTone(c.state)}>{c.state}</Badge>
                            <div className="mt-1 text-xs text-slate-500">{c.status}</div>
                          </td>
                          <td className={cn(td, 'mono max-w-[220px] truncate text-xs text-slate-400')} data-tip={c.ports}>
                            {c.ports || '—'}
                          </td>
                          <td className={cn(td, 'mono text-xs text-slate-400')}>{s ? `${s.cpu} · ${s.memory.split('/')[0].trim()}` : c.state === 'running' ? '...' : '—'}</td>
                          <td className={cn(td, 'whitespace-nowrap text-right')}>
                            {c.state === 'running' ? (
                              <>
                                <IconButton icon={RotateCw} title="Khởi động lại" onClick={() => void act(c, 'restart', 'Khởi động lại')} />
                                <IconButton icon={Pause} title="Tạm dừng" onClick={() => void act(c, 'pause', 'Tạm dừng')} />
                                <IconButton icon={Square} title="Dừng" onClick={() => void act(c, 'stop', 'Dừng')} />
                              </>
                            ) : c.state === 'paused' ? (
                              <IconButton icon={Play} title="Tiếp tục" onClick={() => void act(c, 'unpause', 'Tiếp tục')} />
                            ) : (
                              <IconButton icon={Play} title="Khởi động" className="hover:text-zen-green" onClick={() => void act(c, 'start', 'Khởi động')} />
                            )}
                            <IconButton icon={FileText} title="Xem log" onClick={() => void showLogs(c)} />
                            <IconButton icon={Trash2} title="Xóa" className="hover:text-zen-red" onClick={() => void act(c, 'remove', 'Xóa')} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === 'stacks' && <StacksPanel />}
          {tab === 'hub' && (
            <DockerHubPanel
              onRun={(image) => {
                setCreating(image);
                setTab('containers');
              }}
            />
          )}

          {tab === 'images' &&
            (!images.data ? (
              <Spinner />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Repository</th>
                      <th className={th}>Tag</th>
                      <th className={th}>Image ID</th>
                      <th className={th}>Dung lượng</th>
                      <th className={th}>Tạo</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {images.data.map((image) => (
                      <tr key={`${image.id}-${image.repository}-${image.tag}`} className={tr}>
                        <td className={cn(td, 'font-semibold text-slate-100')}>{image.repository}</td>
                        <td className={td}>
                          <Badge>{image.tag}</Badge>
                        </td>
                        <td className={cn(td, 'mono text-xs text-slate-500')}>{image.id}</td>
                        <td className={cn(td, 'text-slate-300')}>{image.size}</td>
                        <td className={cn(td, 'text-slate-500')}>{image.createdSince}</td>
                        <td className={cn(td, 'text-right')}>
                          <IconButton icon={Trash2} title="Xóa image" className="hover:text-zen-red" onClick={() => void removeImage(image)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === 'volumes' &&
            (!volumes.data ? (
              <Spinner />
            ) : (
              <SimpleTable headers={['Tên volume', 'Driver']} rows={volumes.data.map((v) => [v.name, v.driver])} />
            ))}

          {tab === 'networks' &&
            (!networks.data ? (
              <Spinner />
            ) : (
              <SimpleTable headers={['Tên', 'ID', 'Driver', 'Scope']} rows={networks.data.map((n) => [n.name, n.id, n.driver, n.scope])} />
            ))}
        </Card>
      )}

      {creating !== null && (
        <RunContainerModal open initialImage={creating} onClose={() => setCreating(null)} onDone={() => void containers.reload()} />
      )}
      <Modal open={Boolean(logs)} onClose={() => setLogs(null)} title={`Log: ${logs?.name ?? ''}`} size="xl">
        {logs?.content === null ? (
          <Spinner />
        ) : (
          <pre className="mono max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[#0a0e17] p-4 text-xs leading-relaxed text-slate-300">{logs?.content}</pre>
        )}
      </Modal>
    </>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={tr}>
              {row.map((cell, j) => (
                <td key={j} className={cn(td, j === 0 ? 'font-semibold text-slate-100' : 'mono text-xs text-slate-400')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
