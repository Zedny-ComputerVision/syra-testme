import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import AdminLiveMonitor from './AdminLiveMonitor'

const apiGetMock = vi.fn()

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    tokens: { access_token: 'token-123' },
  }),
}))

vi.mock('../../../services/api', () => ({
  default: {
    get: (...args) => apiGetMock(...args),
  },
}))

describe('AdminLiveMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetMock.mockResolvedValue({ data: { active_sessions: [] } })
  })

  afterEach(() => {
    cleanup()
  })

  it('redirects to access denied when live-monitor access is forbidden', async () => {
    apiGetMock.mockRejectedValue({ response: { status: 403 } })

    render(
      <MemoryRouter initialEntries={['/admin/live-monitor']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/live-monitor" element={<AdminLiveMonitor />} />
          <Route path="/access-denied" element={<div>Access denied route</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Access denied route')).toBeTruthy())
  })
})
