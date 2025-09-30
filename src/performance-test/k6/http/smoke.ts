import http from 'k6/http';
import { sleep, check } from 'k6';
import { env, authHeaders } from '../lib/utils.js';
import { commonThresholds } from '../lib/thresholds.js';
// @ts-expect-error JS module without TS types
import { handleSummary as k6HandleSummary } from '../reports/summary.js';
export { k6HandleSummary as handleSummary };


export const options = {
  thresholds: commonThresholds,
  scenarios: {
    smoke: { executor: 'constant-vus', vus: 5, duration: '1m' }
  },
  tags: { suite: 'http-smoke' }
};

export default function () {
  const res = http.get(env.BASEURL, { headers: authHeaders() });
  check(res, { 'status is 200': r => r.status === 200 });
  sleep(1);
}

