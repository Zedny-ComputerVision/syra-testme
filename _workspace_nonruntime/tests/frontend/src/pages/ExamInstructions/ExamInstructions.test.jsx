import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExamInstructions from './ExamInstructions'

const getTestMock = vi.fn()

vi.mock('../../services/test.service', () => ({
  getTest: (...args) => getTestMock(...args),
}))

describe('ExamInstructions page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders canonical fields', async () => {
    getTestMock.mockResolvedValueOnce({
      data: {
        id: '1',
        title: 'Physics',
        exam_type: 'MCQ',
        time_limit_minutes: 25,
        max_attempts: 1,
        proctoring_config: {},
      },
    })

    render(
      <MemoryRouter initialEntries={['/tests/1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tests/:testId" element={<ExamInstructions />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Physics')).toBeTruthy())
    expect(screen.getByText('MCQ')).toBeTruthy()
    expect(screen.getByText('25 min')).toBeTruthy()
  })

  it('renders legacy fields through adapter fallback', async () => {
    getTestMock.mockResolvedValueOnce({
      data: {
        id: '2',
        title: 'Writing',
        type: 'TEXT',
        time_limit: 40,
        max_attempts: 3,
        proctoring_config: {},
      },
    })

    render(
      <MemoryRouter initialEntries={['/tests/2']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tests/:testId" element={<ExamInstructions />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Writing')).toBeTruthy())
    expect(screen.getByText('TEXT')).toBeTruthy()
    expect(screen.getByText('40 min')).toBeTruthy()
  })

  it('uses runtime settings for learner instructions when settings are absent', async () => {
    getTestMock.mockResolvedValueOnce({
      data: {
        id: '4',
        title: 'Managed Physics',
        exam_type: 'MCQ',
        time_limit_minutes: 30,
        max_attempts: 2,
        runtime_settings: {
          instructions_heading: 'Read carefully before you begin',
          instructions_body: 'Managed instructions should appear for learners.',
        },
        proctoring_config: {},
      },
    })

    render(
      <MemoryRouter initialEntries={['/tests/4']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tests/:testId" element={<ExamInstructions />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Managed Physics')).toBeTruthy())
    expect(screen.getByText('Read carefully before you begin')).toBeTruthy()
    expect(screen.getByText('Managed instructions should appear for learners.')).toBeTruthy()
  })

  it('shows a retry path when loading the test fails', async () => {
    getTestMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        data: {
          id: '3',
          title: 'Chemistry',
          exam_type: 'MCQ',
          time_limit_minutes: 20,
          max_attempts: 1,
          proctoring_config: {},
        },
      })

    render(
      <MemoryRouter initialEntries={['/tests/3']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/tests/:testId" element={<ExamInstructions />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Could not prepare this test')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Chemistry')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Continue to rules' })).toBeTruthy()
  })
})
