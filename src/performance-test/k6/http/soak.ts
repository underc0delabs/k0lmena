import http from 'k6/http';
import { sleep, check } from 'k6';
import { env, authHeaders } from '../lib/utils.js';
// @ts-expect-error JS module without TS types
import { handleSummary as k6HandleSummary } from '../reports/summary.js';
export { k6HandleSummary as handleSummary };

export const options = {
  scenarios: {
    soak: { executor: 'constant-vus', vus: 5, duration: '10m' } // ajustá a tu preferencia
  },
  tags: { suite: 'http-soak', baseurl: env.BASEURL }
};

export default function () {
  const res = http.get(env.BASEURL, { headers: authHeaders({ 'x-k0lmena-baseurl': env.BASEURL }) });
  check(res, { 'status is 200': r => r.status === 200 });
  sleep(1);
}
