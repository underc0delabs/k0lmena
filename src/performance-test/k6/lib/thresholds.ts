// Common defaults (widely used as a starting point)
export const commonThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<500', 'p(99)<1200'],
  checks: ['rate>0.99']
};
