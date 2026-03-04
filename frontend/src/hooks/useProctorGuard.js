import { useEffect, useState } from 'react'

export default function useProctorGuard() {
  const [camera, setCamera] = useState(true)
  const [mic, setMic] = useState(true)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const handle = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])

  return { camera, mic, visible }
}
