import React, { forwardRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { preloadRoute } from '../../../utils/routePrefetch'

const PrefetchLink = forwardRef(function PrefetchLink(
  { to, onMouseEnter, onFocus, ...props },
  ref,
) {
  const handlePrefetch = useCallback(() => {
    preloadRoute(to)
  }, [to])

  const handleMouseEnter = useCallback((event) => {
    handlePrefetch()
    onMouseEnter?.(event)
  }, [handlePrefetch, onMouseEnter])

  const handleFocus = useCallback((event) => {
    handlePrefetch()
    onFocus?.(event)
  }, [handlePrefetch, onFocus])

  return (
    <Link
      ref={ref}
      to={to}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...props}
    />
  )
})

export default PrefetchLink
