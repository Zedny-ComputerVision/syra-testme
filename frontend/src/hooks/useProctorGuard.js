import { useEffect, useState } from 'react'

export default function useProctorGuard() {
  const [camera] = useState(true)
  const [mic] = useState(true)
  const [visible, setVisible] = useState(() => !document.hidden)

  useEffect(() => {
    const handle = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])

  return { camera, mic, visible }
}
