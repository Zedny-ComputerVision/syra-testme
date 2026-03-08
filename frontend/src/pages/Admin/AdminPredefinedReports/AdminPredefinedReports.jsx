import React from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import styles from './AdminPredefinedReports.module.scss'

const PREDEFINED = [
  { key: 'test-performance', title: 'Test Performance Summary', desc: 'Scores, attempts, pass rate by test', columns: ['Test', 'Attempts', 'Avg Score', 'Pass Rate'], audience: 'Admins and instructors', cadence: 'Refreshes from live test results' },
  { key: 'proctoring-alerts', title: 'Proctoring Alerts', desc: 'Count of HIGH/MEDIUM alerts per attempt', columns: ['Attempt', 'User', 'High Alerts', 'Medium Alerts'], audience: 'Admins and proctoring reviewers', cadence: 'Refreshes from live attempt events' },
  { key: 'learner-activity', title: 'Learner Activity', desc: 'Attempts started and submissions', columns: ['User', 'Attempts', 'Submitted'], audience: 'Admins and learner-support teams', cadence: 'Refreshes from live learner activity' },
]

export default function AdminPredefinedReports() {
  const [loadingKey, setLoadingKey] = React.useState('')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const generate = async (key) => {
    const report = PREDEFINED.find((entry) => entry.key === key)
    setLoadingKey(key)
    setError('')
    setNotice('')
    try {
      const res = await adminApi.generatePredefinedReport(key)
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${key}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setNotice(`Downloaded ${report?.title || key} as CSV.`)
    } catch (e) {
      setError(await readBlobErrorMessage(e, 'Failed to generate report.'))
    } finally {
      setLoadingKey('')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Predefined Reports" subtitle="One-click reports" />
      <div className={styles.helper}>Each report exports live server data as CSV using the predefined structure shown on the card.</div>
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      <div className={styles.grid}>
        {PREDEFINED.map((r) => (
          <div key={r.key} className={styles.card}>
            <div className={styles.title}>{r.title}</div>
            <div className={styles.sub}>{r.desc}</div>
            <div className={styles.metaRow}>
              <span className={styles.metaChip}>{r.columns.length} columns</span>
              <span className={styles.metaChip}>CSV export</span>
            </div>
            <div className={styles.metaDetail}>Audience: {r.audience}</div>
            <div className={styles.metaDetail}>{r.cadence}</div>
            <div className={styles.colsLabel}>Columns:</div>
            <div className={styles.chips}>{r.columns.map(c => <span key={c} className={styles.chip}>{c}</span>)}</div>
            <button type="button" className={styles.btn} onClick={() => generate(r.key)} disabled={loadingKey === r.key}>
              {loadingKey === r.key ? 'Working...' : 'Generate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
