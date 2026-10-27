// ZenPanel - Tô màu cú pháp (highlight.js, chỉ nạp các ngôn ngữ hay gặp để bundle gọn)
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import nginx from 'highlight.js/lib/languages/nginx';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGS = { bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, lua, markdown, nginx, php, powershell, python, ruby, rust, sql, swift, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);

const ALIAS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript', ts: 'typescript', tsx: 'typescript',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', html: 'xml', htm: 'xml', svg: 'xml', vue: 'xml', xhtml: 'xml',
  yml: 'yaml', py: 'python', python3: 'python', ps1: 'powershell', ps: 'powershell', pwsh: 'powershell', docker: 'dockerfile',
  md: 'markdown', 'c++': 'cpp', cs: 'csharp', rs: 'rust', golang: 'go', kt: 'kotlin', rb: 'ruby', conf: 'nginx', toml: 'ini', env: 'ini',
};

/** Tên hiển thị đẹp cho nhãn ngôn ngữ */
const LABEL: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', bash: 'Bash', xml: 'HTML / XML', css: 'CSS', json: 'JSON', php: 'PHP',
  sql: 'SQL', yaml: 'YAML', powershell: 'PowerShell', dockerfile: 'Dockerfile', nginx: 'Nginx', go: 'Go', rust: 'Rust', java: 'Java', cpp: 'C++',
  c: 'C', csharp: 'C#', ruby: 'Ruby', kotlin: 'Kotlin', swift: 'Swift', lua: 'Lua', markdown: 'Markdown', diff: 'Diff', ini: 'INI / TOML',
};

export function normalizeLang(lang: string | undefined): string {
  const l = (lang ?? '').trim().toLowerCase().split(/[\s{:]/)[0];
  return ALIAS[l] ?? l;
}

export function langLabel(lang: string | undefined): string {
  const n = normalizeLang(lang);
  return LABEL[n] ?? (n ? n.toUpperCase() : 'Văn bản');
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Trả về HTML đã tô màu (đã escape). Ngôn ngữ lạ / không khai báo: tự đoán trong nhóm phổ biến, code quá dài thì để nguyên */
export function highlightCode(code: string, lang?: string): string {
  const name = normalizeLang(lang);
  try {
    if (name && hljs.getLanguage(name)) return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
    if (!name && code.length < 12_000) return hljs.highlightAuto(code, ['javascript', 'python', 'bash', 'json', 'xml', 'css', 'sql', 'php', 'yaml', 'typescript']).value;
  } catch {
    // rơi xuống văn bản thường
  }
  return escapeHtml(code);
}

/** Phần mở rộng file khi tải code xuống */
export function extensionFor(lang: string | undefined): string {
  const map: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', xml: 'html', css: 'css', json: 'json', php: 'php', sql: 'sql', yaml: 'yml', powershell: 'ps1', dockerfile: 'Dockerfile', go: 'go', rust: 'rs', java: 'java', cpp: 'cpp', c: 'c', csharp: 'cs', ruby: 'rb', kotlin: 'kt', swift: 'swift', lua: 'lua', markdown: 'md', nginx: 'conf', ini: 'ini' };
  return map[normalizeLang(lang)] ?? 'txt';
}
