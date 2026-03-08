import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

async function adminApi(token) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
}

async function addQuestion(api, testId) {
  const questionRes = await api.post('questions/', {
    data: {
      exam_id: testId,
      text: 'Archived lock question',
      type: 'MCQ',
      options: ['Option A', 'Option B'],
      correct_answer: 'A',
      order: 0,
    },
  })
  if (!questionRes.ok()) throw new Error(`question create failed: ${questionRes.status()} ${await questionRes.text()}`)
}

async function createArchivedTest(token, name) {
  const api = await adminApi(token)
  const createRes = await api.post('admin/tests', { data: { name, type: 'MCQ' } })
  if (!createRes.ok()) throw new Error(`create failed: ${createRes.status()} ${await createRes.text()}`)
  const created = await createRes.json()
  await addQuestion(api, created.id)
  const publishRes = await api.post(`admin/tests/${created.id}/publish`)
  if (!publishRes.ok()) throw new Error(`publish failed: ${publishRes.status()} ${await publishRes.text()}`)
  const archiveRes = await api.post(`admin/tests/${created.id}/archive`)
  if (!archiveRes.ok()) throw new Error(`archive failed: ${archiveRes.status()} ${await archiveRes.text()}`)
  return created.id
}

test.describe('Admin archived test lock', () => {
  test('archived test is read-only in UI and rejects PATCH in API', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    const name = `UI Archived ${Date.now()}`
    const testId = await createArchivedTest(token, name)
    const api = await adminApi(token)

    await page.goto('/login')
    await page.evaluate((accessToken) => {
      localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
    }, token)
    await page.goto('/admin/dashboard')

    await page.goto(`/admin/tests/${testId}`)
    await expect(page).toHaveURL(new RegExp(`/admin/tests/${testId}/manage`))
    await expect(page.locator('label:has-text("Test name") input').first()).toHaveValue(name)

    const patchRes = await api.patch(`admin/tests/${testId}`, { data: { name: `${name} Updated` } })
    expect(patchRes.status()).toBe(409)
    const patchBody = await patchRes.json()
    const errorCode = patchBody.error?.code || patchBody.detail?.error?.code
    expect(errorCode).toBe('LOCKED_FIELDS')
  })
})
