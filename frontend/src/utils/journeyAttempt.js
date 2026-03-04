import { createAttempt } from '../services/attempt.service'
import { setAttemptId } from './attemptSession'

export async function resolveAttempt(examId) {
  const { data } = await createAttempt(examId)
  setAttemptId(data.id)
  return data.id
}
