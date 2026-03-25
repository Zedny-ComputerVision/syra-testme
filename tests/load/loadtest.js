import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom metrics ───
const errorRate      = new Rate('errors');
const loginDuration  = new Trend('login_duration', true);
const apiDuration    = new Trend('api_duration', true);
const frontendLoad   = new Trend('frontend_load', true);
const reqCount       = new Counter('total_requests');

// ─── Configuration ───
const BASE_URL   = __ENV.BASE_URL   || 'https://testme.zedny.ai';
const API_URL    = `${BASE_URL}/api`;
const USERS = [
  { role: 'Admin', email: 'admin@example.com', password: 'Admin1234!' },
  { role: 'Instructor', email: 'instructor@example.com', password: 'Instructor1234!' },
  { role: 'Student', email: 'student1@example.com', password: 'Student1234!' },
  { role: 'Student', email: 'student2@example.com', password: 'Student1234!' },
];

// ─── Scenario selector ───
const SCENARIO = __ENV.SCENARIO || 'smoke';

const SCENARIOS = {
  // 1. Smoke — verify system works (1-2 VUs, 30s)
  smoke: {
    stages: [
      { duration: '10s', target: 1 },
      { duration: '20s', target: 2 },
      { duration: '10s', target: 0 },
    ],
    thresholds: {
      http_req_failed:   ['rate<0.01'],
      http_req_duration: ['p(95)<2000'],
    },
  },

  // 2. Baseline — normal performance measurement (5 VUs, 2min)
  baseline: {
    stages: [
      { duration: '30s', target: 5 },
      { duration: '1m',  target: 5 },
      { duration: '30s', target: 0 },
    ],
    thresholds: {
      http_req_failed:   ['rate<0.02'],
      http_req_duration: ['p(95)<1500', 'p(99)<3000'],
      errors:            ['rate<0.05'],
    },
  },

  // 3. Load — expected production traffic (20 VUs, 5min)
  load: {
    stages: [
      { duration: '1m',  target: 10 },
      { duration: '1m',  target: 20 },
      { duration: '2m',  target: 20 },
      { duration: '1m',  target: 0  },
    ],
    thresholds: {
      http_req_failed:   ['rate<0.05'],
      http_req_duration: ['p(95)<2000', 'p(99)<5000'],
      errors:            ['rate<0.10'],
    },
  },

  // 4. Stress — push beyond limits (50 VUs, 5min)
  stress: {
    stages: [
      { duration: '1m',  target: 15 },
      { duration: '1m',  target: 30 },
      { duration: '1m',  target: 50 },
      { duration: '1m',  target: 50 },
      { duration: '1m',  target: 0  },
    ],
    thresholds: {
      http_req_failed:   ['rate<0.15'],
      http_req_duration: ['p(95)<5000'],
    },
  },

  // 5. Spike — sudden traffic burst (0→40 VUs instantly)
  spike: {
    stages: [
      { duration: '30s', target: 2  },
      { duration: '10s', target: 40 },
      { duration: '1m',  target: 40 },
      { duration: '10s', target: 2  },
      { duration: '30s', target: 0  },
    ],
    thresholds: {
      http_req_failed:   ['rate<0.20'],
      http_req_duration: ['p(95)<5000'],
    },
  },
};

const selectedScenario = SCENARIOS[SCENARIO] || SCENARIOS.smoke;
export const options   = selectedScenario;

// ─── Helpers ───
const headers = { 'Content-Type': 'application/json' };

function authHeaders(token) {
  return { ...headers, Authorization: `Bearer ${token}` };
}

function login() {
  // Use __VU to pick a pseudo-random user from the list
  const user = USERS[(__VU || 1) % USERS.length];

  const start = Date.now();
  const res   = http.post(`${API_URL}/auth/login`, JSON.stringify({
    email: __ENV.TEST_EMAIL || user.email, 
    password: __ENV.TEST_PASS || user.password,
  }), { headers, timeout: '15s', tags: { name: 'POST /api/auth/login' } });
  loginDuration.add(Date.now() - start);
  reqCount.add(1);

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token':  (r) => {
      try { return JSON.parse(r.body).access_token !== undefined; }
      catch { return false; }
    },
  });
  errorRate.add(!ok);
  if (!ok) return null;
  return JSON.parse(res.body).access_token;
}

function apiGet(token, path, tag) {
  const start = Date.now();
  const res   = http.get(`${API_URL}${path}`, {
    headers: authHeaders(token), timeout: '10s',
    tags: { name: tag || `GET /api${path}` },
  });
  apiDuration.add(Date.now() - start);
  reqCount.add(1);

  const ok = check(res, {
    [`${tag || path} status OK`]: (r) => r.status >= 200 && r.status < 400,
  });
  errorRate.add(!ok);
  return res;
}

// ─── Main test flow ───
export default function () {

  // 1. Frontend — load the SPA shell
  group('Frontend Load', () => {
    const start = Date.now();
    const res   = http.get(BASE_URL, { timeout: '10s', tags: { name: 'GET /' } });
    frontendLoad.add(Date.now() - start);
    reqCount.add(1);
    check(res, { 'frontend 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  });

  sleep(0.5);

  // 2. Public endpoints (no auth)
  group('Public Endpoints', () => {
    const healthRes = http.get(`${API_URL}/health`, { timeout: '5s', tags: { name: 'GET /api/health' } });
    reqCount.add(1);
    check(healthRes, { 'health 200': (r) => r.status === 200 });
    errorRate.add(healthRes.status !== 200);

    const signupRes = http.get(`${API_URL}/auth/signup-status`, { timeout: '5s', tags: { name: 'GET /api/auth/signup-status' } });
    reqCount.add(1);
    check(signupRes, { 'signup-status OK': (r) => r.status >= 200 && r.status < 400 });

    const maintenanceRes = http.get(`${API_URL}/admin-settings/maintenance/public`, { timeout: '5s', tags: { name: 'GET /api/admin-settings/maintenance/public' } });
    reqCount.add(1);
    check(maintenanceRes, { 'maintenance OK': (r) => r.status >= 200 && r.status < 400 });
  });

  sleep(0.5);

  // 3. Authenticated user journey
  group('Auth Flow', () => {
    const token = login();
    if (!token) { sleep(1); return; }

    sleep(0.3);

    // Dashboard
    apiGet(token, '/dashboard/', 'GET /api/dashboard');
    sleep(0.3);

    // List exams
    apiGet(token, '/exams/?page=1&page_size=10', 'GET /api/exams');
    sleep(0.2);

    // List tests
    apiGet(token, '/admin/tests/?page=1&page_size=10', 'GET /api/admin/tests');
    sleep(0.2);

    // List users
    apiGet(token, '/users/?page=1&page_size=10', 'GET /api/users');
    sleep(0.2);

    // User profile
    apiGet(token, '/auth/me', 'GET /api/auth/me');
    sleep(0.2);

    // List courses
    apiGet(token, '/courses/', 'GET /api/courses');
    sleep(0.2);

    // List notifications
    apiGet(token, '/notifications/', 'GET /api/notifications');
    sleep(0.2);

    // Notification count
    apiGet(token, '/notifications/unread-count', 'GET /api/notifications/unread-count');
    sleep(0.2);

    // Categories
    apiGet(token, '/categories/', 'GET /api/categories');
    sleep(0.2);

    // Audit log
    apiGet(token, '/audit-log/?page=1&page_size=10', 'GET /api/audit-log');
  });

  sleep(1 + Math.random() * 2); // think time
}
