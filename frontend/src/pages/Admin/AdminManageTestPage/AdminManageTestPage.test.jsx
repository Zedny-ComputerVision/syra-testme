import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import AdminManageTestPage from './AdminManageTestPage'

const getTestRuntimeMock = vi.fn()
const getTestMock = vi.fn()
const attemptsMock = vi.fn()
const schedulesMock = vi.fn()
const usersMock = vi.fn()
const getQuestionsMock = vi.fn()
const categoriesMock = vi.fn()
const getAttemptEventsMock = vi.fn()
const listAttemptVideosMock = vi.fn()
const pauseAttemptMock = vi.fn()
const resumeAttemptMock = vi.fn()
const gradeAttemptMock = vi.fn()
const updateTestMock = vi.fn()
const publishTestMock = vi.fn()
const archiveTestMock = vi.fn()
const unarchiveTestMock = vi.fn()
const duplicateTestMock = vi.fn()
const deleteTestMock = vi.fn()
const updateScheduleMock = vi.fn()
const createScheduleMock = vi.fn()
const deleteScheduleMock = vi.fn()
const addQuestionMock = vi.fn()
const updateQuestionMock = vi.fn()
const deleteQuestionMock = vi.fn()
const generateReportMock = vi.fn()
const testReportCsvMock = vi.fn()
const generateTestReportPdfMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    getTestRuntime: (...args) => getTestRuntimeMock(...args),
    getTest: (...args) => getTestMock(...args),
    attempts: (...args) => attemptsMock(...args),
    schedules: (...args) => schedulesMock(...args),
    users: (...args) => usersMock(...args),
    getQuestions: (...args) => getQuestionsMock(...args),
    categories: (...args) => categoriesMock(...args),
    getAttemptEvents: (...args) => getAttemptEventsMock(...args),
    listAttemptVideos: (...args) => listAttemptVideosMock(...args),
    pauseAttempt: (...args) => pauseAttemptMock(...args),
    resumeAttempt: (...args) => resumeAttemptMock(...args),
    gradeAttempt: (...args) => gradeAttemptMock(...args),
    updateTest: (...args) => updateTestMock(...args),
    publishTest: (...args) => publishTestMock(...args),
    archiveTest: (...args) => archiveTestMock(...args),
    unarchiveTest: (...args) => unarchiveTestMock(...args),
    duplicateTest: (...args) => duplicateTestMock(...args),
    deleteTest: (...args) => deleteTestMock(...args),
    updateSchedule: (...args) => updateScheduleMock(...args),
    createSchedule: (...args) => createScheduleMock(...args),
    deleteSchedule: (...args) => deleteScheduleMock(...args),
    addQuestion: (...args) => addQuestionMock(...args),
    updateQuestion: (...args) => updateQuestionMock(...args),
    deleteQuestion: (...args) => deleteQuestionMock(...args),
    generateReport: (...args) => generateReportMock(...args),
    testReportCsv: (...args) => testReportCsvMock(...args),
    generateTestReportPdf: (...args) => generateTestReportPdfMock(...args),
  },
}))

const runtimeExam = {
  id: 'test-1',
  title: 'Midterm',
  status: 'CLOSED',
  max_attempts: 1,
  time_limit: 60,
  question_count: 0,
}

const adminTest = {
  id: 'test-1',
  name: 'Midterm',
  status: 'DRAFT',
  type: 'MCQ',
  description: '',
  time_limit_minutes: 60,
  attempts_allowed: 1,
}

