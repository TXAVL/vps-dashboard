// ZenPanel - Component Highlight các từ khóa tìm kiếm
import { memo } from 'react';

interface HighlightProps {
  text: string | null | undefined;
  query: string | null | undefined;
  className?: string;
  highlightClassName?: string;
}

export const Highlight = memo(function Highlight({
  text,
  query,
  className,
  highlightClassName = 'bg-amber-400/25 text-amber-200 font-bold px-0.5 rounded transition-colors',
}: HighlightProps) {
  if (!text && text !== '') return null;
  const str = String(text);
  const q = (query || '').trim();
  if (!q) return <span className={className}>{str}</span>;

  // Thoát các ký tự đặc biệt của RegExp
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = str.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className={highlightClassName}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
});

export default Highlight;
