import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminCertificates from './AdminCertificates'

const allTestsMock = vi.fn()
const updateTestMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    allTests: (...args) => allTestsMock(...args),
    updateTest: (...args) => updateTestMock(...args),
  },
}))

describe('AdminCertificates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allTestsMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 'test-1',
            title: 'Secure Browser Test',
            status: 'DRAFT',
            code: 'SB-101',
            certificate: {
              title: 'Certificate of Completion',
              subtitle: '',
              issuer: 'SYRA',
              signer: '',
            },
          },
        ],
      },
    })
    updateTestMock.mockResolvedValue({ data: {} })
  })

  it('sends a null certificate when the draft is cleared completely', async () => {
    render(<AdminCertificates />)

    await waitFor(() => expect(screen.getByDisplayValue('Certificate of Completion')).toBeTruthy())

    fireEvent.change(screen.getByDisplayValue('Certificate of Completion'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('SYRA'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateTestMock).toHaveBeenCalledWith('test-1', { certificate: null }))
  })
})