function renderPage(initialEntries = ['/admin/tests/test-1/manage']) {
  function LocationEcho() {
    const location = useLocation()
    return (
      <>
        <div data-testid="location-pathname">{location.pathname}</div>
        <div data-testid="location-search">{location.search}</div>
      </>
    )
  }

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationEcho />
      <Routes>
        <Route path="/admin/tests/:id/manage" element={<AdminManageTestPage />} />
        <Route path="/admin/tests" element={<div>All tests</div>} />
        <Route path="/admin/videos/:attemptId" element={<div>Attempt videos route</div>} />
        <Route path="/attempts/:id" element={<div>Attempt result route</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminManageTestPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()

    getTestRuntimeMock.mockResolvedValue({ data: runtimeExam })
    getTestMock.mockResolvedValue({ data: adminTest })
    attemptsMock.mockResolvedValue({ data: [] })
    schedulesMock.mockResolvedValue({ data: [] })
    usersMock.mockResolvedValue({
      data: [{ id: 'learner-1', user_id: 'L-001', name: 'Learner One', role: 'LEARNER' }],
    })
    getQuestionsMock.mockResolvedValue({ data: [] })
    categoriesMock.mockResolvedValue({ data: [] })
    getAttemptEventsMock.mockResolvedValue({ data: [] })
    listAttemptVideosMock.mockResolvedValue({ data: [] })
    pauseAttemptMock.mockResolvedValue({ data: {} })
    resumeAttemptMock.mockResolvedValue({ data: {} })
    gradeAttemptMock.mockResolvedValue({ data: {} })
    updateTestMock.mockResolvedValue({ data: {} })
    publishTestMock.mockResolvedValue({ data: {} })
    archiveTestMock.mockResolvedValue({ data: {} })
    unarchiveTestMock.mockResolvedValue({ data: {} })
    duplicateTestMock.mockResolvedValue({ data: { id: 'test-2' } })
    deleteTestMock.mockResolvedValue({ data: { detail: 'Deleted' } })
    updateScheduleMock.mockResolvedValue({ data: {} })
    createScheduleMock.mockResolvedValue({ data: {} })
    deleteScheduleMock.mockResolvedValue({ data: { detail: 'Deleted' } })
    addQuestionMock.mockResolvedValue({ data: {} })
    updateQuestionMock.mockResolvedValue({ data: {} })
    deleteQuestionMock.mockResolvedValue({ data: { detail: 'Deleted' } })
    generateReportMock.mockResolvedValue({ data: '<html></html>' })
    testReportCsvMock.mockResolvedValue({ data: new Blob(['id']) })
    generateTestReportPdfMock.mockResolvedValue({ data: new Blob(['pdf']) })
  })

  it('shows a retry path when the initial bootstrap fails', async () => {
    getTestRuntimeMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: runtimeExam })

    renderPage()

    await waitFor(() => expect(screen.getByText('Failed to load test data.')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(getTestRuntimeMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy())
  })

  it('keeps session assignment disabled until learner and schedule are provided', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Testing sessions' }))

    const submitButton = await screen.findByRole('button', { name: 'Assign / Update session' })
    expect(submitButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Learner'), { target: { value: 'learner-1' } })
    expect(submitButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Schedule date/time'), { target: { value: '2026-03-08T12:30' } })
    expect(submitButton.disabled).toBe(false)
  })

  it('keeps tab changes stable and writes canonical manage-tab query values', async () => {
    renderPage(['/admin/tests/test-1/manage?tab=testing-sessions'])

    await screen.findByRole('heading', { name: 'Testing sessions' })
    expect(screen.getByTestId('location-search').textContent).toBe('?tab=testing-sessions')

    fireEvent.click(screen.getByRole('button', { name: 'Candidates' }))

    await screen.findByRole('heading', { name: 'Candidates' })
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toBe('?tab=candidates'))

    fireEvent.click(screen.getByRole('button', { name: 'Testing sessions' }))

    await screen.findByRole('heading', { name: 'Testing sessions' })
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toBe('?tab=sessions'))
  })

  it('shows a busy confirmation state while deleting a question', async () => {
    let resolveDelete

    getQuestionsMock
      .mockResolvedValueOnce({
        data: [{
          id: 'question-1',
          text: 'What is 2 + 2?',
          question_type: 'MCQ',
          points: 1,
          order: 1,
        }],
      })
      .mockResolvedValue({ data: [] })
    deleteQuestionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve
        }),
    )

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Test sections' }))
    await screen.findByText('What is 2 + 2?')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(screen.getByRole('button', { name: 'Deleting...' }).disabled).toBe(true)

    resolveDelete({ data: { detail: 'Deleted' } })

    await waitFor(() => expect(deleteQuestionMock).toHaveBeenCalledWith('question-1'))
    await waitFor(() => expect(screen.getByText('No questions found.')).toBeTruthy())
  })

  it('requires coupon details before saving when coupons are enabled', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Settings' })

    fireEvent.click(screen.getByLabelText('Enable coupon discounts'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => expect(screen.getByText('Coupon code is required when coupons are enabled.')).toBeTruthy())
    expect(updateTestMock).not.toHaveBeenCalled()
  })

  it('locks report review toggles when a test is already published', async () => {
    getTestMock.mockResolvedValueOnce({ data: { ...adminTest, status: 'PUBLISHED' } })
    getTestRuntimeMock.mockResolvedValueOnce({ data: { ...runtimeExam, status: 'OPEN' } })

    renderPage()

    await screen.findByRole('heading', { name: 'Settings' })

    expect(screen.getByLabelText('Show score report to candidate').disabled).toBe(true)
    expect(screen.getByLabelText('Allow answer review after submission').disabled).toBe(true)
    expect(screen.getByLabelText('Show correct answers in review').disabled).toBe(true)
    expect(screen.getByLabelText('Email result to candidate on submit').disabled).toBe(true)
  })

  it('shows a monitoring-specific empty state and restores attempts when filters are cleared', async () => {
    attemptsMock.mockResolvedValueOnce({
      data: [{
        id: 'attempt-1',
        exam_id: 'test-1',
        user_id: 'learner-1',
        status: 'IN_PROGRESS',
        started_at: '2026-03-07T10:00:00Z',
      }],
    })
    schedulesMock.mockResolvedValueOnce({
      data: [{
        id: 'schedule-1',
        exam_id: 'test-1',
        user_id: 'learner-1',
        access_mode: 'OPEN',
        scheduled_at: '2026-03-08T12:30:00Z',
      }],
    })

    renderPage(['/admin/tests/test-1/manage?tab=proctoring'])

    await screen.findByText('Showing 1 attempt across 1 loaded.')
    await screen.findByText('L-001')

    fireEvent.change(screen.getAllByPlaceholderText('Search')[1], { target: { value: 'missing learner' } })

    await screen.findByText('No attempts match the current monitoring filters.')

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    await screen.findByText('L-001')
    expect(screen.getByText('Showing 1 attempt across 1 loaded.')).toBeTruthy()
  })

  it('renders lifecycle summary cards from persisted test, session, and alert data', async () => {
    getTestRuntimeMock.mockResolvedValueOnce({
      data: {
        ...runtimeExam,
        status: 'OPEN',
        certificate: { signer: 'Dr. Review' },
        proctoring_config: { fullscreen_enforce: true, face_detection: true, tab_switch_detect: true },
      },
    })
    getTestMock.mockResolvedValueOnce({
      data: {
        ...adminTest,
        status: 'PUBLISHED',
        runtime_settings: {
          show_score_report: true,
          show_answer_review: true,
          allow_retake: true,
          retake_cooldown_hours: 24,
        },
      },
    })
    attemptsMock.mockResolvedValueOnce({
      data: [{
        id: 'attempt-1',
        exam_id: 'test-1',
        user_id: 'learner-1',
        status: 'SUBMITTED',
        started_at: '2026-03-07T10:00:00Z',
      }],
    })
    schedulesMock.mockResolvedValueOnce({
      data: [{
        id: 'schedule-1',
        exam_id: 'test-1',
        user_id: 'learner-1',
        access_mode: 'RESTRICTED',
        scheduled_at: '2026-03-08T12:30:00Z',
      }],
    })
    getAttemptEventsMock.mockResolvedValueOnce({
      data: [{ id: 'event-1', severity: 'HIGH', event_type: 'PHONE_DETECTED' }],
    })

    renderPage()

    await screen.findByText('Learner access')
    expect(screen.getByText('0 open / 1 restricted')).toBeTruthy()
    expect(screen.getByText('Proctoring profile')).toBeTruthy()
    expect(screen.getByText(/Fullscreen Enforce, Tab Switch Detection, Lighting Quality Check, Face Detection/)).toBeTruthy()
    expect(screen.getAllByText('Certificates').length).toBeGreaterThan(0)
    expect(screen.getByText('Issued by Dr. Review')).toBeTruthy()
    expect(screen.getByText('Retake policy')).toBeTruthy()
    expect(screen.getByText(/Cooldown 24 hour\(s\), max 1 attempt\(s\)/)).toBeTruthy()
    expect(screen.getByText('Review queue')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review proctoring' })).toBeTruthy()
  })

  it('allows grading a submitted attempt and opening its result from the candidates tab', async () => {
    attemptsMock
      .mockResolvedValueOnce({
        data: [{
          id: 'attempt-1',
          exam_id: 'test-1',
          user_id: 'learner-1',
          status: 'SUBMITTED',
          score: null,
          started_at: '2026-03-07T10:00:00Z',
          submitted_at: '2026-03-07T10:45:00Z',
        }],
      })
      .mockResolvedValue({
        data: [{
          id: 'attempt-1',
          exam_id: 'test-1',
          user_id: 'learner-1',
          status: 'GRADED',
          score: 88,
          started_at: '2026-03-07T10:00:00Z',
          submitted_at: '2026-03-07T10:45:00Z',
        }],
      })

    renderPage(['/admin/tests/test-1/manage?tab=candidates'])

    await screen.findByText('Awaiting manual grading')

    fireEvent.change(screen.getByLabelText('Grade for L-001'), { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save grade' }))

    await waitFor(() => expect(gradeAttemptMock).toHaveBeenCalledWith('attempt-1', 88))
    await waitFor(() => expect(screen.getByText('88%')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('Finalized')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Result' }))
    await screen.findByText('Attempt result route')
  })

  it('opens the canonical attempt-videos route from the candidates tab', async () => {
    attemptsMock.mockResolvedValueOnce({
      data: [{
        id: 'attempt-1',
        exam_id: 'test-1',
        user_id: 'learner-1',
        status: 'SUBMITTED',
        score: 75,
        started_at: '2026-03-07T10:00:00Z',
        submitted_at: '2026-03-07T10:45:00Z',
      }],
    })

    renderPage(['/admin/tests/test-1/manage?tab=candidates'])

    await screen.findByText('75%')

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    await screen.findByText('Attempt videos route')
  })

  it('does not bounce to the tests list when it is still mounted during a non-manage route transition', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/videos/attempt-1']}>
        <Routes>
          <Route path="*" element={<AdminManageTestPage />} />
          <Route path="/admin/tests" element={<div>All tests</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('All tests')).toBeNull())
    expect(getTestRuntimeMock).not.toHaveBeenCalled()
  })

  it('shows scheduled learners in candidates even before they start and disables attempt-only actions', async () => {
    schedulesMock.mockResolvedValueOnce({
      data: [{
        id: 'schedule-1',
        exam_id: 'test-1',
        user_id: 'learner-1',
        access_mode: 'RESTRICTED',
        notes: 'Seat by the front desk',
        scheduled_at: '2026-03-08T12:30:00Z',
      }],
    })

    renderPage(['/admin/tests/test-1/manage?tab=candidates'])

    await screen.findByText('Assigned learners stay visible here even before they start the test, so the roster and attempt activity are tracked in one place.')
    expect(screen.getByText('L-001')).toBeTruthy()
    expect(screen.getByText('NOT STARTED')).toBeTruthy()
    expect(screen.getByText('Scheduled, not started')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Result' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Analyze' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Video' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Report' }).disabled).toBe(true)
  })
})
