import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readBlobErrorMessage } from '../../../utils/httpErrors'
import { readPaginatedItems } from '../../../utils/pagination'
import styles from './AdminCandidates.module.scss'

const BASE_TAB_KEYS = ['admin_candidates_tab_attempts', 'admin_candidates_tab_proctoring', 'admin_candidates_tab_imported']
const STATUS_FILTER_KEYS = ['admin_candidates_status_all', 'admin_candidates_status_attempted', 'admin_candidates_status_passed', 'admin_candidates_status_failed', 'admin_candidates_status_not_graded']
const STATUS_FILTER_VALUES = ['All', 'Attempted', 'Passed', 'Failed', 'Not Graded']
const REQUIRED_IMPORT_COLUMNS = ['user_id', 'score']

function isForbiddenError(error) {
  return Number(error?.response?.status) === 403
}

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

function getSortLabel(sortField, sortDir, field, t) {
  if (sortField !== field) return ''
  return sortDir === 'desc' ? ` (${t('admin_candidates_sort_desc')})` : ` (${t('admin_candidates_sort_asc')})`
}

function getRiskLabel(attempt, t) {
  const high = attempt.high_violations || 0
  const medium = attempt.med_violations || 0
  if (!high && !medium) {
    return { text: t('admin_candidates_clean'), tone: styles.riskTextClean }
  }
  const parts = []
  if (high) parts.push(`${high} ${t('admin_candidates_high')}`)
  if (medium) parts.push(`${medium} ${t('admin_candidates_medium')}`)
  return {
    text: parts.join(' | '),
    tone: high ? styles.riskTextHigh : styles.riskTextMedium,
  }
}

