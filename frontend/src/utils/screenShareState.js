/**
 * Module-level store for a screen-share MediaStream that survives
 * client-side SPA navigation (React Router).  RulesPage stores the
 * stream here after the user grants access; Proctoring picks it up.
 */
let _stream = null

export function storeScreenStream(stream) {
  _stream = stream || null
}

export function consumeScreenStream() {
  const s = _stream
  _stream = null
  return s
}
