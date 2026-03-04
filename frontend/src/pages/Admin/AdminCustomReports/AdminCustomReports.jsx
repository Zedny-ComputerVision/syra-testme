import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminCustomReports.module.scss'

const DATASETS = {
  attempts: { label: 'Attempts', fetch: () => adminApi.attempts(), columns: ['id', 'exam_title', 'user_name', 'status', 'score', 'submitted_at'] },
  exams: { label: 'Exams', fetch: () => adminApi.exams(), columns: ['id', 'title', 'status', 'exam_type', 'time_limit_minutes', 'category_name'] },
  users: { label: 'Users', fetch: () => adminApi.users(), columns: ['id', 'user_id', 'name', 'email', 'role', 'is_active'] },
}

function toCSV(rows, cols) {
  const header = cols.join(',')
  const lines = rows.map(r => cols.map(c => {
    const v = r[c] ?? ''
    const s = typeof v === 'string' ? v.replace(/"/g, '""') : v
    return `"${s}"`
  }).join(','))
  return [header, ...lines].join('\n')
}

export default function AdminCustomReports() {
  const [datasetKey, setDatasetKey] = useState('attempts')
  const [rows, setRows] = useState([])
  const [selectedCols, setSelectedCols] = useState(DATASETS.attempts.columns)
  const [loading, setLoading] = useState(false)

  const columns = useMemo(() => DATASETS[datasetKey].columns, [datasetKey])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await DATASETS[datasetKey].fetch()
        setRows(data || [])
        setSelectedCols(DATASETS[datasetKey].columns)
      } finally { setLoading(false) }
    }
    load()
  }, [datasetKey])

  const toggleCol = (col) => {
    setSelectedCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
  }

  const exportCSV = () => {
    const csv = toCSV(rows, selectedCols)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${datasetKey}_report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Report Builder" subtitle="Build ad-hoc CSV reports from SYRA data" />

      <div className={styles.controls}>
        <label className={styles.label}>Dataset</label>
        <select className={styles.select} value={datasetKey} onChange={e => setDatasetKey(e.target.value)}>
          {Object.entries(DATASETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelTitle}>Columns</div>
            <div className={styles.muted}>Select columns to include</div>
          </div>
          <button className={styles.btnPrimary} onClick={exportCSV} disabled={loading || selectedCols.length === 0}>
            {loading ? 'Loading...' : 'Export CSV'}
          </button>
        </div>
        <div className={styles.columns}>
          {columns.map(col => (
            <label key={col} className={styles.colChip}>
              <input type="checkbox" checked={selectedCols.includes(col)} onChange={() => toggleCol(col)} />
              <span>{col}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
