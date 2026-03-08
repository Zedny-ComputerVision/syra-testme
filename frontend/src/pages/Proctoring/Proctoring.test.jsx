import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import Proctoring from './Proctoring'

const getAttemptMock = vi.fn()
const getAttemptAnswersMock = vi.fn()
const submitAnswerMock = vi.fn()
const submitAttemptMock = vi.fn()
const getTestQuestionsMock = vi.fn()
const getTestMock = vi.fn()

function MotionDiv({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }) {
  return <div {...props}>{children}</div>
}

function MotionButton({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }) {
  return <button {...props}>{children}</button>
}

function MotionLabel({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }) {
  return <label {...props}>{children}</label>
}

vi.mock('framer-motion', () => ({
  motion: {
    div: MotionDiv,
    button: MotionButton,
    label: MotionLabel,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}))

vi.mock('../../hooks/useAuth', () => ({
  default: () => ({
    tokens: { access_token: 'test-token' },
  }),
}))

vi.mock('../../components/ProctorOverlay/ProctorOverlay', () => ({
  default: () => <div>Proctor Overlay</div>,
}))

vi.mock('../../components/ViolationToast', () => ({
  default: () => <div>Violation Toast</div>,
}))

vi.mock('../../services/attempt.service', () => ({
  getAttempt: (...args) => getAttemptMock(...args),
  getAttemptAnswers: (...args) => getAttemptAnswersMock(...args),
  submitAnswer: (...args) => submitAnswerMock(...args),
  submitAttempt: (...args) => submitAttemptMock(...args),
}))

vi.mock('../../services/test.service', () => ({
  getTest: (...args) => getTestMock(...args),
  getTestQuestions: (...args) => getTestQuestionsMock(...args),
}))

vi.mock('../../services/proctoring.service', () => ({
  startProctoringVideo: vi.fn(),
  uploadProctoringVideoChunk: vi.fn(),
  finalizeProctoringVideo: vi.fn(),
  proctoringPing: vi.fn(),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/attempts/attempt-1/take']}>
      <Routes>
        <Route path="/attempts/:attemptId/take" element={<Proctoring />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Proctoring page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAttemptMock.mockResolvedValue({
      data: {
        id: 'attempt-1',
        exam_id: 'exam-1',
        started_at: '2026-03-07T10:00:00Z',
      },
    })
    getTestMock.mockResolvedValue({
      data: {
        id: 'exam-1',
        title: 'Physics Final',
        proctoring_config: {},
      },
    })
    getTestQuestionsMock.mockResolvedValue({
      data: [
        {
          id: 'question-1',
          text: 'What is 2 + 2?',
          question_type: 'TEXT',
        },
      ],
    })
    getAttemptAnswersMock.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the attempt usable when saved answers fail to restore', async () => {
    getAttemptAnswersMock.mockRejectedValueOnce(new Error('restore failed'))

    renderPage()

    await waitFor(() => expect(screen.getByText('Physics Final')).toBeTruthy())
    expect(screen.getByText('Previously saved answers could not be restored. New answers will still be saved.')).toBeTruthy()
    expect(screen.getByPlaceholderText('Type your answer here...')).toBeTruthy()
  })

  it('shows a retry state when the test bootstrap fails and recovers on retry', async () => {
    getTestMock
      .mockRejectedValueOnce(new Error('test unavailable'))
      .mockResolvedValueOnce({
        data: {
          id: 'exam-1',
          title: 'Physics Final',
          proctoring_config: {},
        },
      })

    renderPage()

    await waitFor(() => expect(screen.getByText('Failed to load test. Please refresh and try again.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('What is 2 + 2?')).toBeTruthy())
    expect(getAttemptMock).toHaveBeenCalledTimes(2)
  })

  it('shows an explicit empty state when the attempt has no questions', async () => {
    getTestQuestionsMock.mockResolvedValueOnce({ data: [] })

    renderPage()

    await waitFor(() => expect(screen.getByText('No questions are available for this attempt.')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Back to Attempts' })).toBeTruthy()
  })

  it('shows progress details and a submit confirmation before final submission', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Physics Final')).toBeTruthy())
    expect(screen.getByText('0 answered of 1 total')).toBeTruthy()
    expect(screen.getByText('1 unanswered')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }))

    await waitFor(() => expect(screen.getByText('Ready to submit?')).toBeTruthy())
    expect(screen.getByText(/You still have 1 unanswered question./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm Submit' })).toBeTruthy()
  })

  it('shows autosave status when the learner changes an answer', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Physics Final')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('Type your answer here...'), { target: { value: 'Momentum is conserved.' } })

    expect(screen.getByText('Autosave: Pending changes')).toBeTruthy()
  })
})
