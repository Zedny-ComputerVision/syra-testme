import React from 'react'
import axios from 'axios'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import Login from './Login'

const loginMock = vi.fn()
const setupMock = vi.fn()
const signupStatusMock = vi.fn()
const authLoginMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('jwt-decode', () => ({
  jwtDecode: () => ({ role: 'LEARNER' }),
}))

vi.mock('../../services/auth.service', () => ({
  login: (...args) => loginMock(...args),
  setup: (...args) => setupMock(...args),
  signupStatus: (...args) => signupStatusMock(...args),
}))

vi.mock('../../hooks/useAuth', () => ({
  default: () => ({
    login: authLoginMock,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    axios.get.mockReset()
    axios.post.mockReset()
    axios.patch.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('exposes recovery and signup links from the sign-in screen', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/forgot-password')
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/signup')
  })

  it('repairs the localhost sandbox learner account before logging in', async () => {
    const adminTokens = { access_token: 'admin-token', refresh_token: 'admin-refresh' }
    const learnerTokens = { access_token: 'learner-token', refresh_token: 'learner-refresh' }

    loginMock
      .mockResolvedValueOnce({ data: adminTokens })
      .mockResolvedValueOnce({ data: learnerTokens })
    signupStatusMock.mockResolvedValue({ data: { allowed: false } })

    axios.post.mockImplementation((url) => {
      if (url.endsWith('/api/users/')) {
        return Promise.reject({ response: { status: 409, data: { detail: 'Email exists' } } })
      }
      if (url.includes('/reset-password')) {
        return Promise.resolve({ data: { detail: 'Password reset' } })
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`))
    })
    axios.get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'learner-id',
            email: 'sandbox.learner@example.com',
            user_id: 'SBX001',
            role: 'ADMIN',
            is_active: false,
          },
        ],
      },
    })
    axios.patch.mockResolvedValue({ data: {} })

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Learner' }))

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(2))

    expect(setupMock).not.toHaveBeenCalled()
    expect(signupStatusMock).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.patch).toHaveBeenCalledWith(
      'http://localhost:3000/api/users/learner-id',
      expect.objectContaining({
        email: 'sandbox.learner@example.com',
        user_id: 'SBX001',
        role: 'LEARNER',
        is_active: true,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer admin-token',
        }),
      }),
    )
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:3000/api/users/learner-id/reset-password',
      { new_password: 'Sandbox1234!' },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer admin-token',
        }),
      }),
    )
    expect(authLoginMock).toHaveBeenCalledWith(learnerTokens)
    expect(navigateMock).toHaveBeenCalled()
  })
})
