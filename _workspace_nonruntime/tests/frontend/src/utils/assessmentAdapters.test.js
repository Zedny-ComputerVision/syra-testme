import { describe, expect, it } from 'vitest'

import {
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

    expect(canonical.exam_type).toBe('MCQ')
    expect(canonical.time_limit_minutes).toBe(30)
    expect(legacy.exam_type).toBe('TEXT')
    expect(legacy.time_limit_minutes).toBe(45)
    expect(named.title).toBe('Physics')
    expect(named.exam_type).toBe('MCQ')
    expect(named.time_limit_minutes).toBe(50)
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
})
