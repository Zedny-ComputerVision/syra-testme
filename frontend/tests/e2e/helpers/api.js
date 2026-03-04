import { request } from '@playwright/test'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api'

export async function ensureAdmin(context) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'Password123!'
  const base = await request.newContext({ baseURL: API_BASE })
  // If seed endpoint is enabled, reset DB and seed fixtures
  try {
    const seed = await base.post('/testing/reset-seed')
    if (seed.ok()) {
      const seeded = await seed.json()
      return { token: await loginToken(base, adminEmail, password), email: seeded.admin.email, password: seeded.admin.password }
    }
  } catch (_) {
    // ignore if endpoint not enabled
  }
  // Try login
  let res = await base.post('/auth/login', { data: { email: adminEmail, password } })
  if (res.ok()) {
    const body = await res.json()
    return { token: body.access_token, email: adminEmail, password }
  }
  // Try setup (only allowed when no admins exist)
  await base.post('/auth/setup', {
    data: {
      email: adminEmail,
      password,
      name: 'Admin User',
      user_id: 'ADM001',
      role: 'ADMIN',
    },
  })
  res = await base.post('/auth/login', { data: { email: adminEmail, password } })
  if (!res.ok()) throw new Error('Unable to create/login admin')
  const body = await res.json()
  return { token: body.access_token, email: adminEmail, password }
}

async function loginToken(base, email, password) {
  const res = await base.post('/auth/login', { data: { email, password } })
  const body = await res.json()
  return body.access_token
}

export async function createLearner(context, adminToken, overrides = {}) {
  const base = await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  })
  const suffix = Math.random().toString(36).slice(2, 7)
  const email = overrides.email || `learner+${suffix}@example.com`
  const user_id = overrides.user_id || `LRN${suffix}`
  const password = overrides.password || 'Password123!'
  const resp = await base.post('/users/', {
    data: {
      email,
      name: overrides.name || 'Learner Test',
      user_id,
      role: 'LEARNER',
      password,
    },
  })
  if (!resp.ok() && resp.status() !== 409) {
    throw new Error(`Failed to create learner: ${resp.status()} ${await resp.text()}`)
  }
  return { email, password, user_id }
}

export async function createCourseAndNode(adminToken) {
  const base = await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  })
  const suffix = Math.random().toString(36).slice(2, 6)
  const { data: course } = await base.post('/courses/', {
    data: { title: `E2E Course ${suffix}`, description: 'E2E course', status: 'DRAFT' },
  }).then(async r => ({ data: await r.json(), status: r.status() }))
  const { data: node } = await base.post('/nodes/', {
    data: { course_id: course.id, title: 'Module 1', order: 0 },
  }).then(async r => ({ data: await r.json(), status: r.status() }))
  return { course, node }
}
