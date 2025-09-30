import { browser } from 'k6/experimental/browser';
import { check, sleep } from 'k6';
import { env } from '../lib/utils.js';
import { commonThresholds } from '../lib/thresholds.js';

// Re-export del summary (para generar HTML/JSON al terminar la ejecución)
// @ts-expect-error JS module without TS types
import { handleSummary as k6HandleSummary } from '../reports/summary.js';
export { k6HandleSummary as handleSummary };

export const options = {
  thresholds: commonThresholds,
  scenarios: {
    ui: {
      executor: 'constant-vus',
      vus: 3,
      duration: '1m',
      options: {
        browser: { type: 'chromium' }
      }
    }
  },
  tags: { suite: 'browser-ui' }
};

export default async function () {
  const page = browser.newPage();

  try {
    await page.goto(env.BASEURL, { waitUntil: 'networkidle' });
    const title = await page.title();
    check(title, { 'has title': (t: unknown) => typeof t === 'string' && (t as string).length > 0 });

    // ejemplo de espera corta
    await page.waitForTimeout(500);
    sleep(1);
  } finally {
    await page.close();
  }
}
