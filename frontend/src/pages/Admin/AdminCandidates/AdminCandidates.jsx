import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import useAuth from '../../../hooks/useAuth'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import { readPaginatedItems } from '../../../utils/pagination'
import styles from './AdminCandidates.module.scss'

const BASE_TABS = ['Test Attempts', 'Proctoring', 'Imported Results']
const STATUS_FILTERS = ['All', 'Attempted', 'Passed', 'Failed', 'Not Graded']
const REQUIRED_IMPORT_COLUMNS = ['user_id', 'score']

function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    const next = normalized[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell.trim())
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }
  if (!rows.length) return []

  const headers = rows[0].map((header) => header.replace(/^"|"$/g, ''))
  return rows.slice(1)
    .filter((cols) => cols.some((col) => col !== ''))
    .map((cols) => Object.fromEntries(headers.map((header, index) => [header, cols[index] ?? ''])))
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getDuration(attempt) {
  if (!attempt.started_at || !attempt.submitted_at) return '-'
  const ms = new Date(attempt.submitted_at) - new Date(attempt.started_at)
  return `${Math.max(0, Math.floor(ms / 60000))}m`
}

function getStatusCount(filterName, attempts, passingScoreMap = {}) {
  if (filterName === 'All') return attempts.length
  if (filterName === 'Attempted') return attempts.filter((attempt) => !!attempt.submitted_at).length
  if (filterName === 'Passed') return attempts.filter((attempt) => {
    const threshold = passingScoreMap[attempt.exam_id] ?? 60
    return !attempt.pending_manual_review && attempt.score != null && attempt.score >= threshold
  }).length
  if (filterName === 'Failed') return attempts.filter((attempt) => {
    const threshold = passingScoreMap[attempt.exam_id] ?? 60
    return !attempt.pending_manual_review && attempt.score != null && attempt.score < threshold
  }).length
  return attempts.filter((attempt) => attempt.score == null || attempt.pending_manual_review).length
}

function getSortLabel(sortField, sortDir, field) {
  if (sortField !== field) return ''
  return sortDir === 'desc' ? ' (desc)' : ' (asc)'
}

function getRiskLabel(attempt) {
  const high = attempt.high_violations || 0
  const medium = attempt.med_violations || 0
  if (!high && !medium) {
    return { text: 'Clean', tone: styles.riskTextClean }
  }
  const parts = []
  if (high) parts.push(`${high} high`)
  if (medium) parts.push(`${medium} medium`)
  return {
    text: parts.join(' | '),
    tone: high ? styles.riskTextHigh : styles.riskTextMedium,
  }
}

