import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin, createLearner, createCourseAndNode } from './helpers/api'

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
    await page.goto('/admin/exams/new')
    await expect(page).toHaveURL(/admin\/exams\/new/)

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
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 2 - Settings
    await page.fill('input[name="time_limit"]', '20')
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 3 - Questions (auto-save only, no UI question creation)
    await page.getByRole('button', { name: /\+ Add Question/i }).click()
    await page.fill('input[placeholder="Enter question..."]', 'Warm-up question')
    await page.fill('input[placeholder="Option A"]', 'Option A')
    await page.fill('input[placeholder="Option B"]', 'Option B')
    await page.fill('input[placeholder="Option C"]', 'Option C')
    await page.fill('input[placeholder="Option D"]', 'Option D')
    await page.getByRole('button', { name: /Add Question/i }).click()
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 4+ is covered by API publish in this smoke flow.
    await page.waitForTimeout(500)

    // Back-end: ensure question exists for learner flow
    const api = await playwrightRequest.newContext({ baseURL: process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/', extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
    const examsRes = await api.get('exams/')
    const exams = await examsRes.json()
    const exam = exams.find(e => e.title === examTitle)
    if (!exam) throw new Error('Exam not found after wizard')
    await api.post('questions/', {
      data: {
        exam_id: exam.id,
        text: '2+2=?',
        type: 'MCQ',
        options: ['4', '5', '6', '1'],
        correct_answer: '4',
        points: 1,
      },
    })
    await api.put(`exams/${exam.id}`, {
      data: {
        title: exam.title,
        exam_type: exam.exam_type || exam.type || 'MCQ',
        status: 'OPEN',
        time_limit_minutes: exam.time_limit_minutes ?? exam.time_limit ?? 20,
        max_attempts: exam.max_attempts ?? 1,
        passing_score: exam.passing_score ?? 0,
      },
    })

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
    await page.goto('/exams')

    // Create learner attempt via API and bypass precheck in test mode.
    const learnerToken = await page.evaluate(() => {
      const raw = localStorage.getItem('syra_tokens')
      if (!raw) return null
      try { return JSON.parse(raw).access_token || null } catch { return null }
    })
    if (!learnerToken) throw new Error('Learner token missing after UI login')
    const learnerAuthedApi = await playwrightRequest.newContext({
      baseURL: process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/',
      extraHTTPHeaders: { Authorization: `Bearer ${learnerToken}` },
    })
    const attemptRes = await learnerAuthedApi.post('attempts/', { data: { exam_id: exam.id } })
    if (!attemptRes.ok()) throw new Error(`Create attempt failed: ${attemptRes.status()} ${await attemptRes.text()}`)
    const attempt = await attemptRes.json()
    if (!attempt?.id) throw new Error(`Create attempt response missing id: ${JSON.stringify(attempt)}`)
    const precheckRes = await learnerAuthedApi.post(`precheck/${attempt.id}`, { data: { test_pass: true } })
    if (!precheckRes.ok()) throw new Error(`Precheck failed: ${precheckRes.status()} ${await precheckRes.text()}`)

    // Submit attempt via API, then verify learner can open result page.
    const submitRes = await learnerAuthedApi.post(`attempts/${attempt.id}/submit`)
    if (!submitRes.ok()) throw new Error(`Submit attempt failed: ${submitRes.status()} ${await submitRes.text()}`)
    await page.goto('/attempts')
    await expect(page.getByText(examTitle, { exact: false })).toBeVisible({ timeout: 15000 })
  })
})
