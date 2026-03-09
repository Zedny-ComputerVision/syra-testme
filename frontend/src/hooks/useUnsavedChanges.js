import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page?'

export default function useUnsavedChanges(isDirty, message = DEFAULT_MESSAGE) {
  const shouldBlock = useCallback(({ currentLocation, nextLocation }) => {
    if (!isDirty) return false
    return currentLocation.pathname !== nextLocation.pathname
  }, [isDirty])
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state !== 'blocked') return

    if (window.confirm(message)) {
      blocker.proceed()
      return
    }

    blocker.reset()
  }, [blocker, message])

  useEffect(() => {
    if (!isDirty) return undefined

    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, message])
}
