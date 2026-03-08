import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import styles from './AdminDashboard.module.scss'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ users: [], exams: [], attempts: [], dashboard: {} })
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const mountedRef = useRef(false)

  const hasAnyData = stats.users.length > 0
    || stats.exams.length > 0
    || stats.attempts.length > 0
    || auditLog.length > 0
    || Object.keys(stats.dashboard || {}).length > 0

  const loadDashboard = async ({ preserveData = false } = {}) => {
    if (preserveData) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')
    setWarning('')

    const results = await Promise.allSettled([
      adminApi.users(),
      adminApi.attempts(),
      adminApi.dashboard(),
      adminApi.auditLog({ limit: 10 }),
      adminApi.allTests(),
    ])

    if (!mountedRef.current) return

    const [usersRes, attemptsRes, dashboardRes, auditRes, testsRes] = results
    const failedPanels = results.filter((result) => result.status === 'rejected').length
    const baseAttempts = attemptsRes.status === 'fulfilled' ? attemptsRes.value.data || [] : []
    const enrichedAttempts = await Promise.all(
      baseAttempts.map(async (attempt) => {
        try {
          const { data: events } = await adminApi.getAttemptEvents(attempt.id)
          const high = (events || []).filter((event) => event.severity === 'HIGH').length
          const med = (events || []).filter((event) => event.severity === 'MEDIUM').length
          return { ...attempt, high_violations: high, med_violations: med }
        } catch {
          return { ...attempt, high_violations: 0, med_violations: 0 }
        }
      }),
    )

    if (!mountedRef.current) return

    setStats({
      users: usersRes.status === 'fulfilled' ? usersRes.value.data || [] : [],
      exams: testsRes.status === 'fulfilled' ? (testsRes.value.data?.items || []).map(normalizeAdminTest) : [],
      attempts: enrichedAttempts,
      dashboard: dashboardRes.status === 'fulfilled' ? dashboardRes.value.data || {} : {},
    })
    setAuditLog(auditRes.status === 'fulfilled' ? auditRes.value.data || [] : [])

    if (failedPanels === results.length) {
      setError('Failed to load dashboard data.')
    } else if (failedPanels > 0) {
      setWarning('Some dashboard panels could not be loaded. Refresh to retry.')
    }

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    mountedRef.current = true
    loadDashboard()
    return () => {
      mountedRef.current = false
    }
  }, [])

  const totalUsers = stats.users.length
  const totalLearners = stats.users.filter((user) => user.role === 'LEARNER').length
  const totalAdmins = stats.users.filter((user) => user.role === 'ADMIN').length
  const totalExams = stats.exams.length > 0 ? stats.exams.length : stats.dashboard.total_exams || 0
  const activeExams = stats.exams.filter((test) => test.status === 'PUBLISHED').length
  const totalAttempts = stats.attempts.length > 0 ? stats.attempts.length : stats.dashboard.total_attempts || 0

  const riskyAttempts = stats.attempts.filter((attempt) => (attempt.high_violations || 0) > 0 || (attempt.med_violations || 0) >= 2)

  const formatTime = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleRefresh = () => {
    loadDashboard({ preserveData: hasAnyData })
  }

  const KPI_CARDS = [
    { label: 'Total Users', value: totalUsers, icon: 'USR', tone: 'blue', to: '/admin/users' },
    { label: 'Candidates', value: totalLearners, icon: 'LRN', tone: 'green', to: '/admin/candidates' },
    { label: 'Admins', value: totalAdmins, icon: 'ADM', tone: 'red', to: '/admin/users' },
    { label: 'Total Tests', value: totalExams, icon: 'TST', tone: 'violet', to: '/admin/tests' },
    { label: 'Published Tests', value: activeExams, icon: 'PUB', tone: 'amber', to: '/admin/tests' },
    { label: 'Total Attempts', value: totalAttempts, icon: 'ATT', tone: 'cyan', to: '/admin/attempt-analysis' },
  ]

  if (loading && !hasAnyData) return <div className={styles.loading}>Loading dashboard...</div>

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
          <button key={card.label} type="button" className={styles.kpiCard} onClick={() => navigate(card.to)}>
            <div className={`${styles.kpiIcon} ${styles[`kpiIcon${card.tone[0].toUpperCase()}${card.tone.slice(1)}`]}`}>{card.icon}</div>
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
            <button type="button" className={styles.viewAllBtn} onClick={() => navigate('/admin/candidates')}>
              View All →
            </button>
          </div>
          {riskyAttempts.length === 0 ? (
            <div className={styles.empty}>No risky attempts.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Test</th><th>User</th><th>Integrity</th><th>Status</th><th></th></tr>
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
                    <td>{attempt.status}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}
                      >
                        Analyze
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
            <button type="button" className={styles.viewAllBtn} onClick={() => navigate('/admin/audit-log')}>
              View All →
            </button>
          </div>
          {auditLog.length === 0 ? (
            <div className={styles.empty}>No activity yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Action</th><th>Resource</th><th>Time</th></tr>
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
