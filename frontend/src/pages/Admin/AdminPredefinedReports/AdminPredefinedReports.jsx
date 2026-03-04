import React from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminPredefinedReports.module.scss'

const PREDEFINED = [
  { key: 'exam-performance', title: 'Exam Performance Summary', desc: 'Scores, attempts, pass rate by exam', columns: ['Exam', 'Attempts', 'Avg Score', 'Pass Rate'] },
  { key: 'proctoring-alerts', title: 'Proctoring Alerts', desc: 'Count of HIGH/MEDIUM alerts per attempt', columns: ['Attempt', 'User', 'High Alerts', 'Medium Alerts'] },
  { key: 'learner-activity', title: 'Learner Activity', desc: 'Attempts started and submissions', columns: ['User', 'Attempts', 'Submitted'] },
]

export default function AdminPredefinedReports() {
  const [loadingKey, setLoadingKey] = React.useState('')

  const generate = async (key) => {
    setLoadingKey(key)
    try {
      const res = await adminApi.generatePredefinedReport(key)
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${key}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert(e.response?.data?.detail || 'Failed to generate report')
    } finally {
      setLoadingKey('')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Predefined Reports" subtitle="One-click reports" />
      <div className={styles.grid}>
        {PREDEFINED.map((r) => (
          <div key={r.key} className={styles.card}>
            <div className={styles.title}>{r.title}</div>
            <div className={styles.sub}>{r.desc}</div>
            <div className={styles.colsLabel}>Columns:</div>
            <div className={styles.chips}>{r.columns.map(c => <span key={c} className={styles.chip}>{c}</span>)}</div>
            <button className={styles.btn} onClick={() => generate(r.key)} disabled={loadingKey === r.key}>
              {loadingKey === r.key ? 'Working...' : 'Generate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
