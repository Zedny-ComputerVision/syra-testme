import { expect, test } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

test.describe('Auth session handling', () => {
  test('invalid stored token redirects protected admin routes back to login', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('syra_tokens', JSON.stringify({
        access_token: 'definitely-not-a-token',
        refresh_token: 'definitely-not-a-refresh-token',
      }))
    })

    await page.goto('/admin/tests')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logout clears tokens and returns the user to login', async ({ page, context }) => {
    const admin = await ensureAdmin(context)

    await page.goto('/login')
    await page.fill('input[type="email"]', admin.email)
    await page.fill('input[type="password"]', admin.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/admin\/dashboard/)
    await page.locator('button[class*="avatarBtn"]').click()
    await page.getByRole('button', { name: 'Logout' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('syra_tokens'))).toBe(null)
  })
})
