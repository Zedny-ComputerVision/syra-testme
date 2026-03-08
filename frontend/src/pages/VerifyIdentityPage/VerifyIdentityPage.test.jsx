import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import VerifyIdentityPage from './VerifyIdentityPage'

const getTestMock = vi.fn()
const getUserMediaMock = vi.fn()
const requestFullscreenMock = vi.fn()
let fullscreenElement = null

vi.mock('../../services/test.service', () => ({
  getTest: (...args) => getTestMock(...args),
}))

vi.mock('../../services/attempt.service', () => ({
  precheckAttempt: vi.fn(),
}))

vi.mock('../../utils/journeyAttempt', () => ({
  resolveAttempt: vi.fn(),
}))

vi.mock('../../utils/attemptSession', () => ({
  setAttemptId: vi.fn(),
}))

vi.mock('../../components/ExamJourneyStepper/ExamJourneyStepper', () => ({
  default: () => <div>Stepper</div>,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tests/test-1/verify-identity']}>
      <Routes>
        <Route path="/tests/:testId/verify-identity" element={<VerifyIdentityPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('VerifyIdentityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fullscreenElement = null
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock.mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    requestFullscreenMock.mockImplementation(async () => {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('retries requirement loading and keeps confirmation disabled until evidence is ready', async () => {
    getTestMock
      .mockRejectedValueOnce(new Error('config unavailable'))
      .mockResolvedValueOnce({
        data: {
          id: 'test-1',
          proctoring_config: {
            identity_required: true,
            camera_required: true,
            lighting_required: false,
          },
        },
      })

    renderPage()

    await waitFor(() => expect(screen.getByText('Failed to load test verification requirements. Please refresh and try again.')).toBeTruthy())
    const confirmButton = screen.getByRole('button', { name: 'Confirm & Continue' })
    expect(confirmButton.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Retry requirements' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture Selfie' }).disabled).toBe(false))
    expect(screen.getByRole('button', { name: 'Confirm & Continue' }).disabled).toBe(true)
  })

  it('prompts the learner to return to fullscreen after the upload picker exits fullscreen', async () => {
    fullscreenElement = document.documentElement
    getTestMock.mockResolvedValueOnce({
      data: {
        id: 'test-1',
        proctoring_config: {
          identity_required: true,
          camera_required: true,
          fullscreen_required: true,
          lighting_required: false,
        },
      },
    })

    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload ID' }).disabled).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: 'Upload ID' }))
    fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))

    await waitFor(() => expect(screen.getByText(/opening the browser file picker can exit fullscreen/i)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Return to fullscreen' }))

    await waitFor(() => expect(requestFullscreenMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/opening the browser file picker can exit fullscreen/i)).toBeNull())
  })
})
