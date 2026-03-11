import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import RulesPage from './RulesPage'

const getTestMock = vi.fn()

vi.mock('../../services/test.service', () => ({
  getTest: (...args) => getTestMock(...args),
}))

vi.mock('../../services/attempt.service', () => ({
  getAttempt: vi.fn(),
}))

vi.mock('../../utils/journeyAttempt', () => ({
  resolveAttempt: vi.fn(),
}))

vi.mock('../../utils/attemptSession', () => ({
  setAttemptId: vi.fn(),
  clearAttemptId: vi.fn(),
}))

vi.mock('../../components/ExamJourneyStepper/ExamJourneyStepper', () => ({
  default: () => <div>Stepper</div>,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tests/test-1/rules']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/tests/:testId/rules" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('blocks starting until failed rules loading is retried successfully', async () => {
    getTestMock
      .mockRejectedValueOnce(new Error('config unavailable'))
      .mockResolvedValueOnce({
        data: {
          settings: { rules: ['Keep your camera on.'] },
          proctoring_config: { identity_required: true },
        },
      })

    renderPage()

    await waitFor(() => expect(screen.getByText('Failed to load the test rules and requirements. Retry before starting.')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Start Test' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Keep your camera on.')).toBeTruthy())
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(screen.getByRole('button', { name: 'Start Test' }).disabled).toBe(false)
  })

  it('shows the system-check prerequisite state before the learner starts', async () => {
    getTestMock.mockResolvedValue({
      data: {
        settings: { rules: ['Stay visible on camera.'] },
        proctoring_config: { fullscreen_enforce: true, face_detection: true },
      },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('System check')).toBeTruthy())
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText(/System check has not been completed in this browser session yet./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Complete system check first' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Back to system check' })).toBeTruthy()
  })
})
