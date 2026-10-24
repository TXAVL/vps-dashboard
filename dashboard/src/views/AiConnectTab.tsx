// ZenPanel - AI Gateway: Combo model (Smart Routing), endpoint đa chuẩn (OpenAI / Anthropic / Ollama) và giới hạn theo API key
import { useState } from 'react';
import { ArrowDown, ArrowUp, Gauge, Layers, Plug, Plus, Save, Trash2 } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Badge, Button, Card, CopyButton, EmptyState, Field, IconButton, Modal, Select } from '../components/ui';
import { put } from '../lib/api';

export interface Combo {
  name: string;
  models: string[];
  strategy: 'fallback' | 'round-robin';
  description?: string;
}

interface KeyView {
  id: string;
  name: string;
  masked: string;
  enabled: boolean;
  rpmLimit?: number | null;
  dailyTokenLimit?: number | null;
  allowedModels?: string[];
}

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
        {label}
        <CopyButton value={code} />
      </div>
      <pre className="mono overflow-x-auto whitespace-pre rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-emerald-200">{code}</pre>
    </div>
  );
}

export function ConnectTab({
  combos,
  onSaveCombos,
  models,
  keys,
  onKeysChanged,
}: {
  combos: Combo[];
  onSaveCombos: (combos: Combo[]) => Promise<void>;
  models: { id: string }[];
  keys: KeyView[];
  onKeysChanged: () => void;
}) {
  const [editing, setEditing] = useState<{ index: number; combo: Combo } | null>(null);
  const [limits, setLimits] = useState<KeyView | null>(null);
  const [addModel, setAddModel] = useState('');
  const { run } = useFeedback();
  const base = `${window.location.origin}`;
  const sample = keys[0]?.masked ? '<API_KEY_tzp_...>' : '<API_KEY>';

  const saveCombo = async () => {
    if (!editing) return;
    const next = [...combos];
    if (editing.index < 0) next.push(editing.combo);
    else next[editing.index] = editing.combo;
    await onSaveCombos(next);
    setEditing(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    if (!editing) return;
    const list = [...editing.combo.models];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setEditing({ ...editing, combo: { ...editing.combo, models: list } });
  };

  const saveLimits = async () => {
    if (!limits) return;
    const ok = await run(() => put(`/api/ai/gateway/keys/${limits.id}`, { rpmLimit: limits.rpmLimit ?? 0, dailyTokenLimit: limits.dailyTokenLimit ?? 0, allowedModels: limits.allowedModels ?? [] }), 'Đã lưu giới hạn');
    if (ok !== undefined) {
      setLimits(null);
      onKeysChanged();
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Combo model (Smart Routing)"
        icon={Layers}
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({ index: -1, combo: { name: '', models: [], strategy: 'fallback' } })}>
            Tạo combo
          </Button>
        }
      >
        <p className="mb-3 text-xs text-slate-400">
          Một tên model ảo (vd <code className="mono">coding</code>) gom nhiều model thật. <b>Fallback</b>: thử lần lượt khi model trước lỗi / hết quota / 429. <b>Round-robin</b>: chia đều request cho các model để không bị giới hạn tốc độ. Gọi bằng <code className="mono">"model": "coding"</code> ở mọi chuẩn API.
        </p>
        {combos.length === 0 ? (
          <EmptyState icon={Layers} title="Chưa có combo" description="Ví dụ: coding = Claude → GPT → Gemini Flash (miễn phí)." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {combos.map((c, i) => (
              <div key={c.name} className="rounded-xl border border-slate-700/50 bg-ink-950/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="mono text-base font-bold text-white">{c.name}</span>
                  <Badge tone={c.strategy === 'fallback' ? 'blue' : 'amber'}>{c.strategy === 'fallback' ? 'Fallback' : 'Round-robin'}</Badge>
                  <span className="ml-auto flex">
                    <IconButton icon={Save} title="Sửa" onClick={() => setEditing({ index: i, combo: { ...c, models: [...c.models] } })} />
                    <IconButton icon={Trash2} title="Xoá" className="hover:text-zen-red" onClick={() => void onSaveCombos(combos.filter((_, k) => k !== i))} />
                  </span>
                </div>
                {c.description && <p className="mt-1 text-xs text-slate-500">{c.description}</p>}
                <ol className="mt-2 space-y-1">
                  {c.models.map((m, k) => (
                    <li key={m} className="mono flex items-center gap-2 text-xs text-slate-300">
                      <span className="flex size-4 items-center justify-center rounded bg-slate-800 text-[10px] text-slate-400">{k + 1}</span>
                      {m}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Kết nối đa chuẩn API" icon={Plug}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-bold text-white">OpenAI-compatible <Badge tone="green">/zen/v1</Badge></div>
            <Snippet label="cURL" code={`curl ${base}/zen/v1/chat/completions \\\n  -H "Authorization: Bearer ${sample}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Xin chào"}]}'`} />
          </div>
          <div className="space-y-3">
            <div className="text-sm font-bold text-white">Anthropic Messages (Claude Code) <Badge tone="blue">/zen/v1/messages</Badge></div>
            <Snippet label="Claude Code / SDK Anthropic" code={`export ANTHROPIC_BASE_URL=${base}/zen\nexport ANTHROPIC_AUTH_TOKEN=${sample}\nexport ANTHROPIC_MODEL=${combos[0]?.name ?? 'auto'}\nclaude`} />
            <p className="text-[11px] text-slate-500">Hỗ trợ stream, tool use, ảnh và count_tokens — dùng được mọi model (GPT, Gemini, DeepSeek...) qua giao diện Claude Code.</p>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-bold text-white">Ollama-compatible <Badge tone="amber">/ollama</Badge></div>
            <Snippet label="Open WebUI / Continue / n8n (Ollama URL)" code={`${base}/ollama/k/${sample}`} />
            <Snippet label="Hoặc kèm header" code={`curl ${base}/ollama/api/chat -H "Authorization: Bearer ${sample}" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"hi"}],"stream":false}'`} />
          </div>
          <div className="space-y-3">
            <div className="text-sm font-bold text-white">Tên model dùng được</div>
            <ul className="space-y-1 text-xs text-slate-400">
              <li><code className="mono text-slate-200">auto</code>, <code className="mono text-slate-200">tier1/2/3</code> — định tuyến 3 tầng</li>
              <li><code className="mono text-slate-200">{'<combo>'}</code> — combo bạn tạo ở trên</li>
              <li><code className="mono text-slate-200">{'<nhà cung cấp>/<model>'}</code> — vd <span className="mono">openrouter/meta-llama/llama-3.3-70b-instruct</span></li>
              <li>Tên Sub Agent đã tạo</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Giới hạn theo API key" icon={Gauge} bodyClassName="p-0">
        {keys.length === 0 ? (
          <EmptyState icon={Gauge} title="Chưa có API key" />
        ) : (
          <div className="divide-y divide-slate-800/80">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{k.name}</div>
                  <div className="mono text-xs text-slate-500">{k.masked}</div>
                </div>
                <Badge tone={k.rpmLimit ? 'amber' : 'slate'}>{k.rpmLimit ? `${k.rpmLimit} req/phút` : 'Không giới hạn RPM'}</Badge>
                <Badge tone={k.dailyTokenLimit ? 'amber' : 'slate'}>{k.dailyTokenLimit ? `${k.dailyTokenLimit.toLocaleString('vi-VN')} token/ngày` : 'Không giới hạn token'}</Badge>
                {k.allowedModels?.length ? <Badge tone="blue">{k.allowedModels.length} model</Badge> : null}
                <Button size="xs" variant="soft" onClick={() => setLimits({ ...k })}>Đặt giới hạn</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.index < 0 ? 'Tạo combo' : `Sửa combo ${editing.combo.name}`} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Huỷ</Button><Button variant="primary" icon={Save} disabled={!editing.combo.name || !editing.combo.models.length} onClick={() => void saveCombo()}>Lưu combo</Button></>}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tên combo" hint="Chữ, số, . - _ (vd coding, free, fast)">
                <input className="input mono" value={editing.combo.name} onChange={(e) => setEditing({ ...editing, combo: { ...editing.combo, name: e.target.value.trim() } })} />
              </Field>
              <Field label="Chiến lược">
                <Select value={editing.combo.strategy} onChange={(e) => setEditing({ ...editing, combo: { ...editing.combo, strategy: e.target.value as Combo['strategy'] } })}>
                  <option value="fallback">Fallback (thử lần lượt)</option>
                  <option value="round-robin">Round-robin (chia đều)</option>
                </Select>
              </Field>
            </div>
            <Field label="Mô tả (tuỳ chọn)">
              <input className="input" value={editing.combo.description ?? ''} onChange={(e) => setEditing({ ...editing, combo: { ...editing.combo, description: e.target.value } })} />
            </Field>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-300">Model theo thứ tự ưu tiên</div>
              <div className="space-y-1.5">
                {editing.combo.models.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-lg bg-ink-950/60 px-3 py-1.5">
                    <span className="text-xs text-slate-500">{i + 1}</span>
                    <span className="mono min-w-0 flex-1 truncate text-xs text-slate-200">{m}</span>
                    <IconButton icon={ArrowUp} title="Lên" onClick={() => move(i, -1)} />
                    <IconButton icon={ArrowDown} title="Xuống" onClick={() => move(i, 1)} />
                    <IconButton icon={Trash2} title="Bỏ" onClick={() => setEditing({ ...editing, combo: { ...editing.combo, models: editing.combo.models.filter((x) => x !== m) } })} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className="input mono flex-1" list="zp-models" value={addModel} onChange={(e) => setAddModel(e.target.value)} placeholder="nhà cung cấp/model" />
                <datalist id="zp-models">{models.map((m) => <option key={m.id} value={m.id} />)}</datalist>
                <Button
                  icon={Plus}
                  disabled={!addModel.includes('/') || editing.combo.models.includes(addModel)}
                  onClick={() => {
                    setEditing({ ...editing, combo: { ...editing.combo, models: [...editing.combo.models, addModel.trim()] } });
                    setAddModel('');
                  }}
                >
                  Thêm
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {limits && (
        <Modal open onClose={() => setLimits(null)} title={`Giới hạn: ${limits.name}`} footer={<><Button variant="ghost" onClick={() => setLimits(null)}>Huỷ</Button><Button variant="primary" icon={Save} onClick={() => void saveLimits()}>Lưu</Button></>}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Request / phút" hint="0 = không giới hạn">
                <input type="number" min={0} className="input" value={limits.rpmLimit ?? 0} onChange={(e) => setLimits({ ...limits, rpmLimit: Number(e.target.value) })} />
              </Field>
              <Field label="Token / 24 giờ" hint="0 = không giới hạn">
                <input type="number" min={0} step={1000} className="input" value={limits.dailyTokenLimit ?? 0} onChange={(e) => setLimits({ ...limits, dailyTokenLimit: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Chỉ cho phép model / combo" hint="Mỗi dòng 1 tên, hỗ trợ dạng openai/* ; để trống = mọi model">
              <textarea className="input mono min-h-[110px]" value={(limits.allowedModels ?? []).join('\n')} onChange={(e) => setLimits({ ...limits, allowedModels: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
