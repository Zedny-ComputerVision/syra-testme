import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveAttempt } from './journeyAttempt'

const getAttemptMock = vi.fn()
const resolveAttemptRequestMock = vi.fn()
const getAttemptIdMock = vi.fn()
const setAttemptIdMock = vi.fn()
const clearAttemptIdMock = vi.fn()

vi.mock('../services/attempt.service', () => ({
  getAttempt: (...args) => getAttemptMock(...args),
  resolveAttempt: (...args) => resolveAttemptRequestMock(...args),
}))

vi.mock('./attemptSession', () => ({
  getAttemptId: () => getAttemptIdMock(),
  setAttemptId: (...args) => setAttemptIdMock(...args),
  clearAttemptId: () => clearAttemptIdMock(),
}))

describe('resolveAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses cached in-progress attempt for the same exam', async () => {
    getAttemptIdMock.mockReturnValue('cached-attempt')
    getAttemptMock.mockResolvedValueOnce({
      data: { id: 'cached-attempt', exam_id: 'exam-1', status: 'IN_PROGRESS' },
    })

    const id = await resolveAttempt('exam-1')

    expect(id).toBe('cached-attempt')
    expect(resolveAttemptRequestMock).not.toHaveBeenCalled()
    expect(setAttemptIdMock).toHaveBeenCalledWith('cached-attempt')
  })

  it('falls back to backend resolution when cached attempt is invalid', async () => {
    getAttemptIdMock.mockReturnValue('cached-attempt')
    getAttemptMock.mockResolvedValueOnce({
      data: { id: 'cached-attempt', exam_id: 'exam-2', status: 'SUBMITTED' },
    })
    resolveAttemptRequestMock.mockResolvedValueOnce({
      data: { id: 'reusable', exam_id: 'exam-1', status: 'IN_PROGRESS' },
    })

    const id = await resolveAttempt('exam-1')

    expect(clearAttemptIdMock).toHaveBeenCalled()
    expect(id).toBe('reusable')
    expect(resolveAttemptRequestMock).toHaveBeenCalledWith('exam-1')
    expect(setAttemptIdMock).toHaveBeenCalledWith('reusable')
  })

  it('creates or resolves through the backend when there is no cached attempt', async () => {
    getAttemptIdMock.mockReturnValue(null)
    resolveAttemptRequestMock.mockResolvedValueOnce({ data: { id: 'new-attempt' } })

    const id = await resolveAttempt('exam-1')

    expect(id).toBe('new-attempt')
    expect(resolveAttemptRequestMock).toHaveBeenCalledWith('exam-1')
    expect(setAttemptIdMock).toHaveBeenCalledWith('new-attempt')
  })
})
