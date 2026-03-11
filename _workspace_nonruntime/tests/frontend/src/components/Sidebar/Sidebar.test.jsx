import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Sidebar from './Sidebar'

const useAuthMock = vi.fn()

vi.mock('../../hooks/useAuth', () => ({
  default: () => useAuthMock(),
}))

afterEach(() => {
  cleanup()
})

describe('Sidebar role visibility', () => {
  it('hides admin sections for INSTRUCTOR', () => {
    useAuthMock.mockReturnValue({ user: { role: 'INSTRUCTOR' }, hasPermission: () => false })
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.queryByText('Manage Tests')).toBeNull()
    expect(screen.queryByText('Testing Center')).toBeNull()
  })

  it('shows instructor-safe sections when permissions are granted', () => {
    const allowed = new Set(['Assign Schedules', 'Manage Users'])
    useAuthMock.mockReturnValue({
      user: { role: 'INSTRUCTOR' },
      hasPermission: (feature) => allowed.has(feature),
    })
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByText('Testing Sessions')).toBeTruthy()
    expect(screen.getByText('User Profiles')).toBeTruthy()
    expect(screen.queryByText('Manage Tests')).toBeNull()
  })

  it('shows admin sections for ADMIN', () => {
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' }, hasPermission: () => true })
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByText('Manage Tests')).toBeTruthy()
    expect(screen.getAllByText('Testing Center').length).toBeGreaterThan(0)
  })
})
