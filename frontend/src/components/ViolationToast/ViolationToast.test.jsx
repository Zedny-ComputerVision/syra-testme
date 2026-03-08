import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ViolationToast from './ViolationToast'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}))

describe('ViolationToast', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows detail, confidence, and a dismiss button', () => {
    const onClose = vi.fn()

    render(
      <ViolationToast
        event={{
          severity: 'HIGH',
          event_type: 'PHONE_DETECTED',
          detail: 'Phone detected near desk',
          confidence: 0.92,
        }}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('PHONE DETECTED')).toBeTruthy()
    expect(screen.getByText('Phone detected near desk')).toBeTruthy()
    expect(screen.getByText('Confidence 92%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss violation alert' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
