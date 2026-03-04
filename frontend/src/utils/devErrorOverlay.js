let overlay

function ensureOverlay() {
  if (overlay) return overlay
  overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.bottom = '12px'
  overlay.style.right = '12px'
  overlay.style.zIndex = '9999'
  overlay.style.maxWidth = '420px'
  overlay.style.padding = '12px'
  overlay.style.background = 'rgba(220,53,69,0.9)'
  overlay.style.color = '#fff'
  overlay.style.fontSize = '13px'
  overlay.style.borderRadius = '8px'
  overlay.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)'
  overlay.style.pointerEvents = 'none'
  document.body.appendChild(overlay)
  return overlay
}

function appendMessage(prefix, message) {
  const box = ensureOverlay()
  const item = document.createElement('div')
  item.style.marginBottom = '6px'
  item.textContent = `${prefix}: ${message}`
  box.appendChild(item)
  setTimeout(() => item.remove(), 8000)
}

export function installDevErrorOverlay() {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => {
    appendMessage('Error', e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    appendMessage('Promise', e.reason?.message || String(e.reason))
  })
  const origFetch = window.fetch
  window.fetch = async (...args) => {
    const res = await origFetch(...args)
    if (!res.ok) appendMessage('Fetch', `${res.status} ${res.url}`)
    return res
  }
}
