import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import useAuth from '../../hooks/useAuth'
import PrefetchLink from '../../components/common/PrefetchLink/PrefetchLink'
import Skeleton from '../../components/Skeleton/Skeleton'
import ScrollReveal from '../../components/ScrollReveal/ScrollReveal'
import { normalizeSchedule, normalizeAttempt, isAttemptCompletedStatus } from '../../utils/assessmentAdapters'
import { listAttempts } from '../../services/attempt.service'
import { preloadRoute } from '../../utils/routePrefetch'
import { readPaginatedItems } from '../../utils/pagination'
import styles from './Home.module.scss'

const EMPTY_DASHBOARD = {
  total_exams: 0,
  total_tests: 0,
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

function formatRelativeSchedule(iso) {
  if (!iso) return 'No upcoming deadline'
  const diff = new Date(iso).getTime() - Date.now()
  const minutes = Math.round(diff / 60000)
  if (minutes <= 0) return 'Starting now'
  if (minutes < 60) return `Starts in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Starts in ${hours} hr${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `Starts in ${days} day${days === 1 ? '' : 's'}`
}

export default function Home() {
  const { user } = useAuth()
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [attemptsError, setAttemptsError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
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
        setLastUpdated(new Date())
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
      const { data } = await listAttempts({ skip: 0, limit: 10 })
      const all = readPaginatedItems(data).map(normalizeAttempt)
      const done = all
        .filter((attempt) => attempt.is_completed || isAttemptCompletedStatus(attempt.status))
        .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))
        .slice(0, 3)
      setRecentAttempts(done)
      setAttemptsError('')
    } catch (loadError) {
      setAttemptsError(loadError?.message || 'Recent attempts are temporarily unavailable.')
    }
  }

  const refreshDashboard = async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadDashboard(), loadAttempts()])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
    void loadAttempts()
  }, [])

  if (loading && !dash) {
    return (
      <div className={styles.page}>
        <ScrollReveal as="section" className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroEyebrow}>Learner workspace</div>
            <div className={styles.header}>
              <h1 className={styles.heading}>Welcome, {user?.name || 'User'}</h1>
              <p className={styles.sub}>Here is an overview of your learning progress, upcoming schedule, and latest results.</p>
            </div>
            <div className={styles.heroActions}>
              <PrefetchLink to="/tests" className={styles.primaryAction}>Browse Tests</PrefetchLink>
              <PrefetchLink to="/attempts" className={styles.secondaryAction}>Review Attempts</PrefetchLink>
              <PrefetchLink to="/schedule" className={styles.secondaryAction}>Open Schedule</PrefetchLink>
              <button type="button" className={styles.secondaryAction} onClick={() => void refreshDashboard()} disabled={refreshing}>
                {refreshing ? 'Refreshing...' : 'Refresh overview'}
              </button>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.heroPanelTitle}>Today at a glance</div>
            <div className={styles.heroMetricGrid}>
              <Skeleton variant="card" className={styles.statSkeleton} />
              <Skeleton variant="card" className={styles.statSkeleton} />
              <Skeleton variant="card" className={styles.statSkeleton} />
            </div>
          </div>
        </ScrollReveal>
        <div className={styles.statsRow}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} variant="card" className={styles.statSkeleton} />
          ))}
        </div>
        <div className={styles.section}>
          <Skeleton variant="text" className={styles.sectionTitleSkeleton} />
          <div className={styles.scheduleGrid}>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} variant="card" className={styles.scheduleSkeleton} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const stats = [
    { icon: 'TT', label: 'Total Tests', value: dash?.total_tests ?? dash?.total_exams ?? 0 },
    { icon: 'TA', label: 'Total Attempts', value: dash?.total_attempts ?? 0 },
    { icon: 'CP', label: 'Completed', value: dash?.completed_attempts ?? 0 },
    { icon: 'IP', label: 'In Progress', value: dash?.in_progress_attempts ?? 0 },
    { icon: 'BS', label: 'Best Score', value: dash?.best_score != null ? `${dash.best_score.toFixed(1)}%` : 'N/A' },
  ]
  const completionRate = dash?.total_attempts
    ? Math.round(((dash.completed_attempts || 0) / dash.total_attempts) * 100)
    : 0
  const nextSchedule = dash?.upcoming_schedules?.[0] || null
  const heroMetrics = [
    { label: 'Average score', value: dash?.average_score != null ? `${dash.average_score.toFixed(1)}%` : 'N/A' },
    { label: 'Completion rate', value: `${completionRate}%` },
    { label: 'Upcoming', value: dash?.upcoming_count ?? 0 },
  ]
  const progressCards = [
    {
      title: 'Continue your momentum',
      body: (dash?.in_progress_attempts || 0) > 0
        ? `You have ${dash?.in_progress_attempts} active attempt${dash?.in_progress_attempts === 1 ? '' : 's'} that can be resumed right away.`
        : 'No live attempt is waiting on you right now. Use this time to review upcoming tests or recent results.',
      cta: {
        to: (dash?.in_progress_attempts || 0) > 0 ? '/attempts' : '/tests',
        label: (dash?.in_progress_attempts || 0) > 0 ? 'Resume attempts' : 'Browse tests',
      },
    },
    {
      title: 'Next scheduled test',
      body: nextSchedule
        ? `${nextSchedule.test_title || nextSchedule.exam_title || 'Upcoming test'} - ${formatRelativeSchedule(nextSchedule.scheduled_at)}`
        : 'Nothing is on the calendar yet. When an instructor assigns a test, it will appear here.',
      cta: { to: '/schedule', label: 'Open schedule' },
    },
  ]

  return (
    <div className={styles.page}>
      <ScrollReveal as="section" className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>Learner workspace</div>
          <div className={styles.header}>
            <h1 className={styles.heading}>Welcome, {user?.name || 'User'}</h1>
            <p className={styles.sub}>
              {(dash?.in_progress_attempts || 0) > 0
                ? `You have ${dash?.in_progress_attempts} in-progress attempt${dash?.in_progress_attempts === 1 ? '' : 's'} and ${dash?.upcoming_count || 0} upcoming scheduled test${(dash?.upcoming_count || 0) === 1 ? '' : 's'}.`
                : 'Here is an overview of your learning progress, upcoming schedule, and latest results.'}
            </p>
          </div>
          <div className={styles.heroActions}>
            <PrefetchLink to="/tests" className={styles.primaryAction}>Browse Tests</PrefetchLink>
            <PrefetchLink to="/attempts" className={styles.secondaryAction}>Review Attempts</PrefetchLink>
            <PrefetchLink to="/schedule" className={styles.secondaryAction}>Open Schedule</PrefetchLink>
            <button type="button" className={styles.secondaryAction} onClick={() => void refreshDashboard()} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh overview'}
            </button>
          </div>
        </div>
        <div className={styles.heroPanel}>
          <div className={styles.heroPanelTitle}>Today at a glance</div>
          <div className={styles.heroMetricGrid}>
            {heroMetrics.map((metric) => (
              <div key={metric.label} className={styles.heroMetric}>
                <span className={styles.heroMetricValue}>{metric.value}</span>
                <span className={styles.heroMetricLabel}>{metric.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.heroCallout}>
            <span className={styles.heroCalloutLabel}>Next checkpoint</span>
            <span className={styles.heroCalloutTitle}>
              {nextSchedule?.test_title || nextSchedule?.exam_title || 'No scheduled test yet'}
            </span>
            <span className={styles.heroCalloutMeta}>
              {nextSchedule ? formatRelativeSchedule(nextSchedule.scheduled_at) : 'Your next assignment will appear here automatically.'}
            </span>
          </div>
          <div className={styles.statusNote}>
            {lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live learner overview'}
          </div>
        </div>
      </ScrollReveal>

      {error && (
        <div className={styles.errorRow}>
          <div className={styles.error}>{error}</div>
          <button type="button" className={styles.retryBtn} onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? 'Retrying dashboard...' : 'Retry dashboard'}
          </button>
        </div>
      )}

      <ScrollReveal className={styles.statsRow} delay={60}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.statCard}>
            <span className={styles.statIcon}>{stat.icon}</span>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          </div>
        ))}
      </ScrollReveal>

      <ScrollReveal className={styles.focusGrid} delay={120}>
        {progressCards.map((card) => (
          <div key={card.title} className={styles.focusCard}>
            <div className={styles.focusTitle}>{card.title}</div>
            <div className={styles.focusBody}>{card.body}</div>
            <PrefetchLink to={card.cta.to} className={styles.focusLink}>{card.cta.label}</PrefetchLink>
          </div>
        ))}
      </ScrollReveal>

      {dash?.upcoming_schedules?.length > 0 && (
        <ScrollReveal className={styles.section} delay={160}>
          <h2 className={styles.sectionTitle}>Upcoming Tests ({dash.upcoming_count})</h2>
          <div className={styles.scheduleGrid}>
            {dash.upcoming_schedules.map((schedule) => {
              const takenAttempts = recentAttempts.filter(
                (attempt) => String(attempt.exam_id || attempt.test_id) === String(schedule.exam_id || schedule.test_id),
              ).length
              const schedulePath = schedule.test_id || schedule.exam_id
                ? `/tests/${schedule.test_id || schedule.exam_id}`
                : null
              const cardContent = (
                <>
                  <div className={styles.schedExamTitle}>{schedule.test_title || schedule.exam_title || 'Test'}</div>
                  <div className={styles.schedMeta}>
                    <span>{schedule.test_type || schedule.exam_type}</span>
                    <span>{(schedule.test_time_limit ?? schedule.exam_time_limit) ? `${schedule.test_time_limit ?? schedule.exam_time_limit} min` : 'No limit'}</span>
                  </div>
                  <div className={styles.schedMeta}>
                    <span>{new Date(schedule.scheduled_at).toLocaleDateString()}</span>
                    <span>{new Date(schedule.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={styles.schedHint}>{formatRelativeSchedule(schedule.scheduled_at)}</div>
                  <div className={styles.schedFooter}>
                    <span className={styles.accessBadge}>{schedule.access_mode}</span>
                    {takenAttempts > 0 && (
                      <span className={styles.attemptChip}>{takenAttempts} attempt{takenAttempts !== 1 ? 's' : ''} taken</span>
                    )}
                  </div>
                </>
              )

              if (!schedulePath) {
                return (
                  <div key={schedule.id} className={styles.scheduleCard}>
                    {cardContent}
                  </div>
                )
              }

              return (
                <PrefetchLink key={schedule.id} to={schedulePath} className={styles.scheduleCard}>
                  {cardContent}
                </PrefetchLink>
              )
            })}
          </div>
        </ScrollReveal>
      )}

      {dash?.upcoming_schedules?.length === 0 && (
        <ScrollReveal className={styles.section} delay={160}>
          <h2 className={styles.sectionTitle}>Upcoming Tests</h2>
          <div className={styles.emptySchedule}>
            <div>No upcoming scheduled tests.</div>
            <PrefetchLink to="/tests" className={styles.emptyAction}>Browse available tests</PrefetchLink>
          </div>
        </ScrollReveal>
      )}

      {(recentAttempts.length > 0 || attemptsError) && (
        <ScrollReveal className={styles.section} delay={200}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Attempts</h2>
            <div className={styles.sectionActions}>
              {attemptsError && (
                <button type="button" className={styles.retryBtn} onClick={() => void loadAttempts()}>
                  Retry attempts
                </button>
              )}
              <PrefetchLink to="/attempts" className={styles.viewAll}>Open all attempts</PrefetchLink>
            </div>
          </div>
          {attemptsError && (
            <div className={styles.warningRow}>
              <div className={styles.warningText}>{attemptsError}</div>
            </div>
          )}
          <div className={styles.recentGrid}>
            {recentAttempts.map((attempt) => (
              <PrefetchLink
                key={attempt.id}
                to={`/attempts/${attempt.id}`}
                className={styles.recentCard}
                onMouseEnter={() => preloadRoute(`/attempts/${attempt.id}`)}
              >
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
              </PrefetchLink>
            ))}
          </div>
        </ScrollReveal>
      )}

      {recentAttempts.length === 0 && !attemptsError && (
        <ScrollReveal className={styles.section} delay={200}>
          <div className={styles.emptyRecent}>
            <div className={styles.emptyRecentTitle}>No recent attempts yet</div>
            <div className={styles.emptyRecentText}>
              Your completed attempts will show up here once you start taking tests.
            </div>
            <PrefetchLink to="/tests" className={styles.emptyAction}>Start with available tests</PrefetchLink>
          </div>
        </ScrollReveal>
      )}

      <ScrollReveal className={styles.actions} delay={240}>
        <PrefetchLink to="/tests" className={styles.viewAll}>Browse all tests</PrefetchLink>
      </ScrollReveal>
    </div>
  )
}
