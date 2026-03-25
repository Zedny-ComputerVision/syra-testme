import React, { forwardRef, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { preloadRoute } from '../../../utils/routePrefetch'

const HOVER_PREFETCH_DELAY_MS = 150

const PrefetchLink = forwardRef(function PrefetchLink(
  { to, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props },
  ref,
) {
  const hoverTimerRef = useRef(null)

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const handlePrefetch = useCallback(() => {
    preloadRoute(to)
  }, [to])

  const handleMouseEnter = useCallback((event) => {
    clearHoverTimer()
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      handlePrefetch()
    }, HOVER_PREFETCH_DELAY_MS)
    onMouseEnter?.(event)
  }, [clearHoverTimer, handlePrefetch, onMouseEnter])

  const handleMouseLeave = useCallback((event) => {
    clearHoverTimer()
    onMouseLeave?.(event)
  }, [clearHoverTimer, onMouseLeave])

  const handleFocus = useCallback((event) => {
    clearHoverTimer()
    handlePrefetch()
    onFocus?.(event)
  }, [clearHoverTimer, handlePrefetch, onFocus])

  const handleBlur = useCallback((event) => {
    clearHoverTimer()
    onBlur?.(event)
  }, [clearHoverTimer, onBlur])

  useEffect(() => () => {
    clearHoverTimer()
  }, [clearHoverTimer])

  return (
    <Link
      ref={ref}
      to={to}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  )
})

export default PrefetchLink
