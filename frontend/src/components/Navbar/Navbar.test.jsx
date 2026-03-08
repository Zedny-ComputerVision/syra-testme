import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Navbar from './Navbar'
import { ThemeContext } from '../../context/ThemeContext'

const navigateMock = vi.fn()
const useAuthMock = vi.fn()
const searchAllMock = vi.fn()
const getUnreadCountMock = vi.fn()
const markAllReadMock = vi.fn()
const listNotificationsMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../../hooks/useAuth', () => ({
  default: () => useAuthMock(),
}))

vi.mock('../../services/search.service', () => ({
  searchAll: (...args) => searchAllMock(...args),
}))

vi.mock('../../services/notification.service', () => ({
  getUnreadCount: (...args) => getUnreadCountMock(...args),
  markAllRead: (...args) => markAllReadMock(...args),
  listNotifications: (...args) => listNotificationsMock(...args),
}))

function renderNavbar() {
  return render(
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn(), accent: 'emerald', setAccent: vi.fn() }}>
      <Navbar onMenuToggle={vi.fn()} />
    </ThemeContext.Provider>,
  )
}

describe('Navbar search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({
      user: { role: 'ADMIN', name: 'Admin User', user_id: 'admin-1', email: 'admin@example.com' },
      logout: vi.fn(),
      hasPermission: () => true,
      setUser: vi.fn(),
    })
    getUnreadCountMock.mockResolvedValue({ data: { count: 0 } })
    markAllReadMock.mockResolvedValue({ data: {} })
    listNotificationsMock.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('shows a non-navigable empty-state row when search returns no matches', async () => {
    searchAllMock.mockResolvedValue({ data: { exams: [], attempts: [], users: [] } })

    renderNavbar()
    fireEvent.change(screen.getByPlaceholderText('Search tests, attempts, users...'), { target: { value: 'zzzz' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
    })

    expect(screen.getByText('No results found')).toBeTruthy()
    fireEvent.click(screen.getByText('No results found'))
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('does not navigate when the search request fails', async () => {
    searchAllMock.mockRejectedValue(new Error('network'))

    renderNavbar()
    fireEvent.change(screen.getByPlaceholderText('Search tests, attempts, users...'), { target: { value: 'physics' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
    })

    expect(screen.getByText('Search failed')).toBeTruthy()
    fireEvent.click(screen.getByText('Search failed'))
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
