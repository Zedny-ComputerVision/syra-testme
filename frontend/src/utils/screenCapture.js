export const ENTIRE_SCREEN_REQUIRED = 'ENTIRE_SCREEN_REQUIRED'

export function stopCapturedStream(stream) {
  if (!stream?.getTracks) return
  stream.getTracks().forEach((track) => track.stop())
}

export function getCapturedDisplaySurface(stream) {
  const track = stream?.getVideoTracks?.()?.[0]
  if (!track) return ''
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {}
  const constraints = typeof track.getConstraints === 'function' ? track.getConstraints() : {}
  const surface = settings?.displaySurface || constraints?.displaySurface || ''
  return typeof surface === 'string' ? surface.toLowerCase() : ''
}

export function ensureEntireScreenSelection(stream) {
  const surface = getCapturedDisplaySurface(stream)
  if (surface && surface !== 'monitor') {
    // Known non-monitor surface (tab, window, browser) - reject
    stopCapturedStream(stream)
    const error = new Error('Entire screen required')
    error.code = ENTIRE_SCREEN_REQUIRED
    throw error
  }
  if (!surface) {
    // displaySurface is empty/undefined (common on Firefox).
    // Use track label heuristic: labels like "screen:0" or "Primary Monitor"
    // indicate full-screen capture, while "window" or specific app names suggest
    // tab/window sharing. Reject if the label suggests non-screen capture.
    const track = stream?.getVideoTracks?.()?.[0]
    const label = (track?.label || '').toLowerCase()
    const looksLikeScreen = /screen|monitor|display|entire/.test(label)
    const looksLikeWindow = /^window:|tab:/.test(label)
    if (looksLikeWindow || (label && !looksLikeScreen)) {
      stopCapturedStream(stream)
      const error = new Error('Entire screen required')
      error.code = ENTIRE_SCREEN_REQUIRED
      throw error
    }
  }
  return stream
}

export async function requestEntireScreenShare() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'monitor',
    },
    audio: true,
  })
  return ensureEntireScreenSelection(stream)
}
