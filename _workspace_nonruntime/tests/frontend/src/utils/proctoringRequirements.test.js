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

    expect(requirements.cameraRequired).toBe(true)
    expect(requirements.screenRequired).toBe(true)
    expect(requirements.systemCheckRequired).toBe(true)
    expect(normalized.camera_required).toBe(true)
    expect(normalized.screen_required).toBe(true)
  })

  it('infers camera, mic, lighting, and identity requirements from detection aliases', () => {
    const requirements = getJourneyRequirements({
      face_detection: true,
      audio_detection: 'yes',
      require_lighting_check: '0',
    })

    expect(requirements.identityRequired).toBe(true)
    expect(requirements.cameraRequired).toBe(true)
    expect(requirements.micRequired).toBe(true)
    expect(requirements.lightingRequired).toBe(false)
    expect(requirements.screenRequired).toBe(true)
    expect(requirements.systemCheckRequired).toBe(true)
  })

  it('preserves explicit lighting false across mixed input formats', () => {
    const requirements = getJourneyRequirements({
      face_detection: 'true',
      audio_detection: true,
      require_lighting_check: 'off',
      lighting_required: 0,
      camera_required: '1',
      mic_required: 1,
    })

    expect(requirements.identityRequired).toBe(true)
    expect(requirements.cameraRequired).toBe(true)
    expect(requirements.micRequired).toBe(true)
    expect(requirements.lightingRequired).toBe(false)
    expect(requirements.systemCheckRequired).toBe(true)
  })

  it('normalizes strict false values and explicit legacy fullscreen alias', () => {
    const requirements = getJourneyRequirements({
      camera_required: '0',
      mic_required: 'false',
      require_fullscreen: 'off',
      lighting_required: 0,
      face_verify_enabled: false,
      screen_capture: 'off',
    })

    expect(requirements.cameraRequired).toBe(false)
    expect(requirements.micRequired).toBe(false)
    expect(requirements.fullscreenRequired).toBe(false)
    expect(requirements.lightingRequired).toBe(false)
    expect(requirements.identityRequired).toBe(false)
    expect(requirements.screenRequired).toBe(false)
    expect(requirements.systemCheckRequired).toBe(false)
  })

  it('normalizes alert rules and falls back to safe defaults for malformed entries', () => {
    const normalized = normalizeProctoringConfig({
      face_detection: true,
      alert_rules: [
        { event_type: 'tab_switch_detect', threshold: 2, action: 'FLAG_REVIEW', severity: 'high', message: '  Switch windows ' },
        { eventType: 'face_absence', count: '3', action: 'INVALID', severity: 'BAD', message: 77 },
        { event_type: 'SCREEN_SHARE_DENIED', threshold: '4', message: 'Missing share' },
        'not-a-rule',
        null,
      ],
      fullscreen_required: true,
      fullscreen_enforce: false,
    })

    expect(normalized.alert_rules).toEqual([
      {
        id: 'tab_switch_detect-2-flag_review-1',
        event_type: 'TAB_SWITCH_DETECT',
        threshold: 2,
        severity: 'HIGH',
        action: 'FLAG_REVIEW',
        message: 'Switch windows',
      },
      {
        id: 'face_absence-3-warn-2',
        event_type: 'FACE_ABSENCE',
        threshold: 3,
        severity: 'MEDIUM',
        action: 'WARN',
        message: '',
      },
      {
        id: 'screen_share_denied-4-warn-3',
        event_type: 'SCREEN_SHARE_DENIED',
        threshold: 4,
        severity: 'MEDIUM',
        action: 'WARN',
        message: 'Missing share',
      },
    ])

    expect(normalized.fullscreen_enforce).toBe(false)
    expect(normalized.fullscreen_required).toBe(false)
    expect(normalized.screen_capture).toBe(true)
  })

  it('maps legacy fullscreen settings and screen capture through normalization', () => {
    const requirements = getJourneyRequirements({
      require_fullscreen: true,
      screen_required: true,
    })
    const normalized = normalizeProctoringConfig({
      require_fullscreen: true,
      screen_required: true,
    })

    expect(requirements.fullscreenRequired).toBe(true)
    expect(requirements.screenRequired).toBe(true)
    expect(normalized.fullscreen_enforce).toBe(true)
    expect(normalized.fullscreen_required).toBe(true)
    expect(normalized.screen_capture).toBe(true)
    expect(normalized.screen_required).toBe(true)
  })
})
