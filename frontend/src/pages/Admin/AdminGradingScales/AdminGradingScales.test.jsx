import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminGradingScales from './AdminGradingScales'

const gradingScalesMock = vi.fn()
const createGradingScaleMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    gradingScales: (...args) => gradingScalesMock(...args),
    createGradingScale: (...args) => createGradingScaleMock(...args),
    updateGradingScale: vi.fn(),
    deleteGradingScale: vi.fn(),
  },
}))

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    user: { id: 'admin-1', role: 'ADMIN' },
  }),
}))

describe('AdminGradingScales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gradingScalesMock.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('blocks saving when a band minimum score exceeds its maximum', async () => {
    render(<AdminGradingScales />)

    await waitFor(() => expect(screen.getByText('No grading scales yet.')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '+ New Scale' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Standard Letter Grade'), { target: { value: 'Standard Letter' } })
    fireEvent.change(screen.getAllByPlaceholderText('Min')[0], { target: { value: '95' } })
    fireEvent.change(screen.getAllByPlaceholderText('Max')[0], { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Band minimum scores cannot exceed the maximum.')).toBeTruthy())
    expect(createGradingScaleMock).not.toHaveBeenCalled()
  })

  it('blocks saving when grade bands overlap', async () => {
    render(<AdminGradingScales />)

    await waitFor(() => expect(screen.getByText('No grading scales yet.')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '+ New Scale' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Standard Letter Grade'), { target: { value: 'Standard Letter' } })
    fireEvent.change(screen.getAllByPlaceholderText('Max')[1], { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Grade bands cannot overlap.')).toBeTruthy())
    expect(createGradingScaleMock).not.toHaveBeenCalled()
  })

  it('shows a filter-specific empty state and restores the list when filters are cleared', async () => {
    gradingScalesMock.mockResolvedValueOnce({
      data: [
        {
          id: 'scale-1',
          name: 'Standard Letter',
          bands: [
            { label: 'A', min_score: 90, max_score: 100 },
          ],
        },
      ],
    })

    render(<AdminGradingScales />)

    await waitFor(() => expect(screen.getByText('Standard Letter')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('Search scales...'), {
      target: { value: 'custom' },
    })

    await waitFor(() => expect(screen.getByText('No grading scales match the current filters.')).toBeTruthy())
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1))

    await waitFor(() => expect(screen.getByText('Standard Letter')).toBeTruthy())
  })
})
