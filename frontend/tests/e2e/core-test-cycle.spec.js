import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, request as playwrightRequest, test } from '@playwright/test'
import { createCourseAndNode, createLearner, ensureAdmin } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'
const OCR_ID_TOKEN = 'A1234567'

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
})

async function loadIdentityFixtures() {
  const selfiePath = path.resolve(process.cwd(), 'tests', 'e2e', 'fixtures', 'ocr-selfie-grace.jpg')
  const idCardPath = path.resolve(process.cwd(), 'tests', 'e2e', 'fixtures', 'ocr-id-card-grace.png')
  await fs.access(selfiePath)
  await fs.access(idCardPath)
  return { selfiePath, idCardPath }
}

async function fetchTestByName(api, name) {
  const response = await api.get('admin/tests', {
    params: { search: name, status: 'DRAFT,PUBLISHED,ARCHIVED', page_size: 100 },
  })
  if (!response.ok()) throw new Error(`Fetch tests failed: ${response.status()} ${await response.text()}`)
  const payload = await response.json()
  return (payload.items || []).find((item) => item.name === name) || null
}

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function seedAccessToken(page, token) {
  await page.goto('/login')
  await page.evaluate((accessToken) => {
    localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
  }, token)
}

test.describe('Core test cycle', () => {
  test('wizard creation, OCR identity check, live pause/resume, manual grading, reports, certificate, and retake rules all work with real persisted data', async ({ page, context, browser }) => {
    const { token: adminToken } = await ensureAdmin(context)
    const learner = await createLearner(context, adminToken, { user_id: `LIV${Date.now()}` })
    const { node } = await createCourseAndNode(adminToken)
    const { selfiePath, idCardPath } = await loadIdentityFixtures()

    const adminApi = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    })

    const testTitle = `Core Cycle ${Date.now()}`
    const updatedInstructionsHeading = 'Read carefully before you begin'
    const updatedInstructionsBody = 'This core cycle was edited from the manage page and must appear for the learner.'
    const scheduledAtLocal = formatDateTimeLocal(new Date(Date.now() - (5 * 60 * 1000)))

    await seedAccessToken(page, adminToken)
    await page.goto('/admin/tests/new')

    // Step 0: Information
    await page.fill('input[name="title"]', testTitle)
    await page.fill('textarea[name="description"]', 'End-to-end core cycle validation test.')
    await page.fill('input[name="exam_code"]', `CORE-${Date.now()}`)
    await page.selectOption('select[name="course"]', node.course_id)
    await expect.poll(async () => page.locator('select[name="node"] option').count(), { timeout: 15000 }).toBeGreaterThan(1)
    await page.selectOption('select[name="node"]', node.id)
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 1: Method
    await expect(page.getByText('Test Creation Method')).toBeVisible()
    await page.getByText('Manual Selection', { exact: true }).click()
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 2: Settings
    await expect(page.getByRole('heading', { name: 'Test Settings' })).toBeVisible()
    await page.fill('input[name="time_limit"]', '15')
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 3: Questions
    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()
    await page.getByRole('button', { name: /Add Single Choice/i }).click()
    await page.fill('input[placeholder="Enter question..."]', 'What is 2 + 2?')
    await page.fill('input[placeholder="Option A"]', '4')
    await page.fill('input[placeholder="Option B"]', '5')
    await page.fill('input[placeholder="Option C"]', '6')
    await page.fill('input[placeholder="Option D"]', '7')
    await page.getByRole('button', { name: /Add Question/i }).click()
    await expect(page.getByText('What is 2 + 2?')).toBeVisible()
    await page.getByRole('button', { name: /Add Essay/i }).click()
    await page.fill('input[placeholder="Enter question..."]', 'Explain why the correct answer is 4.')
    await page.getByRole('button', { name: /Add Question/i }).click()
    await expect(page.getByText('Explain why the correct answer is 4.')).toBeVisible()
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 4: Grading
    await expect(page.getByRole('heading', { name: 'Grading Configuration' })).toBeVisible()
    await page.getByRole('spinbutton').first().fill('70')
    await page.getByRole('spinbutton').nth(1).fill('2')
    await page.locator('label:has-text("Enforce fullscreen") input[type="checkbox"]').uncheck()
    await page.locator('label:has-text("Detect tab switches") input[type="checkbox"]').check()
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 5: Certificates
    await expect(page.getByRole('heading', { name: 'Certificates' })).toBeVisible()
    await page.getByText('Issue certificate upon passing', { exact: true }).locator('xpath=preceding-sibling::div[1]').click()
    await expect(page.getByText('Certificate Title')).toBeVisible()
    await page.getByText('Certificate Title', { exact: true }).locator('xpath=following-sibling::input[1]').fill('Core Cycle Certificate')
    await page.getByText('Signer Name', { exact: true }).locator('xpath=following-sibling::input[1]').fill('Core Cycle QA')
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 6: Review
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await expect(page.getByText(testTitle)).toBeVisible()
    await expect(page.getByText('Information', { exact: true })).toBeVisible()
    await expect(page.getByText('Question Design', { exact: true })).toBeVisible()
    await expect(page.getByText('Delivery & Security', { exact: true })).toBeVisible()
    await expect(page.getByText('Scoring & Results', { exact: true })).toBeVisible()
    await expect(page.getByText('Final Readiness', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 7: Sessions
    await expect(page.getByRole('heading', { name: 'Testing Sessions' })).toBeVisible()
    await page.locator('select').last().selectOption('RESTRICTED')
    await page.locator('input[type="datetime-local"]').fill(scheduledAtLocal)
    await page.locator('label', { hasText: learner.user_id }).locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: /Save assignments/i }).click()
    await expect(page.getByText(learner.user_id, { exact: false })).toBeVisible()
    await page.getByRole('button', { name: /^Next$/i }).click()

    // Step 8: Save Test
    await expect(page.getByRole('heading', { name: 'Save Test' })).toBeVisible()
    await page.locator('label:has-text("Draft") input[type="radio"]').check()
    await page.getByRole('button', { name: /Save as Draft/i }).click()
    await expect(page).toHaveURL(/\/admin\/tests$/)

    await expect.poll(async () => (await fetchTestByName(adminApi, testTitle))?.status || null, { timeout: 15000 }).toBe('DRAFT')
    const createdTest = await fetchTestByName(adminApi, testTitle)
    if (!createdTest) throw new Error('Created test not found after draft save')

    // Manage page: edit real settings while the draft is writable, then publish from there.
    await page.goto(`/admin/tests/${createdTest.id}`)
    await expect(page).toHaveURL(new RegExp(`/admin/tests/${createdTest.id}/manage`))

    await page.getByRole('button', { name: 'Test instructions dialog settings', exact: true }).click()
    await page.locator('label:has-text("Instructions heading") input').fill(updatedInstructionsHeading)
    await page.locator('label:has-text("Instructions body") textarea').fill(updatedInstructionsBody)

    await page.getByRole('button', { name: 'Security settings', exact: true }).click()
    await page.locator('label:has-text("Lighting Quality Check") input[type="checkbox"]').uncheck()

    await page.getByRole('button', { name: 'Score report settings', exact: true }).click()
    await page.locator('label:has-text("Report content") select').selectOption('SCORE_AND_DETAILS')
    await page.locator('label:has-text("Show score report to candidate") input[type="checkbox"]').check()
    await page.locator('label:has-text("Allow answer review after submission") input[type="checkbox"]').check()
    await page.locator('label:has-text("Show correct answers in review") input[type="checkbox"]').check()

    await page.getByRole('button', { name: 'Pause, retake and reschedule settings', exact: true }).click()
    await page.locator('label:has-text("Allow retake") input[type="checkbox"]').check()
    await page.locator('label:has-text("Retake cooldown (hours)") input[type="number"]').fill('1')

    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Settings saved.')).toBeVisible()

    await expect.poll(async () => {
      const detail = await adminApi.get(`admin/tests/${createdTest.id}`)
      const body = await detail.json()
      return {
        heading: body.runtime_settings?.instructions_heading || '',
        body: body.runtime_settings?.instructions_body || '',
        reportContent: body.report_content || '',
        lightingRequired: body.proctoring_config?.lighting_required,
        showScoreReport: body.runtime_settings?.show_score_report,
        showAnswerReview: body.runtime_settings?.show_answer_review,
        showCorrectAnswers: body.runtime_settings?.show_correct_answers,
        allowRetake: body.runtime_settings?.allow_retake,
        retakeCooldown: body.runtime_settings?.retake_cooldown_hours,
        attemptsAllowed: body.attempts_allowed,
      }
    }).toEqual({
      heading: updatedInstructionsHeading,
      body: updatedInstructionsBody,
      reportContent: 'SCORE_AND_DETAILS',
      lightingRequired: false,
      showScoreReport: true,
      showAnswerReview: true,
      showCorrectAnswers: true,
      allowRetake: true,
      retakeCooldown: 1,
      attemptsAllowed: 2,
    })

    await page.getByRole('button', { name: /Publish test|Open \/ Publish/i }).click()
    await expect(page.getByText('Test published.')).toBeVisible()
    await expect.poll(async () => (await fetchTestByName(adminApi, testTitle))?.status || null, { timeout: 15000 }).toBe('PUBLISHED')

    // Learner login and actual UI journey.
    await page.evaluate(() => localStorage.removeItem('syra_tokens'))
    await page.goto('/login')
    await page.fill('input[type="email"]', learner.email)
    await page.fill('input[type="password"]', learner.password)
    await page.getByRole('button', { name: /Sign In/i }).click()
    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = localStorage.getItem('syra_tokens')
        if (!raw) return ''
        try { return JSON.parse(raw).access_token || '' } catch { return '' }
      })
    }, { timeout: 15000 }).not.toBe('')

    const learnerToken = await page.evaluate(() => JSON.parse(localStorage.getItem('syra_tokens') || '{}').access_token || '')
    if (!learnerToken) throw new Error('Learner token missing after login')
    const learnerApi = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${learnerToken}` },
    })

    await page.goto('/tests')
    await expect(page.getByText(testTitle)).toBeVisible()
    await page.getByText(testTitle).click()

    await expect(page.getByText(updatedInstructionsHeading)).toBeVisible()
    await expect(page.getByText(updatedInstructionsBody)).toBeVisible()
    await page.getByRole('button', { name: /Continue to system check/i }).click()

    await expect(page).toHaveURL(new RegExp(`/tests/${createdTest.id}/system-check`))
    await expect.poll(async () => await page.getByRole('button', { name: /^Continue$/ }).isEnabled(), { timeout: 20000 }).toBe(true)
    await page.getByRole('button', { name: /^Continue$/ }).click()

    await expect(page).toHaveURL(new RegExp(`/tests/${createdTest.id}/verify-identity`))
    const fileInputs = page.locator('input[type="file"]')
    await fileInputs.nth(0).setInputFiles(selfiePath)
    await fileInputs.nth(1).setInputFiles(idCardPath)

    const precheckResponsePromise = page.waitForResponse((response) => (
      response.url().includes('/api/precheck/')
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /Confirm & Continue/i }).click()
    const precheckResponse = await precheckResponsePromise
    expect(precheckResponse.ok()).toBeTruthy()
    const precheckPayload = await precheckResponse.json()
    expect(precheckPayload.all_pass).toBeTruthy()
    expect(precheckPayload.ocr_available).toBeTruthy()
    expect(precheckPayload.ocr_candidates || []).toContain(OCR_ID_TOKEN)
    expect(precheckPayload.manual_id_valid).toBeFalsy()

    await expect(page).toHaveURL(new RegExp(`/tests/${createdTest.id}/rules`), { timeout: 20000 })
    await page.getByLabel(/I have read and agree/i).check()
    await page.getByRole('button', { name: /Start Test/i }).click()

    await expect(page).toHaveURL(/\/attempts\/.+\/take/, { timeout: 20000 })
    const attemptId = page.url().match(/\/attempts\/([^/]+)\/take/)?.[1]
    if (!attemptId) throw new Error('Attempt id missing from take-test route')

    const questionsRes = await learnerApi.get('questions/', { params: { exam_id: createdTest.id } })
    const questionRows = await questionsRes.json()
    const firstQuestion = (questionRows || [])[0]
    if (!firstQuestion?.id) throw new Error('Question id missing for live attempt verification')

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await seedAccessToken(adminPage, adminToken)
    await adminPage.goto(`/admin/tests/${createdTest.id}/manage?tab=proctoring`)
    await expect(adminPage.getByRole('heading', { name: 'Proctoring' })).toBeVisible()
    const liveAttemptRow = adminPage.locator('tr', { hasText: String(attemptId).slice(0, 8) })
    await expect(liveAttemptRow).toBeVisible()

    await expect(page.getByRole('heading', { name: testTitle })).toBeVisible()
    await expect(page.getByLabel('Proctoring panel')).toContainText(/Monitoring active|Connecting/i)
    await expect(page.getByLabel('Answered questions progress')).toBeVisible()
    await expect(page.getByText(/2 unanswered/i)).toBeVisible()

    // Pause via the real manage page and confirm the learner is actually blocked.
    await liveAttemptRow.getByRole('button', { name: /^Pause$/i }).click()
    await expect(liveAttemptRow.getByRole('button', { name: /^Resume$/i })).toBeVisible()

    const pausedAnswerRes = await learnerApi.post(`attempts/${attemptId}/answers`, {
      data: { question_id: firstQuestion.id, answer: 'A' },
    })
    expect(pausedAnswerRes.status()).toBe(409)
    expect(await pausedAnswerRes.text()).toContain('Attempt is paused')

    await liveAttemptRow.getByRole('button', { name: /^Resume$/i }).click()
    await expect(liveAttemptRow.getByRole('button', { name: /^Pause$/i })).toBeVisible()

    const resumedAnswerRes = await learnerApi.post(`attempts/${attemptId}/answers`, {
      data: { question_id: firstQuestion.id, answer: 'A' },
    })
    expect(resumedAnswerRes.ok()).toBeTruthy()

    await page.locator('label', { hasText: 'A. 4' }).click()
    await expect(page.getByText('Autosave: Pending changes')).toBeVisible()
    await page.getByRole('button', { name: '2' }).click()
    await page.getByPlaceholder('Type your answer here...').fill('Because adding 2 and 2 gives a total of 4.')
    await page.waitForTimeout(4500)
    await expect(page.getByText(/Autosave: Saved/i)).toBeVisible()
    await expect(page.getByText(/0 unanswered/i)).toBeVisible()

    // Inject real warning events so the admin timeline has actual data.
    const pingRes = await learnerApi.post(`proctoring/${attemptId}/ping`, {
      data: {
        focus: false,
        visibility: 'hidden',
        blurs: 2,
        fullscreen: false,
        camera_dark: true,
      },
    })
    if (!pingRes.ok()) throw new Error(`Proctoring ping failed: ${pingRes.status()} ${await pingRes.text()}`)

    await page.getByRole('button', { name: /^Submit Test$/i }).click()
    await expect(page.getByText('Ready to submit?')).toBeVisible()
    await expect(page.getByText(/All questions have an answer recorded\./i)).toBeVisible()
    await page.getByRole('button', { name: /Confirm Submit/i }).click()
    await expect(page).toHaveURL(new RegExp(`/attempts/${attemptId}$`), { timeout: 30000 })

    // Learner result should stay pending until the admin grades the manual-response attempt.
    await expect.poll(async () => {
      const attemptRes = await learnerApi.get(`attempts/${attemptId}`)
      const attemptBody = await attemptRes.json()
      return {
        status: attemptBody.status,
        score: attemptBody.score,
      }
    }, { timeout: 20000 }).toEqual({
      status: 'SUBMITTED',
      score: null,
    })
    await expect(page.getByText('Awaiting manual review')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Saved Answers')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /Download Certificate/i })).toHaveCount(0)

    await expect.poll(async () => {
      const eventsRes = await adminApi.get(`proctoring/${attemptId}/events`)
      const events = await eventsRes.json()
      return (events || []).filter((event) => ['HIGH', 'MEDIUM'].includes(event.severity)).length
    }, { timeout: 15000 }).toBeGreaterThan(0)

    await expect.poll(async () => {
      const videosRes = await adminApi.get(`proctoring/${attemptId}/videos`)
      const videos = await videosRes.json()
      return videos.length
    }, { timeout: 30000 }).toBeGreaterThan(0)

    // Admin manage-page reports use the real attempt data.
    await adminPage.goto(`/admin/tests/${createdTest.id}/manage?tab=reports`)
    await expect(adminPage.getByRole('button', { name: /Download Test CSV/i })).toBeVisible()
    await adminPage.getByRole('button', { name: /Download Test CSV/i }).click()
    await expect(adminPage.getByText('CSV report downloaded.')).toBeVisible()
    await adminPage.getByRole('button', { name: /Download Test PDF/i }).click()
    await expect(adminPage.getByText('PDF report downloaded.')).toBeVisible()

    // Admin video timeline view shows the real attempt recording and warnings.
    await adminPage.goto(`/admin/attempts/${attemptId}/videos`)
    await expect(adminPage.getByText('Attempt Recordings')).toBeVisible()
    await expect(adminPage.getByText(/Warnings:/)).toBeVisible()
    await expect(adminPage.getByRole('button', { name: /ALT_TAB/ }).first()).toBeVisible()
    await expect(adminPage.getByRole('button', { name: /FULLSCREEN_EXIT/ }).first()).toBeVisible()
    await expect(adminPage.getByRole('button', { name: /CAMERA_COVERED/ }).first()).toBeVisible()

    // Manage page proctoring tab reflects the real attempt data.
    await adminPage.goto(`/admin/tests/${createdTest.id}/manage?tab=proctoring`)
    await expect(adminPage.getByRole('heading', { name: 'Proctoring' })).toBeVisible()
    await expect(adminPage.getByText(String(attemptId).slice(0, 8))).toBeVisible()
    await expect(adminPage.getByText(learner.user_id, { exact: false })).toBeVisible()

    // Review and finalize the manual-response attempt from the shared result workflow.
    await adminPage.goto(`/admin/tests/${createdTest.id}/manage?tab=candidates`)
    const candidateRow = adminPage.locator('tr', { hasText: String(attemptId).slice(0, 8) })
    await expect(candidateRow).toBeVisible()
    await expect(candidateRow.getByText('Awaiting manual grading')).toBeVisible()
    await candidateRow.getByRole('button', { name: /^Result$/i }).click()
    await expect(adminPage).toHaveURL(new RegExp(`/attempts/${attemptId}(\\?|$)`))
    await expect(adminPage.getByText('Manual review workflow')).toBeVisible()
    await adminPage.getByRole('spinbutton').fill('1')
    await adminPage.getByRole('button', { name: /Save review/i }).click()
    await expect(adminPage.getByText(/Awarded points:/i)).toBeVisible()
    await adminPage.getByRole('button', { name: /Finalize review/i }).click()
    await expect(adminPage.getByText('100')).toBeVisible()
    await adminPage.getByRole('button', { name: /Back to Manage Test/i }).click()
    await expect(adminPage).toHaveURL(new RegExp(`/admin/tests/${createdTest.id}/manage\\?tab=candidates`))
    await expect(candidateRow.getByText('100%')).toBeVisible()
    await expect(adminPage.getByText('Finalized')).toBeVisible()

    // Learner result updates after grading and exposes the persisted final report.
    await page.reload()
    await expect(page.getByText('Answer Review')).toBeVisible()
    await expect(page.getByText('What is 2 + 2?')).toBeVisible()
    await expect(page.getByRole('button', { name: /Download Certificate/i })).toBeVisible()

    const certificateResponsePromise = page.waitForResponse((response) => (
      response.url().includes(`/api/attempts/${attemptId}/certificate`)
      && response.request().method() === 'GET'
    ))
    await page.getByRole('button', { name: /Download Certificate/i }).click()
    const certificateResponse = await certificateResponsePromise
    expect(certificateResponse.ok()).toBeTruthy()
    expect(certificateResponse.headers()['content-type'] || '').toContain('application/pdf')

    // Retake rule is enforced from the published settings saved through Manage Test.
    await page.goto(`/tests/${createdTest.id}/rules`)
    await page.getByLabel(/I have read and agree/i).check()
    await page.getByRole('button', { name: /Start Test/i }).click()
    await expect(page.getByText(/Retake available in \d+ minute\(s\)/)).toBeVisible()

    await adminContext.close()
  })
})
