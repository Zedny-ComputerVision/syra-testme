import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    cleanup()
  })

  it('renders read-only shared courses without unsupported mutation actions', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminCourses />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Shared Course')).toBeTruthy())
    expect(screen.getByLabelText('Title')).toBeTruthy()
    expect(screen.getByLabelText('Description')).toBeTruthy()
    expect(screen.getByLabelText('Status')).toBeTruthy()
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
    expect(screen.getByText('Shared Course Course modules could not be loaded until you retry.')).toBeTruthy()
  })

  it('keeps courses visible when linked tests fail to load', async () => {
    examsMock.mockRejectedValueOnce(new Error('tests unavailable'))

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminCourses />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Shared Course')).toBeTruthy())
    expect(screen.getByText('Linked tests could not be loaded. Courses and modules remain available, but linked test counts may be incomplete until you retry.')).toBeTruthy()
  })
})
