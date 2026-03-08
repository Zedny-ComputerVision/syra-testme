import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

async function createDraftTest(token, name, type = 'MCQ', withQuestion = false) {
  const api = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
  const res = await api.post('admin/tests', { data: { name, type } })
  if (!res.ok()) throw new Error(`createDraftTest failed: ${res.status()} ${await res.text()}`)
  const created = await res.json()
  if (withQuestion) {
    const questionRes = await api.post('questions/', {
      data: {
        exam_id: created.id,
        text: 'Publishable question',
        type: 'MCQ',
        options: ['Option A', 'Option B'],
        correct_answer: 'A',
        order: 0,
      },
    })
    if (!questionRes.ok()) throw new Error(`question create failed: ${questionRes.status()} ${await questionRes.text()}`)
  }
  return created
}

test.describe('Admin Manage Tests page', () => {
  test('admin can publish, archive, unarchive, and delete tests from list actions', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    const unique = Date.now()
    const publishName = `UI Publish ${unique}`
    const deleteName = `UI Delete ${unique}`

    await createDraftTest(token, publishName, 'MCQ', true)
    await createDraftTest(token, deleteName)

    await page.goto('/login')
    await page.evaluate((accessToken) => {
      localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
    }, token)
    await page.goto('/admin/dashboard')

    await page.goto('/admin/tests')
    await expect(page).toHaveURL(/\/admin\/tests/)
    await page.getByRole('button', { name: 'Displayed columns', exact: true }).click()
    await page.getByLabel('Code').uncheck()
    await page.getByRole('button', { name: 'Save displayed column set', exact: true }).click()
    await expect(page.locator('table thead th', { hasText: 'Code' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Displayed columns', exact: true }).click()
    await page.getByLabel('Code').check()
    await page.getByRole('button', { name: 'Save displayed column set', exact: true }).click()
    await expect(page.locator('table thead th', { hasText: 'Code' })).toBeVisible()

    const openFilterPanel = async () => {
      const panel = page.locator('div[class*="filterPanel"]')
      if (await panel.count()) return
      await page.getByRole('button', { name: 'Filter', exact: true }).click()
      await expect(page.locator('div[class*="filterPanel"]')).toBeVisible()
    }

    const statusFilter = page
      .locator('div[class*="filterPanel"] select')
      .filter({ has: page.locator('option[value="ARCHIVED"]') })
      .first()

    // Publish -> Archive -> Unarchive flow on first draft
    await page.fill('input[placeholder="Search by name or code..."]', publishName)
    const publishRow = page.locator('tbody tr', { hasText: publishName })
    await expect(publishRow).toBeVisible()
    await publishRow.getByRole('button', { name: 'Schedule' }).click()
    await expect(page).toHaveURL(/\/admin\/tests\/.+\/manage\?tab=sessions/)
    await expect(page.getByRole('heading', { name: 'Testing sessions' })).toBeVisible()
    await page.goto('/admin/tests')
    await page.fill('input[placeholder="Search by name or code..."]', publishName)
    await expect(publishRow).toBeVisible()
    await publishRow.getByRole('button', { name: 'Candidates' }).click()
    await expect(page).toHaveURL(/\/admin\/tests\/.+\/manage\?tab=candidates/)
    await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible()
    await page.goto('/admin/tests')
    await page.fill('input[placeholder="Search by name or code..."]', publishName)
    await expect(publishRow).toBeVisible()
    await publishRow.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(publishRow.getByText('Published')).toBeVisible()

    await publishRow.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(publishRow).toHaveCount(0)

    await openFilterPanel()
    await statusFilter.selectOption('ARCHIVED')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    const archivedRow = page.locator('tbody tr', { hasText: publishName })
    await expect(archivedRow).toBeVisible()
    await archivedRow.getByRole('button', { name: 'Unarchive', exact: true }).click()
    await expect(archivedRow).toHaveCount(0)

    // Delete flow on second draft
    await statusFilter.selectOption('')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.fill('input[placeholder="Search by name or code..."]', deleteName)
    const deleteRow = page.locator('tbody tr', { hasText: deleteName })
    await expect(deleteRow).toBeVisible()
    await deleteRow.getByRole('button', { name: 'Delete', exact: true }).click()
    await deleteRow.getByRole('button', { name: 'Confirm delete', exact: true }).click()
    await expect(deleteRow).toHaveCount(0)
  })
})
