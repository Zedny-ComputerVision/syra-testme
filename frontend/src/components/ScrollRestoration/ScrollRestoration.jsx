import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function ScrollRestoration() {
  const location = useLocation()
  const previousPathRef = useRef(location.pathname)

  useEffect(() => {
    if (location.hash) {
      previousPathRef.current = location.pathname
      const id = window.requestAnimationFrame(() => {
        const targetId = decodeURIComponent(location.hash.slice(1))
        const target = document.getElementById(targetId)
        if (target) {
          target.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start',
          })
        }
      })
      return () => window.cancelAnimationFrame(id)
    }

    if (previousPathRef.current !== location.pathname) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
      previousPathRef.current = location.pathname
    }

    return undefined
  }, [location.hash, location.pathname])

  return null
}
