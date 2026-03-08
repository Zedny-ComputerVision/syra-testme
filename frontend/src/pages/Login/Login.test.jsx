import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import Login from './Login'

const loginMock = vi.fn()
const authLoginMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('../../services/auth.service', () => ({
  login: (...args) => loginMock(...args),
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
  })

  afterEach(() => {
    cleanup()
  })

  it('exposes recovery and signup links from the sign-in screen', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/forgot-password')
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/signup')
  })
})
