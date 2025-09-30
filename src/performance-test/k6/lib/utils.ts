import { check, sleep } from 'k6';
import http, { RefinedResponse, ResponseType } from 'k6/http';

// Reads from environment injected by GitHub Actions or your local shell.
// In k0lmena you already keep .env at repo root; use a dotenv loader (npm scripts) if running locally.
export const env = {
  BASEURL: __ENV.BASEURL || 'https://example.com',
  API_BASEURL: __ENV.API_BASEURL || 'https://api.example.com',
  AUTH_TOKEN: __ENV.AUTH_TOKEN || ''
};

export function authHeaders(extra: Record<string, string> = {}) {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  const headers = Object.assign({}, base, extra); // <- sin spread
  if (env.AUTH_TOKEN) headers['Authorization'] = `Bearer ${env.AUTH_TOKEN}`;
  return headers;
}

export function ok(res: RefinedResponse<ResponseType | undefined>, name='status 2xx') {
  return check(res, { [name]: r => !!r && r.status !== undefined && r.status >= 200 && r.status < 300 });
}

export function pause(ms=500) { sleep(ms/1000); }

export function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
