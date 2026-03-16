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

  it('compares exam IDs as strings when validating cached attempts', async () => {
    getAttemptIdMock.mockReturnValue('cached-attempt')
    getAttemptMock.mockResolvedValueOnce({
      data: { id: 'cached-attempt', exam_id: 1, status: 'IN_PROGRESS' },
    })

    const id = await resolveAttempt(1)

    expect(id).toBe('cached-attempt')
    expect(resolveAttemptRequestMock).not.toHaveBeenCalled()
    expect(clearAttemptIdMock).not.toHaveBeenCalled()
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

  it('falls back to backend resolution when cached attempt request throws', async () => {
    getAttemptIdMock.mockReturnValue('cached-attempt')
    getAttemptMock.mockRejectedValueOnce(new Error('network failure'))
    resolveAttemptRequestMock.mockResolvedValueOnce({
      data: { id: 'recovered-attempt', exam_id: 'exam-1', status: 'IN_PROGRESS' },
    })

    const id = await resolveAttempt('exam-1')

    expect(clearAttemptIdMock).toHaveBeenCalled()
    expect(id).toBe('recovered-attempt')
    expect(resolveAttemptRequestMock).toHaveBeenCalledWith('exam-1')
  })

  it('creates or resolves through the backend when there is no cached attempt', async () => {
    getAttemptIdMock.mockReturnValue(null)
    resolveAttemptRequestMock.mockResolvedValueOnce({ data: { id: 'new-attempt' } })

    const id = await resolveAttempt('exam-1')

    expect(id).toBe('new-attempt')
    expect(resolveAttemptRequestMock).toHaveBeenCalledWith('exam-1')
    expect(setAttemptIdMock).toHaveBeenCalledWith('new-attempt')
  })

  it('retries from backend when cached attempt is stale object', async () => {
    getAttemptIdMock.mockReturnValue('cached-attempt')
    getAttemptMock.mockResolvedValueOnce({ data: null })
    resolveAttemptRequestMock.mockResolvedValueOnce({
      data: { id: 'fresh-attempt', exam_id: 'exam-1', status: 'IN_PROGRESS' },
    })

    const id = await resolveAttempt('exam-1')

    expect(clearAttemptIdMock).toHaveBeenCalled()
    expect(id).toBe('fresh-attempt')
    expect(resolveAttemptRequestMock).toHaveBeenCalledTimes(1)
  })

  it('throws when backend resolution returns unusable payload', async () => {
    getAttemptIdMock.mockReturnValue('cached-attempt')
    getAttemptMock.mockResolvedValueOnce({
      data: { id: 'cached-attempt', exam_id: 'exam-2', status: 'SUBMITTED' },
    })
    resolveAttemptRequestMock.mockResolvedValueOnce({ data: {} })

    await expect(resolveAttempt('exam-1')).rejects.toThrow('Failed to resolve attempt')
    expect(clearAttemptIdMock).toHaveBeenCalled()
    expect(setAttemptIdMock).not.toHaveBeenCalled()
  })
})
