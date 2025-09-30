// src/performance-test/k6/http/stress.ts
import http from "k6/http";
import { sleep as sleep2, check as check2 } from "k6";

// src/performance-test/k6/lib/utils.ts
import { check, sleep } from "k6";
var env = {
  BASEURL: __ENV.BASEURL || "https://example.com",
  API_BASEURL: __ENV.API_BASEURL || "https://api.example.com",
  AUTH_TOKEN: __ENV.AUTH_TOKEN || ""
};
function authHeaders(extra = {}) {
  const base = { "Content-Type": "application/json" };
  const headers = Object.assign({}, base, extra);
  if (env.AUTH_TOKEN) headers["Authorization"] = `Bearer ${env.AUTH_TOKEN}`;
  return headers;
}

// src/performance-test/k6/lib/thresholds.ts
var commonThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500", "p(99)<1200"],
  checks: ["rate>0.99"]
};

// src/performance-test/k6/http/stress.ts
var options = {
  thresholds: commonThresholds,
  scenarios: {
    ramping_arrival: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { target: 10, duration: "2m" },
        { target: 30, duration: "3m" },
        { target: 0, duration: "1m" }
      ]
    }
  },
  tags: { suite: "http-stress" }
};
function stress_default() {
  const res = http.get(env.BASEURL, { headers: authHeaders() });
  check2(res, { "status is 200": (r) => r.status === 200 });
  sleep2(1);
}
export {
  stress_default as default,
  options
};
//# sourceMappingURL=stress.js.map
