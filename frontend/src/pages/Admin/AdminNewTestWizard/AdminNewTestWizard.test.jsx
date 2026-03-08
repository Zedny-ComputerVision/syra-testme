import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import AdminNewTestWizard from './AdminNewTestWizard'

const coursesMock = vi.fn()
const categoriesMock = vi.fn()
const gradingScalesMock = vi.fn()
const questionPoolsMock = vi.fn()
const usersMock = vi.fn()
const examTemplatesMock = vi.fn()
const createTestMock = vi.fn()
const updateTestMock = vi.fn()
const getQuestionsMock = vi.fn()
const seedExamFromPoolMock = vi.fn()
const attemptsMock = vi.fn()
const schedulesMock = vi.fn()
const pauseAttemptMock = vi.fn()
const resumeAttemptMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    courses: (...args) => coursesMock(...args),
    categories: (...args) => categoriesMock(...args),
    gradingScales: (...args) => gradingScalesMock(...args),
    questionPools: (...args) => questionPoolsMock(...args),
    users: (...args) => usersMock(...args),
    examTemplates: (...args) => examTemplatesMock(...args),
    createTest: (...args) => createTestMock(...args),
    updateTest: (...args) => updateTestMock(...args),
    getQuestions: (...args) => getQuestionsMock(...args),
    seedExamFromPool: (...args) => seedExamFromPoolMock(...args),
    attempts: (...args) => attemptsMock(...args),
    schedules: (...args) => schedulesMock(...args),
    pauseAttempt: (...args) => pauseAttemptMock(...args),
    resumeAttempt: (...args) => resumeAttemptMock(...args),
  },
}))

vi.mock('../../../services/ai.service', () => ({
  generateQuestionsAI: vi.fn(),
}))

vi.mock('../ExamQuestionPanel/ExamQuestionPanel', () => ({
  default: () => <div>Question Panel</div>,
}))

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/admin/tests/new']}>
      <Routes>
        <Route path="/admin/tests/new" element={<AdminNewTestWizard />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminNewTestWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coursesMock.mockResolvedValue({ data: [] })
    categoriesMock.mockResolvedValue({ data: [] })
    gradingScalesMock.mockResolvedValue({ data: [] })
    questionPoolsMock.mockResolvedValue({ data: [] })
    usersMock.mockResolvedValue({ data: [] })
    examTemplatesMock.mockResolvedValue({ data: [] })
    createTestMock.mockResolvedValue({ data: { id: 'test-1' } })
    updateTestMock.mockResolvedValue({ data: {} })
    getQuestionsMock.mockResolvedValue({ data: [] })
    seedExamFromPoolMock.mockResolvedValue({ data: {} })
    attemptsMock.mockResolvedValue({ data: [] })
    schedulesMock.mockResolvedValue({ data: [] })
    pauseAttemptMock.mockResolvedValue({ data: {} })
    resumeAttemptMock.mockResolvedValue({ data: {} })
  })

  afterEach(() => {
    cleanup()
  })

  it('does not advance to the next phase when saving the current step fails', async () => {
    createTestMock.mockRejectedValue({ response: { data: { detail: 'Save failed.' } } })

    renderWizard()

    fireEvent.change((await screen.findAllByPlaceholderText('e.g. Midterm Examination - Computer Science'))[0], {
      target: { value: 'Core Cycle Test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    await waitFor(() => expect(screen.getByText('Save failed.')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Test Information' })).toBeTruthy()
    expect(screen.queryByText('Test Creation Method')).toBeNull()
  })

  it('blocks seeding from an empty pool and explains why', async () => {
    questionPoolsMock.mockResolvedValue({
      data: [{ id: 'pool-1', name: 'Empty Pool', question_count: 0 }],
    })

    renderWizard()

    fireEvent.change(await screen.findByPlaceholderText('e.g. Midterm Examination - Computer Science'), {
      target: { value: 'Core Cycle Test' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByText('Test Creation Method')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Proctoring & Test Settings' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy())

    fireEvent.change(screen.getByDisplayValue('Select pool...'), { target: { value: 'pool-1' } })

    expect(screen.getByText('This pool is empty. Open Question Pools and add questions before seeding.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Seed' }).disabled).toBe(true)
    expect(seedExamFromPoolMock).not.toHaveBeenCalled()
  })

  it('makes the proctoring phase explicit and supports bulk learner selection', async () => {
    usersMock.mockResolvedValue({
      data: [
        { id: 'learner-1', role: 'LEARNER', user_id: 'LIV1001', name: 'Learner One', email: 'one@example.com' },
        { id: 'learner-2', role: 'LEARNER', user_id: 'LIV1002', name: 'Learner Two', email: 'two@example.com' },
        { id: 'admin-1', role: 'ADMIN', user_id: 'ADM1001', name: 'Admin User', email: 'admin@example.com' },
      ],
    })

    renderWizard()

    expect((await screen.findAllByText('Proctoring')).length).toBeGreaterThan(0)

    fireEvent.change(await screen.findByPlaceholderText('e.g. Midterm Examination - Computer Science'), {
      target: { value: 'Core Cycle Test' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByText('Test Creation Method')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Proctoring & Test Settings' })).toBeTruthy())
    expect(screen.getByText(/dedicated proctoring phase/i)).toBeTruthy()
    expect(screen.getByText('Identity verification')).toBeTruthy()
    expect(screen.getByText('Head Pose Detection')).toBeTruthy()
    expect(screen.getByText('Eye deviation angle')).toBeTruthy()
    expect(screen.getByText('Advanced detector tuning')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Grading Configuration' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Certificates' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Review' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Testing Sessions' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Select all learners (2)' }))
    expect(screen.getByText('Selected: 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All learners selected' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save assignments (2)' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByText('Selected: 0')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Bulk learners'), {
      target: { value: 'one@example.com\nLIV1002' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted learners' }))

    await waitFor(() => expect(screen.getByText('Matched 2 learners.')).toBeTruthy())
    expect(screen.getByText('Selected: 2')).toBeTruthy()
  })
})
