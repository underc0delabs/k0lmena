import http from 'k6/http';
import { sleep, check } from 'k6';
import { env, authHeaders } from '../lib/utils.js';
// @ts-expect-error JS module without TS types
import { handleSummary as k6HandleSummary } from '../reports/summary.js';
export { k6HandleSummary as handleSummary };

export const options = {
  tags: { suite: 'stress' },
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m',  target: 30 },
        { duration: '1m',  target: 60 },
        { duration: '30s', target: 0  },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<1200', 'p(99)<2500'],
  },
  summaryTrendStats: ['count','min','med','p(90)','p(95)','p(99)','max','avg'],
};

export default function () {
  const res = http.get(env.BASEURL, { headers: authHeaders({ 'x-k0lmena-baseurl': env.BASEURL }) });
  check(res, { 'status is 200': r => r.status === 200 });
  sleep(1);
}
