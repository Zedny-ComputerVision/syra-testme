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
let decodedRole = 'LEARNER'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('jwt-decode', () => ({
  jwtDecode: () => ({ role: decodedRole }),
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
    decodedRole = 'LEARNER'
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

  it('lets the user toggle password visibility from the sign-in screen', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    )

    const passwordInput = screen.getByLabelText('Password')
    expect(passwordInput.getAttribute('type')).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordInput.getAttribute('type')).toBe('text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordInput.getAttribute('type')).toBe('password')
  })

  it('uses the localhost seeded learner account for the quick login button', async () => {
    const learnerTokens = { access_token: 'learner-token', refresh_token: 'learner-refresh' }

    loginMock
      .mockResolvedValueOnce({ data: learnerTokens })

    axios.post.mockImplementation((url) => {
      if (url.endsWith('/api/testing/reset-seed')) {
        return Promise.resolve({
          data: {
            admin: {
              email: 'admin@example.com',
              password: 'Password123!',
            },
            learners: [
              {
                email: 'learner1@example.com',
                password: 'Password123!',
                user_id: 'LRN001',
              },
            ],
          },
        })
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`))
    })

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Learner' }))

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1))

    expect(setupMock).not.toHaveBeenCalled()
    expect(signupStatusMock).not.toHaveBeenCalled()
    expect(axios.get).not.toHaveBeenCalled()
    expect(axios.patch).not.toHaveBeenCalled()
    expect(loginMock).toHaveBeenCalledWith('learner1@example.com', 'Password123!')
    expect(authLoginMock).toHaveBeenCalledWith(learnerTokens)
    expect(navigateMock).toHaveBeenCalled()
  })

  it('sends admins to the dashboard after login even when returning from an admin deep link', async () => {
    decodedRole = 'ADMIN'
    const adminTokens = { access_token: 'admin-token', refresh_token: 'admin-refresh' }

    loginMock.mockResolvedValueOnce({ data: adminTokens })

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { from: '/admin/tests' } }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Admin1234!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('admin@example.com', 'Admin1234!'))

    expect(authLoginMock).toHaveBeenCalledWith(adminTokens)
    expect(navigateMock).toHaveBeenCalledWith('/admin/dashboard', { replace: true })
  })
})
