import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import Skeleton from '../../../components/Skeleton/Skeleton'
import { readPaginatedItems, readPaginatedTotal } from '../../../utils/pagination'
import styles from './AdminDashboard.module.scss'

const KpiSvg = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
)

const ICONS = {
  users:      'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  learner:    'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
  admin:      'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  tests:      'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  published:  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  attempts:   'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
}

const DASHBOARD_ATTEMPT_LIMIT = 10

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    attempts: [],
    attemptTotal: 0,
    dashboard: {},
  })
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const mountedRef = useRef(false)
  const loadSequenceRef = useRef(0)

  const hasAnyData = stats.attempts.length > 0
    || auditLog.length > 0
    || Object.keys(stats.dashboard || {}).length > 0

  const loadDashboard = async ({ preserveData = false } = {}) => {
    const loadSequence = loadSequenceRef.current + 1
    loadSequenceRef.current = loadSequence

    if (preserveData) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')
    setWarning('')

    try {
      const results = await Promise.allSettled([
        adminApi.dashboard(),
        adminApi.auditLog({ skip: 0, limit: 10 }),
        adminApi.attempts({ skip: 0, limit: DASHBOARD_ATTEMPT_LIMIT }),
      ])

      if (!mountedRef.current || loadSequence !== loadSequenceRef.current) return

      const [dashboardRes, auditRes, attemptsRes] = results
      const failedPanels = results.filter((result) => result.status === 'rejected').length
      const dashboardData = dashboardRes.status === 'fulfilled' ? dashboardRes.value.data || {} : {}
      const auditItems = auditRes.status === 'fulfilled' ? readPaginatedItems(auditRes.value.data) : []
      const baseAttempts = attemptsRes.status === 'fulfilled' ? readPaginatedItems(attemptsRes.value.data) : []
      const attemptTotal = attemptsRes.status === 'fulfilled' ? readPaginatedTotal(attemptsRes.value.data) : 0

      setStats({
        attempts: baseAttempts,
        attemptTotal,
        dashboard: dashboardData,
      })
      setAuditLog(auditItems)

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
    loadDashboard()
    return () => {
      mountedRef.current = false
    }
  }, [])

  const totalUsers = stats.dashboard.total_users ?? 0
  const totalLearners = stats.dashboard.total_learners ?? 0
  const totalAdmins = stats.dashboard.total_admins ?? 0
  const totalTests = stats.dashboard.total_tests ?? stats.dashboard.total_exams ?? 0
  const publishedTests = stats.dashboard.published_tests ?? 0
  const totalAttempts = stats.dashboard.total_attempts ?? stats.attemptTotal ?? stats.attempts.length

  const riskyAttempts = stats.attempts.filter((attempt) => (attempt.high_violations || 0) > 0 || (attempt.med_violations || 0) >= 2)

  const formatTime = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleRefresh = () => {
    loadDashboard({ preserveData: hasAnyData })
  }

  const KPI_CARDS = [
    { label: 'Total Users',     value: totalUsers,    iconKey: 'users',     tone: 'Blue',   to: '/admin/users' },
    { label: 'Candidates',      value: totalLearners, iconKey: 'learner',   tone: 'Green',  to: '/admin/candidates' },
    { label: 'Admins',          value: totalAdmins,   iconKey: 'admin',     tone: 'Red',    to: '/admin/users' },
    { label: 'Total Tests',     value: totalTests,    iconKey: 'tests',     tone: 'Violet', to: '/admin/tests' },
    { label: 'Published Tests', value: publishedTests, iconKey: 'published', tone: 'Amber',  to: '/admin/tests' },
    { label: 'Total Attempts',  value: totalAttempts, iconKey: 'attempts',  tone: 'Cyan',   to: '/admin/attempt-analysis' },
  ]

  if (loading && !hasAnyData) {
    return (
      <div className={styles.page}>
        <AdminPageHeader title="Admin Dashboard" subtitle="System overview and analytics">
          <button type="button" className={styles.refreshButton} disabled>
            Refresh
          </button>
        </AdminPageHeader>
        <div className={styles.kpiGrid}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="card" className={styles.kpiSkeleton} />
          ))}
        </div>
        <div className={styles.tablesRow}>
          <div className={styles.tableCard}>
            <div className={styles.tableCardHeader}>
              <div className={styles.tableCardTitle}>Risky Attempts</div>
            </div>
            <div className={styles.tableBodySkeleton}>
              <Skeleton variant="table" rows={5} />
            </div>
          </div>
          <div className={styles.tableCard}>
            <div className={styles.tableCardHeader}>
              <div className={styles.tableCardTitle}>Recent Activity</div>
            </div>
            <div className={styles.tableBodySkeleton}>
              <Skeleton variant="table" rows={5} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Admin Dashboard" subtitle="System overview and analytics">
        <button
          type="button"
          className={styles.refreshButton}
          onClick={handleRefresh}
          disabled={loading || refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </AdminPageHeader>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>{error}</span>
          <button type="button" className={styles.alertButton} onClick={handleRefresh} disabled={loading || refreshing}>
            Retry
          </button>
        </div>
      )}
      {warning && (
        <div className={`${styles.alert} ${styles.alertWarning}`}>
          <span>{warning}</span>
          <button type="button" className={styles.alertButton} onClick={handleRefresh} disabled={loading || refreshing}>
            Refresh
          </button>
        </div>
      )}

      <div className={styles.kpiGrid}>
        {KPI_CARDS.map((card) => (
          <button
            key={card.label}
            type="button"
            className={styles.kpiCard}
            onClick={() => navigate(card.to)}
          >
            <div className={`${styles.kpiIcon} ${styles[`kpiIcon${card.tone}`]}`}>
              <KpiSvg d={ICONS[card.iconKey]} size={22} />
            </div>
            <div>
              <div className={styles.kpiValue}>{card.value}</div>
              <div className={styles.kpiLabel}>{card.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className={styles.tablesRow}>
        <div className={styles.tableCard}>
          <div className={styles.tableCardHeader}>
            <div className={styles.tableCardTitle}>
              Risky Attempts <span className={styles.countBadge}>{riskyAttempts.length}</span>
            </div>
            <button
              type="button"
              className={styles.viewAllBtn}
              onClick={() => navigate('/admin/candidates')}
              aria-label="Open candidates queue"
            >
              Candidates queue
            </button>
          </div>
          {riskyAttempts.length === 0 ? (
            <div className={styles.empty}>No risky attempts detected.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>User</th>
                  <th>Integrity</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {riskyAttempts.slice(0, 10).map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{attempt.test_title || attempt.exam_title || 'Test'}</td>
                    <td>{attempt.user_name || attempt.user_id || '-'}</td>
                    <td>
                      <span className={styles.integrityScore}>
                        {Math.max(0, 100 - (attempt.high_violations || 0) * 18 - (attempt.med_violations || 0) * 9)}%
                      </span>
                    </td>
                    <td>
                      <span className={styles[`status${attempt.status}`] || styles.statusChip}>
                        {attempt.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}
                        aria-label={`Review attempt for ${attempt.user_name || attempt.user_id || 'learner'} on ${attempt.test_title || attempt.exam_title || 'test'}`}
                      >
                        Review attempt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableCardHeader}>
            <div className={styles.tableCardTitle}>
              Recent Activity <span className={styles.countBadge}>{auditLog.length}</span>
            </div>
            <button
              type="button"
              className={styles.viewAllBtn}
              onClick={() => navigate('/admin/audit-log')}
              aria-label="Open audit log"
            >
              Audit log
            </button>
          </div>
          {auditLog.length === 0 ? (
            <div className={styles.empty}>No activity yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.slice(0, 10).map((log, index) => (
                  <tr key={`${log.id || log.created_at || index}`}>
                    <td>{log.action || log.event_type || '-'}</td>
                    <td className={styles.mutedCell}>{log.resource_type || log.user_id || '-'}</td>
                    <td className={styles.mutedCell}>{formatTime(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
