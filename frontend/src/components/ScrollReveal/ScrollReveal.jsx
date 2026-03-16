import React, { useEffect, useRef, useState } from 'react'
import styles from './ScrollReveal.module.scss'

function canAnimate() {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false
  }
  return typeof window.IntersectionObserver === 'function'
}

export default function ScrollReveal({
  as: Component = 'div',
  children,
  className = '',
  delay = 0,
  once = true,
  threshold = 0.05,
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(!canAnimate())

  useEffect(() => {
    if (!canAnimate() || !ref.current) {
      setVisible(true)
      return undefined
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setVisible(false)
        }
      },
      {
        threshold,
        rootMargin: '0px 0px 0px 0px',
      },
    )

    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [once, threshold])

  return (
    <Component
      ref={ref}
      className={`${styles.root} ${visible ? styles.visible : ''} ${className}`.trim()}
      style={{ '--scroll-delay': `${delay}ms` }}
    >
      {children}
    </Component>
  )
}
