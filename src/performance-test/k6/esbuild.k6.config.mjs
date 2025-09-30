// src/performance-test/k6/esbuild.k6.config.mjs
// Bundlea las suites TS de k6 y copia el summary.js sin bundlear

import { build } from 'esbuild';
import { globby } from 'globby';
import path from 'node:path';
import fs from 'node:fs';

const entryPatterns = [
  'src/performance-test/k6/http/*.ts',
  'src/performance-test/k6/browser/*.ts',
  // ⚠️ No bundlear reports/*.js (se copia tal cual)
];

const entries = (await globby(entryPatterns)).map((f) => ({
  in: f,
  out: path.join('dist/k6', path.relative('src/performance-test/k6', f)).replace(/\.ts$/, '.js'),
}));

// Asegurar carpetas de salida
for (const e of entries) {
  fs.mkdirSync(path.dirname(e.out), { recursive: true });
}

// Módulos nativos de k6 (se resuelven en runtime)
const K6_EXTERNAL = [
  'k6',
  'k6/http',
  'k6/metrics',
  'k6/encoding',
  'k6/ws',
  'k6/experimental/browser',
  'k6/experimental/timers',
];

// Build de todas las entradas
await Promise.all(
  entries.map((e) =>
    build({
      entryPoints: [e.in],
      outfile: e.out,
      bundle: true,
      platform: 'neutral',
      format: 'esm',
      target: ['es2017'], // más compatible con k6
      sourcemap: true,
      external: K6_EXTERNAL,
    }),
  ),
);

// ✅ Copiar summary.js a dist (sin bundlear)
const srcSummary = 'src/performance-test/k6/reports/summary.js';
const outSummary = 'dist/k6/reports/summary.js';
fs.mkdirSync(path.dirname(outSummary), { recursive: true });
fs.copyFileSync(srcSummary, outSummary);

console.log(`Built ${entries.length} k6 files and copied reports/summary.js`);
