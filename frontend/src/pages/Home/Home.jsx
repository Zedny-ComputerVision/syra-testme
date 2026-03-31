import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import useAuth from '../../hooks/useAuth'
import useLanguage from '../../hooks/useLanguage'
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

function getUrgency(scheduledAt) {
  if (!scheduledAt) return 'upcoming'
  const diff = new Date(scheduledAt).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 24 * 60 * 60 * 1000) return 'today'
  if (diff < 3 * 24 * 60 * 60 * 1000) return 'soon'
  return 'upcoming'
}

function formatExamDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Home() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [attemptsError, setAttemptsError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [recentAttempts, setRecentAttempts] = useState([])

  const formatRelativeSchedule = (iso) => {
    if (!iso) return t('home_no_upcoming_deadline')
    const diff = new Date(iso).getTime() - Date.now()
    const minutes = Math.round(diff / 60000)
    if (minutes <= 0) return t('home_starting_now')
    if (minutes < 60) return `${t('home_starts_in')} ${minutes} ${t('time_min')}`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${t('home_starts_in')} ${hours} ${t('time_hrs')}`
    const days = Math.round(hours / 24)
    return `${t('home_starts_in')} ${days} ${t('time_days')}`
  }

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
        setError(t('home_dashboard_unavailable'))
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
      setAttemptsError(loadError?.message || t('home_attempts_unavailable'))
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
            <div className={styles.heroEyebrow}>{t('home_learner_workspace')}</div>
            <div className={styles.header}>
              <h1 className={styles.heading}>{t('home_welcome')}, {user?.name || t('home_user')}</h1>
              <p className={styles.sub}>{t('home_overview_text')}</p>
            </div>
            <div className={styles.heroActions}>
              <PrefetchLink to="/tests" className={styles.primaryAction}>{t('home_browse_tests')}</PrefetchLink>
              <PrefetchLink to="/attempts" className={styles.secondaryAction}>{t('home_review_attempts')}</PrefetchLink>
              <PrefetchLink to="/schedule" className={styles.secondaryAction}>{t('home_open_schedule')}</PrefetchLink>
              <button type="button" className={styles.secondaryAction} onClick={() => void refreshDashboard()} disabled={refreshing}>
                {refreshing ? t('home_refreshing') : t('home_refresh_overview')}
              </button>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.heroPanelTitle}>{t('home_today_glance')}</div>
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
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
          <line x1="9" y1="16" x2="13" y2="16"/>
        </svg>
      ),
      label: t('home_total_tests'),
      value: dash?.total_tests ?? dash?.total_exams ?? 0,
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      ),
      label: t('home_total_attempts'),
      value: dash?.total_attempts ?? 0,
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      ),
      label: t('home_completed'),
      value: dash?.completed_attempts ?? 0,
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      label: t('home_in_progress'),
      value: dash?.in_progress_attempts ?? 0,
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="6"/>
          <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
        </svg>
      ),
      label: t('home_best_score'),
      value: dash?.best_score != null ? `${dash.best_score.toFixed(1)}%` : t('home_na'),
    },
  ]
  const completionRate = dash?.total_attempts
    ? Math.round(((dash.completed_attempts || 0) / dash.total_attempts) * 100)
    : 0
  const nextSchedule = dash?.upcoming_schedules?.[0] || null
  const heroMetrics = [
    { label: t('home_average_score'), value: dash?.average_score != null ? `${dash.average_score.toFixed(1)}%` : t('home_na') },
    { label: t('home_completion_rate'), value: `${completionRate}%` },
    { label: t('home_upcoming'), value: dash?.upcoming_count ?? 0 },
  ]
  const progressCards = [
    {
      title: t('home_continue_momentum'),
      body: (dash?.in_progress_attempts || 0) > 0
        ? `${t('home_you_have')} ${dash?.in_progress_attempts} ${t('home_active_attempts_msg')}`
        : t('home_no_active_attempts_msg'),
      cta: {
        to: (dash?.in_progress_attempts || 0) > 0 ? '/attempts' : '/tests',
        label: (dash?.in_progress_attempts || 0) > 0 ? t('home_resume_attempts') : t('home_browse_tests'),
      },
    },
    {
      title: t('home_next_scheduled_test'),
      body: nextSchedule
        ? `${nextSchedule.test_title || nextSchedule.exam_title || t('home_upcoming_test')} - ${formatRelativeSchedule(nextSchedule.scheduled_at)}`
        : t('home_nothing_on_calendar'),
      cta: { to: '/schedule', label: t('home_open_schedule') },
    },
  ]

  return (
    <div className={styles.page}>
      <ScrollReveal as="section" className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>{t('home_learner_workspace')}</div>
          <div className={styles.header}>
            <h1 className={styles.heading}>{t('home_welcome')}, {user?.name || t('home_user')}</h1>
            <p className={styles.sub}>
              {(dash?.in_progress_attempts || 0) > 0
                ? `${t('home_you_have')} ${dash?.in_progress_attempts} ${t('home_in_progress_attempts_msg')} ${dash?.upcoming_count || 0} ${t('home_upcoming_scheduled_msg')}`
                : t('home_overview_text')}
            </p>
          </div>
          <div className={styles.heroActions}>
            <PrefetchLink to="/tests" className={styles.primaryAction}>{t('home_browse_tests')}</PrefetchLink>
            <PrefetchLink to="/attempts" className={styles.secondaryAction}>{t('home_review_attempts')}</PrefetchLink>
            <PrefetchLink to="/schedule" className={styles.secondaryAction}>{t('home_open_schedule')}</PrefetchLink>
            <button type="button" className={styles.secondaryAction} onClick={() => void refreshDashboard()} disabled={refreshing}>
              {refreshing ? t('home_refreshing') : t('home_refresh_overview')}
            </button>
          </div>
        </div>
        <div className={styles.heroPanel}>
          <div className={styles.heroPanelTitle}>{t('home_today_glance')}</div>
          <div className={styles.heroMetricGrid}>
            {heroMetrics.map((metric) => (
              <div key={metric.label} className={styles.heroMetric}>
                <span className={styles.heroMetricValue}>{metric.value}</span>
                <span className={styles.heroMetricLabel}>{metric.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.heroCallout}>
            <span className={styles.heroCalloutLabel}>{t('home_next_checkpoint')}</span>
            <span className={styles.heroCalloutTitle}>
              {nextSchedule?.test_title || nextSchedule?.exam_title || t('home_no_scheduled_test_yet')}
            </span>
            <span className={styles.heroCalloutMeta}>
              {nextSchedule ? formatRelativeSchedule(nextSchedule.scheduled_at) : t('home_next_assignment_auto')}
            </span>
          </div>
          <div className={styles.statusNote}>
            {lastUpdated ? `${t('home_last_refreshed')} ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : t('home_live_overview')}
          </div>
        </div>
      </ScrollReveal>

      {error && (
        <div className={styles.errorRow}>
          <div className={styles.error}>{error}</div>
          <button type="button" className={styles.retryBtn} onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? t('home_retrying_dashboard') : t('home_retry_dashboard')}
          </button>
        </div>
      )}

      <ScrollReveal className={styles.examSection} delay={60}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            {t('home_your_upcoming_exams')}
            {(dash?.upcoming_count || 0) > 0 && (
              <span className={styles.countBadge}>{dash.upcoming_count}</span>
            )}
          </h2>
          <PrefetchLink to="/schedule" className={styles.viewAll}>{t('home_view_full_schedule')}</PrefetchLink>
        </div>
        {!dash?.upcoming_schedules?.length ? (
          <div className={styles.emptySchedule}>
            <div>{t('home_no_upcoming_exams')}</div>
            <PrefetchLink to="/tests" className={styles.emptyAction}>{t('home_browse_available_tests')}</PrefetchLink>
          </div>
        ) : (
          <div className={styles.scheduleGrid}>
            {dash.upcoming_schedules.map((schedule) => {
              const urgency = getUrgency(schedule.scheduled_at)
              const schedulePath = schedule.test_id || schedule.exam_id
                ? `/tests/${schedule.test_id || schedule.exam_id}`
                : '/schedule'
              const takenAttempts = recentAttempts.filter(
                (a) => String(a.exam_id || a.test_id) === String(schedule.exam_id || schedule.test_id),
              ).length
              return (
                <div
                  key={schedule.id}
                  className={`${styles.scheduleCard} ${urgency === 'today' ? styles.schedCardToday : ''} ${urgency === 'soon' ? styles.schedCardSoon : ''}`}
                >
                  <div className={styles.schedCardTop}>
                    <span className={`${styles.urgencyBadge} ${styles[`urgency_${urgency}`] || ''}`}>
                      {urgency === 'today' ? t('home_urgency_today') : urgency === 'soon' ? t('home_urgency_soon') : urgency === 'overdue' ? t('home_urgency_past_due') : t('home_urgency_upcoming')}
                    </span>
                    {takenAttempts > 0 && (
                      <span className={styles.attemptChip}>{takenAttempts} {t('home_attempts_taken')}</span>
                    )}
                  </div>
                  <div className={styles.schedExamTitle}>{schedule.test_title || schedule.exam_title || t('home_test')}</div>
                  <div className={styles.schedDateRow}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span>{formatExamDate(schedule.scheduled_at)}</span>
                  </div>
                  <div className={styles.schedMeta}>
                    <span>{schedule.test_type || schedule.exam_type || t('home_test')}</span>
                    <span>{(schedule.test_time_limit ?? schedule.exam_time_limit) ? `${schedule.test_time_limit ?? schedule.exam_time_limit} ${t('time_min')}` : t('home_no_limit')}</span>
                  </div>
                  <div className={styles.schedCountdown}>{formatRelativeSchedule(schedule.scheduled_at)}</div>
                  <PrefetchLink
                    to={schedulePath}
                    className={`${styles.schedCta} ${urgency === 'today' || urgency === 'soon' ? styles.schedCtaUrgent : ''}`}
                  >
                    {urgency === 'today' ? t('home_start_test_now') : urgency === 'soon' ? t('home_view_and_prepare') : t('home_view_test')}
                  </PrefetchLink>
                </div>
              )
            })}
          </div>
        )}
      </ScrollReveal>

      <ScrollReveal className={styles.statsRow} delay={120}>
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

      <ScrollReveal className={styles.focusGrid} delay={180}>
        {progressCards.map((card) => (
          <div key={card.title} className={styles.focusCard}>
            <div className={styles.focusTitle}>{card.title}</div>
            <div className={styles.focusBody}>{card.body}</div>
            <PrefetchLink to={card.cta.to} className={styles.focusLink}>{card.cta.label}</PrefetchLink>
          </div>
        ))}
      </ScrollReveal>

      {(recentAttempts.length > 0 || attemptsError) && (
        <ScrollReveal className={styles.section} delay={200}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('home_recent_attempts')}</h2>
            <div className={styles.sectionActions}>
              {attemptsError && (
                <button type="button" className={styles.retryBtn} onClick={() => void loadAttempts()}>
                  {t('home_retry_attempts')}
                </button>
              )}
              <PrefetchLink to="/attempts" className={styles.viewAll}>{t('home_open_all_attempts')}</PrefetchLink>
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
                <div className={styles.recentTitle}>{attempt.test_title || attempt.exam_title || t('home_test')}</div>
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
            <div className={styles.emptyRecentTitle}>{t('home_no_recent_attempts')}</div>
            <div className={styles.emptyRecentText}>
              {t('home_no_recent_attempts_text')}
            </div>
            <PrefetchLink to="/tests" className={styles.emptyAction}>{t('home_start_with_tests')}</PrefetchLink>
          </div>
        </ScrollReveal>
      )}

      <ScrollReveal className={styles.actions} delay={240}>
        <PrefetchLink to="/tests" className={styles.viewAll}>{t('home_browse_all_tests')}</PrefetchLink>
      </ScrollReveal>
    </div>
  )
}
