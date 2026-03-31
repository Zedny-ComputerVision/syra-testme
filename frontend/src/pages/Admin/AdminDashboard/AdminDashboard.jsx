import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import Skeleton from '../../../components/Skeleton/Skeleton'
import { readPaginatedItems } from '../../../utils/pagination'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import DashboardAnalytics from './DashboardAnalytics'
import DashboardOperations from './DashboardOperations'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
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
  const { t } = useLanguage()
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
        setError(t('admin_dash_failed_load'))
      } else if (failedPanels > 0) {
        setWarning(t('admin_dash_partial_load'))
      }
    } catch {
      if (!mountedRef.current || loadSequence !== loadSequenceRef.current) return
      setError(t('admin_dash_failed_load'))
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
    { label: t('admin_dash_needs_review'), value: dashboard.awaiting_review_attempts, to: '/admin/attempt-analysis', tone: styles.attentionAmber },
    { label: t('admin_dash_high_risk'), value: dashboard.high_risk_attempts, to: '/admin/candidates', tone: styles.attentionRose },
    { label: t('admin_dash_open_tests'), value: dashboard.open_tests || dashboard.published_tests, to: '/admin/tests', tone: styles.attentionCyan },
    { label: t('admin_dash_upcoming'), value: dashboard.upcoming_count, to: '/admin/sessions', tone: styles.attentionViolet },
  ]

  const kpiCards = [
    { label: t('admin_dash_platform_accounts'), value: formatCompact(dashboard.total_users), helper: `${dashboard.active_users} ${t('admin_dash_active_right_now')}`, iconKey: 'users', tone: 'Blue', to: '/admin/users' },
    { label: t('admin_dash_learners'), value: formatCompact(dashboard.total_learners), helper: `${dashboard.total_instructors} ${t('admin_dash_instructors_supporting')}`, iconKey: 'learners', tone: 'Green', to: '/admin/candidates' },
    { label: t('admin_dash_open_tests'), value: formatCompact(dashboard.open_tests || dashboard.published_tests), helper: `${dashboard.closed_tests} ${t('admin_dash_closed_unpublished')}`, iconKey: 'tests', tone: 'Violet', to: '/admin/tests' },
    { label: t('admin_dash_total_attempts'), value: formatCompact(dashboard.total_attempts), helper: `${dashboard.in_progress_attempts} ${t('admin_dash_currently_in_progress')}`, iconKey: 'attempts', tone: 'Cyan', to: '/admin/attempt-analysis' },
    { label: t('admin_dash_average_score'), value: formatPercent(dashboard.average_score, 1), helper: `${t('admin_dash_best_score')} ${formatPercent(dashboard.best_score, 1)}`, iconKey: 'score', tone: 'Amber', to: '/admin/attempt-analysis' },
    { label: t('admin_dash_pass_rate'), value: formatPercent(dashboard.pass_rate, 1), helper: `${dashboard.completed_attempts} ${t('admin_dash_completed_attempts')}`, iconKey: 'passRate', tone: 'Green', to: '/admin/reports' },
    { label: t('admin_dash_submitted_backlog'), value: formatCompact(dashboard.awaiting_review_attempts), helper: t('admin_dash_awaiting_review'), iconKey: 'alert', tone: 'Amber', to: '/admin/attempt-analysis' },
    { label: t('admin_dash_admin_team'), value: formatCompact(dashboard.total_admins), helper: t('admin_dash_admin_operators'), iconKey: 'users', tone: 'Rose', to: '/admin/users' },
  ]

  if (loading && !hasAnyData) {
    return (
      <div className={styles.page}>
        <AdminPageHeader title={t('admin_dash_title')} subtitle={t('admin_dash_subtitle')}>
          <button type="button" className={styles.refreshButton} disabled>{t('refresh')}</button>
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
      <AdminPageHeader title={t('admin_dash_title')} subtitle={t('admin_dash_subtitle')}>
        <button type="button" className={styles.refreshButton} onClick={() => void loadDashboard({ preserveData: hasAnyData })} disabled={loading || refreshing}>
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </AdminPageHeader>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>{error}</span>
          <button type="button" className={styles.alertButton} onClick={() => void loadDashboard({ preserveData: hasAnyData })} disabled={loading || refreshing}>{t('retry')}</button>
        </div>
      )}
      {warning && (
        <div className={`${styles.alert} ${styles.alertWarning}`}>
          <span>{warning}</span>
          <button type="button" className={styles.alertButton} onClick={() => void loadDashboard({ preserveData: hasAnyData })} disabled={loading || refreshing}>{t('refresh')}</button>
        </div>
      )}

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroEyebrow}>{t('admin_dash_operations_cockpit')}</div>
          <h2 className={styles.heroTitle}>{heroName}</h2>
          <p className={styles.heroSubtitle}>{t('admin_dash_hero_subtitle')}</p>
          <div className={styles.heroMeta}>
            <span>{t('admin_dash_last_refreshed')} {dashboard.generated_at ? formatTime(dashboard.generated_at) : t('admin_dash_just_now')}</span>
            <span>{dashboard.total_attempts} {t('admin_dash_attempts_tracked')}</span>
            <span>{dashboard.total_tests} {t('admin_dash_tests_in_scope')}</span>
          </div>
          <div className={styles.heroActions}>
            {['/admin/candidates', '/admin/tests', '/admin/sessions', '/admin/audit-log'].map((to, index) => (
              <button key={to} type="button" className={styles.heroAction} onClick={() => navigate(to)}>
                {[t('admin_dash_candidates'), t('admin_dash_tests'), t('admin_dash_sessions'), t('admin_dash_audit_log')][index]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.heroPanel}>
          {[
            { label: t('admin_dash_pass_rate'), value: formatPercent(dashboard.pass_rate, 1), tone: 'Cyan', sub: `${dashboard.completed_attempts} ${t('admin_dash_completed_attempts')}` },
            { label: t('admin_dash_needs_review'), value: dashboard.awaiting_review_attempts, tone: 'Amber', sub: t('admin_dash_submitted_needing_followup') },
            { label: t('admin_dash_high_risk'), value: dashboard.high_risk_attempts, tone: 'Rose', sub: `${dashboard.medium_risk_attempts} ${t('admin_dash_medium_risk_attempts')}` },
            { label: t('admin_dash_upcoming_sessions'), value: dashboard.upcoming_count, tone: 'Violet', sub: t('admin_dash_scheduled_pipeline') },
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
