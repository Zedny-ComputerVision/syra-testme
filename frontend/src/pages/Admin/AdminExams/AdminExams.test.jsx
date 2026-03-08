import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminExams from './AdminExams'

const navigate = vi.fn()
const testsMock = vi.fn()
const duplicateTestMock = vi.fn()
const deleteTestMock = vi.fn()
const downloadTestReportMock = vi.fn()
const publishTestMock = vi.fn()
const archiveTestMock = vi.fn()
const unarchiveTestMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    tests: (...args) => testsMock(...args),
    duplicateTest: (...args) => duplicateTestMock(...args),
    deleteTest: (...args) => deleteTestMock(...args),
    downloadTestReport: (...args) => downloadTestReportMock(...args),
    publishTest: (...args) => publishTestMock(...args),
    archiveTest: (...args) => archiveTestMock(...args),
    unarchiveTest: (...args) => unarchiveTestMock(...args),
  },
}))

const baseListResponse = {
  data: {
    items: [
      {
        id: 'test-1',
        name: 'Midterm',
        code: 'MID-1',
        type: 'MCQ',
        status: 'DRAFT',
        time_limit_minutes: 60,
        testing_sessions: 2,
        updated_at: '2026-03-01T09:00:00Z',
      },
    ],
    total: 1,
  },
}

describe('AdminExams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testsMock.mockResolvedValue(baseListResponse)
    duplicateTestMock.mockResolvedValue({ data: { id: 'test-2' } })
    deleteTestMock.mockResolvedValue({ data: { detail: 'Deleted' } })
    downloadTestReportMock.mockResolvedValue({ data: '<html></html>' })
    publishTestMock.mockResolvedValue({ data: {} })
    archiveTestMock.mockResolvedValue({ data: {} })
    unarchiveTestMock.mockResolvedValue({ data: {} })
    vi.spyOn(window, 'open').mockImplementation(() => ({ document: { write: vi.fn(), close: vi.fn() } }))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows a retry path when the list bootstrap fails', async () => {
    testsMock
      .mockRejectedValueOnce({ response: { data: { detail: 'Failed to load tests.' } } })
      .mockResolvedValueOnce({ data: { items: [], total: 0 } })

    render(<AdminExams />)

    await waitFor(() => expect(screen.getByText('Failed to load tests.')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(testsMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('No tests created yet.')).toBeTruthy())
  })

  it('requires explicit confirmation before deleting a test', async () => {
    testsMock
      .mockResolvedValueOnce(baseListResponse)
      .mockResolvedValueOnce({ data: { items: [], total: 0 } })

    render(<AdminExams />)

    await waitFor(() => expect(screen.getByText('Midterm')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Midterm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteTestMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(deleteTestMock).toHaveBeenCalledWith('test-1'))
    await waitFor(() => expect(screen.getByText('Test deleted.')).toBeTruthy())
  })
})
