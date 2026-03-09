import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import AdminAttemptVideos from './AdminAttemptVideos'

const attemptsMock = vi.fn()
const getAttemptMock = vi.fn()
const listAttemptVideosMock = vi.fn()
const getAttemptEventsMock = vi.fn()
const fetchAuthenticatedMediaObjectUrlMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    attempts: (...args) => attemptsMock(...args),
    getAttempt: (...args) => getAttemptMock(...args),
    listAttemptVideos: (...args) => listAttemptVideosMock(...args),
    getAttemptEvents: (...args) => getAttemptEventsMock(...args),
  },
}))

vi.mock('../../../utils/authenticatedMedia', () => ({
  fetchAuthenticatedMediaObjectUrl: (...args) => fetchAuthenticatedMediaObjectUrlMock(...args),
  revokeObjectUrl: vi.fn(),
}))

describe('AdminAttemptVideos supervision mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    attemptsMock.mockResolvedValue({ data: [] })
    getAttemptMock.mockResolvedValue({ data: null })
    listAttemptVideosMock.mockResolvedValue({ data: [] })
    getAttemptEventsMock.mockResolvedValue({ data: [] })
    fetchAuthenticatedMediaObjectUrlMock.mockResolvedValue('blob:media')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a stable empty state when a test has no attempts yet', async () => {
    render(
      <MemoryRouter
        initialEntries={['/admin/videos?exam_id=test-1']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/admin/videos" element={<AdminAttemptVideos />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('No attempts found for this test yet.')).toBeTruthy())
    expect(screen.getByText('No attempts yet')).toBeTruthy()
    expect(getAttemptMock).not.toHaveBeenCalled()
    expect(listAttemptVideosMock).not.toHaveBeenCalled()
    expect(getAttemptEventsMock).not.toHaveBeenCalled()
  })

  it('retries loading when attempt recordings fail to load', async () => {
    getAttemptMock
      .mockRejectedValueOnce({ response: { data: { detail: 'Attempt load failed' } } })
      .mockResolvedValueOnce({ data: { id: 'attempt-7', status: 'COMPLETED' } })

    render(
      <MemoryRouter
        initialEntries={['/admin/videos/attempt-7']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/admin/videos/:attemptId" element={<AdminAttemptVideos />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Attempt load failed')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(getAttemptMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('No video recordings are saved yet for this attempt.')).toBeTruthy())
  })

  it('keeps video playback available when warning events fail to load', async () => {
    getAttemptMock.mockResolvedValue({
      data: {
        id: 'attempt-7',
        status: 'SUBMITTED',
        started_at: '2026-03-07T10:00:00Z',
        user_name: 'Learner One',
        test_title: 'Core Cycle Test',
      },
    })
    listAttemptVideosMock.mockResolvedValue({
      data: [{
        name: 'attempt-7.webm',
        url: '/videos/attempt-7.webm',
        created_at: '2026-03-07T10:05:00Z',
      }],
    })
    getAttemptEventsMock.mockRejectedValue(new Error('events unavailable'))

    render(
      <MemoryRouter
        initialEntries={['/admin/videos/attempt-7']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/admin/videos/:attemptId" element={<AdminAttemptVideos />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Warning events could not be loaded. Video playback remains available.')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Open file' })).toBeTruthy()
    expect(screen.getByText('Warnings')).toBeTruthy()
  })

  it('filters the flagged event list by severity', async () => {
    getAttemptMock.mockResolvedValue({
      data: {
        id: 'attempt-7',
        status: 'SUBMITTED',
        started_at: '2026-03-07T10:00:00Z',
        user_name: 'Learner One',
        test_title: 'Core Cycle Test',
      },
    })
    listAttemptVideosMock.mockResolvedValue({
      data: [{
        name: 'attempt-7.webm',
        url: '/videos/attempt-7.webm',
        created_at: '2026-03-07T10:05:00Z',
      }],
    })
    getAttemptEventsMock.mockResolvedValue({
      data: [
        {
          id: 'event-1',
          event_type: 'ALT_TAB',
          severity: 'MEDIUM',
          detail: 'Learner changed tabs',
          occurred_at: '2026-03-07T10:01:00Z',
        },
        {
          id: 'event-2',
          event_type: 'CAMERA_COVERED',
          severity: 'HIGH',
          detail: 'Camera covered',
          occurred_at: '2026-03-07T10:02:00Z',
        },
      ],
    })

    render(
      <MemoryRouter
        initialEntries={['/admin/videos/attempt-7']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/admin/videos/:attemptId" element={<AdminAttemptVideos />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Warnings')).toBeTruthy())
    expect(screen.getAllByText('Learner changed tabs').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Camera covered').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'HIGH' } })

    await waitFor(() => expect(screen.queryByText('Learner changed tabs')).toBeNull())
    expect(screen.getAllByText('Camera covered').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CAMERA_COVERED').length).toBeGreaterThan(0)
    expect(screen.getByText('Confidence unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('recovers a finite duration when a webm recording initially reports an open-ended duration', async () => {
    getAttemptMock.mockResolvedValue({
      data: {
        id: 'attempt-7',
        status: 'SUBMITTED',
        started_at: '2026-03-07T10:00:00Z',
        user_name: 'Learner One',
        test_title: 'Core Cycle Test',
      },
    })
    listAttemptVideosMock.mockResolvedValue({
      data: [{
        name: 'attempt-7.webm',
        url: '/videos/attempt-7.webm',
        created_at: '2026-03-07T10:05:00Z',
      }],
    })
    getAttemptEventsMock.mockResolvedValue({ data: [] })

    const view = render(
      <MemoryRouter
        initialEntries={['/admin/videos/attempt-7']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/admin/videos/:attemptId" element={<AdminAttemptVideos />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Warnings')).toBeTruthy())

    const video = view.container.querySelector('video')
    expect(video).toBeTruthy()

    let durationValue = Number.POSITIVE_INFINITY
    let currentTimeValue = 0
    const finiteDuration = 19.753

    Object.defineProperty(video, 'duration', {
      configurable: true,
      get: () => durationValue,
    })
    Object.defineProperty(video, 'seekable', {
      configurable: true,
      get: () => ({
        length: 1,
        start: () => 0,
        end: () => durationValue,
      }),
    })
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      get: () => ({
        length: 1,
        start: () => 0,
        end: () => durationValue,
      }),
    })
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTimeValue,
      set: (value) => {
        if (value > 1e100) {
          durationValue = finiteDuration
          currentTimeValue = 0
          setTimeout(() => {
            fireEvent(video, new Event('durationchange'))
            fireEvent(video, new Event('timeupdate'))
          }, 0)
          return
        }
        currentTimeValue = value
      },
    })

    fireEvent.loadedMetadata(video)

    await waitFor(() => expect(screen.getByText('0:00 / 0:19')).toBeTruthy())
  })
})
