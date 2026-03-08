import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

async function bootstrapSession(page, token) {
  await page.goto('/login')
  await page.evaluate((accessToken) => {
    localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
  }, token)
}

function integrationCard(page, title) {
  return page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: /Enable|Disable/ }) }).first()
}

function scheduleRow(page, title) {
  return page.getByTestId('report-schedule-row').filter({ hasText: title }).first()
}

test.describe('Admin system pages', () => {
  test('subscribers and scheduled reports validate and persist', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    const api = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    })
    await api.put('admin-settings/subscribers', { data: { value: '[]' } })
    await bootstrapSession(page, token)

    const email = `reports-${Date.now()}@example.com`
    const scheduleName = `Daily Risk ${Date.now()}`

    await page.goto('/admin/subscribers')
    await expect(page.getByRole('heading', { name: 'Subscribers' })).toBeVisible()

    await page.getByPlaceholder('user@example.com').fill('bad-email')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()

    await page.getByPlaceholder('user@example.com').fill(email)
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Subscriber added.')).toBeVisible()
    await page.reload()
    await expect(page.getByText(email)).toBeVisible()

    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { name: 'Report Builder' })).toBeVisible()

    const main = page.locator('main')
    await main.getByRole('textbox').nth(0).fill(scheduleName)
    await main.getByRole('textbox').nth(1).fill('bad cron')
    await main.getByRole('textbox').nth(2).fill(email)
    await main.getByRole('button', { name: 'Save Schedule' }).click()
    await expect(page.getByText('Invalid cron expression')).toBeVisible()

    await main.getByRole('textbox').nth(1).fill('0 8 * * *')
    await main.getByRole('button', { name: 'Save Schedule' }).click()
    await expect(page.getByText('Schedule created.')).toBeVisible()

    const row = scheduleRow(page, scheduleName)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Run now' }).click()
    await expect(page.getByText(/Report generated successfully|Report run completed successfully/)).toBeVisible()
    const generatedReportLink = page.getByRole('link', { name: 'Open generated report' })
    await expect(generatedReportLink).toBeVisible()
    await expect(generatedReportLink).toHaveAttribute('href', /\/reports\//)

    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(scheduleName)).not.toBeVisible()

    await page.goto('/admin/subscribers')
    const subscriberRow = page.locator('div').filter({ hasText: email }).filter({ has: page.getByRole('button', { name: 'Remove' }) }).first()
    await subscriberRow.getByRole('button', { name: 'Remove' }).nth(0).click()
    await expect(page.getByText('Subscriber removed.')).toBeVisible()
    await expect(page.getByText(email)).not.toBeVisible()
  })

  test('integrations require a URL before enabling and persist saved values', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    const api = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    })
    await api.put('admin-settings/integrations_config', { data: { value: '{}' } })
    await bootstrapSession(page, token)

    const slackUrl = `https://example.com/hooks/${Date.now()}`

    await page.goto('/admin/integrations')
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    const main = page.locator('main')
    await main.getByRole('button', { name: 'Enable' }).nth(0).click()
    await expect(page.getByText('Slack requires a URL before you can enable it.')).toBeVisible()

    await main.getByRole('textbox').nth(0).fill(slackUrl)
    await main.getByRole('button', { name: 'Save' }).nth(0).click()
    await expect(page.getByText('Slack settings saved.')).toBeVisible()

    await page.reload()
    const reloadedMain = page.locator('main')
    await expect(reloadedMain.getByRole('textbox').nth(0)).toHaveValue(slackUrl)

    await reloadedMain.getByRole('button', { name: 'Enable' }).nth(0).click()
    await expect(page.getByText('Slack enabled.')).toBeVisible()
    await expect(reloadedMain.getByRole('button', { name: 'Disable' }).nth(0)).toBeVisible()
  })
})
