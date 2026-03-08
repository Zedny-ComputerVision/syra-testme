import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MySurveys from './MySurveys'

const listSurveysMock = vi.fn()
const submitResponseMock = vi.fn()

vi.mock('../../services/survey.service', () => ({
  listSurveys: (...args) => listSurveysMock(...args),
  submitResponse: (...args) => submitResponseMock(...args),
}))

describe('MySurveys page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('retries survey loading after a bootstrap failure', async () => {
    listSurveysMock
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        data: [
          {
            id: 'survey-1',
            title: 'Course Feedback',
            questions: [{ text: 'How was it?', question_type: 'TEXT' }],
          },
        ],
      })

    render(<MySurveys />)

    await waitFor(() => expect(screen.getByText('Failed to load surveys.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Course Feedback')).toBeTruthy())
  })

  it('tracks completion per survey without disabling untouched survey cards', async () => {
    listSurveysMock.mockResolvedValue({
      data: [
        {
          id: 'survey-1',
          title: 'Course Feedback',
          questions: [{ text: 'How was it?', question_type: 'TEXT' }],
        },
        {
          id: 'survey-2',
          title: 'Platform Feedback',
          questions: [{ text: 'Would you recommend it?', question_type: 'BOOLEAN' }],
        },
      ],
    })
    submitResponseMock.mockResolvedValue({ data: {} })

    render(<MySurveys />)

    await waitFor(() => expect(screen.getByText('Course Feedback')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('Your answer'), { target: { value: 'Great' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Response' })[0])

    await waitFor(() => expect(screen.getByText('1/2 completed')).toBeTruthy())
    expect(screen.getByText('Response submitted')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Submit Response' })[0].disabled).toBe(false)
  })
})
