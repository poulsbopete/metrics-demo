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

// Global state to cache frontend status
let frontendStatus = null;
let lastStatusCheck = 0;
const STATUS_CHECK_INTERVAL = 10000; // Check every 10 seconds

// Check frontend status to determine traffic pattern
function getFrontendStatus() {
  const now = Date.now();
  // Cache status for 10 seconds to avoid too many status checks
  if (frontendStatus && (now - lastStatusCheck) < STATUS_CHECK_INTERVAL) {
    return frontendStatus;
  }
  
  try {
    const statusRes = http.get(`${BASE_URL}/status`, { timeout: '2s' });
    if (statusRes.status === 200) {
      frontendStatus = JSON.parse(statusRes.body);
      lastStatusCheck = now;
      return frontendStatus;
    }
  } catch (e) {
    // If status check fails, use cached status or default
  }
  
  // Return cached status or default
  return frontendStatus || { mode: 'firehose', cardinalityBombMode: false, highCardinalityMode: false };
}

export default function () {
  // Check frontend status periodically
  const status = getFrontendStatus();
  const bombMode = status.cardinalityBombMode === true;
  const highCardinality = status.highCardinalityMode === true || status.mode === 'firehose';
  
  let randomPath;
  
  if (bombMode) {
    // Cardinality bomb mode: generate paths with random IDs
    const pathPrefixes = ['/orders/', '/users/', '/products/', '/items/', '/transactions/'];
    const prefix = pathPrefixes[Math.floor(Math.random() * pathPrefixes.length)];
    const randomId = Math.floor(Math.random() * 10000);
    randomPath = `${prefix}${randomId}`;
  } else if (highCardinality) {
    // High cardinality mode: use predefined paths with some variation
    const paths = [
      '/api/call',
      `/orders/${Math.floor(Math.random() * 1000)}`,
      `/orders/${Math.floor(Math.random() * 1000)}`,
      `/users/${Math.floor(Math.random() * 1000)}`,
      `/users/${Math.floor(Math.random() * 1000)}`,
      `/products/${Math.floor(Math.random() * 1000)}`,
      `/products/${Math.floor(Math.random() * 1000)}`,
    ];
    randomPath = paths[Math.floor(Math.random() * paths.length)];
  } else {
    // Shaped mode: use normalized paths
    const paths = [
      '/api/call',
      '/orders/12345',
      '/orders/67890',
      '/users/111',
      '/users/222',
      '/products/333',
      '/products/444',
    ];
    randomPath = paths[Math.floor(Math.random() * paths.length)];
  }
  
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
