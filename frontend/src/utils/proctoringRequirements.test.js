import { describe, expect, it } from 'vitest'

import { getJourneyRequirements, normalizeProctoringConfig } from './proctoringRequirements'

describe('proctoringRequirements', () => {
  it('prefers fullscreen_enforce when legacy fullscreen_required conflicts', () => {
    const requirements = getJourneyRequirements({
      fullscreen_required: true,
      fullscreen_enforce: false,
    })

    expect(requirements.fullscreenRequired).toBe(false)
  })

  it('normalizes conflicting fullscreen aliases to the editable fullscreen_enforce value', () => {
    const normalized = normalizeProctoringConfig({
      fullscreen_required: true,
      fullscreen_enforce: false,
    })

    expect(normalized.fullscreen_enforce).toBe(false)
    expect(normalized.fullscreen_required).toBe(false)
  })

  it('treats screen capture as a required system-check gate', () => {
    const requirements = getJourneyRequirements({
      screen_capture: true,
    })
    const normalized = normalizeProctoringConfig({
      screen_capture: true,
    })

    expect(requirements.screenRequired).toBe(true)
    expect(requirements.systemCheckRequired).toBe(true)
    expect(normalized.screen_required).toBe(true)
  })
})
