import api from './api'

export const proctoringPing = (attemptId, payload) =>
  api.post(`proctoring/${attemptId}/ping`, payload)

export const uploadProctoringVideo = (attemptId, session_id, source, filename, blob, metadata = {}, options = {}) =>
  api.post(`proctoring/${attemptId}/video/upload`, blob, {
    params: {
      session_id,
      source,
      filename,
      recording_started_at: metadata.recording_started_at,
      recording_stopped_at: metadata.recording_stopped_at,
    },
    headers: { 'Content-Type': blob?.type || 'application/octet-stream' },
    timeout: 600000, // 10 min — backend streams to Cloudflare which can be slow for large recordings on slow networks
    onUploadProgress: options.onUploadProgress,
  })

export const reportProctoringVideoUploadProgress = (attemptId, payload) =>
  api.post(`proctoring/${attemptId}/video/upload-progress`, payload)

export const getProctoringVideoJobStatus = (attemptId, jobId) =>
  api.get(`proctoring/${attemptId}/jobs/${jobId}/status`)

export const listProctoringVideos = (attemptId) =>
  api.get(`proctoring/${attemptId}/videos`)
