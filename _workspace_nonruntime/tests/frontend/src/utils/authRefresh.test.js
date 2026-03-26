import { describe, expect, it } from 'vitest'

import { isTerminalRefreshError, markRefreshError } from './authRefresh'

describe('authRefresh helpers', () => {
  it('treats invalid-token refresh failures as terminal', () => {
    expect(isTerminalRefreshError({
      response: {
        status: 401,
        data: { detail: 'Invalid token' },
      },
    })).toBe(true)
  })

  it('treats rate-limited refresh failures as non-terminal', () => {
    expect(isTerminalRefreshError({
      response: {
        status: 429,
        data: { detail: 'Too many requests' },
      },
    })).toBe(false)
  })

  it('marks locally detected missing refresh token failures as terminal', () => {
    const error = markRefreshError(new Error('Missing refresh token'), { terminal: true })
    expect(isTerminalRefreshError(error)).toBe(true)
  })
})
