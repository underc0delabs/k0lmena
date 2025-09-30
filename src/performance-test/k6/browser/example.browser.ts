import { browser } from 'k6/experimental/browser';
import { check, sleep } from 'k6';
import { env } from '../lib/utils.js';
import { commonThresholds } from '../lib/thresholds.js';
import '../reports/summary.js';

export const options = {
  thresholds: commonThresholds,
  scenarios: {
    ui: {
      executor: 'constant-vus',
      vus: 3,
      duration: '1m',
      options: { browser: { type: 'chromium' } }
    }
  },
  tags: { suite: 'browser-ui' }
};

export default async function () {
  const page = browser.newPage();
  try {
    await page.goto(env.BASEURL, { waitUntil: 'networkidle' });
    const title = await page.title();
    check(title, { 'has title': t => typeof t === 'string' && t.length > 0 });
    await page.waitForTimeout(500);
    sleep(1);
  } finally {
    await page.close();
  }
}
