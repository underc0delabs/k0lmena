import http from 'k6/http';
import { sleep, check } from 'k6';
import { env, authHeaders } from '../lib/utils.js';
import { commonThresholds } from '../lib/thresholds.js';
import '../reports/summary.js';

export const options = {
  thresholds: commonThresholds,
  scenarios: {
    ramping_arrival: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { target: 10, duration: '2m' },
        { target: 30, duration: '3m' },
        { target: 0,  duration: '1m' }
      ]
    }
  },
  tags: { suite: 'http-stress' }
};

export default function () {
  const res = http.get(env.BASEURL, { headers: authHeaders() });
  check(res, { 'status is 200': r => r.status === 200 });
  sleep(1);
}
