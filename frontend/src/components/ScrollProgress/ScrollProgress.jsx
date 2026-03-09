import { useEffect, useState } from 'react'
import styles from './ScrollProgress.module.scss'

function getProgress() {
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
  if (scrollHeight <= 0) return 0
  return Math.min(1, Math.max(0, window.scrollY / scrollHeight))
}

export default function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setProgress(getProgress())
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  return (
    <div className={styles.track} aria-hidden="true">
      <div
        className={styles.bar}
        style={{
          transform: `scaleX(${progress})`,
        }}
      />
    </div>
  )
}
