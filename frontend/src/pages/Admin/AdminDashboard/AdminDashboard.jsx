import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminDashboard.module.scss'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: [], exams: [], attempts: [], dashboard: {} })
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      adminApi.users(),
      adminApi.exams(),
      adminApi.attempts(),
      adminApi.dashboard(),
      adminApi.auditLog({ limit: 10 }),
    ]).then(([uRes, eRes, aRes, dRes, alRes]) => {
      setStats({
        users: uRes.data || [],
        exams: eRes.data || [],
        attempts: aRes.data || [],
        dashboard: dRes.data || {},
      })
      setAuditLog(alRes.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const totalUsers = stats.users.length
  const totalLearners = stats.users.filter(u => u.role === 'LEARNER').length
  const totalAdmins = stats.users.filter(u => u.role === 'ADMIN').length
  const totalExams = stats.exams.length
  const activeExams = stats.exams.filter(e => e.status === 'OPEN').length
  const totalAttempts = stats.attempts.length

  const riskyAttempts = stats.attempts.filter(a => a.score != null && a.score < 40)

  const formatTime = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const KPI_CARDS = [
    { label: 'Total Users', value: totalUsers, icon: '👥', color: '#3b82f6' },
    { label: 'Candidates', value: totalLearners, icon: '🎓', color: '#10b981' },
    { label: 'Admins', value: totalAdmins, icon: '🔑', color: '#ef4444' },
    { label: 'Total Exams', value: totalExams, icon: '📋', color: '#8b5cf6' },
    { label: 'Active Exams', value: activeExams, icon: '✅', color: '#f59e0b' },
    { label: 'Total Attempts', value: totalAttempts, icon: '📊', color: '#06b6d4' },
  ]

  if (loading) return <div className={styles.loading}>Loading dashboard...</div>

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Admin Dashboard" subtitle="System overview and analytics" />

      <div className={styles.kpiGrid}>
        {KPI_CARDS.map(card => (
          <div key={card.label} className={styles.kpiCard}>
            <div className={styles.kpiIcon} style={{ background: card.color + '22', color: card.color }}>{card.icon}</div>
            <div>
              <div className={styles.kpiValue}>{card.value}</div>
              <div className={styles.kpiLabel}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.tablesRow}>
        <div className={styles.tableCard}>
          <div className={styles.tableCardTitle}>Risky Attempts (Score &lt; 40%)</div>
          {riskyAttempts.length === 0 ? (
            <div className={styles.empty}>No risky attempts.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Exam</th><th>User</th><th>Score</th><th>Status</th></tr>
              </thead>
              <tbody>
                {riskyAttempts.slice(0, 8).map(a => (
                  <tr key={a.id}>
                    <td>{a.exam_title || 'Exam'}</td>
                    <td>{a.user_name || a.user_id || '-'}</td>
                    <td><span style={{ color: '#ef4444', fontWeight: 700 }}>{a.score}%</span></td>
                    <td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableCardTitle}>Recent Activity</div>
          {auditLog.length === 0 ? (
            <div className={styles.empty}>No activity yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Action</th><th>User</th><th>Time</th></tr>
              </thead>
              <tbody>
                {auditLog.slice(0, 8).map((log, i) => (
                  <tr key={i}>
                    <td>{log.action || log.event_type || '-'}</td>
                    <td>{log.user_id || '-'}</td>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.78rem' }}>{formatTime(log.created_at)}</td>
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
