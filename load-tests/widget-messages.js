import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Message acceptance latency, excluding AI generation (the POST returns 202 before AI work).
// Targets are ESTIMATED engineering targets, not measured claims: p95 < 500ms.
const acceptLatency = new Trend('message_accept_latency', true);

const API = __ENV.API_URL || 'http://localhost:3001';
const ORIGIN = __ENV.WIDGET_ORIGIN || 'http://localhost:3002';
const WIDGET_KEY = __ENV.WIDGET_KEY || 'wgt_acme_local_demo_key';

export const options = {
  scenarios: {
    widget_messages: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    message_accept_latency: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const tokenRes = http.post(`${API}/v1/widget/token`, JSON.stringify({ widgetKey: WIDGET_KEY }), {
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  check(tokenRes, { 'token minted': (r) => r.status === 201 || r.status === 200 });
  return { token: tokenRes.json('token') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Authorization: `Bearer ${data.token}`,
  };
  const conv = http.post(`${API}/v1/widget/conversations`, JSON.stringify({}), { headers });
  if (conv.status >= 300) {
    sleep(1);
    return;
  }
  const convId = conv.json('id');
  const res = http.post(
    `${API}/v1/widget/conversations/${convId}/messages`,
    JSON.stringify({
      content: 'What is your shipping policy?',
      idempotencyKey: crypto.randomUUID(),
    }),
    { headers },
  );
  acceptLatency.add(res.timings.duration);
  check(res, { 'message accepted': (r) => r.status < 300 });
  sleep(1);
}
