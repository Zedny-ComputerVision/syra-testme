import api from './api'

export const proctoringPing = (attemptId, payload) =>
  api.post(`proctoring/${attemptId}/ping`, payload)

export const uploadProctoringVideo = (attemptId, session_id, source, filename, blob, metadata = {}, options = {}) => {
  // Scale timeout with file size: 10 min base + 1 min per 50 MB, capped at 2 hours
  const sizeMB = (blob?.size || 0) / (1024 * 1024)
  const timeout = Math.min(7200000, 600000 + Math.ceil(sizeMB / 50) * 60000)
  return api.post(`proctoring/${attemptId}/video/upload`, blob, {
    params: {
      session_id,
      source,
      filename,
      recording_started_at: metadata.recording_started_at,
      recording_stopped_at: metadata.recording_stopped_at,
    },
    headers: { 'Content-Type': blob?.type || 'application/octet-stream' },
    timeout,
    onUploadProgress: options.onUploadProgress,
  })
}

export const reportProctoringVideoUploadProgress = (attemptId, payload) =>
  api.post(`proctoring/${attemptId}/video/upload-progress`, payload)

export const getProctoringVideoJobStatus = (attemptId, jobId) =>
  api.get(`proctoring/${attemptId}/jobs/${jobId}/status`)

export const listProctoringVideos = (attemptId) =>
  api.get(`proctoring/${attemptId}/videos`)
