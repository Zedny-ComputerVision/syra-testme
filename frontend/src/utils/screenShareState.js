/**
 * Module-level store for a screen-share MediaStream that survives
 * client-side SPA navigation (React Router). SystemCheckPage stores the
 * stream here after the user grants access; Proctoring picks it up.
 */
let _stream = null

export function storeScreenStream(stream) {
  if (_stream && _stream !== stream && typeof _stream.getTracks === 'function') {
    _stream.getTracks().forEach((track) => track.stop())
  }
  _stream = stream || null
}

export function peekScreenStream() {
  return _stream
}

export function consumeScreenStream() {
  const s = _stream
  _stream = null
  return s
}

export function clearScreenStream() {
  if (_stream && typeof _stream.getTracks === 'function') {
    _stream.getTracks().forEach((track) => track.stop())
  }
  _stream = null
}
