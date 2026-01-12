"use strict";

const report = require("multiple-cucumber-html-reporter");
const fs = require("fs");
const path = require("path");

/**
 * Este script vive dentro de src/reports/front
 */
const REPORT_DIR = path.resolve(__dirname);

(async function main() {
  // 1) Genera el reporte
  report.generate({
    jsonDir: REPORT_DIR,
    reportPath: REPORT_DIR,
    metadata: {
      browser: { name: "chrome", version: "latest" },
      device: "Local test machine",
      platform: { name: "Windows", version: "10" },
    },
    customData: {
      title: "Test Execution Report",
      data: [
        { label: "Project", value: "K0lmena" },
        { label: "Execution Date", value: new Date().toLocaleString() },
      ],
    },
  });

  // 2) Espera a que se creen HTMLs
  await waitForHtmlGeneration(REPORT_DIR);

  // 3) Aplica patches en TODOS los HTML generados
  patchAllHtmlReports(REPORT_DIR);

  console.log(
    "[k0lmena] Report patched: toolbox labels fixed (Show Info vs Download Zip) + dark-only (no toggle) + trace links fixed."
  );
})().catch((e) => {
  console.error("[k0lmena] Report generation/patch failed:", e);
  process.exitCode = 1;
});

/* ----------------------------- Patcher ----------------------------- */

function patchAllHtmlReports(rootDir) {
  const htmlFiles = collectFilesRecursive(rootDir, (p) =>
    p.toLowerCase().endsWith(".html")
  );

  for (const file of htmlFiles) {
    patchSingleHtml(file, rootDir);
  }
}

