import { describe, expect, it } from 'vitest'

import {
  normalizeAdminTest,
  isAttemptCompletedStatus,
  normalizeAttempt,
  normalizeExam,
  normalizeQuestion,
  normalizeSchedule,
  normalizeTest,
} from './assessmentAdapters'

describe('assessment adapters', () => {
  it('normalizes exam type and time limit with fallback', () => {
    const canonical = normalizeExam({ exam_type: 'MCQ', time_limit_minutes: 30 })
    const legacy = normalizeExam({ type: 'TEXT', time_limit: 45 })
    const named = normalizeTest({ test_title: 'Physics', test_type: 'MCQ', test_time_limit: 50 })
    const runtimeBacked = normalizeTest({
      title: 'Runtime-backed test',
      exam_type: 'MCQ',
      runtime_settings: { instructions_heading: 'Read me first' },
    })

    expect(canonical.exam_type).toBe('MCQ')
    expect(canonical.time_limit_minutes).toBe(30)
    expect(legacy.exam_type).toBe('TEXT')
    expect(legacy.time_limit_minutes).toBe(45)
    expect(named.title).toBe('Physics')
    expect(named.exam_type).toBe('MCQ')
    expect(named.time_limit_minutes).toBe(50)
    expect(runtimeBacked.settings.instructions_heading).toBe('Read me first')
    expect(runtimeBacked.runtime_settings.instructions_heading).toBe('Read me first')
  })

  it('normalizes question type with fallback', () => {
    expect(normalizeQuestion({ question_type: 'MCQ' }).question_type).toBe('MCQ')
    expect(normalizeQuestion({ type: 'TRUEFALSE' }).question_type).toBe('TRUEFALSE')
    expect(normalizeQuestion({}).question_type).toBe('TEXT')
  })

  it('marks only submitted/graded attempts as completed', () => {
    expect(isAttemptCompletedStatus('SUBMITTED')).toBe(true)
    expect(isAttemptCompletedStatus('GRADED')).toBe(true)
    expect(isAttemptCompletedStatus('IN_PROGRESS')).toBe(false)
    const normalizedAttempt = normalizeAttempt({ status: 'SUBMITTED', exam_title: 'Legacy Title' })
    const normalizedSchedule = normalizeSchedule({ exam_title: 'Legacy Title', exam_type: 'TEXT', exam_time_limit: 40 })
    expect(normalizedAttempt.is_completed).toBe(true)
    expect(normalizedAttempt.test_title).toBe('Legacy Title')
    expect(normalizedSchedule.test_title).toBe('Legacy Title')
    expect(normalizedSchedule.test_type).toBe('TEXT')
  })

  it('normalizes attempts and schedules across legacy/modern title and time-limit keys', () => {
    const canonical = normalizeAttempt({
      test_title: 'Canonical',
      test_type: 'TEXT',
      test_time_limit: 20,
      status: 'GRADED',
    })
    const legacy = normalizeSchedule({
      test_name: 'Legacy',
      exam_type: 'MCQ',
      exam_time_limit: 45,
    })

    expect(canonical.test_title).toBe('Canonical')
    expect(canonical.exam_title).toBe('Canonical')
    expect(canonical.test_type).toBe('TEXT')
    expect(canonical.test_time_limit).toBe(20)
    expect(canonical.is_completed).toBe(true)
    expect(legacy.test_name).toBe('Legacy')
    expect(legacy.test_title).toBe('Legacy')
    expect(legacy.test_type).toBe('MCQ')
    expect(legacy.test_time_limit).toBe(45)
  })

  it('defaults unknown admin fields and normalizes admin test proctoring config aliases', () => {
    const normalized = normalizeAdminTest({
      name: 'Admin Test',
      proctoring_config: {
        camera_required: '0',
        mic_required: 'yes',
      },
    })

    expect(normalized.max_attempts).toBe(1)
    expect(normalized.question_count).toBe(0)
    expect(normalized.time_limit_minutes).toBeNull()
    expect(normalized.exam_type).toBeNull()
    expect(normalized.proctoring_config.camera_required).toBe(false)
    expect(normalized.proctoring_config.mic_required).toBe(true)
    expect(normalized.type).toBeNull()
  })

  it('enforces completed status strictness', () => {
    expect(isAttemptCompletedStatus('submitted')).toBe(false)
    expect(normalizeAttempt({ status: 'submitted' }).is_completed).toBe(false)
  })

  it('propagates runtime settings and normalized question type fallback', () => {
    const normalizedTest = normalizeTest({
      title: 'Runtime',
      runtime_settings: { randomize_questions: true, time_limit: 90 },
    })
    const normalizedQuestion = normalizeQuestion({ type: 'TRUEFALSE' })
    const migrated = normalizeQuestion({})

    expect(normalizedTest.runtime_settings).toEqual({ randomize_questions: true, time_limit: 90 })
    expect(normalizedTest.settings).toEqual({ randomize_questions: true, time_limit: 90 })
    expect(normalizedTest.exam_type).toBeNull()
    expect(normalizedTest.time_limit_minutes).toBeNull()
    expect(normalizedQuestion.question_type).toBe('TRUEFALSE')
    expect(migrated.question_type).toBe('TEXT')
  })
})
