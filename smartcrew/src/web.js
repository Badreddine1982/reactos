// Minimal built-in web UI + JSON API. No external deps; uses node:http.
// Demonstrates model switching over a persistent knowledge memory.
import { createServer } from "node:http";
import { Agent } from "./agent.js";

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

export function startWeb(cfg) {
  const agent = new Agent(cfg);
  const port = cfg.runtime?.web_port || 3080;
  const host = cfg.runtime?.web_host || "0.0.0.0";

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGE(cfg));
    }
    if (req.method === "GET" && url.pathname === "/api/models") {
      return json(res, 200, { active: agent.switcher.activeId, models: agent.switcher.list() });
    }
    if (req.method === "GET" && url.pathname === "/api/memory") {
      return json(res, 200, { stats: agent.memory.stats(), facts: agent.memory.all("facts"), decisions: agent.memory.all("decisions").slice(-20) });
    }
    if (req.method === "POST" && url.pathname === "/api/use") {
      const b = await readBody(req);
      try { return json(res, 200, agent.use(b.model)); }
      catch (e) { return json(res, 400, { error: String(e.message) }); }
    }
    if (req.method === "POST" && url.pathname === "/api/remember") {
      const b = await readBody(req);
      const rec = agent.memory.remember(b.text || "", { tags: b.tags });
      return json(res, 200, { ok: true, rec });
    }
    if (req.method === "POST" && url.pathname === "/api/ask") {
      const b = await readBody(req);
      try {
        const out = await agent.ask(b.text || "", { taskHints: b.taskHints });
        return json(res, 200, out);
      } catch (e) {
        return json(res, 502, { error: String(e.message), model: agent.switcher.activeId });
      }
    }
    json(res, 404, { error: "not found" });
  });

  server.listen(port, host, () => {
    console.log(`\n  ${cfg.harness.name}`);
    console.log(`  Web UI  ->  http://${host}:${port}`);
    console.log(`  Active model: ${agent.switcher.activeId}`);
    console.log(`  Memory dir  : ${agent.memory.dir}\n`);
  });
  return server;
}

function PAGE(cfg) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.harness.name}</title>
<style>
:root{--bg:#0b1020;--card:#151b30;--fg:#e7ecff;--mut:#8ea0c8;--acc:#5b8cff;--ok:#3ddc97}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--fg)}
header{padding:18px 22px;border-bottom:1px solid #23304f;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
h1{font-size:17px;margin:0}.badge{background:#23304f;color:var(--mut);padding:3px 9px;border-radius:20px;font-size:12px}
.wrap{max-width:960px;margin:0 auto;padding:20px;display:grid;gap:16px}
.card{background:var(--card);border:1px solid #23304f;border-radius:14px;padding:16px}
label{font-size:13px;color:var(--mut)}
select,input,textarea,button{font:inherit;background:#0e1428;color:var(--fg);border:1px solid #2b3a5e;border-radius:10px;padding:10px}
textarea{width:100%;min-height:70px;resize:vertical}
button{cursor:pointer;background:var(--acc);border-color:var(--acc);color:#04102e;font-weight:600}
button.ghost{background:#0e1428;color:var(--fg)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.msg{white-space:pre-wrap;line-height:1.6}.mut{color:var(--mut);font-size:13px}
.pill{font-size:12px;border:1px solid #2b3a5e;border-radius:20px;padding:2px 8px;color:var(--mut)}
#log .turn{border-top:1px dashed #26324f;padding:10px 0}
</style></head><body>
<header>
  <h1>🚢 ${cfg.harness.name}</h1>
  <span class="badge">MIT</span><span class="badge">Memory-persistent</span>
  <span class="badge" id="active">…</span>
</header>
<div class="wrap">
  <div class="card">
    <div class="row">
      <label>النموذج النشط (Active model):</label>
      <select id="model"></select>
      <button id="switch">تبديل / Switch</button>
      <span class="mut" id="switchNote"></span>
    </div>
    <p class="mut">التبديل لا يمسح الذاكرة المعرفية — يتم أخذ لقطة (snapshot) وإعادة حقن السياق تلقائياً.</p>
  </div>

  <div class="card">
    <label>أضف معرفة دائمة (Add permanent knowledge):</label>
    <div class="row"><input id="know" style="flex:1" placeholder="مثال: النظام يفضّل الحلول منخفضة التكلفة">
    <button class="ghost" id="remember">حفظ في الذاكرة</button></div>
  </div>

  <div class="card">
    <label>اسأل الوكيل (Ask the agent):</label>
    <textarea id="q" placeholder="اكتب سؤالك..."></textarea>
    <div class="row"><button id="ask">إرسال / Ask</button>
    <span class="mut">يعمل عند توفّر مفتاح API للنموذج النشط.</span></div>
    <div id="log"></div>
  </div>

  <div class="card">
    <label>الذاكرة (Memory)</label>
    <div id="mem" class="mut">…</div>
  </div>
</div>
<script>
const $=s=>document.querySelector(s);
async function j(u,o){const r=await fetch(u,o);return r.json()}
async function loadModels(){const d=await j('/api/models');$('#active').textContent='الآن: '+d.active;
 $('#model').innerHTML=d.models.map(m=>'<option value="'+m.id+'"'+(m.active?' selected':'')+'>'+m.label+' ('+m.cost_tier+') · '+m.credentials+'</option>').join('')}
async function loadMem(){const d=await j('/api/memory');
 $('#mem').innerHTML='الطبقات: '+Object.entries(d.stats).map(([k,v])=>'<span class="pill">'+k+': '+v+'</span>').join(' ')+
 '<br>آخر القرارات:<br>'+ (d.decisions.map(x=>'• ['+x.model+'] '+x.decision).join('<br>')||'—')}
$('#switch').onclick=async()=>{const r=await j('/api/use',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:$('#model').value})});
 $('#switchNote').textContent=r.switched?('تم التبديل ✓ (لقطة محفوظة)'):(r.note||'');loadModels();loadMem()}
$('#remember').onclick=async()=>{const t=$('#know').value.trim();if(!t)return;await j('/api/remember',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});$('#know').value='';loadMem()}
$('#ask').onclick=async()=>{const t=$('#q').value.trim();if(!t)return;
 const el=document.createElement('div');el.className='turn';el.innerHTML='<b>أنت:</b> '+t+'<br><span class="mut">…</span>';$('#log').prepend(el);
 const r=await j('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});
 el.innerHTML='<b>أنت:</b> '+t+'<br><b class="pill">'+(r.model||'')+'</b> <span class="msg">'+((r.text||r.error||'').replace(/</g,'&lt;'))+'</span>';loadMem()}
loadModels();loadMem();
</script></body></html>`;
}

export default { startWeb };
