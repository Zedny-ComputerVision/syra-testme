import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import Home from './Home'

const apiGet = vi.fn()
const listAttemptsMock = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args) => apiGet(...args),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  default: () => ({ user: { name: 'Learner One' } }),
}))

vi.mock('../../services/attempt.service', () => ({
  listAttempts: (...args) => listAttemptsMock(...args),
}))

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAttemptsMock.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps learner navigation usable and retries after dashboard failure', async () => {
    apiGet
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        data: {
          total_exams: 3,
          total_attempts: 4,
          in_progress_attempts: 1,
          best_score: 92.5,
          upcoming_count: 1,
          upcoming_schedules: [
            {
              id: 'schedule-1',
              test_title: 'Biology Quiz',
              scheduled_at: '2026-03-08T09:00:00Z',
              access_mode: 'OPEN',
            },
          ],
        },
      })

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Dashboard data is temporarily unavailable. You can still open your tests and retry.')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'View all tests ->' })).toBeTruthy()
    expect(screen.getByText('No upcoming scheduled tests.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Biology Quiz')).toBeTruthy())
  })

  it('falls back cleanly when the dashboard endpoint resolves without a payload', async () => {
    apiGet.mockResolvedValueOnce(undefined)

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Dashboard data is temporarily unavailable. You can still open your tests and retry.')).toBeTruthy())
    expect(screen.getByText('No upcoming scheduled tests.')).toBeTruthy()
  })
})
