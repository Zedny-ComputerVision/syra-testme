import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminRolesPermissions from './AdminRolesPermissions'

const getSettingMock = vi.fn()
const updateSettingMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    getSetting: (...args) => getSettingMock(...args),
    updateSetting: (...args) => updateSettingMock(...args),
  },
}))

describe('AdminRolesPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettingMock.mockResolvedValue({
      data: {
        value: JSON.stringify([
          { feature: 'Manage Users', admin: true, instructor: false, learner: false },
          { feature: 'Assign Schedules', admin: true, instructor: false, learner: false },
        ]),
      },
    })
    updateSettingMock.mockResolvedValue({ data: {} })
  })

  it('tracks dirty state and saves canonicalized permission rows', async () => {
    render(<AdminRolesPermissions />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true))

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    expect(screen.getByText('You have unsaved permission changes.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateSettingMock).toHaveBeenCalledTimes(1))
    expect(updateSettingMock.mock.calls[0][0]).toBe('permissions_config')
    expect(updateSettingMock.mock.calls[0][1]).toContain('"Manage Users"')
    expect(updateSettingMock.mock.calls[0][1]).toContain('"instructor":true')
  })

  it('lets admins reload settings after a bootstrap failure', async () => {
    getSettingMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { value: null } })

    render(<AdminRolesPermissions />)

    await waitFor(() => expect(screen.getByText('Failed to load permission settings. Showing defaults.')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(getSettingMock).toHaveBeenCalledTimes(2))
  })
})
