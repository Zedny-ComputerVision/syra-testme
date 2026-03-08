import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import AdminCourses from './AdminCourses'

const coursesMock = vi.fn()
const examsMock = vi.fn()
const nodesMock = vi.fn()

vi.mock('../../../services/admin.service', () => ({
  adminApi: {
    courses: (...args) => coursesMock(...args),
    exams: (...args) => examsMock(...args),
    allTests: (...args) => examsMock(...args),
    nodes: (...args) => nodesMock(...args),
  },
}))

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    user: { id: 'instructor-1', role: 'INSTRUCTOR' },
  }),
}))

describe('AdminCourses instructor permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coursesMock.mockResolvedValue({
      data: [
        {
          id: 'course-1',
          title: 'Shared Course',
          description: 'Owned by another instructor',
          status: 'DRAFT',
          created_by_id: 'owner-2',
        },
      ],
    })
    examsMock.mockResolvedValue({ data: [] })
    nodesMock.mockResolvedValue({ data: [] })
  })

  it('renders read-only shared courses without unsupported mutation actions', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminCourses />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Shared Course')).toBeTruthy())
    expect(screen.getByText('Read-only course. Only the course owner or an admin can edit modules and publishing settings.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull()
  })

  it('keeps courses visible when a module lookup fails for one course', async () => {
    nodesMock.mockRejectedValueOnce(new Error('node fetch failed'))

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminCourses />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Shared Course')).toBeTruthy())
    expect(screen.getByText('Some module lists could not be loaded: Shared Course.')).toBeTruthy()
  })
})
