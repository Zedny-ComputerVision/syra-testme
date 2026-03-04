import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAttempts } from '../../services/attempt.service'
import styles from './Attempts.module.scss'

const STATUS_CLASSES = {
  COMPLETED: styles.badgeCompleted,
  IN_PROGRESS: styles.badgeInProgress,
  TIMED_OUT: styles.badgeTimedOut,
}

export default function Attempts() {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    listAttempts()
      .then(({ data }) => setAttempts(data || []))
      .catch(() => setAttempts([]))
      .finally(() => setLoading(false))
  }, [])

  const completed = attempts.filter(a => a.status === 'COMPLETED')
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, a) => s + (a.score || 0), 0) / completed.length)
    : 0
  const bestScore = completed.length
    ? Math.max(...completed.map(a => a.score || 0))
    : 0

  const formatDate = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const formatDuration = (start, end) => {
    if (!start || !end) return '-'
    const ms = new Date(end) - new Date(start)
    const mins = Math.floor(ms / 60000)
    return `${mins} min`
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Your Attempts</h2>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{attempts.length}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{completed.length}</div>
          <div className={styles.statLabel}>Completed</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{avgScore}%</div>
          <div className={styles.statLabel}>Avg Score</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{bestScore}%</div>
          <div className={styles.statLabel}>Best</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : attempts.length === 0 ? (
          <div className={styles.empty}>No attempts yet. Take an exam to get started.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Exam</th>
                <th>Status</th>
                <th>Score</th>
                <th>Date</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map(a => (
                <tr key={a.id} onClick={() => navigate(`/attempts/${a.id}`)}>
                  <td>{a.exam_title || 'Exam'}</td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_CLASSES[a.status] || ''}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>{a.score != null ? `${a.score}%` : '-'}</td>
                  <td>{formatDate(a.started_at)}</td>
                  <td>{formatDuration(a.started_at, a.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
