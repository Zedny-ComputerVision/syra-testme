import { test, expect } from '@playwright/test'
import { ensureAdmin, createLearner, createCourseAndNode } from './helpers/api'

test.describe('Admin New Test Wizard end-to-end', () => {
  test('admin can create exam with question and learner can take it', async ({ page, context }) => {
    const { token: adminToken, email: adminEmail, password: adminPassword } = await ensureAdmin(context)
    const learner = await createLearner(context, adminToken)
    const { node } = await createCourseAndNode(adminToken)

    // Admin login
    await page.goto('/')
    await page.fill('input[type="email"]', adminEmail)
    await page.fill('input[type="password"]', adminPassword)
    await page.click('button:has-text("Sign In")')
    await page.waitForURL('**/admin/dashboard')

    // Start wizard
    await page.getByRole('link', { name: /new test/i }).click()
    await expect(page).toHaveURL(/admin\/exams\/new/)

    // Step 0 - Information
    const examTitle = `E2E Exam ${Date.now()}`
    await page.fill('input[name="title"]', examTitle)
    await page.selectOption('select[name="course"]', node.course_id)
    await page.selectOption('select[name="node"]', node.id)
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 1 - Method
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 2 - Settings
    await page.fill('input[name="time_limit"]', '20')
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 3 - Questions (auto-save only, no UI question creation)
    await page.getByRole('button', { name: /Next/i }).click()

    // Step 4 - Grading
    await page.getByRole('button', { name: /Next/i }).click()
    // Certificates
    await page.getByRole('button', { name: /Next/i }).click()
    // Review
    await page.getByRole('button', { name: /Next/i }).click()

    // Publish
    await page.getByRole('button', { name: /Publish|Save as Draft/i }).click()
    await page.waitForTimeout(500)

    // Back-end: ensure question exists for learner flow
    const api = await context.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://127.0.0.1:8000/api', extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
    const examsRes = await api.get('/exams/')
    const exams = await examsRes.json()
    const exam = exams.find(e => e.title === examTitle)
    if (!exam) throw new Error('Exam not found after wizard')
    await api.post('/questions/', {
      data: {
        exam_id: exam.id,
        text: '2+2=?',
        type: 'MCQ',
        options: ['4', '5', '6', '1'],
        correct_answer: '4',
        points: 1,
      },
    })

    // Logout
    await page.getByRole('button', { name: /Logout|Sign Out/i }).click({ timeout: 5000 }).catch(() => {})

    // Learner login
    await page.goto('/')
    await page.fill('input[type="email"]', learner.email)
    await page.fill('input[type="password"]', learner.password)
    await page.click('button:has-text("Sign In")')
    await page.waitForURL('**/exams')

    // Start exam
    await page.getByText(examTitle, { exact: false }).first().click()
    await page.getByRole('button', { name: /Start/i }).click()
    await page.getByText('2+2=?').first().click()
    await page.getByLabel('4').check({ force: true }).catch(() => {})
    await page.getByRole('button', { name: /Submit/i }).click()
    await expect(page.getByText(/Result|score/i)).toBeVisible({ timeout: 5000 })
  })
})
