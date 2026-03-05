import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminCandidates.module.scss'

const TABS = ['Test Attempts', 'Proctoring', 'Rescheduling', 'Imported Results']
const STATUS_FILTERS = ['All', 'Attempted', 'Passed', 'Failed', 'Not Graded']

function parseCSV(text) {
  const [headerLine, ...lines] = text.trim().split('\n')
  const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

export default function AdminCandidates() {
  const navigate = useNavigate()
  const fileRef = useRef()
  const [tab, setTab] = useState('Test Attempts')
  const [attempts, setAttempts] = useState([])
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [examFilter, setExamFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Rescheduling state
  const [rescheduleId, setRescheduleId] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleNotes, setRescheduleNotes] = useState('')
  const [rescheduleMsg, setRescheduleMsg] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [downloadMsg, setDownloadMsg] = useState('')

  // Import state
  const [csvRows, setCsvRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([adminApi.attempts(), adminApi.exams()])
      .then(([aRes, eRes]) => {
        setAttempts(aRes.data || [])
        setExams(eRes.data || [])
      }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = attempts.filter(a => {
    const matchExam = !examFilter || a.exam_id === examFilter
    let matchStatus = true
    if (statusFilter === 'Attempted') matchStatus = !!a.submitted_at
    else if (statusFilter === 'Passed') matchStatus = a.score != null && a.score >= 60
    else if (statusFilter === 'Failed') matchStatus = a.score != null && a.score < 60
    else if (statusFilter === 'Not Graded') matchStatus = a.score == null
    return matchExam && matchStatus
  })

  const riskyAttempts = attempts.filter(a => a.score != null && a.score < 40)
  const completedAttempts = attempts.filter(a => a.status === 'GRADED' || a.status === 'SUBMITTED' || a.status === 'COMPLETED')

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'

  const getDuration = (a) => {
    if (!a.started_at || !a.submitted_at) return '-'
    const ms = new Date(a.submitted_at) - new Date(a.started_at)
    return `${Math.floor(ms / 60000)}m`
  }

  const handleReschedule = async (attempt) => {
    if (!rescheduleDate) { setRescheduleMsg('Please pick a date and time.'); return }
    setRescheduling(true)
    setRescheduleMsg('')
    try {
      await adminApi.createSchedule({
        exam_id: attempt.exam_id,
        user_id: attempt.user_id,
        scheduled_at: new Date(rescheduleDate).toISOString(),
        access_mode: 'INVITE_ONLY',
        notes: rescheduleNotes || 'Rescheduled by admin',
      })
      setRescheduleMsg(`Rescheduled for ${attempt.user_name || attempt.user_id}`)
      setRescheduleId(null)
      setRescheduleDate('')
      setRescheduleNotes('')
    } catch (e) {
      setRescheduleMsg(e.response?.data?.detail || 'Failed to create schedule')
    } finally { setRescheduling(false) }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target.result)
        setCsvRows(rows)
        setImportMsg('')
      } catch {
        setImportMsg('Could not parse CSV. Check the format.')
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!csvRows.length) return
    setImporting(true)
    setImportMsg('')
    try {
      const { data } = await adminApi.importAttempts(csvRows)
      setImportMsg(`Imported ${data.length} result(s) successfully.`)
      setCsvRows([])
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (e) {
      setImportMsg(e.response?.data?.detail || 'Import failed.')
    } finally { setImporting(false) }
  }

  const handleDownloadReport = async (attemptId) => {
    setDownloadMsg('')
    try {
      const { data } = await adminApi.generateReport(attemptId)
      const blob = new Blob([data], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proctoring-report-${attemptId.slice(0, 8)}.html`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDownloadMsg(e.response?.data?.detail || 'Report download failed')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Candidates" subtitle="Monitor test attempts and proctoring" />

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Test Attempts' && (
        <>
          <div className={styles.filterRow}>
            <select className={styles.filterSelect} value={examFilter} onChange={e => setExamFilter(e.target.value)}>
              <option value="">All Exams</option>
              {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
            </select>
            {downloadMsg && <div className={styles.importMsg}>{downloadMsg}</div>}
          </div>
          <div className={styles.statusFilters}>
            {STATUS_FILTERS.map(f => (
              <button key={f} className={`${styles.statusBtn} ${statusFilter === f ? styles.statusBtnActive : ''}`} onClick={() => setStatusFilter(f)}>
                {f}
                <span className={styles.statusCount}>
                  {f === 'All' ? attempts.length
                    : f === 'Attempted' ? attempts.filter(a => !!a.submitted_at).length
                    : f === 'Passed' ? attempts.filter(a => a.score != null && a.score >= 60).length
                    : f === 'Failed' ? attempts.filter(a => a.score != null && a.score < 60).length
                    : attempts.filter(a => a.score == null).length}
                </span>
              </button>
            ))}
          </div>
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.empty}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>No attempts found.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>User</th><th>Exam</th><th>Status</th><th>Score</th>
                    <th>Date</th><th>Duration</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}>
                      <td>{a.user_name || a.user_id || '-'}</td>
                      <td>{a.exam_title || '-'}</td>
                      <td>
                        <span className={`${styles.badge} ${a.status === 'COMPLETED' ? styles.badgePass : a.status === 'IN_PROGRESS' ? styles.badgePending : styles.badgeFail}`}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ color: a.score != null && a.score < 60 ? '#ef4444' : 'var(--color-text)' }}>
                        {a.score != null ? `${a.score}%` : '-'}
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.82rem' }}>{formatDate(a.started_at)}</td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.82rem' }}>{getDuration(a)}</td>
                      <td>
                        <button className={styles.actionBtn} onClick={() => navigate(`/admin/attempt-analysis?id=${a.id}`)}>View</button>
                        <button className={styles.actionBtn} onClick={() => handleDownloadReport(a.id)} style={{ marginLeft: '0.4rem' }}>
                          Download Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'Proctoring' && (
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.empty}>Loading...</div>
          ) : riskyAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🛡️</div>
              <div className={styles.emptyText}>No high-risk attempts detected.</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th><th>Exam</th><th>Score</th><th>Integrity</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riskyAttempts.map(a => {
                  const integrity = 100 - (a.high_violations || 0) * 18 - (a.med_violations || 0) * 9
                  const intColor = integrity >= 70 ? '#10b981' : integrity >= 40 ? '#fbbf24' : '#ef4444'
                  return (
                    <tr key={a.id}>
                      <td>{a.user_name || a.user_id || '-'}</td>
                      <td>{a.exam_title || '-'}</td>
                      <td style={{ color: '#ef4444', fontWeight: 700 }}>{a.score != null ? `${a.score}%` : '-'}</td>
                      <td style={{ color: intColor, fontWeight: 700 }}>{Math.max(0, integrity)}%</td>
                      <td><span className={styles.severityHigh}>HIGH RISK</span></td>
                      <td>
                        <button className={styles.actionBtn} onClick={() => navigate(`/admin/attempt-analysis?id=${a.id}`)}>View Report</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Rescheduling' && (
        <div className={styles.tableWrap}>
          {rescheduleMsg && <div className={styles.importMsg}>{rescheduleMsg}</div>}
          {completedAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📅</div>
              <div className={styles.emptyText}>No completed attempts available for rescheduling.</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th><th>Exam</th><th>Score</th><th>Submitted</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedAttempts.map(a => (
                  <React.Fragment key={a.id}>
                    <tr>
                      <td>{a.user_name || a.user_id || '-'}</td>
                      <td>{a.exam_title || '-'}</td>
                      <td style={{ color: a.score != null && a.score < 60 ? '#ef4444' : 'var(--color-text)' }}>
                        {a.score != null ? `${a.score}%` : '-'}
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.82rem' }}>{formatDate(a.submitted_at)}</td>
                      <td>
                        <button
                          className={styles.actionBtn}
                          onClick={() => setRescheduleId(rescheduleId === a.id ? null : a.id)}
                        >
                          {rescheduleId === a.id ? 'Cancel' : 'Reschedule'}
                        </button>
                      </td>
                    </tr>
                    {rescheduleId === a.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--color-surface)', padding: '1rem' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div>
                              <div className={styles.label}>New Date &amp; Time</div>
                              <input
                                type="datetime-local"
                                className={styles.filterSelect}
                                value={rescheduleDate}
                                onChange={e => setRescheduleDate(e.target.value)}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className={styles.label}>Notes (optional)</div>
                              <input
                                className={styles.filterSelect}
                                style={{ width: '100%' }}
                                placeholder="Reason for reschedule"
                                value={rescheduleNotes}
                                onChange={e => setRescheduleNotes(e.target.value)}
                              />
                            </div>
                            <button
                              className={styles.actionBtn}
                              disabled={rescheduling}
                              onClick={() => handleReschedule(a)}
                            >
                              {rescheduling ? 'Saving...' : 'Confirm'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Imported Results' && (
        <div className={styles.tableWrap}>
          <div className={styles.importBox}>
            <div className={styles.sectionTitle}>Import Results from CSV</div>
            <div className={styles.importHint}>
              CSV must have columns: <code>user_id</code>, <code>exam_title</code>, <code>score</code>
              <br />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                user_id can be the student ID or email. Score is 0–100.
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className={styles.filterSelect} />
              {csvRows.length > 0 && (
                <button className={styles.actionBtn} onClick={handleImport} disabled={importing}>
                  {importing ? 'Importing...' : `Import ${csvRows.length} row(s)`}
                </button>
              )}
            </div>
            {importMsg && <div className={styles.importMsg}>{importMsg}</div>}
          </div>

          {csvRows.length > 0 && (
            <>
              <div className={styles.sectionTitle} style={{ marginTop: '1.5rem' }}>Preview</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {Object.keys(csvRows[0]).map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => <td key={j}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 20 && (
                <div className={styles.importHint}>Showing first 20 of {csvRows.length} rows.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
