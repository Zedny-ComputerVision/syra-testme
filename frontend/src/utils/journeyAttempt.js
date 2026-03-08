import { getAttempt, resolveAttempt as resolveAttemptRequest } from '../services/attempt.service'
import { clearAttemptId, getAttemptId, setAttemptId } from './attemptSession'

function isReusableAttempt(attempt, examId) {
  return (
    String(attempt?.exam_id) === String(examId) &&
    String(attempt?.status || '') === 'IN_PROGRESS'
  )
}

export async function resolveAttempt(examId) {
  const cachedAttemptId = getAttemptId()
  if (cachedAttemptId) {
    try {
      const { data } = await getAttempt(cachedAttemptId)
      if (isReusableAttempt(data, examId)) {
        setAttemptId(data.id)
        return data.id
      }
    } catch {
      // ignore and create/find another attempt below
    }
    clearAttemptId()
  }
  const { data } = await resolveAttemptRequest(examId)
  setAttemptId(data.id)
  return data.id
}
