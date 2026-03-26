const SHARED_ROUTE_PATTERNS = [
  /^\/$/i,
  /^\/change-password\/?$/i,
  /^\/profile\/?$/i,
  /^\/schedule\/?$/i,
  /^\/attempts(?:\/[^/]+)?\/?$/i,
  /^\/attempt-result(?:\/[^/]+)?\/?$/i,
  /^\/training\/?$/i,
  /^\/surveys\/?$/i,
]

const INSTRUCTOR_ROUTE_PATTERNS = [
  /^\/admin\/categories(?:\/|$)/i,
  /^\/admin\/grading-scales(?:\/|$)/i,
  /^\/admin\/question-pools(?:\/|$)/i,
  /^\/admin\/sessions(?:\/|$)/i,
  /^\/admin\/candidates(?:\/|$)/i,
  /^\/admin\/attempt-analysis(?:\/|$)/i,
  /^\/admin\/attempts\/[^/]+\/videos\/?$/i,
  /^\/admin\/videos(?:\/[^/]+)?\/?$/i,
  /^\/admin\/users(?:\/|$)/i,
  /^\/admin\/templates(?:\/|$)/i,
  /^\/admin\/courses(?:\/|$)/i,
  /^\/admin\/surveys\/?$/i,
]

const LEARNER_ROUTE_PATTERNS = [
  /^\/tests(?:\/|$)/i,
  /^\/exams(?:\/|$)/i,
  /^\/system-check(?:\/|$)/i,
  /^\/verify-identity(?:\/|$)/i,
  /^\/rules(?:\/|$)/i,
  /^\/exam(?:\/|$)/i,
]

const BLOCKED_ROUTE_PATTERNS = [
  /^\/login(?:\/|$)/i,
  /^\/signup(?:\/|$)/i,
  /^\/forgot-password(?:\/|$)/i,
  /^\/reset-password(?:\/|$)/i,
  /^\/access-denied\/?$/i,
]

const DEFAULT_PATHS = {
  ADMIN: '/admin/dashboard',
  INSTRUCTOR: '/',
  LEARNER: '/',
}

function normalizeRequestedPath(requestedPath) {
  if (typeof requestedPath !== 'string' || !requestedPath.startsWith('/')) {
    return ''
  }

  try {
    const pathname = new URL(requestedPath, 'http://localhost').pathname.replace(/\/+$/, '')
    return pathname || '/'
  } catch {
    return ''
  }
}

export function canReusePostLoginPath(role, requestedPath) {
  const pathname = normalizeRequestedPath(requestedPath)
  if (!pathname) return false
  if (BLOCKED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return false
  }
  if (SHARED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return true
  }

  switch (role) {
    case 'ADMIN':
      return false
    case 'INSTRUCTOR':
      return INSTRUCTOR_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
    case 'LEARNER':
      return LEARNER_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
    default:
      return pathname === '/'
  }
}

export function resolvePostLoginPath(role, requestedPath) {
  if (role === 'ADMIN') {
    return DEFAULT_PATHS.ADMIN
  }

  if (canReusePostLoginPath(role, requestedPath)) {
    return requestedPath
  }

  return DEFAULT_PATHS[role] || '/'
}
