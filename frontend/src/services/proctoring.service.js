import api from './api'

export const proctoringPing = (attemptId, payload) =>
  api.post(`proctoring/${attemptId}/ping`, payload)

export const uploadProctoringVideo = (attemptId, session_id, source, filename, blob) =>
  api.post(`proctoring/${attemptId}/video/upload`, blob, {
    params: { session_id, source, filename },
    headers: { 'Content-Type': blob?.type || 'application/octet-stream' },
  })

export const listProctoringVideos = (attemptId) =>
  api.get(`proctoring/${attemptId}/videos`)
