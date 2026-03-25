const CHUNK_RELOAD_MARKER_KEY = 'syra:chunk-reload-at'
const CHUNK_RELOAD_QUERY_KEY = '_v'
const CHUNK_RELOAD_GUARD_MS = 30000

function readReloadMarker() {
  try {
    return Number(window.sessionStorage.getItem(CHUNK_RELOAD_MARKER_KEY) || '0')
  } catch {
    return 0
  }
}

function writeReloadMarker(value) {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_MARKER_KEY, String(value))
  } catch {
    // ignore storage failures
  }
}

function normalizeErrorMessage(errorLike) {
  if (!errorLike) return ''
  if (typeof errorLike === 'string') return errorLike
  if (typeof errorLike?.message === 'string') return errorLike.message
  if (typeof errorLike?.reason?.message === 'string') return errorLike.reason.message
  return String(errorLike)
}

export function isDynamicImportFailure(errorLike) {
  const message = normalizeErrorMessage(errorLike).toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module')
    || message.includes('error loading dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('chunkloaderror')
  )
}

export function recoverFromChunkFailure() {
  if (typeof window === 'undefined') return false

  const now = Date.now()
  if ((now - readReloadMarker()) < CHUNK_RELOAD_GUARD_MS) {
    return false
  }

  writeReloadMarker(now)

  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set(CHUNK_RELOAD_QUERY_KEY, String(now))
  window.location.replace(nextUrl.toString())
  return true
}

export function clearChunkRecoveryQueryParam() {
  if (typeof window === 'undefined') return

  const currentUrl = new URL(window.location.href)
  if (!currentUrl.searchParams.has(CHUNK_RELOAD_QUERY_KEY)) {
    return
  }

  currentUrl.searchParams.delete(CHUNK_RELOAD_QUERY_KEY)
  window.history.replaceState(window.history.state, '', currentUrl.toString())
}
