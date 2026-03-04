import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import styles from './ViolationToast.module.scss'

export default function ViolationToast({ event, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose])

  const severityClass = styles['toast' + (event.severity || 'LOW')]

  return (
    <motion.div
      className={styles.toastWrap}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className={`${styles.toast} ${severityClass} glass`}>
        <span className={styles.severity}>{event.severity}</span>
        <span>{event.event_type?.replace(/_/g, ' ')}</span>
      </div>
    </motion.div>
  )
}
