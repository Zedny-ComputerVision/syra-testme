import { request } from '@playwright/test'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'
let cachedAdminPassword = null
let cachedAdminToken = null
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function ensureAdmin(context) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'Password123!'
  const candidatePasswords = Array.from(new Set([
    cachedAdminPassword,
    'Admin1234!',
    password,
    'Password123!',
    'ZednyAdmin12#',
  ].filter(Boolean)))
  const base = await request.newContext({ baseURL: API_BASE })

  // Reset seed first when the endpoint is available so each spec starts from known state.
  try {
    const seed = await base.post('testing/reset-seed')
    if (seed.ok()) {
      const seeded = await seed.json()
      cachedAdminToken = null
      cachedAdminPassword = seeded.admin.password
      const token = await loginToken(base, seeded.admin.email, seeded.admin.password)
      cachedAdminToken = token
      return { token, email: seeded.admin.email, password: seeded.admin.password }
    }
  } catch (_) {
    // ignore if endpoint not enabled
  }
  if (cachedAdminToken && cachedAdminPassword) {
    const me = await base.get('auth/me', { headers: { Authorization: `Bearer ${cachedAdminToken}` } })
    if (me.ok()) {
      return { token: cachedAdminToken, email: adminEmail, password: cachedAdminPassword }
    }
    cachedAdminToken = null
  }
  // Try login with known admin password candidates.
  for (const candidate of candidatePasswords) {
    const res = await base.post('auth/login', { data: { email: adminEmail, password: candidate } })
    if (res.status() === 429) {
      await sleep(1500)
      continue
    }
    if (res.ok()) {
      const body = await res.json()
      cachedAdminPassword = candidate
      cachedAdminToken = body.access_token
      return { token: body.access_token, email: adminEmail, password: candidate }
    }
  }
  // Try setup (only allowed when no admins exist)
  await base.post('auth/setup', {
    data: {
      email: adminEmail,
      password,
      name: 'Admin User',
      user_id: 'ADM001',
      role: 'ADMIN',
    },
  })
  for (const candidate of candidatePasswords) {
    const res = await base.post('auth/login', { data: { email: adminEmail, password: candidate } })
    if (res.status() === 429) {
      await sleep(1500)
      continue
    }
    if (res.ok()) {
      const body = await res.json()
      cachedAdminPassword = candidate
      cachedAdminToken = body.access_token
      return { token: body.access_token, email: adminEmail, password: candidate }
    }
  }
  throw new Error('Unable to create/login admin')
}

async function loginToken(base, email, password) {
  const res = await base.post('auth/login', { data: { email, password } })
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
  const resp = await base.post('users/', {
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
  const { data: course } = await base.post('courses/', {
    data: { title: `E2E Course ${suffix}`, description: 'E2E course', status: 'DRAFT' },
  }).then(async r => ({ data: await r.json(), status: r.status() }))
  const { data: node } = await base.post('nodes/', {
    data: { course_id: course.id, title: 'Module 1', order: 0 },
  }).then(async r => ({ data: await r.json(), status: r.status() }))
  return { course, node }
}

export async function assignLearnerToExam(adminToken, learnerUserId, examId, overrides = {}) {
  const base = await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  })
  const usersRes = await base.get('users/', {
    params: {
      search: learnerUserId,
      limit: 200,
      role: 'LEARNER',
    },
  })
  if (!usersRes.ok()) {
    throw new Error(`Failed to list learners: ${usersRes.status()} ${await usersRes.text()}`)
  }
  const usersBody = await usersRes.json()
  const users = usersBody.items || usersBody
  const learner = users.find((user) => String(user.user_id) === String(learnerUserId))
  if (!learner?.id) {
    throw new Error(`Learner fixture lookup failed for ${learnerUserId}`)
  }

  const scheduledAt = overrides.scheduled_at || new Date().toISOString()
  const accessMode = overrides.access_mode || 'RESTRICTED'
  const scheduleRes = await base.post('schedules/', {
    data: {
      exam_id: examId,
      user_id: learner.id,
      scheduled_at: scheduledAt,
      access_mode: accessMode,
    },
  })
  if (scheduleRes.status() === 409) {
    const existingRes = await base.get('schedules/', {
      params: {
        exam_id: examId,
      },
    })
    if (!existingRes.ok()) {
      throw new Error(`Failed to read existing schedule after conflict: ${existingRes.status()} ${await existingRes.text()}`)
    }
    const existingBody = await existingRes.json()
    const existingRows = existingBody.items || existingBody
    const existing = existingRows.find((schedule) => String(schedule.user_id) === String(learner.id))
    if (!existing) {
      throw new Error(`Schedule conflict reported but no existing schedule found for learner ${learnerUserId}`)
    }
    return existing
  }
  if (!scheduleRes.ok()) {
    throw new Error(`Failed to create schedule: ${scheduleRes.status()} ${await scheduleRes.text()}`)
  }
  return scheduleRes.json()
}
