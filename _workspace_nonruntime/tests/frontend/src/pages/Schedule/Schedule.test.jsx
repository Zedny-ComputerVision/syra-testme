import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Schedule from './Schedule'

const navigate = vi.fn()
const listSchedules = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../services/schedule.service', () => ({
  listSchedules: (...args) => listSchedules(...args),
}))

describe('Schedule page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not expose a live start action before the scheduled start time', async () => {
    listSchedules.mockResolvedValue({
      data: [
        {
          id: 'schedule-1',
          exam_id: 'exam-1',
          test_title: 'Chemistry Midterm',
          scheduled_at: '2999-03-08T09:00:00Z',
          access_mode: 'OPEN',
        },
      ],
    })

    render(<Schedule />)

    await waitFor(() => expect(screen.getByText('Chemistry Midterm')).toBeTruthy())
    const button = screen.getByRole('button', { name: 'Starts at scheduled time' })
    expect(button.disabled).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })
})
