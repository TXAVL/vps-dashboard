// ZenPanel - Dựng tài liệu cho iframe sandbox chạy thử code AI sinh ra.
// iframe dùng sandbox="allow-scripts" (KHÔNG allow-same-origin): code chạy ở origin "null", không đọc được
// localStorage / token của panel, không gọi được API panel. JS và Python chạy trong Web Worker bên trong iframe
// nên vòng lặp vô hạn bị cắt bằng timeout thay vì treo trình duyệt.
export type RunKind = 'js' | 'python' | 'html' | 'mermaid';

export interface RunMessage {
  zpRun: number;
  type: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'result' | 'status' | 'done';
  data: string | number;
}

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js';
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';

const b64 = (text: string) => btoa(unescape(encodeURIComponent(text)));

const WORKER_JS = `
function fmt(a){return Array.prototype.map.call(a,function(v){if(typeof v==='string')return v;try{if(v instanceof Error)return v.stack||String(v);if(typeof v==='object'&&v!==null)return JSON.stringify(v,function(k,x){return typeof x==='bigint'?x.toString():x},2);return String(v)}catch(e){return String(v)}}).join(' ')}
self.onmessage=async function(ev){
  var code=ev.data;var post=function(t,d){self.postMessage({type:t,data:d})};
  ['log','info','warn','error','debug'].forEach(function(m){console[m]=function(){post(m,fmt(arguments))}});
  var AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;var t0=Date.now();
  try{
    var fn;
    try{fn=new AsyncFunction('return ('+code.trim().replace(/;+\\s*$/,'')+')')}catch(e){fn=new AsyncFunction(code)}
    var r=await fn();
    if(r!==undefined)post('result',fmt([r]));
  }catch(e){
    var msg=(e&&e.stack)?e.stack:String(e);
    if(/(document|window|localStorage|alert) is not defined/.test(msg))msg+='\\n\\n→ Code này dùng DOM của trình duyệt. Hãy chạy ở chế độ HTML (đặt trong thẻ <script>).';
    post('error',msg);
  }
  post('done',Date.now()-t0);
};`;

const WORKER_PY = `
importScripts('${PYODIDE}');
self.onmessage=async function(ev){
  var post=function(t,d){self.postMessage({type:t,data:d})};
  try{
    post('status','Đang tải Python (Pyodide ~10MB, lần đầu hơi lâu)...');
    var py=await loadPyodide();
    py.setStdout({batched:function(s){post('log',s)}});
    py.setStderr({batched:function(s){post('error',s)}});
    post('status','Đang chạy...');
    var t0=Date.now();
    try{
      await py.loadPackagesFromImports(ev.data);
      var r=await py.runPythonAsync(ev.data);
      if(r!==undefined&&r!==null)post('result',String(r));
    }catch(e){post('error',String((e&&e.message)||e))}
    post('done',Date.now()-t0);
  }catch(e){
    post('error','Không tải được Python runtime: '+((e&&e.message)||e)+'\\n(cần truy cập cdn.jsdelivr.net)');
    post('done',0);
  }
};`;

/** Khung chạy: tạo worker từ mã nguồn, chuyển tiếp tin nhắn lên trang cha, cắt timeout */
function workerDoc(runId: number, workerSrc: string, code: string, limitSec: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function(){
  var id=${runId};
  function send(t,d){parent.postMessage({zpRun:id,type:t,data:d},'*')}
  var src=decodeURIComponent(escape(atob('${b64(workerSrc)}')));
  var code=decodeURIComponent(escape(atob('${b64(code)}')));
  var w;
  try{w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})))}catch(e){send('error','Trình duyệt không cho tạo worker trong sandbox: '+e.message);send('done',0);return}
  var timer=setTimeout(function(){w.terminate();send('error','Hết thời gian chạy ('+${limitSec}+' giây). Có thể do vòng lặp vô hạn, đã dừng.');send('done',${limitSec * 1000})},${limitSec * 1000});
  w.onmessage=function(e){var m=e.data;if(m.type==='done'){clearTimeout(timer);w.terminate()}send(m.type,m.data)};
  w.onerror=function(e){clearTimeout(timer);send('error',e.message||'Lỗi worker');send('done',0);w.terminate()};
  w.postMessage(code);
})();
<\/script></body></html>`;
}

/** Cầu nối console + lỗi cho tài liệu HTML do người dùng viết */
function bridge(runId: number): string {
  return `<script>(function(){var id=${runId};function send(t,d){parent.postMessage({zpRun:id,type:t,data:d},'*')}
function fmt(a){return Array.prototype.map.call(a,function(v){if(typeof v==='string')return v;try{if(v instanceof Error)return v.stack||String(v);if(typeof v==='object'&&v!==null)return JSON.stringify(v,null,2);return String(v)}catch(e){return String(v)}}).join(' ')}
['log','info','warn','error','debug'].forEach(function(m){var o=console[m];console[m]=function(){send(m,fmt(arguments));try{o.apply(console,arguments)}catch(e){}}});
window.addEventListener('error',function(e){send('error',(e.message||'Lỗi')+(e.lineno?' (dòng '+e.lineno+')':''))});
window.addEventListener('unhandledrejection',function(e){send('error','Promise bị từ chối: '+fmt([e.reason]))});
window.addEventListener('load',function(){send('done',0)});})();<\/script>`;
}

function htmlDoc(runId: number, source: string): string {
  let doc = source;
  if (!/<html[\s>]/i.test(doc)) {
    doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${doc}</body></html>`;
  }
  const b = bridge(runId);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${b}`);
  return doc.replace(/<html[^>]*>/i, (m) => `${m}<head>${b}</head>`);
}

export function buildSrcDoc(kind: RunKind, code: string, runId: number): { doc: string; visible: boolean; limitSec: number } {
  switch (kind) {
    case 'js':
      return { doc: workerDoc(runId, WORKER_JS, code, 10), visible: false, limitSec: 10 };
    case 'python':
      return { doc: workerDoc(runId, WORKER_PY, code, 120), visible: false, limitSec: 120 };
    case 'mermaid':
      return {
        doc: `<!doctype html><html><head><meta charset="utf-8">${bridge(runId)}<style>body{margin:0;padding:12px;background:#0b0f19;color:#e2e8f0;font-family:system-ui}</style></head><body><pre class="mermaid">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre><script src="${MERMAID}"><\/script><script>mermaid.initialize({startOnLoad:false,theme:'dark'});mermaid.run().catch(function(e){console.error('Sơ đồ lỗi: '+(e&&e.message||e))});<\/script></body></html>`,
        visible: true,
        limitSec: 30,
      };
    case 'html':
    default: {
      // SVG đứng riêng: bọc để hiển thị giữa khung
      const isSvg = /^\s*<svg[\s>]/i.test(code);
      const source = isSvg ? `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff">${code}</body>` : code;
      return { doc: htmlDoc(runId, source), visible: true, limitSec: 60 };
    }
  }
}

/** Loại code có thể chạy thử, theo nhãn ngôn ngữ của khối code */
export function runKindFor(lang: string | undefined, code: string): RunKind | null {
  const l = (lang ?? '').trim().toLowerCase();
  if (['js', 'javascript', 'node', 'mjs'].includes(l)) return 'js';
  if (['python', 'py', 'python3'].includes(l)) return 'python';
  if (['html', 'htm', 'xhtml'].includes(l)) return 'html';
  if (l === 'svg' || (l === 'xml' && /^\s*<svg[\s>]/i.test(code))) return 'html';
  if (l === 'mermaid') return 'mermaid';
  return null;
}
