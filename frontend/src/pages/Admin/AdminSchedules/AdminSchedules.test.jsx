import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminSchedules from './AdminSchedules'

const schedulesMock = vi.fn()
const allTestsMock = vi.fn()
const usersMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    schedules: (...args) => schedulesMock(...args),
    allTests: (...args) => allTestsMock(...args),
    users: (...args) => usersMock(...args),
    createSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  },
}))

describe('AdminSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    schedulesMock.mockResolvedValue({ data: [] })
    allTestsMock.mockResolvedValue({
      data: { items: [{ id: 'test-1', title: 'Physics Quiz' }] },
    })
    usersMock.mockResolvedValue({
      data: [{ id: 'user-1', user_id: 'STU-1', name: 'Learner One' }],
    })
  })

  it('keeps the assign action disabled until a scheduled time is provided', async () => {
    render(<AdminSchedules />)

    await waitFor(() => expect(screen.getByText('No schedules yet.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ Assign' }))

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'user-1' } })
    fireEvent.change(selects[1], { target: { value: 'test-1' } })

    const assignButton = screen.getByRole('button', { name: 'Assign' })
    expect(assignButton.disabled).toBe(true)

    const scheduledInput = document.querySelector('input[type="datetime-local"]')
    fireEvent.change(scheduledInput, { target: { value: '2026-03-08T09:30' } })
    expect(screen.getByRole('button', { name: 'Assign' }).disabled).toBe(false)
  })

  it('shows a filter-specific empty state and restores the schedule list when filters are cleared', async () => {
    schedulesMock.mockResolvedValueOnce({
      data: [{
        id: 'schedule-1',
        user_name: 'Learner One',
        test_title: 'Physics Quiz',
        scheduled_at: '2026-03-08T09:30:00Z',
        access_mode: 'OPEN',
        notes: 'Morning lab',
      }],
    })

    render(<AdminSchedules />)

    await waitFor(() => expect(screen.getByText('Showing 1 schedule across 1 loaded.')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Search schedules'), { target: { value: 'chemistry' } })

    await waitFor(() => expect(screen.getByText('No schedules match the current filters.')).toBeTruthy())

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    await waitFor(() => expect(screen.getByText('Learner One')).toBeTruthy())
    expect(screen.getByText('Showing 1 schedule across 1 loaded.')).toBeTruthy()
  })
})
