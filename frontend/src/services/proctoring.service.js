import api from './api'

export const proctoringPing = (attemptId, payload) =>
  api.post(`proctoring/${attemptId}/ping`, payload)

export const startProctoringVideo = (attemptId, mime_type) =>
  api.post(`proctoring/${attemptId}/video/start`, { mime_type })

export const uploadProctoringVideoChunk = (attemptId, session_id, chunk_index, blob) => {
  const formData = new FormData()
  formData.append('session_id', session_id)
  formData.append('chunk_index', String(chunk_index))
  formData.append('chunk', blob, `chunk-${chunk_index}.webm`)
  return api.post(`proctoring/${attemptId}/video/chunk`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const finalizeProctoringVideo = (attemptId, session_id, extension = 'webm') =>
  api.post(`proctoring/${attemptId}/video/finalize`, { session_id, extension })

export const listProctoringVideos = (attemptId) =>
  api.get(`proctoring/${attemptId}/videos`)
