import { useCallback, useRef } from 'react'

export default function useAutoSave(callback, delay = 800) {
  const timeout = useRef()
  return useCallback(
    (...args) => {
      clearTimeout(timeout.current)
      timeout.current = setTimeout(() => callback(...args), delay)
    },
    [callback, delay]
  )
}
