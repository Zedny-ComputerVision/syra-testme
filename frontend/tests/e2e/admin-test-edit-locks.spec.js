import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

async function withAdminApi(token) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
}

async function createAndPublishTest(token, name) {
  const api = await withAdminApi(token)
  const createRes = await api.post('admin/tests', { data: { name, type: 'MCQ' } })
  if (!createRes.ok()) throw new Error(`create test failed: ${createRes.status()} ${await createRes.text()}`)
  const created = await createRes.json()
  const publishRes = await api.post(`admin/tests/${created.id}/publish`)
  if (!publishRes.ok()) throw new Error(`publish failed: ${publishRes.status()} ${await publishRes.text()}`)
  return created.id
}

test.describe('Admin test edit lock rules', () => {
  test('published test keeps locked fields disabled and allows report fields', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    const name = `UI Edit Locks ${Date.now()}`
    const testId = await createAndPublishTest(token, name)
    const api = await withAdminApi(token)

    await page.goto('/login')
    await page.evaluate((accessToken) => {
      localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
    }, token)
    await page.goto('/admin/dashboard')

    await page.goto(`/admin/tests/${testId}`)
    await expect(page.getByRole('heading', { name })).toBeVisible()

    const nameInput = page.locator('label:has-text("Test name") input').first()
    await expect(nameInput).toBeEnabled()

    await page.getByRole('button', { name: 'Duration and layout' }).click()
    const timeLimitInput = page.locator('label:has-text("Time limit (minutes)") input').first()
    await expect(timeLimitInput).toBeDisabled()

    await page.getByRole('button', { name: 'Score report settings' }).click()
    const reportContentSelect = page.locator('label:has-text("Report content") select').first()
    await expect(reportContentSelect).toBeEnabled()
    await reportContentSelect.selectOption('SCORE_ONLY')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved successfully.')).toBeVisible()

    const detailRes = await api.get(`admin/tests/${testId}`)
    if (!detailRes.ok()) throw new Error(`fetch detail failed: ${detailRes.status()} ${await detailRes.text()}`)
    const detail = await detailRes.json()
    expect(detail.report_content).toBe('SCORE_ONLY')
    expect(detail.time_limit_minutes).toBe(60)
  })
})
