export function readTestAccessError(error, fallbackMessage) {
  const status = Number(error?.response?.status || 0)
  const detail = error?.response?.data?.detail

  if (status === 403 || status === 404) {
    return 'This test is not assigned to you or is no longer available.'
  }
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }
  return fallbackMessage
}
