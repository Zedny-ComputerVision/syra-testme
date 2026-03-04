import React, { useEffect, useState } from 'react'
import { listSchedules } from '../../services/schedule.service'
import styles from './Schedule.module.scss'

export default function Schedule() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSchedules()
      .then(({ data }) => setSchedules(data || []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const upcoming = schedules.filter(s => new Date(s.scheduled_at) >= now)
  const past = schedules.filter(s => new Date(s.scheduled_at) < now)

  const formatDate = (iso) => {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) return <div className={styles.loading}>Loading schedules...</div>

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Exam Schedule</h2>

      {schedules.length === 0 ? (
        <div className={styles.empty}>No scheduled exams.</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Upcoming</div>
              <div className={styles.list}>
                {upcoming.map(s => (
                  <div key={s.id} className={styles.card}>
                    <div className={styles.cardLeft}>
                      <span className={styles.examTitle}>{s.exam_title || 'Exam'}</span>
                      <span className={styles.dateText}>{formatDate(s.scheduled_at)}</span>
                    </div>
                    <span className={`${styles.modeBadge} ${s.access_mode === 'OPEN' ? styles.modeOpen : styles.modeScheduled}`}>
                      {s.access_mode || 'Scheduled'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Past</div>
              <div className={styles.list}>
                {past.map(s => (
                  <div key={s.id} className={styles.card} style={{ opacity: 0.6 }}>
                    <div className={styles.cardLeft}>
                      <span className={styles.examTitle}>{s.exam_title || 'Exam'}</span>
                      <span className={styles.dateText}>{formatDate(s.scheduled_at)}</span>
                    </div>
                    <span className={`${styles.modeBadge} ${styles.modeScheduled}`}>
                      Past
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