function patchSingleHtml(filePath, rootDir) {
  let html;
  try {
    html = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  // Evita doble inyección
  if (html.includes('id="k0lmena-theme"')) return;

  // ✅ FIX 1: Descarga zip (traces) - corrige rutas relativas en páginas dentro de /features/
  html = fixRelativeTraceLinks(html, filePath, rootDir);

  // ✅ FIX 2: Labels (sin tocar estilos)
  // Deben quedar así:
  // + Show Error
  // + Show Info
  // + Download Zip
  // + Screenshot
  html = fixInfoAndZipLabels(html);

  // ✅ FIX 3: Dark-only - elimina el script del reporter que agrega el toggle dark/light
  html = html.replace(
    /<script[^>]+src=["'][^"']*darkmode\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi,
    ""
  );

  // Asegura class en <html ...>
  html = html.replace(/<html([^>]*)>/i, (_match, attrs) => {
    const attrsStr = attrs || "";
    const classAttrMatch = attrsStr.match(/class\s*=\s*["']([^"']*)["']/i);

    if (classAttrMatch) {
      const current = classAttrMatch[1]
        .split(/\s+/)
        .map((c) => c.trim())
        .filter(Boolean);

      for (const c of ["darkmode", "k0lmena-dark"]) {
        if (!current.includes(c)) current.push(c);
      }

      const newAttrs = attrsStr.replace(
        /class\s*=\s*["'][^"']*["']/i,
        `class="${current.join(" ")}"`
      );

      return `<html${newAttrs}>`;
    }

    return `<html${attrsStr} class="darkmode k0lmena-dark">`;
  });

  // Asegura class en <body ...>
  html = html.replace(/<body([^>]*)>/i, (_match, attrs) => {
    const attrsStr = attrs || "";
    const classAttrMatch = attrsStr.match(/class\s*=\s*["']([^"']*)["']/i);

    if (classAttrMatch) {
      const current = classAttrMatch[1]
        .split(/\s+/)
        .map((c) => c.trim())
        .filter(Boolean);

      for (const c of ["darkmode", "k0lmena-dark"]) {
        if (!current.includes(c)) current.push(c);
      }

      const newAttrs = attrsStr.replace(
        /class\s*=\s*["'][^"']*["']/i,
        `class="${current.join(" ")}"`
      );

      return `<body${newAttrs}>`;
    }

    return `<body${attrsStr} class="darkmode k0lmena-dark">`;
  });

  const injection = buildK0lmenaGrayThemeInjection();

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${injection}\n</head>`);
  } else {
    return;
  }

  try {
    fs.writeFileSync(filePath, html, "utf8");
  } catch {
    // noop
  }
}

/**
 * ✅ Corrige links como href="traces/archivo.zip" para que apunten bien desde subcarpetas (features/, etc.)
 */
function fixRelativeTraceLinks(html, filePath, rootDir) {
  try {
    const tracesDir = path.join(rootDir, "traces");
    let rel = path.relative(path.dirname(filePath), tracesDir);
    rel = rel.split(path.sep).join("/"); // web slashes
    if (!rel || rel.trim() === "") rel = "traces";
    rel = rel.replace(/\/+$/, "");

    // Reescribe SOLO cuando arranca con "traces/" (no toca ../traces/ ya correctos)
    html = html.replace(
      /(href|src)=(["'])traces\/([^"']+)/gi,
      (_m, attr, q, rest) => `${attr}=${q}${rel}/${rest}`
    );

    return html;
  } catch {
    return html;
  }
}

/**
 * ✅ FIX DEFINITIVO:
 * Parcha SOLO dentro de <ul class="panel_toolbox">...</ul>.
 *
 * Reglas:
 * 1) Si un <a> es claramente de ZIP (atributos con .zip / traces / downloadZip / trace), se etiqueta "+ Download Zip".
 * 2) Si hay patrón en el toolbox: Error -> Info -> Info -> Screenshot, el 3º se fuerza a "+ Download Zip".
 * 3) Se normaliza cualquier "Descargar Zip" / "download zip" a "Download Zip".
 * 4) No se toca CSS/estructura, solo texto.
 */
function fixInfoAndZipLabels(html) {
  return html.replace(
    /<ul\b[^>]*class=(["'])[^"']*panel_toolbox[^"']*\1[^>]*>[\s\S]*?<\/ul>/gi,
    (ul) => patchPanelToolboxUl(ul)
  );
}

function patchPanelToolboxUl(ulHtml) {
  const anchorRe = /<a\b[^>]*>[\s\S]*?<\/a>/gi;

  const anchors = [];
  let m;
  while ((m = anchorRe.exec(ulHtml)) !== null) {
    anchors.push({
      start: m.index,
      end: anchorRe.lastIndex,
      html: m[0],
    });
  }

  if (anchors.length === 0) return ulHtml;

  // Utilidad: tipo por label visible
  const getPlain = (aHtml) =>
    aHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const getType = (aHtml) => {
    const p = getPlain(aHtml);
    if (p.includes("+ show error")) return "error";
    if (p.includes("+ screenshot")) return "screenshot";
    if (p.includes("+ download zip") || p.includes("+ descargar zip") || p.includes("+ downloadzip"))
      return "zip";
    if (p.includes("+ show info")) return "info";
    return "other";
  };

  const isZipCandidateByAttrs = (aHtml) => {
    const open = (aHtml.match(/^<a\b[^>]*>/i) || [""])[0].toLowerCase();
    return (
      open.includes(".zip") ||
      open.includes("traces/") ||
      open.includes("trace") || // clave: muchos reports no ponen .zip en href pero sí "trace"/"downloadTrace"
      open.includes("downloadzip") ||
      open.includes("download-zip") ||
      open.includes("zip")
    );
  };

  // 1) Primer pasada: normaliza ZIP por atributos, y normaliza "Descargar Zip" -> "Download Zip"
  let updated = ulHtml;
  for (let i = anchors.length - 1; i >= 0; i--) {
    const a = anchors[i].html;
    const type = getType(a);

    let newA = a;

    // Normaliza cualquier texto "Descargar Zip" o "download zip" a "Download Zip"
    if (/(\+\s*)(descargar\s*zip|download\s*zip|downloadzip)/i.test(newA)) {
      newA = replacePlusLabel(newA, "+ Download Zip");
    }

    // Si por atributos parece ZIP, fuerza "Download Zip"
    if (isZipCandidateByAttrs(newA)) {
      // Incluso si hoy dice Show Info
      if (/(\+\s*)(show\s*info|descargar\s*zip|download\s*zip|downloadzip)/i.test(getPlain(newA))) {
        newA = replacePlusLabel(newA, "+ Download Zip");
      }
    } else {
      // Si NO parece ZIP pero quedó "Download Zip", lo vuelve a Show Info (evita falsos positivos)
      if (type === "zip" && !isZipCandidateByAttrs(newA)) {
        newA = replacePlusLabel(newA, "+ Show Info");
      }
    }

    if (newA !== a) {
      updated = updated.slice(0, anchors[i].start) + newA + updated.slice(anchors[i].end);
    }
  }

  // Re-extrae anchors desde el HTML ya actualizado (porque cambiaron longitudes)
  const anchors2 = [];
  anchorRe.lastIndex = 0;
  while ((m = anchorRe.exec(updated)) !== null) {
    anchors2.push({
      start: m.index,
      end: anchorRe.lastIndex,
      html: m[0],
      type: getType(m[0]),
    });
  }

  // 2) Fallback definitivo por patrón visual:
  // Error -> Info -> Info -> Screenshot  => el 3º es ZIP
  if (anchors2.length >= 4) {
    for (let i = 0; i <= anchors2.length - 4; i++) {
      const a0 = anchors2[i];
      const a1 = anchors2[i + 1];
      const a2 = anchors2[i + 2];
      const a3 = anchors2[i + 3];

      const isPattern =
        a0.type === "error" &&
        a1.type === "info" &&
        a2.type === "info" &&
        a3.type === "screenshot";

      if (isPattern) {
        const target = anchors2[i + 2].html;
        const patched = replacePlusLabel(target, "+ Download Zip");

        if (patched !== target) {
          updated =
            updated.slice(0, anchors2[i + 2].start) +
            patched +
            updated.slice(anchors2[i + 2].end);
        }
        break; // con uno alcanza por toolbox
      }
    }
  }

  return updated;
}

/**
 * Reemplaza SOLO el texto del label "+ ..." manteniendo cualquier HTML interno.
 */
function replacePlusLabel(aTagOrInner, desiredLabel) {
  const desiredNoPlus = desiredLabel.replace(/^\+\s*/i, "");

  // Reemplaza el label si existe (Show Info / Download Zip / Descargar Zip)
  const re = /(\+\s*)(Show\s*Info|Descargar\s*Zip|Download\s*Zip|download\s*zip|downloadzip)/i;

  if (re.test(aTagOrInner)) {
    return aTagOrInner.replace(re, `$1${desiredNoPlus}`);
  }

  // Si no encontró el label, pero hay HTML: agrega al final sin romper nada
  if (/<[^>]+>/.test(aTagOrInner)) {
    return `${aTagOrInner} ${desiredLabel}`;
  }

  return desiredLabel;
}

function buildK0lmenaGrayThemeInjection() {
  return `
<style id="k0lmena-theme">
  :root{
    --k-bg: #0b0b0c;
    --k-surface: #121214;
    --k-surface-2: #17181b;
    --k-border: rgba(255,255,255,0.10);
    --k-border-2: rgba(255,255,255,0.14);

    --k-text: #e9e9ea;
    --k-muted: #a9aaad;

    --k-accent: #d4d4d6;

    --k-success: #22c55e;
    --k-danger: #ef4444;
    --k-warning: #f59e0b;
    --k-info: #38bdf8;

    --k-shadow: 0 12px 35px rgba(0,0,0,0.45);
    --k-header: rgba(18,18,20,0.88);
  }

  html.k0lmena-dark, body.k0lmena-dark{
    background:
      radial-gradient(1200px circle at 12% -10%, rgba(255,255,255,0.06) 0%, transparent 45%),
      radial-gradient(1000px circle at 88% 0%, rgba(255,255,255,0.04) 0%, transparent 50%),
      var(--k-bg) !important;
    color: var(--k-text) !important;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial !important;
    font-size: 14.5px !important;
    line-height: 1.6 !important;
  }

  html.k0lmena-dark .main_container{
    width: 94vw !important;
    max-width: 2000px;
    margin: 0 auto !important;
    padding: 30px 34px 18px !important;
  }
  @media (max-width: 1200px){
    html.k0lmena-dark .main_container{
      width: 96vw !important;
      padding: 20px 18px 12px !important;
    }
  }

  html.k0lmena-dark .top_nav,
  html.k0lmena-dark .nav_menu{
    background: var(--k-header) !important;
    border-bottom: 1px solid var(--k-border) !important;
  }

  html.k0lmena-dark nav.navbar{
    position: sticky;
    top: 0;
    z-index: 999;
    background: var(--k-header) !important;
    border-bottom: 1px solid var(--k-border) !important;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: none !important;
  }

  html.k0lmena-dark nav.navbar *{
    background: transparent !important;
    background-image: none !important;
  }

  html.k0lmena-dark nav .container-fluid{
    width: 94vw !important;
    max-width: 2000px;
    margin: 0 auto !important;
    padding: 0 18px;
  }
  @media (max-width: 1200px){
    html.k0lmena-dark nav .container-fluid{ width: 96vw !important; }
  }

  html.k0lmena-dark nav .navbar-brand{
    border-right: 1px solid var(--k-border) !important;
    color: var(--k-text) !important;
    width: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.9;
  }

  html.k0lmena-dark nav .navbar-text{
    color: var(--k-text) !important;
    font-weight: 750;
    letter-spacing: -0.01em;
  }
  html.k0lmena-dark nav .navbar-text:last-child{
    color: var(--k-muted) !important;
    font-weight: 600;
  }

  html.k0lmena-dark nav .darkmode-toggle,
  html.k0lmena-dark nav #darkmode-toggle,
  html.k0lmena-dark nav #darkModeToggle,
  html.k0lmena-dark nav .theme-toggle,
  html.k0lmena-dark nav #theme-toggle,
  html.k0lmena-dark nav .theme-switch,
  html.k0lmena-dark nav .darkmode-switch{
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html.k0lmena-dark .x_panel{
    background: rgba(18,18,20,0.92) !important;
    border: 1px solid var(--k-border) !important;
    border-radius: 18px !important;
    box-shadow: var(--k-shadow);
    overflow: hidden;
  }
  html.k0lmena-dark .x_panel:hover{
    border-color: var(--k-border-2) !important;
  }

  html.k0lmena-dark .x_title{
    background: rgba(18,18,20,0.96) !important;
    border-bottom: 1px solid var(--k-border) !important;
    padding: 16px 18px 14px !important;
    margin-bottom: 0 !important;
  }
  html.k0lmena-dark .x_title h2{
    color: var(--k-text) !important;
    font-size: 16px !important;
    font-weight: 800;
    margin: 0;
  }
  html.k0lmena-dark .x_title h2 small{
    color: var(--k-muted) !important;
    font-weight: 600;
  }
  html.k0lmena-dark .x_content{
    background: transparent !important;
    color: var(--k-text) !important;
    padding: 18px 18px 20px !important;
  }

  html.k0lmena-dark .x_content table:not(.table),
  html.k0lmena-dark .x_content table:not(.table) tr,
  html.k0lmena-dark .x_content table:not(.table) td,
  html.k0lmena-dark .x_content table:not(.table) th{
    background: transparent !important;
    border-color: rgba(255,255,255,0.10) !important;
  }

  html.k0lmena-dark td.chart,
  html.k0lmena-dark td.chart > div,
  html.k0lmena-dark td.chart canvas,
  html.k0lmena-dark td.chart svg{
    background: transparent !important;
  }

  html.k0lmena-dark table td.chart .total{
    color: var(--k-text) !important;
    font-weight: 900;
  }

  html.k0lmena-dark .panel_toolbox > li > a{
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: rgba(255,255,255,0.06) !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    color: var(--k-text) !important;
    transition: all .15s ease;
  }
  html.k0lmena-dark .panel_toolbox > li > a:hover{
    background: rgba(255,255,255,0.10) !important;
    border-color: rgba(255,255,255,0.16) !important;
  }

  html.k0lmena-dark table,
  html.k0lmena-dark .table{
    color: var(--k-text) !important;
  }

  html.k0lmena-dark .table > thead > tr > th,
  html.k0lmena-dark th{
    background: rgba(255,255,255,0.06) !important;
    color: #efeff0 !important;
    border-color: var(--k-border) !important;
  }

  html.k0lmena-dark .table > tbody > tr > td,
  html.k0lmena-dark td{
    border-color: var(--k-border) !important;
  }

  html.k0lmena-dark .table-striped > tbody > tr:nth-of-type(even){
    background: rgba(255,255,255,0.03) !important;
  }
  html.k0lmena-dark .table-striped > tbody > tr:hover{
    background: rgba(255,255,255,0.06) !important;
  }

  html.k0lmena-dark .dataTables_filter input,
  html.k0lmena-dark .dataTables_length select{
    background: rgba(255,255,255,0.06) !important;
    color: var(--k-text) !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    border-radius: 10px !important;
    padding: 6px 10px !important;
    outline: none !important;
  }
  html.k0lmena-dark .dataTables_filter input:focus,
  html.k0lmena-dark .dataTables_length select:focus{
    border-color: rgba(255,255,255,0.22) !important;
  }

  html.k0lmena-dark a,
  html.k0lmena-dark a:visited{
    color: var(--k-accent) !important;
    text-decoration: underline;
    text-decoration-color: rgba(255,255,255,0.16);
    text-underline-offset: 3px;
  }
  html.k0lmena-dark a:hover{
    color: #ffffff !important;
    text-decoration-color: rgba(255,255,255,0.35);
  }

  html.k0lmena-dark .scenario-step-container{
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 0 !important;
    margin: 0 !important;
    border-bottom: 1px solid rgba(255,255,255,0.10);
  }
  html.k0lmena-dark .scenario-step-container:last-child{ border-bottom: 0; }
  html.k0lmena-dark .scenario-step-container .text{
    flex: 1;
    color: var(--k-text) !important;
  }
  html.k0lmena-dark .scenario-step-container .text .keyword.highlight{
    color: #ffffff !important;
    font-weight: 800;
  }
  html.k0lmena-dark .scenario-step-container .duration{
    color: var(--k-muted) !important;
  }

  html.k0lmena-dark pre{
    background: rgba(0,0,0,0.32) !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    border-radius: 14px;
    color: #eaeaea !important;
    padding: 12px 14px !important;
  }

  html.k0lmena-dark ::-webkit-scrollbar{ height: 10px; width: 10px; }
  html.k0lmena-dark ::-webkit-scrollbar-thumb{
    background: rgba(255,255,255,0.18);
    border-radius: 999px;
    border: 2px solid rgba(18,18,20,0.92);
  }
  html.k0lmena-dark ::-webkit-scrollbar-thumb:hover{
    background: rgba(255,255,255,0.26);
  }
</style>

<script id="k0lmena-theme-js">
(function () {
  function applyDarkOnly() {
    try {
      document.documentElement.classList.add("darkmode","k0lmena-dark");
      if (document.body) document.body.classList.add("darkmode","k0lmena-dark");
      try {
        localStorage.setItem("theme", "dark");
        localStorage.setItem("darkmode", "true");
        localStorage.setItem("darkMode", "true");
        localStorage.setItem("isDarkMode", "true");
      } catch(e) {}
    } catch(e){}
  }

  function removeThemeToggleIfAny() {
    try {
      var selectors = [
        "#darkmode-toggle",
        "#darkModeToggle",
        ".darkmode-toggle",
        ".darkmode-switch",
        "#theme-toggle",
        ".theme-toggle",
        ".theme-switch",
        "[data-theme-toggle]",
        "[data-darkmode-toggle]"
      ];

      selectors.forEach(function (s) {
        document.querySelectorAll(s).forEach(function (el) {
          var wrapper = el.closest("li") || el.closest("div") || el.closest("span") || el;
          wrapper.remove();
        });
      });

      document
        .querySelectorAll("nav input[type='checkbox'], nav input[type='radio']")
        .forEach(function (inp) {
          var key = ((inp.id || "") + " " + (inp.name || "") + " " + (inp.className || "")).toLowerCase();
          if (key.includes("dark") || key.includes("theme")) {
            var wrapper = inp.closest("li") || inp.closest("div") || inp.closest("span") || inp.parentElement || inp;
            wrapper.remove();
          }
        });
    } catch(e){}
  }

  function boot() {
    applyDarkOnly();
    removeThemeToggleIfAny();
    try {
      var obs = new MutationObserver(function () {
        applyDarkOnly();
        removeThemeToggleIfAny();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch(e){}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>
`.trim();
}

/* ----------------------------- Helpers ----------------------------- */

function collectFilesRecursive(dir, predicate) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...collectFilesRecursive(fullPath, predicate));
    } else if (entry.isFile()) {
      if (!predicate || predicate(fullPath)) out.push(fullPath);
    }
  }

  return out;
}

function waitForHtmlGeneration(rootDir, timeoutMs = 15000) {
  const start = Date.now();

  return new Promise((resolve) => {
    const tick = () => {
      const htmlFiles = collectFilesRecursive(rootDir, (p) =>
        p.toLowerCase().endsWith(".html")
      );

      if (htmlFiles.length > 0) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);

      setTimeout(tick, 250);
    };

    tick();
  });
}
