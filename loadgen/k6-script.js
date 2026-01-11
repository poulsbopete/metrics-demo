import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '2m', target: 10 },    // Stay at 10 users
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '2m', target: 20 },     // Stay at 20 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    errors: ['rate<0.1'],             // Error rate should be less than 10%
  },
};

const BASE_URL = __ENV.FRONTEND_URL || 'http://frontend:8080';

export default function () {
  // Generate random paths to simulate high cardinality
  const paths = [
    '/api/call',
    '/orders/12345',
    '/orders/67890',
    '/users/111',
    '/users/222',
    '/products/333',
    '/products/444',
  ];
  
  const randomPath = paths[Math.floor(Math.random() * paths.length)];
  const url = `${BASE_URL}${randomPath}`;
  
  const params = {
    headers: {
      'User-Agent': `k6-loadgen-${Math.floor(Math.random() * 1000)}`,
    },
  };

  const res = http.get(url, params);
  
  const result = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!result);
  
  sleep(0.5); // 2 requests per second per user
}
