// src/performance-test/k6/reports/summary.js
// SUPER REPORT v3 — BASEURL en título, Status Codes, Top Endpoints, Charts responsivos (sin scroll infinito)

function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) {
  const y = d.getFullYear(), m = pad(d.getMonth()+1), dd = pad(d.getDate());
  const hh = pad(d.getHours()), mm = pad(d.getMinutes()), ss = pad(d.getSeconds());
  return `${y}${m}${dd}-${hh}${mm}${ss}`;
}
function n(x){ return (typeof x === 'number' && isFinite(x)) ? x : null; }
function get(o, path, d=null){
  try { return path.split('.').reduce((a,k)=> (a && (k in a)) ? a[k] : undefined, o) ?? d; }
  catch { return d; }
}
function htmlEscape(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function fmtMs(x){ return x==null ? '—' : `${x.toFixed(2)} ms`; }
function fmtNum(x){ return x==null ? '—' : x.toLocaleString(); }
function fmtPct(x){ return x==null ? '—' : (x*100).toFixed(2)+'%'; }
function fmtBytes(x){
  if (x==null) return '—';
  const u=['B','KB','MB','GB']; let i=0, v=x; while(v>=1024 && i<u.length-1){ v/=1024; i++; }
  return `${v.toFixed(2)} ${u[i]}`;
}
function humanDur(ms){
  if (!ms && ms!==0) return '—';
  const s = Math.round(ms/1000);
  const m = Math.floor(s/60), rem = s%60;
  return m ? `${m}m ${rem}s` : `${s}s`;
}

// Targets desde variables de entorno (con defaults)
const TARGETS = {
  p95_warn: Number(__ENV.P95_WARN || 800),     // ms
  p95_crit: Number(__ENV.P95_CRIT || 1200),
  p99_warn: Number(__ENV.P99_WARN || 1500),
  p99_crit: Number(__ENV.P99_CRIT || 2500),
  err_warn: Number(__ENV.ERROR_WARN || 0.01),  // fracción (0.01 = 1%)
  err_crit: Number(__ENV.ERROR_CRIT || 0.05),
};

function compute(data){
  const m = data.metrics || {};
  const dur = m.http_req_duration?.values || {};
  const lat = {
    p50: n(dur['p(50)']), p90: n(dur['p(90)']), p95: n(dur['p(95)']),
    p99: n(dur['p(99)']), avg: n(dur['avg']), max: n(dur['max']), min: n(dur['min'])
  };
  const phases = {
    blocked:   n(get(m,'http_req_blocked.values.avg', null)),
    connecting:n(get(m,'http_req_connecting.values.avg', null)),
    tls:       n(get(m,'http_req_tls_handshaking.values.avg', null)),
    sending:   n(get(m,'http_req_sending.values.avg', null)),
    waiting:   n(get(m,'http_req_waiting.values.avg', null)),   // TTFB
    receiving: n(get(m,'http_req_receiving.values.avg', null)),
  };
  const reqs       = n(get(m,'http_reqs.values.count', 0)) || 0;
  const failedRate = n(get(m,'http_req_failed.values.rate', 0)) || 0;
  const bytesIn    = n(get(m,'data_received.values.bytes', 0)) || 0;
  const bytesOut   = n(get(m,'data_sent.values.bytes', 0)) || 0;
  const iter       = n(get(m,'iterations.values.count', 0)) || 0;
  const testMs     = n(get(data,'state.testRunDurationMs', 0)) || 0;
  const rps        = testMs ? (reqs / (testMs / 1000)) : null;
  const checksPass = n(get(m,'checks.passes',0)) || 0;
  const checksFail = n(get(m,'checks.fails',0)) || 0;
  const vus        = n(get(m,'vus.values.value', null));
  const vusMax     = n(get(m,'vus_max.values.value', null));
  return { m, lat, phases, reqs, failedRate, bytesIn, bytesOut, iter, testMs, rps, checksPass, checksFail, vus, vusMax };
}

function grade(errorRate, p95){
  if (errorRate >= TARGETS.err_crit) return { g:'E', color:'#ef4444', reason:`error rate ≥ ${(TARGETS.err_crit*100)}%` };
  if (p95 == null)                     return { g:'C', color:'#f59e0b', reason:'p95 unavailable' };
  if (p95 <= 500)  return { g:'A', color:'#22c55e', reason:'p95 ≤ 500ms' };
  if (p95 <= 800)  return { g:'B', color:'#84cc16', reason:'p95 ≤ 800ms' };
  if (p95 <= 1200) return { g:'C', color:'#f59e0b', reason:'p95 ≤ 1200ms' };
  if (p95 <= 2000) return { g:'D', color:'#fb923c', reason:'p95 ≤ 2000ms' };
  return { g:'E', color:'#ef4444', reason:'p95 > 2000ms' };
}

// ------- Extra: Status Codes & Top Endpoints parsing -------

// Devuelve {metric, tags:{k:v}} si la key tiene submétrica con etiquetas, ej: "http_reqs{status:200,name:GET /api}"
function parseSubmetricKey(key){
  const i = key.indexOf('{');
  if (i === -1) return { metric: key, tags: null };
  const metric = key.slice(0, i);
  const inside = key.slice(i+1, key.lastIndexOf('}'));
  const tags = {};
  for (const raw of inside.split(',')){
    const j = raw.indexOf(':');
    if (j === -1) continue;
    const k = raw.slice(0, j).trim();
    const v = raw.slice(j+1).trim();
    tags[k] = v;
  }
  return { metric, tags };
}

function extractStatusBreakdown(metrics){
  // Busca submétricas con tag status:* dentro de http_reqs
  const total = get(metrics, 'http_reqs.values.count', 0) || 0;
  const map = new Map();
  for (const [k, v] of Object.entries(metrics)){
    if (!k.startsWith('http_reqs{')) continue;
    const {metric, tags} = parseSubmetricKey(k);
    if (metric !== 'http_reqs' || !tags || !('status' in tags)) continue;
    const code = String(tags.status);
    const count = Number(get(v,'values.count',0) || 0);
    if (!map.has(code)) map.set(code, 0);
    map.set(code, map.get(code) + count);
  }
  const arr = [...map.entries()].map(([code, count])=>({ code, count, pct: total ? count/total : 0 }));
  arr.sort((a,b)=> b.count - a.count);
  return { total, items: arr };
}

function extractEndpoints(metrics){
  // Intenta varias fuentes: group_duration{group:::...} o http_req_duration{name:...} o {url:...}
  const entries = [];

  for (const [k, v] of Object.entries(metrics)){
    const { metric, tags } = parseSubmetricKey(k);
    if (!tags) continue;
    const values = v && v.values ? v.values : null;
    if (!values) continue;

    // group_duration por grupo (si usás group('...'))
    if (metric === 'group_duration' && 'group' in tags) {
      const name = tags.group; // suele venir como :::Grupo
      entries.push({
        source: 'group',
        name,
        count: Number(values.count || 0),
        p95: n(values['p(95)']),
        avg: n(values.avg),
        max: n(values.max)
      });
      continue;
    }

    // http_req_duration tag name (si seteaste "name" en la request)
    if (metric === 'http_req_duration' && 'name' in tags) {
      entries.push({
        source: 'name',
        name: tags.name,
        count: Number(values.count || 0),
        p95: n(values['p(95)']),
        avg: n(values.avg),
        max: n(values.max)
      });
      continue;
    }

    // http_req_duration por url (algunas veces aparece)
    if (metric === 'http_req_duration' && 'url' in tags) {
      entries.push({
        source: 'url',
        name: tags.url,
        count: Number(values.count || 0),
        p95: n(values['p(95)']),
        avg: n(values.avg),
        max: n(values.max)
      });
      continue;
    }
  }

  // Agregar items por nombre consolidando mismos nombres (suma counts, promedia ponderado)
  const agg = new Map();
  for (const e of entries){
    const key = e.name;
    if (!agg.has(key)) agg.set(key, { name: key, count: 0, p95: null, avg: null, max: null });
    const cur = agg.get(key);
    const c0 = cur.count || 0, c1 = e.count || 0, total = c0 + c1;
    cur.count = total;
    // promedio ponderado para avg/p95 (aprox. sin distribución)
    if (e.avg != null) cur.avg = cur.avg==null ? e.avg : ( (cur.avg*c0 + e.avg*c1) / (total||1) );
    if (e.p95 != null) cur.p95 = cur.p95==null ? e.p95 : ( (cur.p95*c0 + e.p95*c1) / (total||1) );
    // max global
    if (e.max != null) cur.max = cur.max==null ? e.max : Math.max(cur.max, e.max);
  }
  const list = [...agg.values()];
  list.sort((a,b)=> b.count - a.count); // Top por cantidad
  return list.slice(0, 10); // Top 10
}

// ----------------------------------------------------------

function htmlReport(data, datasets){
  const suite   = get(data,'options.tags.suite','(unknown)');
  const baseurl = __ENV.BASEURL || '';
  const nowStr  = new Date().toLocaleString();
  const scenarios = Object.keys(get(data,'options.scenarios', {}));
  const c = datasets.ctx;
  const g = datasets.grade;

  const haveChecks = (c.checksPass || 0) + (c.checksFail || 0) > 0;
  const haveStatus = datasets.status.items.length > 0;
  const haveEndpoints = datasets.endpoints.length > 0;

  // Semáforo helper
  function semaBar(value, warn, crit, unit){
    const v = value==null ? null : Number(value);
    const color = (v==null) ? '#94a3b8' : (v>=crit) ? '#ef4444' : (v>=warn) ? '#f59e0b' : '#22c55e';
    const max = v==null ? crit*1.1 : Math.max(crit*1.1, v);
    const pct = v==null ? 0 : Math.min(100, Math.round((v/max)*100));
    return `<div style="display:flex; align-items:center; gap:10px">
      <div style="flex:1; background:#0f172a; border:1px solid #1e293b; border-radius:999px; height:12px; position:relative; overflow:hidden">
        <div style="width:${pct}%; height:100%; background:${color};"></div>
        <div title="warn" style="position:absolute; left:${Math.min(100, (warn/max)*100)}%; top:-2px; bottom:-2px; width:2px; background:#f59e0b; opacity:.8"></div>
        <div title="crit" style="position:absolute; left:${Math.min(100, (crit/max)*100)}%; top:-2px; bottom:-2px; width:2px; background:#ef4444; opacity:.8"></div>
      </div>
      <div style="min-width:120px; font-variant-numeric: tabular-nums">${v==null?'—':v.toFixed(2)} ${unit}</div>
    </div>`;
  }

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>k6 Report — ${htmlEscape(baseurl || '(no BASEURL)')} (suite: ${htmlEscape(suite)})</title>
  <style>
    :root{
      --bg:#070b12; --panel:#0d1320; --muted:#9aa5b1; --line:#1b2330;
      --text:#e6edf3; --ok:#22c55e; --warn:#f59e0b; --err:#ef4444; --info:#60a5fa;
    }
    *{ box-sizing:border-box }
    html, body { margin:0; padding:0; background:radial-gradient(1200px 600px at 10% -10%, #0a1425 0%, var(--bg) 60%); color:var(--text); }
    header { padding:20px 24px; border-bottom:1px solid var(--line); background:linear-gradient(90deg, rgba(59,130,246,.15), rgba(139,92,246,.10)); }
    .muted { color:var(--muted); }
    .grid { display:grid; gap:12px; grid-template-columns: repeat(12, 1fr); padding:16px; }
    .col-12{ grid-column: span 12; }
    .col-8{ grid-column: span 8; }
    .col-6{ grid-column: span 6; }
    .col-4{ grid-column: span 4; }
    .col-3{ grid-column: span 3; }
    @media (max-width: 900px){
      .col-8, .col-6, .col-4, .col-3 { grid-column: span 12; }
    }
    .card { background:linear-gradient(180deg, rgba(17,24,39,.7), rgba(13,19,32,.9)); border:1px solid var(--line); border-radius:16px; padding:14px; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
    h1 { font-size:22px; margin:0 0 6px; }
    h2 { font-size:16px; margin:0 0 8px; }
    .kpis { display:grid; grid-template-columns: repeat(6, minmax(120px,1fr)); gap:12px; }
    @media (max-width: 900px){ .kpis{ grid-template-columns: repeat(2, minmax(140px,1fr)); } }
    .kpi .label{ font-size:12px; color:var(--muted); }
    .kpi .value{ font-size:18px; font-weight:700; }
    .badge { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; font-weight:700; font-size:12px; border:1px solid var(--line) }
    .badge .dot{ width:10px; height:10px; border-radius:999px; display:inline-block }
    table { width:100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; }
    th { color:var(--muted); font-weight:600; background:rgba(255,255,255,.02); }
    code { background:#0b1220; padding:2px 6px; border-radius:6px; }
    /* FIX scroll infinito: contenedor con alto fijo; el canvas llena el contenedor */
    .chart { position:relative; width:100%; height:280px; background:#0b0f14; border-radius:12px; border:1px solid var(--line); padding:10px; overflow:hidden; }
    @media (max-width: 900px){ .chart{ height:240px; } }
    .chart > canvas { display:block; width:100% !important; height:100% !important; }
    footer { padding:12px 16px; color:var(--muted); }
    a { color:var(--info); text-decoration:none; }
    .sema { display:grid; gap:10px; }
    .tips li{ margin-bottom:6px }
  </style>
</head>
<body>
<header>
  <h1>k6 Report — ${htmlEscape(baseurl || '(no BASEURL)')} <span class="muted">(suite: ${htmlEscape(suite)})</span></h1>
  <div class="muted">Generado: ${htmlEscape(nowStr)} • Duración: ${htmlEscape(humanDur(get(data,'state.testRunDurationMs',0)))}</div>
  <div class="muted">Escenarios: ${htmlEscape(scenarios.join(', ')||'(none)')}</div>
  <div style="margin-top:10px">
    <span class="badge" style="background:rgba(255,255,255,.03)"><span class="dot" style="background:${g.color}"></span> <span>Grade <b>${g.g}</b></span> <span class="muted" style="margin-left:8px">(${htmlEscape(g.reason)})</span></span>
  </div>
</header>

<section class="grid">
  <div class="card col-12">
    <div class="kpis">
      <div class="kpi"><div class="label">HTTP reqs</div><div class="value">${fmtNum(c.reqs)}</div></div>
      <div class="kpi"><div class="label">RPS promedio</div><div class="value">${c.rps==null?'—':c.rps.toFixed(2)}</div></div>
      <div class="kpi"><div class="label">Error rate</div><div class="value" style="color:${c.failedRate>0? '#ff7b7b':'#22c55e'}">${fmtPct(c.failedRate)}</div></div>
      <div class="kpi"><div class="label">Iteraciones</div><div class="value">${fmtNum(c.iter)}</div></div>
      <div class="kpi"><div class="label">VUs</div><div class="value">${c.vus==null?'—':fmtNum(c.vus)} / max ${c.vusMax==null?'—':fmtNum(c.vusMax)}</div></div>
      <div class="kpi"><div class="label">Datos recibidos</div><div class="value">${fmtBytes(c.bytesIn)}</div></div>
      <div class="kpi"><div class="label">Datos enviados</div><div class="value">${fmtBytes(c.bytesOut)}</div></div>
      <div class="kpi"><div class="label">Checks pass/fail</div><div class="value">${fmtNum(c.checksPass)} / ${fmtNum(c.checksFail)}</div></div>
    </div>
  </div>

  <div class="card col-6">
    <h2>Latencias (ms)</h2>
    <div class="chart"><canvas id="chartDur"></canvas></div>
    <div class="muted" style="margin-top:6px">
      p50: ${fmtMs(c.lat.p50)} · p90: ${fmtMs(c.lat.p90)} · p95: ${fmtMs(c.lat.p95)} · p99: ${fmtMs(c.lat.p99)} · avg: ${fmtMs(c.lat.avg)} · max: ${fmtMs(c.lat.max)}
    </div>
  </div>

  <div class="card col-6">
    <h2>Fases HTTP (avg ms)</h2>
    <div class="chart"><canvas id="chartPhase"></canvas></div>
    <div class="muted" style="margin-top:6px">
      blocked: ${fmtMs(c.phases.blocked)} · connecting: ${fmtMs(c.phases.connecting)} · tls: ${fmtMs(c.phases.tls)} · sending: ${fmtMs(c.phases.sending)} · waiting: ${fmtMs(c.phases.waiting)} · receiving: ${fmtMs(c.phases.receiving)}
    </div>
  </div>

  <div class="card col-6">
    <h2>Checks</h2>
    ${haveChecks ? `<div class="chart"><canvas id="chartChecks"></canvas></div>` : `<div class="muted">Sin checks registrados.</div>`}
  </div>

  <div class="card col-6">
    <h2>Semáforo</h2>
    <div class="sema">
      <div><b>p95</b> (warn ${TARGETS.p95_warn}ms / crit ${TARGETS.p95_crit}ms)</div>
      ${semaBar(c.lat.p95, TARGETS.p95_warn, TARGETS.p95_crit, 'ms')}
      <div style="height:8px"></div>
      <div><b>p99</b> (warn ${TARGETS.p99_warn}ms / crit ${TARGETS.p99_crit}ms)</div>
      ${semaBar(c.lat.p99, TARGETS.p99_warn, TARGETS.p99_crit, 'ms')}
      <div style="height:8px"></div>
      <div><b>Error rate</b> (warn ${(TARGETS.err_warn*100).toFixed(1)}% / crit ${(TARGETS.err_crit*100).toFixed(1)}%)</div>
      ${semaBar(c.failedRate, TARGETS.err_warn, TARGETS.err_crit, '')}
    </div>
  </div>

  <div class="card col-6">
    <h2>Status Codes</h2>
    ${haveStatus ? `
      <div class="chart"><canvas id="chartStatus"></canvas></div>
      <div style="height:8px"></div>
      <table>
        <thead><tr><th>Código</th><th>Cantidad</th><th>%</th></tr></thead>
        <tbody>
          ${datasets.status.items.map(it => `<tr><td>${htmlEscape(it.code)}</td><td>${fmtNum(it.count)}</td><td>${fmtPct(it.pct)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : `<div class="muted">Sin datos de status codes (no se encontraron submétricas con tag <code>status</code>).</div>`}
  </div>

  <div class="card col-6">
    <h2>Top Endpoints</h2>
    ${haveEndpoints ? `
      <table>
        <thead><tr><th>Endpoint</th><th>Requests</th><th>p95</th><th>avg</th><th>max</th></tr></thead>
        <tbody>
          ${datasets.endpoints.map(e => `
            <tr>
              <td><code>${htmlEscape(e.name)}</code></td>
              <td>${fmtNum(e.count)}</td>
              <td>${fmtMs(e.p95)}</td>
              <td>${fmtMs(e.avg)}</td>
              <td>${fmtMs(e.max)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="muted" style="margin-top:6px">Fuente: tags <code>group</code>, <code>name</code> o <code>url</code> en métricas. Si no se usan, este bloque quedará vacío.</div>
    ` : `<div class="muted">Sin datos de endpoints (no se hallaron submétricas con tags <code>group</code>/<code>name</code>/<code>url</code>).</div>`}
  </div>

  <div class="card col-12">
    <h2>Todas las métricas</h2>
    <table>
      <thead><tr><th>Métrica</th><th>Values</th></tr></thead>
      <tbody>
        ${Object.entries(c.m).map(([k,v])=>{
          const vals = v?.values || {};
          const pair = Object.entries(vals).map(([n,vv])=>`${htmlEscape(n)}: ${htmlEscape(String(vv))}`).join(' · ');
          return `<tr><td><code>${htmlEscape(k)}</code></td><td>${pair||'—'}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
</section>

<footer>Se generan también <code>summary.json</code> y <code>summary.csv</code> en esta carpeta.</footer>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  // Datasets para los charts
  const latData   = ${JSON.stringify(datasets.latData)};
  const phaseData = ${JSON.stringify(datasets.phaseData)};
  const statusItems = ${JSON.stringify(datasets.status.items)};

  const colorBars1 = ['#60a5fa','#a78bfa','#4ade80','#fbbf24','#fb7185','#38bdf8'];
  const colorBars2 = ['#94a3b8','#60a5fa','#a78bfa','#22c55e','#f59e0b','#06b6d4'];
  const colorBars3 = ['#22c55e','#60a5fa','#f59e0b','#ef4444','#06b6d4','#a78bfa','#4ade80','#fb7185'];

  // Latency chart
  (function(){
    const el = document.getElementById('chartDur');
    if (!el) return;
    const ctx = el.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: { labels: ['p50','p90','p95','p99','avg','max'], datasets: [{ label: 'ms', data: latData, backgroundColor: colorBars1 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  })();

  // Phases chart
  (function(){
    const el = document.getElementById('chartPhase');
    if (!el) return;
    const ctx = el.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: { labels: ['blocked','connecting','tls','sending','waiting','receiving'], datasets: [{ label: 'avg ms', data: phaseData, backgroundColor: colorBars2 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  })();

  // Checks donut (solo si hay datos)
  (function(){
    const el = document.getElementById('chartChecks');
    if (!el) return;
    const ctx = el.getContext('2d');
    // Si existiera el canvas es porque había checks>0 según el template
    const pass = ${Number(c.checksPass || 0)};
    const fail = ${Number(c.checksFail || 0)};
    new Chart(ctx, {
      type: 'doughnut',
      data: { labels:['Pass','Fail'], datasets:[{ data:[pass, fail], backgroundColor:['#22c55e','#ef4444'] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
    });
  })();

  // Status codes bar (solo si hay items)
  (function(){
    const el = document.getElementById('chartStatus');
    if (!el || !Array.isArray(statusItems) || statusItems.length === 0) return;
    const ctx = el.getContext('2d');
    const labels = statusItems.map(x => x.code);
    const counts = statusItems.map(x => x.count);
    new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'requests', data: counts, backgroundColor: colorBars3 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  })();
</script>

</body>
</html>`;
}

function toCSV(data){
  const lines = [];
  const meta = [
    ['meta','generated_at', new Date().toISOString()],
    ['meta','baseurl', __ENV.BASEURL || ''],
    ['meta','suite', get(data,'options.tags.suite','')],
    ['meta','vus', get(data,'metrics.vus.values.value','')],
    ['meta','vus_max', get(data,'metrics.vus_max.values.value','')],
    ['meta','iterations', get(data,'metrics.iterations.values.count','')],
    ['meta','duration_ms', get(data,'state.testRunDurationMs','')],
    ['targets','p95_warn', TARGETS.p95_warn],
    ['targets','p95_crit', TARGETS.p95_crit],
    ['targets','p99_warn', TARGETS.p99_warn],
    ['targets','p99_crit', TARGETS.p99_crit],
    ['targets','err_warn', TARGETS.err_warn],
    ['targets','err_crit', TARGETS.err_crit],
  ];
  for (const row of meta) lines.push(row.map(String).join(','));

  lines.push('metric,value_name,value');
  const metrics = data.metrics || {};
  for (const [metric, body] of Object.entries(metrics)){
    const values = body?.values || {};
    for (const [vname, val] of Object.entries(values)){
      lines.push(`${metric},${vname},${val}`);
    }
  }
  return lines.join('\n');
}

export function handleSummary(data){
  const ts = stamp(new Date());
  const baseDir = 'src/reports/performance/k6';

  const c  = compute(data);
  const m  = data.metrics || {};
  const dv = m.http_req_duration?.values || {};
  const latData = [
    Number(dv['p(50)'] || 0),
    Number(dv['p(90)'] || 0),
    Number(dv['p(95)'] || 0),
    Number(dv['p(99)'] || 0),
    Number(dv['avg']   || 0),
    Number(dv['max']   || 0),
  ];
  const phaseData = [
    Number(get(m,'http_req_blocked.values.avg', 0)),
    Number(get(m,'http_req_connecting.values.avg', 0)),
    Number(get(m,'http_req_tls_handshaking.values.avg', 0)),
    Number(get(m,'http_req_sending.values.avg', 0)),
    Number(get(m,'http_req_waiting.values.avg', 0)),
    Number(get(m,'http_req_receiving.values.avg', 0)),
  ];

  // Extra: status & endpoints
  const status = extractStatusBreakdown(m);       // { total, items:[{code,count,pct},...] }
  const endpoints = extractEndpoints(m);          // [{name,count,p95,avg,max}, ...]

  const datasets = {
    ctx: c,
    latData,
    phaseData,
    status,
    endpoints,
    grade: grade(c.failedRate, c.lat.p95)
  };

  const html = htmlReport(data, datasets);

  return {
    [`${baseDir}/index-${ts}.html`]: html,
    [`${baseDir}/summary-${ts}.json`]: JSON.stringify(data, null, 2),
    [`${baseDir}/summary-${ts}.csv`]: toCSV(data),
    [`${baseDir}/latest.html`]: html,
    [`${baseDir}/latest.json`]: JSON.stringify(data, null, 2),
    [`${baseDir}/latest.csv`]: toCSV(data)
  };
}
