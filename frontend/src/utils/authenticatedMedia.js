import api from '../services/api'

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function normalizeAbsoluteApiPath(value) {
  try {
    const target = new URL(String(value || '').trim())
    const configuredBase = new URL(api.defaults.baseURL, window.location.origin)
    const basePath = configuredBase.pathname.endsWith('/')
      ? configuredBase.pathname
      : `${configuredBase.pathname}/`

    if (target.origin === configuredBase.origin && target.pathname.startsWith(basePath)) {
      return `${target.pathname.slice(basePath.length)}${target.search}`
    }
  } catch {
    return value
  }

  return value
}

export function normalizeMediaRequestPath(path, _depth = 0) {
  const raw = String(path || '').trim()
  if (!raw) return ''
  if (_depth > 3) return raw
  if (isAbsoluteUrl(raw)) {
    const normalizedAbsolute = normalizeAbsoluteApiPath(raw)
    if (normalizedAbsolute !== raw) {
      return normalizeMediaRequestPath(normalizedAbsolute, _depth + 1)
    }
    return raw
  }

  let normalized = raw.startsWith('/') ? raw.slice(1) : raw
  if (normalized.startsWith('api/')) {
    normalized = normalized.slice(4)
  }
  if (normalized.startsWith('videos/')) {
    return `media/${normalized}`
  }
  if (normalized.startsWith('evidence/')) {
    return `media/${normalized}`
  }
  if (normalized.startsWith('reports/')) {
    return `media/${normalized}`
  }
  return normalized
}

export async function fetchAuthenticatedMediaObjectUrl(path) {
  const requestPath = normalizeMediaRequestPath(path)
  if (!requestPath) return ''

  if (isAbsoluteUrl(requestPath)) {
    return requestPath
  }

  const { data } = await api.get(requestPath, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

export function revokeObjectUrl(url) {
  if (String(url || '').startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
