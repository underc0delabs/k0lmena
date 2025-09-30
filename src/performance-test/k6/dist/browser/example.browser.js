// src/performance-test/k6/browser/example.browser.ts
import { browser } from "k6/experimental/browser";
import { check as check2, sleep as sleep2 } from "k6";

// src/performance-test/k6/lib/utils.ts
import { check, sleep } from "k6";
var env = {
  BASEURL: __ENV.BASEURL || "https://example.com",
  API_BASEURL: __ENV.API_BASEURL || "https://api.example.com",
  AUTH_TOKEN: __ENV.AUTH_TOKEN || ""
};

// src/performance-test/k6/lib/thresholds.ts
var commonThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500", "p(99)<1200"],
  checks: ["rate>0.99"]
};

// src/performance-test/k6/reports/summary.js
function num(x) {
  return typeof x === "number" && isFinite(x) ? x : null;
}
function simpleHtmlReport(data) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const m = data && data.metrics || {};
  const checksPass = (_b = (_a = m.checks) == null ? void 0 : _a.passes) != null ? _b : 0;
  const checksFail = (_d = (_c = m.checks) == null ? void 0 : _c.fails) != null ? _d : 0;
  const httpFailedRate = (_g = num((_f = (_e = m.http_req_failed) == null ? void 0 : _e.values) == null ? void 0 : _f.rate)) != null ? _g : 0;
  const durVals = ((_h = m.http_req_duration) == null ? void 0 : _h.values) || {};
  const p95 = num(durVals["p(95)"]);
  const p99 = num(durVals["p(99)"]);
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
    <h1>Resumen de ejecuci\xF3n k6</h1>
    <div class="muted">Fecha: ${(/* @__PURE__ */ new Date()).toLocaleString()}</div>
  </div>

  <div class="card">
    <table>
      <tr><th>M\xE9trica</th><th>Valor</th></tr>
      <tr><td>Checks (pass/fail)</td><td>${checksPass} / ${checksFail}</td></tr>
      <tr><td>Error rate (http_req_failed)</td><td class="${httpFailedRate < 0.01 ? "ok" : "bad"}">${(httpFailedRate * 100).toFixed(2)}%</td></tr>
      <tr><td>http_req_duration p95</td><td>${p95 !== null ? p95 + " ms" : "\u2014"}</td></tr>
      <tr><td>http_req_duration p99</td><td>${p99 !== null ? p99 + " ms" : "\u2014"}</td></tr>
    </table>
  </div>

  <div class="card muted">
    JSON generado en: src/reports/performance/k6/summary.json
  </div>
</body></html>`;
}
function handleSummary(data) {
  return {
    "src/reports/performance/k6/summary.html": simpleHtmlReport(data),
    "src/reports/performance/k6/summary.json": JSON.stringify(data, null, 2)
  };
}

// src/performance-test/k6/browser/example.browser.ts
var options = {
  thresholds: commonThresholds,
  scenarios: {
    ui: {
      executor: "constant-vus",
      vus: 3,
      duration: "1m",
      options: {
        browser: { type: "chromium" }
      }
    }
  },
  tags: { suite: "browser-ui" }
};
async function example_browser_default() {
  const page = browser.newPage();
  try {
    await page.goto(env.BASEURL, { waitUntil: "networkidle" });
    const title = await page.title();
    check2(title, { "has title": (t) => typeof t === "string" && t.length > 0 });
    await page.waitForTimeout(500);
    sleep2(1);
  } finally {
    await page.close();
  }
}
export {
  example_browser_default as default,
  handleSummary,
  options
};
//# sourceMappingURL=example.browser.js.map
