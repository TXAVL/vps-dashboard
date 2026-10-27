// ZenPanel - Khối code đẹp: nhãn ngôn ngữ, tô màu cú pháp, số dòng, sao chép, tải xuống, xuống dòng, thu gọn, CHẠY THỬ
import { memo, useMemo, useState } from 'react';
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, Download, Play, WrapText } from 'lucide-react';
import { cn } from '../ui';
import { CodeRunner } from './CodeRunner';
import { extensionFor, highlightCode, langLabel } from './highlight';
import { runKindFor } from './sandbox';

const COLLAPSE_LINES = 28;

export const CodeBlock = memo(function CodeBlock({ code, lang, live = false }: { code: string; lang?: string; live?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(0);
  const text = code.replace(/\n$/, '');
  const lines = text.split('\n').length;
  const html = useMemo(() => highlightCode(text, lang), [text, lang]);
  const kind = runKindFor(lang, text);
  const collapsible = lines > COLLAPSE_LINES;
  const collapsed = collapsible && !expanded;

  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const save = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `code.${extensionFor(lang)}` }).click();
    URL.revokeObjectURL(url);
  };

  const btn = 'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-700/60 hover:text-white';

  return (
    <div className="zp-code my-3 overflow-hidden rounded-xl border border-slate-700/60 bg-[#0a0e17]">
      <div className="flex items-center gap-1 border-b border-slate-700/50 bg-slate-800/40 px-3 py-1.5">
        <span className="mr-auto flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {langLabel(lang)}
          <span className="font-normal normal-case text-slate-600">{lines} dòng</span>
        </span>
        {kind && (
          <button type="button" disabled={live} onClick={() => setRunning((n) => n + 1)} className={cn(btn, 'text-emerald-300 hover:text-emerald-200', live && 'opacity-40')} data-tip={live ? 'Đợi AI viết xong' : kind === 'html' || kind === 'mermaid' ? 'Xem kết quả' : 'Chạy thử trong sandbox an toàn'}>
            <Play className="size-3.5 fill-current" /> {kind === 'html' || kind === 'mermaid' ? 'Xem' : 'Chạy'}
          </button>
        )}
        <button type="button" onClick={() => setWrap(!wrap)} className={cn(btn, wrap && 'bg-slate-700/60 text-white')} data-tip="Xuống dòng">
          <WrapText className="size-3.5" />
        </button>
        <button type="button" onClick={save} className={btn} data-tip="Tải xuống">
          <Download className="size-3.5" />
        </button>
        <button type="button" onClick={() => void copy()} className={btn}>
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? 'Đã chép' : 'Sao chép'}
        </button>
      </div>
      <div className={cn('relative overflow-auto', collapsed ? 'max-h-[26rem]' : 'max-h-[44rem]')}>
        <pre className={cn('hljs m-0 p-3 text-[12.5px] leading-relaxed', wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre')}>
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
        {collapsed && <div className="pointer-events-none sticky bottom-0 h-10 bg-gradient-to-t from-[#0a0e17] to-transparent" />}
      </div>
      {collapsible && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-center gap-1.5 border-t border-slate-700/50 py-1.5 text-[11px] font-medium text-slate-400 hover:bg-slate-800/50 hover:text-white">
          {expanded ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
          {expanded ? 'Thu gọn' : `Hiện đủ ${lines} dòng`}
        </button>
      )}
      {kind && running > 0 && <CodeRunner key={running} kind={kind} code={text} onClose={() => setRunning(0)} />}
    </div>
  );
});
