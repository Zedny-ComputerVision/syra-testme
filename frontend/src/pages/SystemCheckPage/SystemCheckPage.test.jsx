import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import SystemCheckPage from './SystemCheckPage'

const getTestMock = vi.fn()
const getUserMediaMock = vi.fn()

function MotionDiv({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }) {
  return <div {...props}>{children}</div>
}

function MotionButton({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }) {
  return <button {...props}>{children}</button>
}

vi.mock('framer-motion', () => ({
  motion: {
    div: MotionDiv,
    button: MotionButton,
  },
}))

vi.mock('../../services/test.service', () => ({
  getTest: (...args) => getTestMock(...args),
}))

vi.mock('../../components/ExamJourneyStepper/ExamJourneyStepper', () => ({
  default: () => <div>Stepper</div>,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tests/test-1/system-check']}>
      <Routes>
        <Route path="/tests/:testId/system-check" element={<SystemCheckPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SystemCheckPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() {
        return this.__srcObject ?? null
      },
      set(value) {
        this.__srcObject = value
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('retries requirement loading and restores the continue path', async () => {
    getTestMock
      .mockRejectedValueOnce(new Error('config unavailable'))
      .mockResolvedValueOnce({
        data: {
          id: 'test-1',
          proctoring_config: {
            camera_required: false,
            mic_required: false,
            fullscreen_required: false,
            lighting_required: false,
          },
        },
      })

    renderPage()

    await waitFor(() => expect(screen.getByText('Failed to load test configuration. Please refresh and try again.')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Cannot continue' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Retry requirements' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(false))
  })

  it('attaches the camera stream after the preview video mounts', async () => {
    const stream = {
      getTracks: vi.fn(() => []),
    }
    getUserMediaMock.mockResolvedValue(stream)
    getTestMock.mockResolvedValueOnce({
      data: {
        id: 'test-1',
        proctoring_config: {
          camera_required: true,
          mic_required: false,
          fullscreen_required: false,
          lighting_required: false,
        },
      },
    })

    const { container } = renderPage()

    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledWith({ video: true }))
    const video = await waitFor(() => {
      const element = container.querySelector('video')
      expect(element).toBeTruthy()
      return element
    })
    await waitFor(() => expect(video.srcObject).toBe(stream))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(false))
  })
})
