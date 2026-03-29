import { expect, request as playwrightRequest, test } from '@playwright/test'
import { createCourseAndNode, ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

test.describe('Admin New Test Wizard draft flow', () => {
  test('admin can save a draft without questions and finish the wizard', async ({ page, context }) => {
    const { token: adminToken } = await ensureAdmin(context)
    const { node } = await createCourseAndNode(adminToken)
    const title = `Draft Wizard ${Date.now()}`

    const api = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    })

    await page.goto('/login')
    await page.evaluate((accessToken) => {
      localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
    }, adminToken)

    await page.goto('/admin/tests/new')
    await page.locator('input[name="title"]').fill(title)
    await page.locator('select[name="course"]').selectOption(String(node.course_id))
    await expect.poll(async () => {
      return await page.locator('select[name="node"]').inputValue()
    }, { timeout: 30000 }).not.toBe('')

    for (let step = 0; step < 8; step += 1) {
      const nextBtn = page.getByRole('button', { name: /Next/i })
      await expect(nextBtn).toBeEnabled({ timeout: 30000 })
      await nextBtn.click()
    }

    await expect(page.getByText(/Drafts can be saved without questions/i)).toBeVisible()
    await page.getByRole('radio', { name: /Draft Not visible to candidates/i }).check()
    await page.getByRole('button', { name: /Save as Draft/i }).click()
    await expect(page).toHaveURL(/\/admin\/tests$/)

    await expect.poll(async () => {
      const res = await api.get('admin/tests', { params: { search: title } })
      const body = await res.json()
      return (body?.items || []).find((item) => item.name === title)?.status || null
    }, { timeout: 15000 }).toBe('DRAFT')
  })
})
