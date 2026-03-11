import fs from 'node:fs/promises'
import path from 'node:path'
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin, createLearner, createCourseAndNode } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

async function findNamedFile(rootDir, fileNames, depth = 0) {
  if (depth > 5) return null
  let entries = []
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (entry.isFile() && fileNames.includes(entry.name)) {
      return path.join(rootDir, entry.name)
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = await findNamedFile(path.join(rootDir, entry.name), fileNames, depth + 1)
    if (nested) return nested
  }
  return null
}

async function loadIdentityFixtureDataUrl() {
  const candidates = [
    path.resolve(process.cwd(), '..', 'backend', '.venv'),
    path.resolve(process.cwd(), '..', 'backend', 'storage'),
  ]
  for (const rootDir of candidates) {
    const filePath = await findNamedFile(rootDir, ['grace_hopper.jpg', 'zidane.jpg'])
    if (filePath) {
      const raw = await fs.readFile(filePath)
      return `data:image/jpeg;base64,${raw.toString('base64')}`
    }
  }
  return null
}

test.describe('Admin New Test Wizard end-to-end', () => {
  test('admin can create exam with question and learner can take it', async ({ page, context }) => {
    const { token: adminToken } = await ensureAdmin(context)
    const learner = await createLearner(context, adminToken)
    const { node } = await createCourseAndNode(adminToken)

    // Admin auth bootstrap
    await page.goto('/login')
    await page.evaluate((accessToken) => {
      localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
    }, adminToken)
    await page.goto('/admin/dashboard')

    // Start wizard
    await page.goto('/admin/tests/new')
    await expect(page).toHaveURL(/admin\/tests\/new/)

    // Step 0 - Information
    const examTitle = `E2E Exam ${Date.now()}`
    await page.fill('input[name="title"]', examTitle)
    await page.selectOption('select[name="course"]', node.course_id)
    await expect.poll(async () => {
      return page.locator('select[name="node"] option').count()
    }, { timeout: 15000 }).toBeGreaterThan(1)
    const nodeOption = page.locator(`select[name="node"] option[value="${node.id}"]`)
    if (await nodeOption.count()) {
      await page.selectOption('select[name="node"]', node.id)
    } else {
      const fallbackValue = await page.locator('select[name="node"] option:not([value=""])').first().getAttribute('value')
      await page.selectOption('select[name="node"]', fallbackValue || '')
    }
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 1 - Method
    await expect(page.getByRole('heading', { name: 'Test Creation Method' })).toBeVisible()
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 2 - Proctoring & settings
    await expect(page.getByRole('heading', { name: 'Proctoring & Test Settings' })).toBeVisible()
    await page.fill('input[name="time_limit"]', '20')
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 3 - Questions
    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()
    await page.getByRole('button', { name: /Add Single Choice/i }).click()
    await page.fill('input[placeholder="Enter question..."]', 'Warm-up question')
    await page.fill('input[placeholder="Option A"]', 'Option A')
    await page.fill('input[placeholder="Option B"]', 'Option B')
    await page.fill('input[placeholder="Option C"]', 'Option C')
    await page.fill('input[placeholder="Option D"]', 'Option D')
    await page.getByRole('button', { name: /Add Question/i }).click()
    await page.getByRole('button', { name: /Next/i }).click()

    // Complete the wizard through the canonical publish flow.
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: /Next/i }).click()
    }
    await page.getByLabel('Published').check()
    await page.getByRole('button', { name: /Publish Test/i }).click()
    await expect(page).toHaveURL(/\/admin\/tests/)

    const api = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    })
    const fetchWizardTest = async () => {
      const testsRes = await api.get('admin/tests', {
        params: { search: examTitle, status: 'DRAFT,PUBLISHED,ARCHIVED', page_size: 100 },
      })
      const testsPayload = await testsRes.json()
      return (testsPayload.items || []).find((item) => item.name === examTitle) || null
    }
    await expect.poll(async () => (await fetchWizardTest())?.status || null, { timeout: 15000 }).toBe('PUBLISHED')
    const exam = await fetchWizardTest()
    if (!exam) throw new Error('Wizard-created test not found in admin/tests')

    // Logout (force clear auth token to avoid flaky navbar selectors).
    await page.evaluate(() => localStorage.removeItem('syra_tokens'))

    // Learner login
    await page.goto('/login')
    await page.fill('input[type="email"]', learner.email)
    await page.fill('input[type="password"]', learner.password)
    await page.click('button:has-text("Sign In")')
    await expect.poll(async () => {
      return page.evaluate(() => !!localStorage.getItem('syra_tokens'))
    }, { timeout: 15000 }).toBe(true)
    await page.goto('/tests')

    // Create learner attempt via API and bypass precheck in test mode.
    const learnerToken = await page.evaluate(() => {
      const raw = localStorage.getItem('syra_tokens')
      if (!raw) return null
      try { return JSON.parse(raw).access_token || null } catch { return null }
    })
    if (!learnerToken) throw new Error('Learner token missing after UI login')
    const learnerAuthedApi = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${learnerToken}` },
    })
    const attemptRes = await learnerAuthedApi.post('attempts/resolve', { data: { exam_id: exam.id } })
    if (!attemptRes.ok()) throw new Error(`Create attempt failed: ${attemptRes.status()} ${await attemptRes.text()}`)
    const attempt = await attemptRes.json()
    if (!attempt?.id) throw new Error(`Create attempt response missing id: ${JSON.stringify(attempt)}`)
    const identityFixture = await loadIdentityFixtureDataUrl()
    if (identityFixture) {
      const verifyRes = await learnerAuthedApi.post(`attempts/${attempt.id}/verify-identity`, {
        data: { photo_base64: identityFixture },
      })
      if (!verifyRes.ok()) throw new Error(`Verify identity failed: ${verifyRes.status()} ${await verifyRes.text()}`)
    } else {
      const precheckRes = await learnerAuthedApi.post(`precheck/${attempt.id}`, { data: { test_pass: true } })
      if (!precheckRes.ok()) throw new Error(`Precheck failed: ${precheckRes.status()} ${await precheckRes.text()}`)
    }

    await page.goto(`/attempts/${attempt.id}/take`)
    await expect(page.getByRole('heading', { name: examTitle })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
    await expect(page.getByPlaceholder('Search tests, attempts, users...')).toHaveCount(0)

    // Submit attempt via API, then verify learner can open result page.
    const submitRes = await learnerAuthedApi.post(`attempts/${attempt.id}/submit`)
    if (!submitRes.ok()) throw new Error(`Submit attempt failed: ${submitRes.status()} ${await submitRes.text()}`)
    await page.goto('/attempts')
    await expect(page.getByText(examTitle, { exact: false })).toBeVisible({ timeout: 15000 })
  })
})
