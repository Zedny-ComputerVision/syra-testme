import api from './api'

export const createAttempt = (exam_id) => api.post('attempts/', { exam_id })
export const listAttempts = () => api.get('attempts/')
export const getAttempt = (id) => api.get(`attempts/${id}`)
export const submitAnswer = (attemptId, question_id, answer) =>
  api.post(`attempts/${attemptId}/answers`, { question_id, answer })
export const submitAttempt = (id, score = null) =>
  api.post(`attempts/${id}/submit`, null, { params: score != null ? { score } : {} })
export const getAttemptAnswers = (attemptId) => api.get(`attempts/${attemptId}/answers`)
export const getAttemptEvents = (attemptId) => api.get(`proctoring/${attemptId}/events`)
export const verifyIdentity = (attemptId, photo_base64) =>
  api.post(`attempts/${attemptId}/verify-identity`, { photo_base64 })
export const precheckAttempt = (attemptId, payload) =>
  api.post(`precheck/${attemptId}`, payload)
