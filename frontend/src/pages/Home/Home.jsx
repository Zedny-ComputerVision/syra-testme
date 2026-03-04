import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import useAuth from '../../hooks/useAuth'
import Loader from '../../components/common/Loader/Loader'
import styles from './Home.module.scss'

export default function Home() {
  const { user } = useAuth()
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('dashboard/')
      .then(({ data }) => setDash(data))
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loader />
  if (error) return <div className={styles.error}>{error}</div>

  const stats = [
    { icon: '\u270D', label: 'Total Exams', value: dash?.total_exams ?? 0 },
    { icon: '\u2611', label: 'Total Attempts', value: dash?.total_attempts ?? 0 },
    { icon: '\u23F3', label: 'In Progress', value: dash?.in_progress_attempts ?? 0 },
    { icon: '\u2B50', label: 'Best Score', value: dash?.best_score != null ? `${dash.best_score.toFixed(1)}%` : 'N/A' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Welcome, {user?.name || 'User'}</h1>
        <p className={styles.sub}>Here is an overview of your learning progress</p>
      </div>

      <div className={styles.statsRow}>
        {stats.map((s) => (
          <div key={s.label} className={styles.statCard}>
            <span className={styles.statIcon}>{s.icon}</span>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {dash?.upcoming_schedules?.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming Exams ({dash.upcoming_count})</h2>
          <div className={styles.scheduleGrid}>
            {dash.upcoming_schedules.map((s) => (
              <div key={s.id} className={styles.scheduleCard}>
                <div className={styles.schedExamTitle}>{s.exam_title || 'Exam'}</div>
                <div className={styles.schedMeta}>
                  <span>{s.exam_type}</span>
                  <span>{s.exam_time_limit ? `${s.exam_time_limit} min` : 'No limit'}</span>
                </div>
                <div className={styles.schedMeta}>
                  <span>{new Date(s.scheduled_at).toLocaleDateString()}</span>
                  <span>{new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <span className={styles.accessBadge}>{s.access_mode}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <Link to="/exams" className={styles.viewAll}>View all exams &rarr;</Link>
      </div>
    </div>
  )
}
