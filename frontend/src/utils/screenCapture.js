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
    stopCapturedStream(stream)
    const error = new Error('Entire screen required')
    error.code = ENTIRE_SCREEN_REQUIRED
    throw error
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
