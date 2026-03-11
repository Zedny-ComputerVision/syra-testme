import { expect, request as playwrightRequest, test } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

async function createInstructor(adminToken) {
  const api = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  })
  const suffix = Math.random().toString(36).slice(2, 7)
  const email = `instructor+${suffix}@example.com`
  const password = 'Password123!'
  const userId = `INS${suffix.toUpperCase()}`
  const response = await api.post('users/', {
    data: {
      email,
      password,
      name: 'Instructor Test',
      user_id: userId,
      role: 'INSTRUCTOR',
    },
  })
  if (!response.ok() && response.status() !== 409) {
    throw new Error(`Failed to create instructor: ${response.status()} ${await response.text()}`)
  }
  return { email, password }
}

test.describe('Instructor attempt analysis access', () => {
  test('instructor can open the attempt-analysis route without access-denied redirect', async ({ page, context }) => {
    const admin = await ensureAdmin(context)
    const instructor = await createInstructor(admin.token)

    await page.goto('/login')
    await page.fill('input[type="email"]', instructor.email)
    await page.fill('input[type="password"]', instructor.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = localStorage.getItem('syra_tokens')
        return raw ? 'ready' : 'missing'
      })
    }).toBe('ready')

    await page.goto('/admin/attempt-analysis')
    await expect(page).toHaveURL(/\/admin\/attempt-analysis/)
    await expect(page.getByRole('heading', { name: /attempt analysis/i })).toBeVisible()
  })
})
