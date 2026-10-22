// ZenPanel - Docker Compose stacks: tạo / sửa docker-compose.yml, up / down / restart / pull, xem cả stack có sẵn trên máy
import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ArrowDownToLine, Layers, Pencil, Play, Plus, RefreshCw, RotateCw, Square, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { useJobs } from '../components/jobs';
import { Badge, Button, EmptyState, ErrorBox, Field, IconButton, Modal, Notice, Spinner, Toggle, cn, td, th, tr } from '../components/ui';
import { del, get, post, put } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Job, Stack } from '../lib/types';

const TEMPLATE = `services:
  web:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "8091:80"
    volumes:
      - ./html:/usr/share/nginx/html
`;

function StackEditor({ stack, onClose, onSaved }: { stack: Stack | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(stack?.name ?? '');
  const [yaml, setYaml] = useState<string | null>(stack ? null : TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { runJob } = useJobs();
  const { toast } = useFeedback();

  useEffect(() => {
    if (!stack) return;
    get<{ yaml: string }>(`/api/docker/stacks/${stack.name}`)
      .then((r) => setYaml(r.yaml))
      .catch((err: Error) => setError(err.message));
  }, [stack]);

  const save = async (deploy: boolean) => {
    if (yaml === null) return;
    setSaving(true);
    setError(null);
    try {
      if (!stack) {
        // Tạo mới = lưu file + chạy "up -d" trong job
        const job = await post<Job>('/api/docker/stacks', { name: name.trim(), yaml });
        onClose();
        void runJob(() => Promise.resolve(job), onSaved);
        return;
      }
      await put(`/api/docker/stacks/${stack.name}`, { yaml });
      onSaved();
      if (deploy) {
        onClose();
        void runJob(() => post<Job>(`/api/docker/stacks/${stack.name}/up`), onSaved);
      } else toast('Đã lưu docker-compose.yml');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={stack ? `Sửa stack ${stack.name}` : 'Tạo Docker Compose stack'} size="xl">
      <div className="space-y-4">
        {!stack && (
          <Field label="Tên stack" hint="Chữ thường, số, gạch ngang. Dùng làm tên project của docker compose">
            <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-stack" />
          </Field>
        )}
        <div className="h-[50vh] overflow-hidden rounded-xl border border-slate-700/50">
          {yaml === null ? (
            error ? <ErrorBox message={error} /> : <Spinner />
          ) : (
            <Editor
              height="100%"
              theme="vs-dark"
              language="yaml"
              value={yaml}
              onChange={(v) => setYaml(v ?? '')}
              options={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 13, minimap: { enabled: false }, automaticLayout: true, tabSize: 2, scrollBeyondLastLine: false }}
            />
          )}
        </div>
        <p className="text-xs text-slate-500">Đường dẫn tương đối (vd ./html) nằm trong thư mục của stack trên máy chủ. Có thể sửa file trong File Manager.</p>
        {error && yaml !== null && <ErrorBox message={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          {stack && (
            <Button loading={saving} onClick={() => void save(false)}>
              Lưu
            </Button>
          )}
          <Button variant="primary" icon={Play} loading={saving} disabled={!stack && !name.trim()} onClick={() => void save(true)}>
            {stack ? 'Lưu & triển khai' : 'Tạo & chạy'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function StacksPanel() {
  const { data, error, reload } = useApi<Stack[]>('/api/docker/stacks', 15000);
  const [editing, setEditing] = useState<Stack | 'new' | null>(null);
  const [removing, setRemoving] = useState<{ stack: Stack; volumes: boolean } | null>(null);
  const { runJob } = useJobs();

  const act = (stack: Stack, action: 'up' | 'down' | 'restart' | 'pull') => void runJob(() => post<Job>(`/api/docker/stacks/${stack.name}/${action}`), () => void reload());

  const remove = async () => {
    if (!removing) return;
    const { stack, volumes } = removing;
    setRemoving(null);
    await runJob(() => del<Job>(`/api/docker/stacks/${stack.name}?volumes=${volumes}`), () => void reload());
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/40 p-4">
        <p className="text-sm text-slate-400">Chạy nhiều container cùng lúc bằng docker-compose.yml. Stack của App Store có tiền tố "zen-".</p>
        <div className="flex gap-2">
          <IconButton icon={RefreshCw} title="Làm mới" onClick={() => void reload()} />
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Tạo stack
          </Button>
        </div>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState icon={Layers} title="Chưa có stack nào" description="Tạo stack từ docker-compose.yml có sẵn (WordPress + MySQL, Supabase, Immich...)." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className={th}>Stack</th>
                <th className={th}>Trạng thái</th>
                <th className={th}>File compose</th>
                <th className={cn(th, 'text-right')}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.map((stack) => {
                const running = /running/i.test(stack.status);
                return (
                  <tr key={stack.name} className={tr}>
                    <td className={td}>
                      <div className="flex items-center gap-2 font-semibold text-slate-100">
                        {stack.name}
                        {stack.managed && <Badge tone="blue">ZenPanel</Badge>}
                        {stack.appStore && <Badge>App Store</Badge>}
                      </div>
                    </td>
                    <td className={td}>
                      <Badge tone={running ? 'green' : 'slate'}>{stack.status}</Badge>
                    </td>
                    <td className={cn(td, 'mono max-w-[320px] truncate text-xs text-slate-500')} data-tip={stack.configFiles.join('\n')}>
                      {stack.configFiles[0] ?? '—'}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      {running ? (
                        <>
                          <IconButton icon={RotateCw} title="Khởi động lại" onClick={() => act(stack, 'restart')} />
                          <IconButton icon={Square} title="Dừng (down)" onClick={() => act(stack, 'down')} />
                        </>
                      ) : (
                        <IconButton icon={Play} title="Chạy (up -d)" className="hover:text-zen-green" onClick={() => act(stack, 'up')} />
                      )}
                      <IconButton icon={ArrowDownToLine} title="Pull image mới & chạy lại" onClick={() => act(stack, 'pull')} />
                      {stack.managed && <IconButton icon={Pencil} title="Sửa docker-compose.yml" onClick={() => setEditing(stack)} />}
                      {stack.managed && <IconButton icon={Trash2} title="Xoá stack" className="hover:text-zen-red" onClick={() => setRemoving({ stack, volumes: false })} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <StackEditor stack={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Xoá stack ${removing?.stack.name ?? ''}`} size="sm">
        {removing && (
          <div className="space-y-4">
            <Notice tone="amber">Container sẽ bị dừng và thư mục stack (kể cả docker-compose.yml) bị xoá.</Notice>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-zen-red/30 bg-zen-red/10 px-4 py-3 text-sm">
              <span className="text-red-200">Xoá luôn volumes (dữ liệu) — không thể khôi phục</span>
              <Toggle checked={removing.volumes} onChange={(volumes) => setRemoving({ ...removing, volumes })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Huỷ
              </Button>
              <Button variant="danger" icon={Trash2} onClick={() => void remove()}>
                Xoá stack
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
