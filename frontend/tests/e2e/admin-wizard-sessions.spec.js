import { expect, request as playwrightRequest, test } from '@playwright/test'
import { createCourseAndNode, createLearner, ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

test.describe('Admin New Test Wizard session editing', () => {
  test('edit mode preloads existing schedules and can replace them', async ({ page, context }) => {
    const { token: adminToken } = await ensureAdmin(context)
    const learnerOne = await createLearner(context, adminToken, { user_id: `LRN${Date.now()}A` })
    const learnerTwo = await createLearner(context, adminToken, { user_id: `LRN${Date.now()}B` })
    const { node } = await createCourseAndNode(adminToken)

    const api = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    })

    const usersRes = await api.get('users/')
    const users = await usersRes.json()
    const learnerOneUser = users.find((user) => user.user_id === learnerOne.user_id)
    const learnerTwoUser = users.find((user) => user.user_id === learnerTwo.user_id)
    if (!learnerOneUser || !learnerTwoUser) throw new Error('Learner fixture lookup failed')

    const testRes = await api.post('admin/tests', {
      data: {
        name: `Wizard Session Edit ${Date.now()}`,
        type: 'MCQ',
        node_id: node.id,
        attempts_allowed: 1,
        time_limit_minutes: 30,
        runtime_settings: { creation_method: 'manual' },
      },
    })
    if (!testRes.ok()) throw new Error(`Create test failed: ${testRes.status()} ${await testRes.text()}`)
    const createdTest = await testRes.json()

    const questionRes = await api.post('questions/', {
      data: {
        exam_id: createdTest.id,
        text: 'Session edit question',
        question_type: 'MCQ',
        options: ['A', 'B'],
        correct_answer: 'A',
        points: 1,
        order: 1,
      },
    })
    if (!questionRes.ok()) throw new Error(`Create question failed: ${questionRes.status()} ${await questionRes.text()}`)

    const initialScheduleRes = await api.post('schedules/', {
      data: {
        exam_id: createdTest.id,
        user_id: learnerOneUser.id,
        scheduled_at: '2026-03-06T12:00:00Z',
        access_mode: 'RESTRICTED',
      },
    })
    if (!initialScheduleRes.ok()) throw new Error(`Create schedule failed: ${initialScheduleRes.status()} ${await initialScheduleRes.text()}`)

    await page.goto('/login')
    await page.evaluate((accessToken) => {
      localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
    }, adminToken)
    await page.goto(`/admin/exams/${createdTest.id}/edit`)

    for (let step = 0; step < 7; step += 1) {
      await page.getByRole('button', { name: /Next/i }).click()
    }

    const learnerOneLabel = page.locator('label', { hasText: learnerOne.user_id })
    const learnerTwoLabel = page.locator('label', { hasText: learnerTwo.user_id })
    await expect(learnerOneLabel.locator('input[type="checkbox"]')).toBeChecked()

    await page.getByRole('button', { name: 'Remove' }).first().click()
    await expect(learnerOneLabel.locator('input[type="checkbox"]')).not.toBeChecked()

    await learnerTwoLabel.locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: /Save assignments/i }).click()
    await expect.poll(async () => {
      const schedulesRes = await api.get('schedules/')
      const schedules = await schedulesRes.json()
      return schedules.filter((schedule) => String(schedule.exam_id) === String(createdTest.id))
    }, { timeout: 15000 }).toHaveLength(1)

    const schedulesRes = await api.get('schedules/')
    const schedules = await schedulesRes.json()
    const testSchedules = schedules.filter((schedule) => String(schedule.exam_id) === String(createdTest.id))
    expect(String(testSchedules[0].user_id)).toBe(String(learnerTwoUser.id))
  })
})
