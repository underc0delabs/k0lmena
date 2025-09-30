// src/performance-test/k6/reports/summary.js
function num(x) { return (typeof x === 'number' && isFinite(x)) ? x : null; }

function simpleHtmlReport(data) {
  const m = (data && data.metrics) || {};

  const checksPass = m.checks?.passes ?? 0;
  const checksFail = m.checks?.fails ?? 0;

  const httpFailedRate = num(m.http_req_failed?.values?.rate) ?? 0;

  const durVals = m.http_req_duration?.values || {};
  const p95 = num(durVals['p(95)']);   // 👈 claves con paréntesis, usar bracket-notation
  const p99 = num(durVals['p(99)']);

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<title>k6 Summary</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:24px;background:#0b0f14;color:#e6edf3}
  .card{background:#0f1720;border:1px solid #1f2a37;border-radius:12px;padding:18px;margin-bottom:16px}
  h1{font-size:20px;margin:0 0 12px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #1f2a37;text-align:left;font-size:14px}
  th{color:#9fb3c8}
  .muted{color:#9fb3c8}
  .ok{color:#22c55e}
  .bad{color:#ef4444}
</style>
</head><body>
  <div class="card">
    <h1>Resumen de ejecución k6</h1>
    <div class="muted">Fecha: ${new Date().toLocaleString()}</div>
  </div>

  <div class="card">
    <table>
      <tr><th>Métrica</th><th>Valor</th></tr>
      <tr><td>Checks (pass/fail)</td><td>${checksPass} / ${checksFail}</td></tr>
      <tr><td>Error rate (http_req_failed)</td><td class="${httpFailedRate < 0.01 ? 'ok':'bad'}">${(httpFailedRate*100).toFixed(2)}%</td></tr>
      <tr><td>http_req_duration p95</td><td>${p95 !== null ? p95 + ' ms' : '—'}</td></tr>
      <tr><td>http_req_duration p99</td><td>${p99 !== null ? p99 + ' ms' : '—'}</td></tr>
    </table>
  </div>

  <div class="card muted">
    JSON generado en: src/reports/performance/k6/summary.json
  </div>
</body></html>`;
}

export function handleSummary(data) {
  return {
    'src/reports/performance/k6/summary.html': simpleHtmlReport(data),
    'src/reports/performance/k6/summary.json': JSON.stringify(data, null, 2)
  };
}
