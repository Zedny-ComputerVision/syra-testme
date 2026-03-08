import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import useAuth from '../../hooks/useAuth'
import Loader from '../../components/common/Loader/Loader'
import { normalizeSchedule, normalizeAttempt, isAttemptCompletedStatus } from '../../utils/assessmentAdapters'
import { listAttempts } from '../../services/attempt.service'
import styles from './Home.module.scss'

const EMPTY_DASHBOARD = {
  total_exams: 0,
  total_attempts: 0,
  in_progress_attempts: 0,
  completed_attempts: 0,
  best_score: null,
  average_score: null,
  upcoming_count: 0,
  upcoming_schedules: [],
}

function normalizeDashboardResponse(response) {
  if (!response || typeof response !== 'object') return null
  return typeof response.data === 'object' && response.data !== null ? response.data : null
}

export default function Home() {
  const { user } = useAuth()
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recentAttempts, setRecentAttempts] = useState([])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const [dashRes] = await Promise.allSettled([api.get('dashboard/')])
      const data = dashRes.status === 'fulfilled' ? normalizeDashboardResponse(dashRes.value) : null
      if (data) {
        setDash({
          ...EMPTY_DASHBOARD,
          ...data,
          upcoming_schedules: (data.upcoming_schedules || []).map(normalizeSchedule),
        })
        setError('')
      } else {
        setDash(EMPTY_DASHBOARD)
        setError('Dashboard data is temporarily unavailable. You can still open your tests and retry.')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadAttempts = async () => {
    try {
      const { data } = await listAttempts()
      const all = (data || []).map(normalizeAttempt)
      const done = all
        .filter((attempt) => attempt.is_completed || isAttemptCompletedStatus(attempt.status))
        .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))
        .slice(0, 3)
      setRecentAttempts(done)
    } catch {
      // Non-critical for the learner dashboard.
    }
  }

  useEffect(() => {
    void loadDashboard()
    void loadAttempts()
  }, [])

  if (loading && !dash) return <Loader />

  const stats = [
    { icon: 'TT', label: 'Total Tests', value: dash?.total_exams ?? 0 },
    { icon: 'TA', label: 'Total Attempts', value: dash?.total_attempts ?? 0 },
    { icon: 'CP', label: 'Completed', value: dash?.completed_attempts ?? 0 },
    { icon: 'IP', label: 'In Progress', value: dash?.in_progress_attempts ?? 0 },
    { icon: 'BS', label: 'Best Score', value: dash?.best_score != null ? `${dash.best_score.toFixed(1)}%` : 'N/A' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Welcome, {user?.name || 'User'}</h1>
        <p className={styles.sub}>Here is an overview of your learning progress</p>
      </div>

      {error && (
        <div className={styles.errorRow}>
          <div className={styles.error}>{error}</div>
          <button type="button" className={styles.retryBtn} onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      <div className={styles.statsRow}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.statCard}>
            <span className={styles.statIcon}>{stat.icon}</span>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      {dash?.upcoming_schedules?.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming Tests ({dash.upcoming_count})</h2>
          <div className={styles.scheduleGrid}>
            {dash.upcoming_schedules.map((schedule) => {
              const takenAttempts = recentAttempts.filter(
                (attempt) => String(attempt.exam_id || attempt.test_id) === String(schedule.exam_id || schedule.test_id),
              ).length
              return (
                <div key={schedule.id} className={styles.scheduleCard}>
                  <div className={styles.schedExamTitle}>{schedule.test_title || schedule.exam_title || 'Test'}</div>
                  <div className={styles.schedMeta}>
                    <span>{schedule.test_type || schedule.exam_type}</span>
                    <span>{(schedule.test_time_limit ?? schedule.exam_time_limit) ? `${schedule.test_time_limit ?? schedule.exam_time_limit} min` : 'No limit'}</span>
                  </div>
                  <div className={styles.schedMeta}>
                    <span>{new Date(schedule.scheduled_at).toLocaleDateString()}</span>
                    <span>{new Date(schedule.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={styles.schedFooter}>
                    <span className={styles.accessBadge}>{schedule.access_mode}</span>
                    {takenAttempts > 0 && (
                      <span className={styles.attemptChip}>{takenAttempts} attempt{takenAttempts !== 1 ? 's' : ''} taken</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {dash?.upcoming_schedules?.length === 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming Tests</h2>
          <div className={styles.emptySchedule}>No upcoming scheduled tests.</div>
        </div>
      )}

      {recentAttempts.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Attempts</h2>
            <Link to="/attempts" className={styles.viewAll}>View all -&gt;</Link>
          </div>
          <div className={styles.recentGrid}>
            {recentAttempts.map((attempt) => (
              <Link key={attempt.id} to={`/attempts/${attempt.id}`} className={styles.recentCard}>
                <div className={styles.recentTitle}>{attempt.test_title || attempt.exam_title || 'Test'}</div>
                <div className={styles.recentMeta}>
                  {attempt.score != null && (
                    <span className={`${styles.scoreBadge} ${attempt.score >= 60 ? styles.scorePass : styles.scoreFail}`}>
                      {attempt.score}%
                    </span>
                  )}
                  <span className={styles.recentDate}>
                    {attempt.started_at ? new Date(attempt.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <Link to="/tests" className={styles.viewAll}>View all tests -&gt;</Link>
      </div>
    </div>
  )
}
