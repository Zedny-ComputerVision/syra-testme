import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import styles from './ViolationToast.module.scss'

export default function ViolationToast({ event, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 7000)
    return () => clearTimeout(t)
  }, [onClose])

  const eventLabel = event.event_type?.replace(/_/g, ' ') || 'Violation'
  const severityClass = styles['toast' + (event.severity || 'LOW')]
  const confidence = typeof event.ai_confidence === 'number'
    ? event.ai_confidence
    : typeof event.confidence === 'number'
      ? event.confidence
      : null
  const hasConfidence = confidence != null
  const detailMessage = event.detail?.trim() || 'Automatic proctoring alert detected.'

  return (
    <motion.div
      className={styles.toastWrap}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className={`${styles.toast} ${severityClass} glass`}>
        <div className={styles.toastMain}>
          <span className={styles.severity}>{event.severity}</span>
          <span className={styles.eventType}>{eventLabel}</span>
          {hasConfidence && (
            <span className={styles.confidence}>Confidence {Math.round(confidence * 100)}%</span>
          )}
        </div>
        <div className={styles.toastDetail}>{detailMessage}</div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Dismiss violation alert">x</button>
      </div>
    </motion.div>
  )
}
