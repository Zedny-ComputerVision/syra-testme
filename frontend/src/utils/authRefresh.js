const TERMINAL_REFRESH_STATUSES = new Set([400, 401, 403])
const TERMINAL_REFRESH_FRAGMENTS = [
  'invalid token',
  'invalid refresh token',
  'missing refresh token',
  'user not found',
  'inactive user',
]

export function markRefreshError(error, { terminal } = {}) {
  if (error && typeof error === 'object') {
    error.isTerminalRefreshError = Boolean(terminal)
  }
  return error
}

export function isTerminalRefreshError(error) {
  if (!error) return false
  if (error.isTerminalRefreshError === true) return true

  const status = Number(error?.response?.status)
  if (TERMINAL_REFRESH_STATUSES.has(status)) {
    return true
  }

  const detail = String(
    error?.response?.data?.detail
    || error?.userMessage
    || error?.message
    || '',
  ).toLowerCase()

  return TERMINAL_REFRESH_FRAGMENTS.some((fragment) => detail.includes(fragment))
}
