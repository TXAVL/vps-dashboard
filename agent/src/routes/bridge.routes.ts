// ZenPanel - Cầu nối lấy link mới sau cập nhật.
// Sau khi agent khởi động lại, link Cloudflare cũ chết và trình duyệt (đang ở trang https) không gọi được http://IP vì
// bị chặn "mixed content". Cửa sổ này mở TRỰC TIẾP tới http://IP:cổng/zp-bridge (điều hướng cấp cao nhất thì được phép),
// hỏi chính server link tunnel mới rồi gửi về tab cũ bằng postMessage (chỉ tới đúng origin tab đó).
// Token nằm trong #fragment nên không gửi lên server / không lộ qua Referer, và bị xoá khỏi thanh địa chỉ ngay.
import type { FastifyInstance } from 'fastify';

const PAGE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZenPanel · Lấy link mới</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif}
.card{width:min(92vw,420px);padding:24px;border-radius:20px;background:#111827;border:1px solid #334155}
h1{margin:0 0 4px;font-size:18px}p{margin:6px 0;color:#94a3b8;font-size:13px;line-height:1.5}
.url{margin:12px 0;padding:10px 12px;border-radius:12px;background:#000;color:#6ee7b7;font:600 13px ui-monospace,monospace;word-break:break-all}
button,a.btn{display:inline-block;margin:4px 6px 0 0;padding:8px 14px;border-radius:10px;border:0;background:#3b82f6;color:#fff;font-weight:600;font-size:13px;cursor:pointer;text-decoration:none}
button.alt{background:#1e293b}.ok{color:#6ee7b7}.err{color:#fda4af}
.spin{display:inline-block;width:14px;height:14px;border:2px solid #334155;border-top-color:#60a5fa;border-radius:50%;animation:r 1s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes r{to{transform:rotate(360deg)}}
</style></head><body><div class="card">
<h1>🧘 ZenPanel</h1>
<p id="msg"><span class="spin"></span>Đang hỏi máy chủ link mới...</p>
<div id="out"></div>
</div>
<script>
(function(){
  var msg=document.getElementById('msg'), out=document.getElementById('out');
  var q=new URLSearchParams(location.search), h=new URLSearchParams(location.hash.slice(1));
  var origin=q.get('origin')||'', token=h.get('token')||'';
  history.replaceState(null,'',location.pathname);
  if(!/^https?:\\/\\/[A-Za-z0-9.-]+(:\\d+)?$/.test(origin)) origin='';
  function say(t,cls){msg.className=cls||'';msg.textContent=t}
  function send(d){ if(window.opener&&origin){ try{window.opener.postMessage(Object.assign({zpBridge:true},d),origin)}catch(e){} } }
  if(!token){ say('Thiếu token đăng nhập. Hãy bấm lại nút từ trang ZenPanel.','err'); send({error:'Thiếu token'}); return; }
  var tries=0;
  function poll(){
    tries++;
    fetch('/api/update/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'}).then(function(r){
      if(r.status===401){ say('Token không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.','err'); send({error:'Token không hợp lệ'}); return null; }
      return r.json();
    }).then(function(s){
      if(!s) return;
      if(s.tunnelUrl){ done(s); return; }
      if((s.tunnelStatus==='starting'||s.tunnelStatus==='idle') && tries<45){ say('Máy chủ đang xin link Cloudflare mới... ('+tries+')'); setTimeout(poll,2000); return; }
      done(s);
    }).catch(function(){ if(tries<30){ setTimeout(poll,2000) } else { say('Không kết nối được máy chủ.','err'); send({error:'Không kết nối được máy chủ'}) } });
  }
  function done(s){
    send({tunnelUrl:s.tunnelUrl||null,tunnelStatus:s.tunnelStatus,version:s.version,directUrl:s.directUrl||null});
    var url=s.tunnelUrl||s.directUrl||'';
    if(s.tunnelUrl){ say('Đã lấy được link mới (ZenPanel v'+s.version+'). Đã gửi về tab cũ.','ok'); }
    else { say('Máy chủ không dùng Cloudflare Tunnel (trạng thái: '+s.tunnelStatus+'). Dùng địa chỉ IP bên dưới.','err'); }
    if(url){
      var d=document.createElement('div'); d.className='url'; d.textContent=url; out.appendChild(d);
      var c=document.createElement('button'); c.textContent='Sao chép'; c.onclick=function(){navigator.clipboard.writeText(url).then(function(){c.textContent='Đã chép'})}; out.appendChild(c);
      var a=document.createElement('a'); a.className='btn'; a.textContent='Mở panel'; a.href=url+'/?token='+encodeURIComponent(token)+'&auto_login=1'; a.target='_blank'; a.rel='noopener'; out.appendChild(a);
    }
    var x=document.createElement('button'); x.className='alt'; x.textContent='Đóng cửa sổ'; x.onclick=function(){window.close()}; out.appendChild(x);
  }
  poll();
})();
</script></body></html>`;

export async function bridgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/zp-bridge', async (_req, reply) => reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').type('text/html; charset=utf-8').send(PAGE));
}
