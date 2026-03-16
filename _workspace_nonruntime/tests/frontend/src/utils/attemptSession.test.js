import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAttemptId, getAttemptId, setAttemptId } from './attemptSession'

describe('attemptSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('stores, returns, and removes the active attempt id', () => {
    expect(getAttemptId()).toBeNull()

    setAttemptId('attempt-123')
    expect(getAttemptId()).toBe('attempt-123')

    clearAttemptId()
    expect(getAttemptId()).toBeNull()
  })
})