export default function AdminCandidates() {
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()
  const [tab, setTab] = useState('Test Attempts')
  const [attempts, setAttempts] = useState([])
  const [tests, setTests] = useState([])
  const [passingScoreMap, setPassingScoreMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [examFilter, setExamFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [rescheduleId, setRescheduleId] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleNotes, setRescheduleNotes] = useState('')
  const [rescheduleMsg, setRescheduleMsg] = useState('')
  const [reschedulingId, setReschedulingId] = useState('')
  const [downloadMsg, setDownloadMsg] = useState('')
  const [downloadBusyId, setDownloadBusyId] = useState('')

  const [csvRows, setCsvRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const canAssignSchedules = hasPermission?.('Assign Schedules')
  const tabs = canAssignSchedules
    ? ['Test Attempts', 'Proctoring', 'Rescheduling', 'Imported Results']
    : BASE_TABS

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await adminApi.attempts({ skip: 0, limit: 200 })
      const enriched = readPaginatedItems(data).map((attempt) => ({
        ...attempt,
        high_violations: Number(attempt.high_violations || 0),
        med_violations: Number(attempt.med_violations || 0),
      }))

      const uniqueTests = new Map()
      enriched.forEach((attempt) => {
        if (!attempt.exam_id || uniqueTests.has(attempt.exam_id)) {
          return
        }
        uniqueTests.set(attempt.exam_id, normalizeAdminTest({
          id: attempt.exam_id,
          title: attempt.test_title || attempt.exam_title || 'Test',
        }))
      })

      let scoreMap = {}
      try {
        const { data: testsData } = await adminApi.allTests({ page_size: 200 })
        ;(testsData?.items || []).forEach((t) => {
          if (t.id && t.passing_score != null) scoreMap[t.id] = t.passing_score
        })
      } catch { /* non-critical */ }
      setAttempts(enriched)
      setTests(Array.from(uniqueTests.values()))
      setPassingScoreMap(scoreMap)
    } catch (error) {
      setAttempts([])
      setTests([])
      setPassingScoreMap({})
      setLoadError(error.response?.data?.detail || 'Failed to load candidates data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!tabs.includes(tab)) {
      setTab(tabs[0])
    }
  }, [tab, tabs])

  const filtered = attempts.filter((attempt) => {
    const matchExam = !examFilter || attempt.exam_id === examFilter
    const q = search.trim().toLowerCase()
    const matchSearch = !q
      || (attempt.user_name || '').toLowerCase().includes(q)
      || (attempt.user_email || '').toLowerCase().includes(q)
      || (attempt.test_title || attempt.exam_title || '').toLowerCase().includes(q)
    const matchDateFrom = !dateFrom || new Date(attempt.started_at) >= new Date(dateFrom)
    const matchDateTo = !dateTo || new Date(attempt.started_at) <= new Date(`${dateTo}T23:59:59`)
    let matchStatus = true
    if (statusFilter === 'Attempted') matchStatus = !!attempt.submitted_at
    else if (statusFilter === 'Passed') { const t = passingScoreMap[attempt.exam_id] ?? 60; matchStatus = !attempt.pending_manual_review && attempt.score != null && attempt.score >= t }
    else if (statusFilter === 'Failed') { const t = passingScoreMap[attempt.exam_id] ?? 60; matchStatus = !attempt.pending_manual_review && attempt.score != null && attempt.score < t }
    else if (statusFilter === 'Not Graded') matchStatus = attempt.score == null || attempt.pending_manual_review
    return matchExam && matchSearch && matchDateFrom && matchDateTo && matchStatus
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'score') {
      const sa = a.score != null ? a.score : -1
      const sb = b.score != null ? b.score : -1
      return sortDir === 'desc' ? sb - sa : sa - sb
    }
    const da = a.started_at ? new Date(a.started_at).getTime() : 0
    const db = b.started_at ? new Date(b.started_at).getTime() : 0
    return sortDir === 'desc' ? db - da : da - db
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const previewHeaders = csvRows.length > 0 ? Object.keys(csvRows[0]) : []
  const missingImportColumns = REQUIRED_IMPORT_COLUMNS.filter((column) => !previewHeaders.includes(column))
  const hasImportTitle = previewHeaders.includes('test_title') || previewHeaders.includes('exam_title')
  if (csvRows.length > 0 && !hasImportTitle) {
    missingImportColumns.push('test_title or exam_title')
  }
  const hasActiveFilters = Boolean(search.trim() || examFilter || dateFrom || dateTo || statusFilter !== 'All')

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortField(field); setSortDir('desc') }
    setPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setExamFilter('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('All')
    setSortField('date')
    setSortDir('desc')
    setPage(1)
  }

  const exportCSV = () => {
    const rows = [
      ['User', 'Email', 'Test', 'Status', 'Score', 'Date', 'Duration'],
      ...sorted.map((a) => [
        a.user_name || a.user_id || '',
        a.user_email || '',
        a.test_title || a.exam_title || '',
        a.status || '',
        a.score != null ? a.score : '',
        formatDate(a.started_at),
        getDuration(a),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'attempts-export.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const riskyAttempts = attempts.filter((attempt) => (attempt.high_violations || 0) > 0 || (attempt.med_violations || 0) >= 2)
  const completedAttempts = attempts.filter((attempt) => ['GRADED', 'SUBMITTED', 'COMPLETED'].includes(attempt.status))
  let summaryCards = [
    { label: 'Loaded attempts', value: attempts.length, sub: 'All candidate records currently loaded' },
    { label: 'Matching filters', value: sorted.length, sub: hasActiveFilters ? 'Active filters applied' : 'Showing all attempts' },
    { label: 'High risk', value: riskyAttempts.length, sub: 'Attempts with notable proctoring alerts' },
    { label: 'Tracked tests', value: tests.length, sub: 'Unique tests represented in the attempt feed' },
  ]

  if (tab === 'Proctoring') {
    summaryCards = [
      { label: 'Flagged attempts', value: riskyAttempts.length, sub: 'High or repeated medium proctoring alerts' },
      { label: 'Total attempts', value: attempts.length, sub: 'All attempts monitored by this page' },
      { label: 'Highest-risk queue', value: riskyAttempts.filter((attempt) => (attempt.high_violations || 0) > 0).length, sub: 'At least one high-severity alert' },
      { label: 'Clean attempts', value: Math.max(attempts.length - riskyAttempts.length, 0), sub: 'No follow-up needed right now' },
    ]
  } else if (tab === 'Rescheduling') {
    summaryCards = [
      { label: 'Eligible attempts', value: completedAttempts.length, sub: 'Completed or graded attempts that can be rescheduled' },
      { label: 'Pending action', value: rescheduleId ? 1 : 0, sub: rescheduleId ? 'A reschedule draft is open below' : 'No reschedule draft open' },
      { label: 'Loaded attempts', value: attempts.length, sub: 'All attempt rows available to review' },
      { label: 'Flagged attempts', value: riskyAttempts.length, sub: 'Useful context before rescheduling' },
    ]
  } else if (tab === 'Imported Results') {
    summaryCards = [
      { label: 'Preview rows', value: csvRows.length, sub: csvRows.length ? 'Rows ready to validate or import' : 'Upload a CSV to start' },
      { label: 'Detected columns', value: previewHeaders.length, sub: previewHeaders.length ? previewHeaders.join(', ') : 'Waiting for CSV headers' },
      { label: 'Required columns', value: missingImportColumns.length ? 'Missing' : 'Ready', sub: missingImportColumns.length ? missingImportColumns.join(', ') : 'Ready to import when preview looks correct' },
      { label: 'Imported attempts', value: attempts.length, sub: 'Imported records will merge into this attempt list' },
    ]
  }

  const handleReschedule = async (attempt) => {
    if (!rescheduleDate) {
      setRescheduleMsg('Please pick a date and time.')
      return
    }
    setReschedulingId(String(attempt.id))
    setRescheduleMsg('')
    try {
      const { data: schedules } = await adminApi.schedules()
      const existing = (schedules || []).find(
        (schedule) =>
          String(schedule.exam_id) === String(attempt.exam_id)
          && String(schedule.user_id) === String(attempt.user_id),
      )
      const payload = {
        scheduled_at: new Date(rescheduleDate).toISOString(),
        access_mode: 'RESTRICTED',
        notes: rescheduleNotes.trim() || 'Rescheduled by admin',
      }
      if (existing?.id) {
        await adminApi.updateSchedule(existing.id, payload)
      } else {
        await adminApi.createSchedule({
          exam_id: attempt.exam_id,
          user_id: attempt.user_id,
          ...payload,
        })
      }
      setRescheduleMsg(`Rescheduled for ${attempt.user_name || attempt.user_id}.`)
      setRescheduleId(null)
      setRescheduleDate('')
      setRescheduleNotes('')
      await load()
    } catch (error) {
      setRescheduleMsg(error.response?.data?.detail || 'Failed to save schedule')
    } finally {
      setReschedulingId('')
    }
  }

  const toggleReschedule = (attemptId) => {
    setRescheduleMsg('')
    if (rescheduleId === attemptId) {
      setRescheduleId(null)
      setRescheduleDate('')
      setRescheduleNotes('')
      return
    }
    setRescheduleId(attemptId)
    setRescheduleDate('')
    setRescheduleNotes('')
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const rows = parseCSV(loadEvent.target.result)
        setCsvRows(rows)
        setImportMsg(rows.length ? '' : 'No data rows were found in the selected CSV.')
      } catch {
        setCsvRows([])
        setImportMsg('Could not parse CSV. Check the format and try again.')
      }
    }
    reader.readAsText(file)
  }

  const clearImportPreview = () => {
    setCsvRows([])
    setImportMsg('')
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (!csvRows.length) return
    if (missingImportColumns.length > 0) {
      setImportMsg(`Missing required columns: ${missingImportColumns.join(', ')}`)
      return
    }
    setImporting(true)
    setImportMsg('')
    try {
      const { data } = await adminApi.importAttempts(csvRows)
      setImportMsg(`Imported ${data.length} result(s) successfully.`)
      setCsvRows([])
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (error) {
      setImportMsg(error.response?.data?.detail || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadReport = async (attemptId) => {
    setDownloadMsg('')
    setDownloadBusyId(String(attemptId))
    try {
      const { data } = await adminApi.generateReport(attemptId)
      const blob = new Blob([data], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `proctoring-report-${String(attemptId).slice(0, 8)}.html`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setDownloadMsg('Report download started.')
    } catch (error) {
      setDownloadMsg(await readBlobErrorMessage(error, 'Report download failed.'))
    } finally {
      setDownloadBusyId('')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Candidates" subtitle="Monitor attempt quality, review proctoring risk, and repair imported or rescheduled records." />
      {loadError && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>{loadError}</span>
          <button type="button" className={styles.alertButton} onClick={() => void load()} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      <div className={styles.tabs}>
        {tabs.map((tabName) => (
          <button type="button" key={tabName} className={`${styles.tab} ${tab === tabName ? styles.tabActive : ''}`} onClick={() => setTab(tabName)}>{tabName}</button>
        ))}
      </div>

      <div className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.sub}</div>
          </div>
        ))}
      </div>

      {tab === 'Test Attempts' && (
        <>
          <div className={styles.filterPanel}>
            <div className={styles.filterRow}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by learner, email, or test"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              />
              <select
                className={styles.filterSelect}
                value={examFilter}
                onChange={(event) => { setExamFilter(event.target.value); setPage(1) }}
              >
                <option value="">All Tests</option>
                {tests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.name}{test.code ? ` (${test.code})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className={styles.dateInput}
                title="From date"
                value={dateFrom}
                onChange={(event) => { setDateFrom(event.target.value); setPage(1) }}
              />
              <input
                type="date"
                className={styles.dateInput}
                title="To date"
                value={dateTo}
                onChange={(event) => { setDateTo(event.target.value); setPage(1) }}
              />
              <button type="button" className={styles.exportBtn} onClick={exportCSV} disabled={sorted.length === 0}>
                Export CSV
              </button>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                Clear filters
              </button>
              <div className={styles.filterMeta}>
                Showing {sorted.length} matching attempt{sorted.length !== 1 ? 's' : ''} across {attempts.length} loaded.
              </div>
            </div>
            {downloadMsg && <div className={styles.importMsg}>{downloadMsg}</div>}
          </div>
          <div className={styles.statusFilters}>
            {STATUS_FILTERS.map((filterName) => (
              <button
                type="button"
                key={filterName}
                className={`${styles.statusBtn} ${statusFilter === filterName ? styles.statusBtnActive : ''}`}
                onClick={() => {
                  setStatusFilter(filterName)
                  setPage(1)
                }}
              >
                {filterName}
                <span className={styles.statusCount}>{getStatusCount(filterName, attempts, passingScoreMap)}</span>
              </button>
            ))}
          </div>
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.empty}>Loading candidate attempts...</div>
            ) : attempts.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>No attempts yet</div>
                <div className={styles.emptyText}>Candidate activity will appear here after learners start or submit tests.</div>
              </div>
            ) : paginated.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>No matches</div>
                <div className={styles.emptyText}>No attempts match the current filters. Clear the filters to see the full queue again.</div>
                <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>User</th><th>Test</th><th>Status</th>
                    <th>
                      <button type="button" className={styles.sortBtn} onClick={() => toggleSort('score')}>
                        Score{getSortLabel(sortField, sortDir, 'score')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={styles.sortBtn} onClick={() => toggleSort('date')}>
                        Date{getSortLabel(sortField, sortDir, 'date')}
                      </button>
                    </th>
                    <th>Duration</th><th>Risk</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((attempt) => {
                    const risk = getRiskLabel(attempt)
                    return (
                      <tr key={attempt.id}>
                        <td>
                          <div>{attempt.user_name || attempt.user_id || '-'}</div>
                          {attempt.user_email && <div className={styles.mutedSub}>{attempt.user_email}</div>}
                        </td>
                        <td>
                          <div>{attempt.test_title || attempt.exam_title || '-'}</div>
                          <div className={styles.mutedSub}>{attempt.exam_id ? `Test ID: ${attempt.exam_id}` : 'Legacy import row'}</div>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${attempt.status === 'COMPLETED' ? styles.badgePass : attempt.status === 'IN_PROGRESS' ? styles.badgePending : styles.badgeFail}`}>
                            {attempt.status || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className={attempt.score != null && attempt.score < 60 ? styles.scoreFail : ''}>
                          {attempt.score != null ? `${attempt.score}%` : '-'}
                        </td>
                        <td className={styles.mutedCell}>{formatDate(attempt.started_at)}</td>
                        <td className={styles.mutedCell}>{getDuration(attempt)}</td>
                        <td>
                          <span className={`${styles.riskText} ${risk.tone}`}>{risk.text}</span>
                        </td>
                        <td className={styles.actionCell}>
                          <div className={styles.actionGroup}>
                            <button type="button" className={styles.actionBtn} onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}>Open Analysis</button>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => void handleDownloadReport(attempt.id)}
                              disabled={downloadBusyId === String(attempt.id)}
                            >
                              {downloadBusyId === String(attempt.id) ? 'Downloading...' : 'Download Report'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>{sorted.length} result{sorted.length !== 1 ? 's' : ''} | Page {page} of {totalPages}</span>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          )}
        </>
      )}

      {tab === 'Proctoring' && (
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.empty}>Loading proctoring risk...</div>
          ) : attempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>No attempts yet</div>
              <div className={styles.emptyText}>Proctoring review appears here once learners generate attempt activity.</div>
            </div>
          ) : riskyAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>Queue clear</div>
              <div className={styles.emptyText}>No high-risk attempts are waiting for review right now.</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th><th>Test</th><th>Alerts</th><th>Score</th><th>Integrity</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riskyAttempts.map((attempt) => {
                  const integrity = 100 - (attempt.high_violations || 0) * 18 - (attempt.med_violations || 0) * 9
                  const integrityClassName = integrity >= 70
                    ? styles.integrityGood
                    : integrity >= 40
                      ? styles.integrityMedium
                      : styles.integrityHigh
                  return (
                    <tr key={attempt.id}>
                      <td>{attempt.user_name || attempt.user_id || '-'}</td>
                      <td>{attempt.test_title || attempt.exam_title || '-'}</td>
                      <td className={styles.mutedCell}>{attempt.high_violations || 0} high | {attempt.med_violations || 0} medium</td>
                      <td className={attempt.score != null && attempt.score < 60 ? styles.scoreFail : ''}>{attempt.score != null ? `${attempt.score}%` : '-'}</td>
                      <td className={integrityClassName}>{Math.max(0, integrity)}%</td>
                      <td><span className={styles.severityHigh}>HIGH RISK</span></td>
                      <td>
                        <button type="button" className={styles.actionBtn} onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}>Open Analysis</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Rescheduling' && canAssignSchedules && (
        <div className={styles.tableWrap}>
          {rescheduleMsg && <div className={styles.importMsg}>{rescheduleMsg}</div>}
          {completedAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>Nothing to reschedule</div>
              <div className={styles.emptyText}>Only completed, submitted, or graded attempts can be rescheduled from this queue.</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th><th>Test</th><th>Score</th><th>Submitted</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedAttempts.map((attempt) => {
                  const attemptLabel = `${attempt.user_name || attempt.user_id || 'candidate'} for ${attempt.test_title || attempt.exam_title || 'test'}`

                  return (
                  <React.Fragment key={attempt.id}>
                    <tr>
                      <td>{attempt.user_name || attempt.user_id || '-'}</td>
                      <td>{attempt.test_title || attempt.exam_title || '-'}</td>
                      <td className={attempt.score != null && attempt.score < 60 ? styles.scoreFail : ''}>
                        {attempt.score != null ? `${attempt.score}%` : '-'}
                      </td>
                      <td className={styles.mutedCell}>{formatDateTime(attempt.submitted_at)}</td>
                      <td className={styles.actionCell}>
                        <div className={styles.actionGroup}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => toggleReschedule(attempt.id)}
                            disabled={reschedulingId === String(attempt.id)}
                            aria-label={`${rescheduleId === attempt.id ? 'Cancel' : 'Open'} reschedule form for ${attemptLabel}`}
                          >
                            {rescheduleId === attempt.id ? 'Cancel reschedule' : 'Reschedule'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {rescheduleId === attempt.id && (
                      <tr>
                        <td colSpan={5} className={styles.rescheduleCell}>
                          <div className={styles.rescheduleForm}>
                            <div>
                              <div className={styles.label}>New Date & Time</div>
                              <input
                                type="datetime-local"
                                className={styles.filterSelect}
                                value={rescheduleDate}
                                onChange={(event) => setRescheduleDate(event.target.value)}
                              />
                            </div>
                            <div className={styles.growField}>
                              <div className={styles.label}>Notes (optional)</div>
                              <input
                                className={styles.filterSelect}
                                data-testid="reschedule-notes"
                                placeholder="Reason for reschedule"
                                value={rescheduleNotes}
                                onChange={(event) => setRescheduleNotes(event.target.value)}
                              />
                            </div>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              disabled={reschedulingId === String(attempt.id) || !rescheduleDate}
                              onClick={() => void handleReschedule(attempt)}
                              aria-label={`Save reschedule for ${attemptLabel}`}
                            >
                              {reschedulingId === String(attempt.id) ? 'Saving...' : 'Save reschedule'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  )
                })}
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
              CSV must have columns: <code>user_id</code>, <code>test_title</code> or <code>exam_title</code>, and <code>score</code>.
              <br />
              <span id="results-import-help" className={styles.mutedText}>
                user_id can be the learner ID or email. Score must be 0-100. Preview the file before import to catch missing headers early.
              </span>
            </div>
            <div className={styles.importControls}>
              <div className={styles.importFileField}>
                <label className={styles.label} htmlFor="results-import-file">CSV file</label>
                <input
                  id="results-import-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className={styles.filterSelect}
                  aria-describedby="results-import-help"
                  aria-label="Choose CSV file to import candidate results"
                />
              </div>
              {csvRows.length > 0 && (
                <>
                  <button type="button" className={styles.actionBtn} onClick={() => void handleImport()} disabled={importing || missingImportColumns.length > 0}>
                    {importing ? 'Importing...' : `Import ${csvRows.length} result row(s)`}
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={clearImportPreview} disabled={importing}>
                    Clear CSV preview
                  </button>
                </>
              )}
            </div>
            {missingImportColumns.length > 0 && csvRows.length > 0 && (
              <div className={styles.importError}>Missing required columns: {missingImportColumns.join(', ')}</div>
            )}
            {importMsg && <div className={styles.importMsg} aria-live="polite">{importMsg}</div>}
          </div>

          {csvRows.length > 0 && (
            <>
              <div className={`${styles.sectionTitle} ${styles.previewTitle}`}>Preview</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {previewHeaders.map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 20).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Object.values(row).map((value, colIndex) => <td key={colIndex}>{value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 20 && (
                <div className={styles.importHint}>Showing the first 20 of {csvRows.length} rows.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}



