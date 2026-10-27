// ZenPanel - Chạy thử code AI sinh ra trong iframe sandbox (xem sandbox.ts): hiện console, kết quả, thời gian chạy, nút dừng
import { useEffect, useRef, useState } from 'react';
import { Loader2, Maximize2, Square, X } from 'lucide-react';
import { cn } from '../ui';
import { buildSrcDoc, type RunKind, type RunMessage } from './sandbox';

interface Line {
  type: RunMessage['type'];
  text: string;
}

let nextRunId = 1;

const TONE: Partial<Record<RunMessage['type'], string>> = {
  error: 'text-rose-300',
  warn: 'text-amber-300',
  info: 'text-sky-300',
  result: 'text-emerald-300',
  status: 'text-slate-500 italic',
};

const KIND_LABEL: Record<RunKind, string> = { js: 'JavaScript', python: 'Python', html: 'HTML', mermaid: 'Sơ đồ Mermaid' };

export function CodeRunner({ kind, code, onClose }: { kind: RunKind; code: string; onClose: () => void }) {
  const [runId] = useState(() => nextRunId++);
  const [{ doc, visible }] = useState(() => buildSrcDoc(kind, code, runId));
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<'running' | 'done' | 'stopped'>('running');
  const [ms, setMs] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const out = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent<RunMessage>) => {
      // Chỉ nhận tin từ đúng iframe của lần chạy này
      if (e.source !== frame.current?.contentWindow || e.data?.zpRun !== runId) return;
      const { type, data } = e.data;
      if (type === 'done') {
        setState('done');
        setMs(typeof data === 'number' ? data : null);
        return;
      }
      setLines((prev) => (prev.length > 500 ? prev : [...prev, { type, text: String(data) }]));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [runId]);

  useEffect(() => {
    out.current?.scrollTo({ top: out.current.scrollHeight });
  }, [lines]);

  const status = [...lines].reverse().find((l) => l.type === 'status')?.text;
  const shown = lines.filter((l) => l.type !== 'status');
  const stop = () => {
    frame.current?.remove();
    setState('stopped');
  };

  const frameEl = (
    <iframe
      ref={frame}
      title={`Chạy thử ${KIND_LABEL[kind]}`}
      // KHÔNG có allow-same-origin: code chạy ở origin "null", không đụng được token / dữ liệu của panel
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      srcDoc={doc}
      className={cn('w-full border-0 bg-white', visible ? (full ? 'h-[78vh]' : 'h-80') : 'hidden')}
    />
  );

  return (
    <div className="border-t border-slate-700/60 bg-[#060912]">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
        {state === 'running' ? <Loader2 className="size-3.5 animate-spin text-sky-400" /> : <span className={cn('size-2 rounded-full', state === 'done' ? 'bg-emerald-400' : 'bg-slate-500')} />}
        <span className="font-semibold text-slate-300">
          {state === 'running' ? `Đang chạy ${KIND_LABEL[kind]}...` : state === 'stopped' ? 'Đã dừng' : `Chạy xong${ms ? ` · ${ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}` : ''}`}
        </span>
        {status && state === 'running' && <span className="text-slate-500">{status}</span>}
        <span className="ml-auto flex items-center gap-1">
          {visible && (
            <button type="button" onClick={() => setFull(!full)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip={full ? 'Thu nhỏ' : 'Phóng to'}>
              <Maximize2 className="size-3.5" />
            </button>
          )}
          {state === 'running' && (
            <button type="button" onClick={stop} className="flex items-center gap-1 rounded px-1.5 py-1 text-rose-300 hover:bg-rose-950/50">
              <Square className="size-3 fill-current" /> Dừng
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" data-tip="Đóng">
            <X className="size-3.5" />
          </button>
        </span>
      </div>
      {frameEl}
      {(shown.length > 0 || !visible) && (
        <div ref={out} className="mono max-h-52 overflow-auto border-t border-slate-800/80 px-3 py-2 text-[11.5px] leading-relaxed">
          {shown.length === 0 ? (
            <span className="text-slate-600">{state === 'running' ? 'Đang chờ kết quả...' : '(không có đầu ra — dùng console.log / print để xem giá trị)'}</span>
          ) : (
            shown.map((l, i) => (
              <div key={i} className={cn('whitespace-pre-wrap break-words', TONE[l.type] ?? 'text-slate-300')}>
                {l.type === 'result' && <span className="mr-1 text-slate-500">⇒</span>}
                {l.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
