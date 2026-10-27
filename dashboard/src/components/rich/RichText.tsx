// ZenPanel - Bộ hiển thị nội dung AI: Markdown đầy đủ (GFM: bảng, danh sách việc, gạch ngang, code, trích dẫn, ảnh, link),
// HTML nhúng được làm sạch bằng DOMPurify, khối code có tô màu + chạy thử. Hỗ trợ stream (code chưa đóng vẫn hiển thị).
import { memo, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Marked, type Token, type Tokens } from 'marked';
import { cn } from '../ui';
import { CodeBlock } from './CodeBlock';
import { escapeHtml, highlightCode } from './highlight';

// Link luôn mở tab mới, không lộ window.opener
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

/** Code lồng trong danh sách / trích dẫn: tô màu bằng HTML thuần (khối cấp cao nhất dùng <CodeBlock> có nút chạy) */
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }: Tokens.Code) {
      return `<pre class="hljs zp-nested-pre"><code>${highlightCode(text, lang)}</code></pre>`;
    },
    codespan({ text }: Tokens.Codespan) {
      return `<code class="zp-inline">${escapeHtml(text)}</code>`;
    },
  },
});

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'meta', 'link', 'base'], FORBID_ATTR: ['srcset'] });

/** Một khối Markdown cấp cao nhất (đoạn, tiêu đề, bảng, danh sách...) -> HTML đã làm sạch; memo theo raw để stream không render lại cả bài */
const HtmlBlock = memo(function HtmlBlock({ raw, links }: { raw: string; links: Record<string, unknown> }) {
  const html = useMemo(() => {
    const tokens = md.lexer(raw) as Token[] & { links: Record<string, unknown> };
    tokens.links = links as never;
    return sanitize(md.parser(tokens));
  }, [raw, links]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

export const RichText = memo(function RichText({ content, streaming = false, className }: { content: string; streaming?: boolean; className?: string }) {
  const { blocks, links } = useMemo(() => {
    const tokens = md.lexer(content) as Token[] & { links: Record<string, unknown> };
    return { blocks: tokens.filter((t) => t.type !== 'space'), links: tokens.links ?? {} };
  }, [content]);

  return (
    <div className={cn('zp-md', className)}>
      {blocks.map((token, i) =>
        token.type === 'code' ? (
          <CodeBlock key={i} code={(token as Tokens.Code).text} lang={(token as Tokens.Code).lang} live={streaming && i === blocks.length - 1} />
        ) : (
          <HtmlBlock key={i} raw={token.raw} links={links} />
        ),
      )}
      {streaming && <span className="zp-caret" />}
    </div>
  );
});
