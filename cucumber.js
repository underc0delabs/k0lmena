// Cucumber configuration (dynamic).
//
// Migrated from cucumber.json to JavaScript so the parallelism can be toggled
// from the environment (.env). The profile shape is otherwise identical.
//
// PARALLEL env var:
//   (empty) | 0 | 1 | false | off | no  -> sequential (single process)
//   on | true | yes                     -> auto (one worker per CPU core)
//   N (>1)                              -> N parallel workers
require('dotenv').config();

const resolveParallel = () => {
  const raw = (process.env.PARALLEL ?? '').trim().toLowerCase();
  if (!raw || ['0', '1', 'false', 'off', 'no'].includes(raw)) return 0;
  if (['on', 'true', 'yes', 'auto'].includes(raw)) {
    // "auto": use the number of logical CPUs (min 2).
    const cpus = require('os').cpus()?.length || 2;
    return Math.max(2, cpus);
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 0;
};

const parallel = resolveParallel();

const common = {
  requireModule: ['ts-node/register'],
  timeout: 60000,
  formatOptions: {
    snippetInterface: 'async-await',
  },
};

module.exports = {
  front: {
    ...common,
    paths: ['src/front-test/features/*.feature'],
    require: ['src/front-test/steps/*.ts'],
    parallel,
    format: [
      ['html', 'src/reports/front/front-report.html'],
      'summary',
      'progress-bar',
      'json:src/reports/front/cucumber-report.json',
    ],
  },

  api: {
    ...common,
    paths: ['src/api-test/features/*.feature'],
    require: ['src/api-test/tests/*.ts'],
    parallel,
    format: [
      ['html', 'src/reports/api/api-report.html'],
      'summary',
      'progress-bar',
      'json:src/reports/api/cucumber-report.json',
    ],
  },

  // Debug always runs sequentially so breakpoints / logs are readable.
  debug: {
    ...common,
    paths: ['src/front-test/features/*.feature'],
    require: ['src/tools/debug/debugHook.ts', 'src/front-test/steps/*.ts'],
    parallel: 0,
    format: [
      ['html', 'src/reports/front/front-report-debug.html'],
      'summary',
      'progress-bar',
      'json:src/reports/front/cucumber-report-debug.json',
    ],
  },
};
