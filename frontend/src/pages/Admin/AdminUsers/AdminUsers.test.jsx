import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import AdminUsers from './AdminUsers'

const usersMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    users: (...args) => usersMock(...args),
  },
}))

vi.mock('../../../hooks/useAuth', () => ({
  default: () => useAuthMock(),
}))

describe('AdminUsers permission modes', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    usersMock.mockResolvedValue({
      data: [
        {
          id: 'user-1',
          user_id: 'learner01',
          name: 'Learner One',
          email: 'learner01@example.com',
          role: 'LEARNER',
          is_active: true,
        },
      ],
    })
  })

  it('renders read-only access for instructors', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'INSTRUCTOR' } })

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminUsers />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Learner One')).toBeTruthy())
    expect(screen.getByText('Read-only access')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ New User' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('shows a retry action when loading users fails', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } })
    usersMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: [
          {
            id: 'user-1',
            user_id: 'learner01',
            name: 'Learner One',
            email: 'learner01@example.com',
            role: 'LEARNER',
            is_active: true,
          },
        ],
      })

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminUsers />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('offline')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(usersMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getAllByText('Learner One').length).toBeGreaterThan(0))
  })

  it('shows a filter-specific empty state and restores the full list when filters are cleared', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } })

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminUsers />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getAllByText('Learner One').length).toBeGreaterThan(0))

    fireEvent.change(screen.getAllByPlaceholderText('Search by name, email, ID...').at(-1), {
      target: { value: 'missing-user' },
    })

    await waitFor(() => expect(screen.getByText('No users match the current filters. Clear the filters to see the full directory again.')).toBeTruthy())

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1))

    await waitFor(() => expect(screen.getAllByText('Learner One').length).toBeGreaterThan(0))
  })
})
