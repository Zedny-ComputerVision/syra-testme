import { normalizeProctoringConfig } from './proctoringRequirements'

const COMPLETED_STATUSES = new Set(['SUBMITTED', 'GRADED'])

export function normalizeTest(test) {
  if (!test) return test
  const title = test.test_title ?? test.title ?? test.test_name ?? test.name ?? ''
  const type = test.test_type ?? test.exam_type ?? test.type ?? null
  const timeLimit = test.time_limit_minutes ?? test.test_time_limit ?? test.exam_time_limit ?? test.time_limit ?? null
  const settings = test.runtime_settings ?? test.settings ?? {}
  return {
    ...test,
    title,
    name: test.name ?? title,
    test_title: test.test_title ?? title,
    exam_title: test.exam_title ?? title,
    exam_type: type,
    test_type: type,
    time_limit_minutes: timeLimit,
    test_time_limit: timeLimit,
    settings,
    runtime_settings: test.runtime_settings ?? settings,
    proctoring_config: normalizeProctoringConfig(test.proctoring_config),
  }
}

export function normalizeExam(exam) {
  return normalizeTest(exam)
}

export function normalizeAdminTest(test) {
  if (!test) return test
  return {
    ...test,
    title: test.title ?? test.name ?? '',
    name: test.name ?? test.title ?? '',
    exam_type: test.exam_type ?? test.type ?? null,
    type: test.type ?? test.exam_type ?? null,
    time_limit_minutes: test.time_limit_minutes ?? test.time_limit ?? null,
    max_attempts: test.max_attempts ?? test.attempts_allowed ?? 1,
    question_count: test.question_count ?? 0,
    proctoring_config: normalizeProctoringConfig(test.proctoring_config),
  }
}

export function normalizeQuestion(question) {
  if (!question) return question
  return {
    ...question,
    question_type: question.question_type ?? question.type ?? 'TEXT',
  }
}

export function isAttemptCompletedStatus(status) {
  return COMPLETED_STATUSES.has(status)
}

export function normalizeAttempt(attempt) {
  if (!attempt) return attempt
  return {
    ...attempt,
    test_title: attempt.test_title ?? attempt.exam_title ?? null,
    test_type: attempt.test_type ?? attempt.exam_type ?? null,
    test_time_limit: attempt.test_time_limit ?? attempt.exam_time_limit ?? null,
    exam_title: attempt.exam_title ?? attempt.test_title ?? null,
    is_completed: isAttemptCompletedStatus(attempt.status),
  }
}

export function normalizeSchedule(schedule) {
  if (!schedule) return schedule
  const title = schedule.test_title ?? schedule.test_name ?? schedule.exam_title ?? null
  const type = schedule.test_type ?? schedule.exam_type ?? null
  const timeLimit = schedule.test_time_limit ?? schedule.exam_time_limit ?? null
  return {
    ...schedule,
    test_title: title,
    test_name: schedule.test_name ?? title,
    exam_title: schedule.exam_title ?? title,
    test_type: type,
    test_time_limit: timeLimit,
  }
}
