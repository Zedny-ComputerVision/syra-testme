import { useCallback, useEffect, useRef } from 'react'

export default function useAutoSave(callback, delay = 2000) {
  const callbackRef = useRef(callback)
  const timerRef = useRef(null)

  useEffect(() => { callbackRef.current = callback }, [callback])

  const debouncedSave = useCallback((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => callbackRef.current(...args), delay)
  }, [delay])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return debouncedSave
}