export default function AdminCandidates() {
  const { hasPermission } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const fileRef = useRef()
  const [tab, setTab] = useState('admin_candidates_tab_attempts')
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
  const [accessDenied, setAccessDenied] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const canAssignSchedules = hasPermission?.('Assign Schedules')
  const tabKeys = canAssignSchedules
    ? ['admin_candidates_tab_attempts', 'admin_candidates_tab_proctoring', 'admin_candidates_tab_rescheduling', 'admin_candidates_tab_imported']
    : BASE_TAB_KEYS

  const load = async () => {
    setLoading(true)
    setLoadError('')
    setAccessDenied(false)
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
          title: attempt.test_title || attempt.exam_title || t('admin_candidates_test'),
        }))
      })

      let scoreMap = {}
      try {
        const { data: testsData } = await adminApi.allTests({ page_size: 200 })
        ;(testsData?.items || []).forEach((t) => {
          if (t.id && t.passing_score != null) scoreMap[t.id] = t.passing_score
        })
      } catch (error) {
        if (isForbiddenError(error)) {
          throw error
        }
      }
      setAttempts(enriched)
      setTests(Array.from(uniqueTests.values()))
      setPassingScoreMap(scoreMap)
    } catch (error) {
      if (isForbiddenError(error)) {
        setAccessDenied(true)
        setAttempts([])
        setTests([])
        setPassingScoreMap({})
        return
      }
      setAttempts([])
      setTests([])
      setPassingScoreMap({})
      setLoadError(error.response?.data?.detail || t('admin_candidates_load_error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!tabKeys.includes(tab)) {
      setTab(tabKeys[0])
    }
  }, [tab, tabKeys])

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
    missingImportColumns.push(t('admin_candidates_col_test_title_or_exam_title'))
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
      [t('admin_candidates_col_user'), t('email'), t('admin_candidates_col_test'), t('status'), t('score'), t('date'), t('duration')],
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
    { label: t('admin_candidates_loaded_attempts'), value: attempts.length, sub: t('admin_candidates_loaded_attempts_sub') },
    { label: t('admin_candidates_matching_filters'), value: sorted.length, sub: hasActiveFilters ? t('admin_candidates_active_filters_applied') : t('admin_candidates_showing_all') },
    { label: t('admin_candidates_high_risk'), value: riskyAttempts.length, sub: t('admin_candidates_high_risk_sub') },
    { label: t('admin_candidates_tracked_tests'), value: tests.length, sub: t('admin_candidates_tracked_tests_sub') },
  ]

  if (tab === 'admin_candidates_tab_proctoring') {
    summaryCards = [
      { label: t('admin_candidates_flagged_attempts'), value: riskyAttempts.length, sub: t('admin_candidates_flagged_attempts_sub') },
      { label: t('admin_candidates_total_attempts'), value: attempts.length, sub: t('admin_candidates_total_attempts_sub') },
      { label: t('admin_candidates_highest_risk_queue'), value: riskyAttempts.filter((attempt) => (attempt.high_violations || 0) > 0).length, sub: t('admin_candidates_highest_risk_sub') },
      { label: t('admin_candidates_clean_attempts'), value: Math.max(attempts.length - riskyAttempts.length, 0), sub: t('admin_candidates_clean_attempts_sub') },
    ]
  } else if (tab === 'admin_candidates_tab_rescheduling') {
    summaryCards = [
      { label: t('admin_candidates_eligible_attempts'), value: completedAttempts.length, sub: t('admin_candidates_eligible_attempts_sub') },
      { label: t('admin_candidates_pending_action'), value: rescheduleId ? 1 : 0, sub: rescheduleId ? t('admin_candidates_reschedule_draft_open') : t('admin_candidates_no_reschedule_draft') },
      { label: t('admin_candidates_loaded_attempts'), value: attempts.length, sub: t('admin_candidates_all_rows_review') },
      { label: t('admin_candidates_flagged_attempts'), value: riskyAttempts.length, sub: t('admin_candidates_context_before_reschedule') },
    ]
  } else if (tab === 'admin_candidates_tab_imported') {
    summaryCards = [
      { label: t('admin_candidates_preview_rows'), value: csvRows.length, sub: csvRows.length ? t('admin_candidates_rows_ready') : t('admin_candidates_upload_csv_start') },
      { label: t('admin_candidates_detected_columns'), value: previewHeaders.length, sub: previewHeaders.length ? previewHeaders.join(', ') : t('admin_candidates_waiting_headers') },
      { label: t('admin_candidates_required_columns'), value: missingImportColumns.length ? t('admin_candidates_missing') : t('admin_candidates_ready'), sub: missingImportColumns.length ? missingImportColumns.join(', ') : t('admin_candidates_ready_to_import') },
      { label: t('admin_candidates_imported_attempts'), value: attempts.length, sub: t('admin_candidates_imported_merge') },
    ]
  }

  const handleReschedule = async (attempt) => {
    if (!rescheduleDate) {
      setRescheduleMsg(t('admin_candidates_pick_date'))
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
        notes: rescheduleNotes.trim() || t('admin_candidates_rescheduled_by_admin'),
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
      setRescheduleMsg(`${t('admin_candidates_rescheduled_for')} ${attempt.user_name || attempt.user_id}.`)
      setRescheduleId(null)
      setRescheduleDate('')
      setRescheduleNotes('')
      await load()
    } catch (error) {
      setRescheduleMsg(error.response?.data?.detail || t('admin_candidates_save_schedule_failed'))
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
        setImportMsg(rows.length ? '' : t('admin_candidates_no_csv_rows'))
      } catch {
        setCsvRows([])
        setImportMsg(t('admin_candidates_csv_parse_error'))
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
      setImportMsg(`${t('admin_candidates_missing_columns')}: ${missingImportColumns.join(', ')}`)
      return
    }
    setImporting(true)
    setImportMsg('')
    try {
      const { data } = await adminApi.importAttempts(csvRows)
      setImportMsg(`${t('admin_candidates_imported')} ${data.length} ${t('admin_candidates_results_successfully')}`)
      setCsvRows([])
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (error) {
      setImportMsg(error.response?.data?.detail || t('admin_candidates_import_failed'))
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadReport = async (attemptId) => {
    setDownloadMsg('')
    setDownloadBusyId(String(attemptId))
    try {
      const { data } = await adminApi.generateReport(attemptId, { outputFormat: 'pdf' })
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `proctoring-report-${String(attemptId).slice(0, 8)}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setDownloadMsg(t('admin_candidates_report_started'))
    } catch (error) {
      setDownloadMsg(await readBlobErrorMessage(error, t('admin_candidates_report_failed')))
    } finally {
      setDownloadBusyId('')
    }
  }

  if (accessDenied) {
    return <Navigate to="/access-denied" replace />
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_candidates_title')} subtitle={t('admin_candidates_subtitle')} />
      {loadError && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>{loadError}</span>
          <button type="button" className={styles.alertButton} onClick={() => void load()} disabled={loading}>
            {t('retry')}
          </button>
        </div>
      )}

      <div className={styles.tabs}>
        {tabKeys.map((tabKey) => (
          <button type="button" key={tabKey} className={`${styles.tab} ${tab === tabKey ? styles.tabActive : ''}`} onClick={() => setTab(tabKey)}>{t(tabKey)}</button>
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

      {tab === 'admin_candidates_tab_attempts' && (
        <>
          <div className={styles.filterPanel}>
            <div className={styles.filterRow}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t('admin_candidates_search_placeholder')}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              />
              <select
                className={styles.filterSelect}
                value={examFilter}
                onChange={(event) => { setExamFilter(event.target.value); setPage(1) }}
              >
                <option value="">{t('admin_candidates_all_tests')}</option>
                {tests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.name}{test.code ? ` (${test.code})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className={styles.dateInput}
                title={t('admin_candidates_from_date')}
                value={dateFrom}
                onChange={(event) => { setDateFrom(event.target.value); setPage(1) }}
              />
              <input
                type="date"
                className={styles.dateInput}
                title={t('admin_candidates_to_date')}
                value={dateTo}
                onChange={(event) => { setDateTo(event.target.value); setPage(1) }}
              />
              <button type="button" className={styles.exportBtn} onClick={exportCSV} disabled={sorted.length === 0}>
                {t('admin_candidates_export_csv')}
              </button>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => void load()} disabled={loading}>
                {loading ? t('refreshing') : t('refresh')}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                {t('clear_filters')}
              </button>
              <div className={styles.filterMeta}>
                {t('showing')} {sorted.length} {sorted.length !== 1 ? t('admin_candidates_matching_attempts') : t('admin_candidates_matching_attempt')} {t('admin_candidates_across')} {attempts.length} {t('admin_candidates_loaded')}.
              </div>
            </div>
            {downloadMsg && <div className={styles.importMsg}>{downloadMsg}</div>}
          </div>
          <div className={styles.statusFilters}>
            {STATUS_FILTER_KEYS.map((filterKey, idx) => (
              <button
                type="button"
                key={filterKey}
                className={`${styles.statusBtn} ${statusFilter === STATUS_FILTER_VALUES[idx] ? styles.statusBtnActive : ''}`}
                onClick={() => {
                  setStatusFilter(STATUS_FILTER_VALUES[idx])
                  setPage(1)
                }}
              >
                {t(filterKey)}
                <span className={styles.statusCount}>{getStatusCount(STATUS_FILTER_VALUES[idx], attempts, passingScoreMap)}</span>
              </button>
            ))}
          </div>
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.empty}>{t('admin_candidates_loading_attempts')}</div>
            ) : attempts.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{t('admin_candidates_no_attempts_yet')}</div>
                <div className={styles.emptyText}>{t('admin_candidates_no_attempts_text')}</div>
              </div>
            ) : paginated.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{t('admin_candidates_no_matches')}</div>
                <div className={styles.emptyText}>{t('admin_candidates_no_matches_text')}</div>
                <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>
                  {t('clear_filters')}
                </button>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('admin_candidates_col_user')}</th><th>{t('admin_candidates_col_test')}</th><th>{t('status')}</th>
                    <th>
                      <button type="button" className={styles.sortBtn} onClick={() => toggleSort('score')}>
                        {t('score')}{getSortLabel(sortField, sortDir, 'score', t)}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={styles.sortBtn} onClick={() => toggleSort('date')}>
                        {t('date')}{getSortLabel(sortField, sortDir, 'date', t)}
                      </button>
                    </th>
                    <th>{t('duration')}</th><th>{t('admin_candidates_col_risk')}</th><th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((attempt) => {
                    const risk = getRiskLabel(attempt, t)
                    return (
                      <tr key={attempt.id}>
                        <td>
                          <div>{attempt.user_name || attempt.user_id || '-'}</div>
                          {attempt.user_email && <div className={styles.mutedSub}>{attempt.user_email}</div>}
                        </td>
                        <td>
                          <div>{attempt.test_title || attempt.exam_title || '-'}</div>
                          <div className={styles.mutedSub}>{attempt.exam_id ? `${t('admin_candidates_test_id')}: ${attempt.exam_id}` : t('admin_candidates_legacy_import')}</div>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${attempt.status === 'COMPLETED' ? styles.badgePass : attempt.status === 'IN_PROGRESS' ? styles.badgePending : styles.badgeFail}`}>
                            {attempt.status || t('admin_candidates_status_unknown')}
                          </span>
                        </td>
                        <td className={attempt.score != null && attempt.score < (passingScoreMap[attempt.exam_id] ?? 60) ? styles.scoreFail : ''}>
                          {attempt.score != null ? `${attempt.score}%` : '-'}
                        </td>
                        <td className={styles.mutedCell}>{formatDate(attempt.started_at)}</td>
                        <td className={styles.mutedCell}>{getDuration(attempt)}</td>
                        <td>
                          <span className={`${styles.riskText} ${risk.tone}`}>{risk.text}</span>
                        </td>
                        <td className={styles.actionCell}>
                          <div className={styles.actionGroup}>
                            <button type="button" className={styles.actionBtn} onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}>{t('admin_candidates_open_analysis')}</button>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => void handleDownloadReport(attempt.id)}
                              disabled={downloadBusyId === String(attempt.id)}
                            >
                              {downloadBusyId === String(attempt.id) ? t('admin_candidates_downloading') : t('admin_candidates_download_report')}
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
              <span className={styles.pageInfo}>{sorted.length} {sorted.length !== 1 ? t('admin_candidates_results') : t('admin_candidates_result')} | {t('page')} {page} {t('of')} {totalPages}</span>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t('admin_candidates_previous')}</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t('next')}</button>
            </div>
          )}
        </>
      )}

      {tab === 'admin_candidates_tab_proctoring' && (
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.empty}>{t('admin_candidates_loading_proctoring')}</div>
          ) : attempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{t('admin_candidates_no_attempts_yet')}</div>
              <div className={styles.emptyText}>{t('admin_candidates_proctoring_empty_text')}</div>
            </div>
          ) : riskyAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{t('admin_candidates_queue_clear')}</div>
              <div className={styles.emptyText}>{t('admin_candidates_no_high_risk')}</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin_candidates_col_user')}</th><th>{t('admin_candidates_col_test')}</th><th>{t('admin_candidates_col_alerts')}</th><th>{t('score')}</th><th>{t('admin_candidates_col_integrity')}</th><th>{t('status')}</th><th>{t('actions')}</th>
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
                      <td className={styles.mutedCell}>{attempt.high_violations || 0} {t('admin_candidates_high')} | {attempt.med_violations || 0} {t('admin_candidates_medium')}</td>
                      <td className={attempt.score != null && attempt.score < (passingScoreMap[attempt.exam_id] ?? 60) ? styles.scoreFail : ''}>{attempt.score != null ? `${attempt.score}%` : '-'}</td>
                      <td className={integrityClassName}>{Math.max(0, integrity)}%</td>
                      <td><span className={styles.severityHigh}>{t('admin_candidates_high_risk_label')}</span></td>
                      <td>
                        <button type="button" className={styles.actionBtn} onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}>{t('admin_candidates_open_analysis')}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'admin_candidates_tab_rescheduling' && canAssignSchedules && (
        <div className={styles.tableWrap}>
          {rescheduleMsg && <div className={styles.importMsg}>{rescheduleMsg}</div>}
          {completedAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{t('admin_candidates_nothing_reschedule')}</div>
              <div className={styles.emptyText}>{t('admin_candidates_nothing_reschedule_text')}</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin_candidates_col_user')}</th><th>{t('admin_candidates_col_test')}</th><th>{t('score')}</th><th>{t('admin_candidates_col_submitted')}</th><th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {completedAttempts.map((attempt) => {
                  const attemptLabel = `${attempt.user_name || attempt.user_id || t('admin_candidates_candidate')} ${t('admin_candidates_for')} ${attempt.test_title || attempt.exam_title || t('admin_candidates_test_fallback')}`

                  return (
                  <React.Fragment key={attempt.id}>
                    <tr>
                      <td>{attempt.user_name || attempt.user_id || '-'}</td>
                      <td>{attempt.test_title || attempt.exam_title || '-'}</td>
                      <td className={attempt.score != null && attempt.score < (passingScoreMap[attempt.exam_id] ?? 60) ? styles.scoreFail : ''}>
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
                            aria-label={`${rescheduleId === attempt.id ? t('cancel') : t('admin_candidates_open')} ${t('admin_candidates_reschedule_form_for')} ${attemptLabel}`}
                          >
                            {rescheduleId === attempt.id ? t('admin_candidates_cancel_reschedule') : t('admin_candidates_reschedule')}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {rescheduleId === attempt.id && (
                      <tr>
                        <td colSpan={5} className={styles.rescheduleCell}>
                          <div className={styles.rescheduleForm}>
                            <div>
                              <div className={styles.label}>{t('admin_candidates_new_date_time')}</div>
                              <input
                                type="datetime-local"
                                className={styles.filterSelect}
                                value={rescheduleDate}
                                onChange={(event) => setRescheduleDate(event.target.value)}
                              />
                            </div>
                            <div className={styles.growField}>
                              <div className={styles.label}>{t('admin_candidates_notes_optional')}</div>
                              <input
                                className={styles.filterSelect}
                                data-testid="reschedule-notes"
                                placeholder={t('admin_candidates_reason_reschedule')}
                                value={rescheduleNotes}
                                onChange={(event) => setRescheduleNotes(event.target.value)}
                              />
                            </div>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              disabled={reschedulingId === String(attempt.id) || !rescheduleDate}
                              onClick={() => void handleReschedule(attempt)}
                              aria-label={`${t('admin_candidates_save_reschedule')} ${attemptLabel}`}
                            >
                              {reschedulingId === String(attempt.id) ? t('saving') : t('admin_candidates_save_reschedule')}
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

      {tab === 'admin_candidates_tab_imported' && (
        <div className={styles.tableWrap}>
          <div className={styles.importBox}>
            <div className={styles.sectionTitle}>{t('admin_candidates_import_csv_title')}</div>
            <div className={styles.importHint}>
              {t('admin_candidates_csv_columns_hint')}
              <br />
              <span id="results-import-help" className={styles.mutedText}>
                {t('admin_candidates_csv_help_text')}
              </span>
            </div>
            <div className={styles.importControls}>
              <div className={styles.importFileField}>
                <label className={styles.label} htmlFor="results-import-file">{t('admin_candidates_csv_file')}</label>
                <input
                  id="results-import-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className={styles.filterSelect}
                  aria-describedby="results-import-help"
                  aria-label={t('admin_candidates_choose_csv_aria')}
                />
              </div>
              {csvRows.length > 0 && (
                <>
                  <button type="button" className={styles.actionBtn} onClick={() => void handleImport()} disabled={importing || missingImportColumns.length > 0}>
                    {importing ? t('admin_candidates_importing') : `${t('import')} ${csvRows.length} ${t('admin_candidates_result_rows')}`}
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={clearImportPreview} disabled={importing}>
                    {t('admin_candidates_clear_csv_preview')}
                  </button>
                </>
              )}
            </div>
            {missingImportColumns.length > 0 && csvRows.length > 0 && (
              <div className={styles.importError}>{t('admin_candidates_missing_columns')}: {missingImportColumns.join(', ')}</div>
            )}
            {importMsg && <div className={styles.importMsg} aria-live="polite">{importMsg}</div>}
          </div>

          {csvRows.length > 0 && (
            <>
              <div className={`${styles.sectionTitle} ${styles.previewTitle}`}>{t('admin_candidates_preview')}</div>
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
                <div className={styles.importHint}>{t('admin_candidates_showing_first_20')} {csvRows.length} {t('admin_candidates_rows')}.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

