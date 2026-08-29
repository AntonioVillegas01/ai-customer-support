import http from 'k6/http';
import { check, sleep } from 'k6';

// Non-AI staff API read path. ESTIMATED target (not a measured claim): p95 < 300ms.
const API = __ENV.API_URL || 'http://localhost:3001';
const EMAIL = __ENV.STAFF_EMAIL || 'agent@acme.test';
const PASSWORD = __ENV.STAFF_PASSWORD || 'Password123!Password';
const ORG_ID = __ENV.ORG_ID; // required: acme organization id from seed

export const options = {
  scenarios: {
    staff_reads: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const res = http.post(`${API}/v1/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'login ok': (r) => r.status < 300 });
  return { cookies: res.cookies };
}

export default function (data) {
  const jar = http.cookieJar();
  for (const [name, values] of Object.entries(data.cookies)) {
    jar.set(API, name, values[0].value);
  }
  const res = http.get(`${API}/v1/orgs/${ORG_ID}/conversations?limit=20`);
  check(res, { 'list ok': (r) => r.status === 200 });
  sleep(0.5);
}
