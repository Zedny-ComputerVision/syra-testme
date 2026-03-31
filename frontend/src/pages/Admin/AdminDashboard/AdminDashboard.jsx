import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import Skeleton from '../../../components/Skeleton/Skeleton'
import { readPaginatedItems } from '../../../utils/pagination'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import DashboardAnalytics from './DashboardAnalytics'
import DashboardOperations from './DashboardOperations'
import useAuth from '../../../hooks/useAuth'
import {
  EMPTY_DASHBOARD,
  formatCompact,
  formatPercent,
  formatTime,
  ICONS,
} from './dashboardConfig'
import styles from './AdminDashboard.module.scss'

const KpiSvg = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
)

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const mountedRef = useRef(false)
  const loadSequenceRef = useRef(0)

  const hasAnyData = auditLog.length > 0 || Object.values(dashboard).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === 'object') return Object.keys(value).length > 0
    return Boolean(value)
  })

  const heroName = user?.name?.trim()?.split(/\s+/)[0] || user?.user_id || 'Admin'

  const loadDashboard = async ({ preserveData = false } = {}) => {
    const loadSequence = loadSequenceRef.current + 1
    loadSequenceRef.current = loadSequence

    if (preserveData) setRefreshing(true)
    else setLoading(true)

    setError('')
    setWarning('')

    try {
      const results = await Promise.allSettled([
        adminApi.dashboard(),
        adminApi.auditLog({ skip: 0, limit: 8 }),
      ])

      if (!mountedRef.current || loadSequence !== loadSequenceRef.current) return

      const [dashboardRes, auditRes] = results
      const failedPanels = results.filter((result) => result.status === 'rejected').length
      setDashboard(dashboardRes.status === 'fulfilled' ? { ...EMPTY_DASHBOARD, ...(dashboardRes.value.data || {}) } : EMPTY_DASHBOARD)
      setAuditLog(auditRes.status === 'fulfilled' ? readPaginatedItems(auditRes.value.data) : [])

      if (failedPanels === results.length) {
        setError('Failed to load dashboard data.')
      } else if (failedPanels > 0) {
        setWarning('Some dashboard panels could not be loaded in time. Refresh to retry.')
      }
    } catch {
      if (!mountedRef.current || loadSequence !== loadSequenceRef.current) return
      setError('Failed to load dashboard data.')
    } finally {
      if (!mountedRef.current || loadSequence !== loadSequenceRef.current) return
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void loadDashboard()
    return () => {
      mountedRef.current = false
    }
  }, [])

  const attentionItems = [
    { label: 'Needs review', value: dashboard.awaiting_review_attempts, to: '/admin/attempt-analysis', tone: styles.attentionAmber },
    { label: 'High risk', value: dashboard.high_risk_attempts, to: '/admin/candidates', tone: styles.attentionRose },
    { label: 'Open tests', value: dashboard.open_tests || dashboard.published_tests, to: '/admin/tests', tone: styles.attentionCyan },
    { label: 'Upcoming', value: dashboard.upcoming_count, to: '/admin/sessions', tone: styles.attentionViolet },
  ]

  const kpiCards = [
    { label: 'Platform accounts', value: formatCompact(dashboard.total_users), helper: `${dashboard.active_users} active right now`, iconKey: 'users', tone: 'Blue', to: '/admin/users' },
    { label: 'Learners', value: formatCompact(dashboard.total_learners), helper: `${dashboard.total_instructors} instructors supporting delivery`, iconKey: 'learners', tone: 'Green', to: '/admin/candidates' },
    { label: 'Open tests', value: formatCompact(dashboard.open_tests || dashboard.published_tests), helper: `${dashboard.closed_tests} closed or unpublished`, iconKey: 'tests', tone: 'Violet', to: '/admin/tests' },
    { label: 'Total attempts', value: formatCompact(dashboard.total_attempts), helper: `${dashboard.in_progress_attempts} currently in progress`, iconKey: 'attempts', tone: 'Cyan', to: '/admin/attempt-analysis' },
    { label: 'Average score', value: formatPercent(dashboard.average_score, 1), helper: `Best score ${formatPercent(dashboard.best_score, 1)}`, iconKey: 'score', tone: 'Amber', to: '/admin/attempt-analysis' },
    { label: 'Pass rate', value: formatPercent(dashboard.pass_rate, 1), helper: `${dashboard.completed_attempts} completed attempts`, iconKey: 'passRate', tone: 'Green', to: '/admin/reports' },
    { label: 'Submitted backlog', value: formatCompact(dashboard.awaiting_review_attempts), helper: 'Attempts waiting for review', iconKey: 'alert', tone: 'Amber', to: '/admin/attempt-analysis' },
    { label: 'Admin team', value: formatCompact(dashboard.total_admins), helper: 'Administrative operators', iconKey: 'users', tone: 'Rose', to: '/admin/users' },
  ]

  if (loading && !hasAnyData) {
    return (
      <div className={styles.page}>
        <AdminPageHeader title="Admin Dashboard" subtitle="Platform health, risk monitoring, and performance analytics">
          <button type="button" className={styles.refreshButton} disabled>Refresh</button>
        </AdminPageHeader>
        <div className={styles.heroSkeleton}>
          <Skeleton variant="card" className={styles.heroSkeletonMain} />
          <Skeleton variant="card" className={styles.heroSkeletonSide} />
        </div>
        <div className={styles.kpiGrid}>
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} variant="card" className={styles.kpiSkeleton} />)}
        </div>
        <div className={styles.analyticsGrid}>
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="card" className={styles.panelSkeleton} />)}
        </div>
        <div className={styles.tablesGrid}>
          {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} variant="card" className={styles.tableSkeleton} />)}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Admin Dashboard" subtitle="Platform health, risk monitoring, and performance analytics">
        <button type="button" className={styles.refreshButton} onClick={() => void loadDashboard({ preserveData: hasAnyData })} disabled={loading || refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </AdminPageHeader>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>{error}</span>
          <button type="button" className={styles.alertButton} onClick={() => void loadDashboard({ preserveData: hasAnyData })} disabled={loading || refreshing}>Retry</button>
        </div>
      )}
      {warning && (
        <div className={`${styles.alert} ${styles.alertWarning}`}>
          <span>{warning}</span>
          <button type="button" className={styles.alertButton} onClick={() => void loadDashboard({ preserveData: hasAnyData })} disabled={loading || refreshing}>Refresh</button>
        </div>
      )}

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroEyebrow}>Operations cockpit</div>
          <h2 className={styles.heroTitle}>{heroName}</h2>
          <p className={styles.heroSubtitle}>Monitor platform growth, learner throughput, proctoring risk, and which tests or sessions need attention next.</p>
          <div className={styles.heroMeta}>
            <span>Last refreshed {dashboard.generated_at ? formatTime(dashboard.generated_at) : 'just now'}</span>
            <span>{dashboard.total_attempts} attempts tracked</span>
            <span>{dashboard.total_tests} tests in scope</span>
          </div>
          <div className={styles.heroActions}>
            {['/admin/candidates', '/admin/tests', '/admin/sessions', '/admin/audit-log'].map((to, index) => (
              <button key={to} type="button" className={styles.heroAction} onClick={() => navigate(to)}>
                {['Candidates', 'Tests', 'Sessions', 'Audit Log'][index]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.heroPanel}>
          {[
            { label: 'Pass rate', value: formatPercent(dashboard.pass_rate, 1), tone: 'Cyan', sub: `${dashboard.completed_attempts} completed attempts` },
            { label: 'Awaiting review', value: dashboard.awaiting_review_attempts, tone: 'Amber', sub: 'Submitted attempts needing follow-up' },
            { label: 'High risk', value: dashboard.high_risk_attempts, tone: 'Rose', sub: `${dashboard.medium_risk_attempts} medium-risk attempts` },
            { label: 'Upcoming sessions', value: dashboard.upcoming_count, tone: 'Violet', sub: 'Scheduled learners in the pipeline' },
          ].map((stat) => (
            <div key={stat.label} className={styles.heroStat}>
              <div className={`${styles.heroStatValue} ${styles[`heroStat${stat.tone}`]}`}>{stat.value}</div>
              <div className={styles.heroStatLabel}>{stat.label}</div>
              <div className={styles.heroStatSub}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.attentionStrip}>
        {attentionItems.map((item) => (
          <button key={item.label} type="button" className={styles.attentionChip} onClick={() => navigate(item.to)}>
            <span className={`${styles.attentionDot} ${item.tone}`} />
            <span className={styles.attentionLabel}>{item.label}</span>
            <strong className={styles.attentionValue}>{item.value}</strong>
          </button>
        ))}
      </div>

      <div className={styles.kpiGrid}>
        {kpiCards.map((card) => (
          <button key={card.label} type="button" className={styles.kpiCard} onClick={() => navigate(card.to)}>
            <div className={`${styles.kpiIcon} ${styles[`kpiIcon${card.tone}`]}`}>
              <KpiSvg d={ICONS[card.iconKey]} size={22} />
            </div>
            <div className={styles.kpiContent}>
              <div className={styles.kpiValue}>{card.value}</div>
              <div className={styles.kpiLabel}>{card.label}</div>
              <div className={styles.kpiHelper}>{card.helper}</div>
            </div>
          </button>
        ))}
      </div>

      <DashboardAnalytics
        dashboard={dashboard}
        attemptStatusBreakdown={dashboard.attempt_status_breakdown || []}
        scoreDistribution={dashboard.score_distribution || []}
        roleDistribution={(dashboard.role_distribution || []).filter((item) => item.value > 0)}
        testStatusBreakdown={(dashboard.test_status_breakdown || []).filter((item) => item.value > 0)}
        trendData={dashboard.recent_attempt_trend || []}
      />

      <DashboardOperations
        auditLog={auditLog}
        flaggedAttempts={dashboard.recent_flagged_attempts || []}
        navigate={navigate}
        funnelStats={{
          totalLearners: dashboard.total_learners || 0,
          totalAttempts: dashboard.total_attempts || 0,
          completedAttempts: dashboard.completed_attempts || 0,
          passRate: dashboard.pass_rate || 0,
          awaitingReview: dashboard.awaiting_review_attempts || 0,
        }}
      />
    </div>
  )
}
