import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminReports.module.scss'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const REPORT_TYPES = new Set(['attempt-summary', 'risk-alerts', 'usage'])

function parseRecipients(raw) {
  return [...new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )]
}

function formatDate(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleString()
}

export default function AdminReports() {
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState({ name: '', report_type: 'attempt-summary', schedule_cron: '0 8 * * *', recipients: '' })
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeLink, setNoticeLink] = useState('')
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [creating, setCreating] = useState(false)
  const [runningId, setRunningId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.reportSchedules()
      setSchedules(data || [])
      setListError('')
    } catch (err) {
      setSchedules([])
      setListError(err.response?.data?.detail || 'Failed to load schedules.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const validateForm = () => {
    if (!form.name.trim()) {
      setError('Schedule name is required.')
      return null
    }
    if (!REPORT_TYPES.has(form.report_type)) {
      setError('Select a valid report type.')
      return null
    }
    if (!form.schedule_cron.trim()) {
      setError('Cron schedule is required.')
      return null
    }
    const recipients = parseRecipients(form.recipients)
    const invalidRecipient = recipients.find((entry) => !EMAIL_RE.test(entry))
    if (invalidRecipient) {
      setError(`Invalid recipient email: ${invalidRecipient}`)
      return null
    }
    return recipients
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setNoticeLink('')
    const recipients = validateForm()
    if (!recipients) return

    setCreating(true)
    try {
      await adminApi.createReportSchedule({
        name: form.name.trim(),
        report_type: form.report_type,
        schedule_cron: form.schedule_cron.trim(),
        recipients,
        is_active: true,
      })
      setForm({ name: '', report_type: 'attempt-summary', schedule_cron: '0 8 * * *', recipients: '' })
      setNotice('Schedule created.')
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create schedule')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    setError('')
    setNotice('')
    setNoticeLink('')
    setDeletingId(id)
    try {
      await adminApi.deleteReportSchedule(id)
      setDeleteConfirmId('')
      setNotice('Schedule deleted.')
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not delete schedule')
    } finally {
      setDeletingId(null)
    }
  }

  const handleRun = async (id) => {
    setError('')
    setNotice('')
    setNoticeLink('')
    setRunningId(id)
    try {
      const { data } = await adminApi.runReportSchedule(id)
      setNotice(data?.detail || 'Report run completed successfully.')
      setNoticeLink(data?.report_url || '')
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not run schedule')
    } finally {
      setRunningId(null)
    }
  }

  const loadSubscribers = async () => {
    setLoadingSubs(true)
    try {
      const { data } = await adminApi.settings()
      const raw = (data || []).find((setting) => setting.key === 'subscribers')?.value
      let subscribers = []
      try {
        const parsed = raw ? JSON.parse(raw) : []
        subscribers = Array.isArray(parsed)
          ? parsed
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter((entry) => EMAIL_RE.test(entry))
          : []
      } catch {
        subscribers = []
      }
      if (subscribers.length === 0) {
        setError('No subscribers configured yet.')
        setNoticeLink('')
        return
      }
      const merged = [...new Set([...parseRecipients(form.recipients), ...subscribers])]
      setForm((current) => ({ ...current, recipients: merged.join(', ') }))
      setError('')
    } catch {
      setError('Could not load subscribers.')
    } finally {
      setLoadingSubs(false)
    }
  }

  const resetForm = () => {
    setForm({ name: '', report_type: 'attempt-summary', schedule_cron: '0 8 * * *', recipients: '' })
    setError('')
    setNotice('')
    setNoticeLink('')
  }

  const filteredSchedules = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return schedules.filter((schedule) => {
      if (typeFilter !== 'ALL' && schedule.report_type !== typeFilter) return false
      if (!normalizedSearch) return true
      return [
        schedule.name,
        schedule.report_type,
        schedule.schedule_cron,
        ...(schedule.recipients || []),
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(normalizedSearch)
    })
  }, [schedules, search, typeFilter])

  const hasActiveFilters = Boolean(search.trim() || typeFilter !== 'ALL')
  const uniqueRecipientCount = new Set(schedules.flatMap((schedule) => schedule.recipients || []).map((recipient) => String(recipient || '').toLowerCase())).size
  const ranAtLeastOnceCount = schedules.filter((schedule) => Boolean(schedule.last_run_at)).length
  const summaryCards = [
    {
      label: 'Scheduled reports',
      value: schedules.length,
      helper: 'Automation jobs currently loaded',
    },
    {
      label: 'Visible now',
      value: filteredSchedules.length,
      helper: hasActiveFilters ? 'Matching the active filters' : 'All loaded schedules',
    },
    {
      label: 'Recipients',
      value: uniqueRecipientCount,
      helper: 'Unique delivery targets across schedules',
    },
    {
      label: 'Run at least once',
      value: ranAtLeastOnceCount,
      helper: 'Schedules with execution history',
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Report Builder" subtitle="Schedule automated proctoring and test reports" />
      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={handleCreate}>
          <div className={styles.sectionTitle}>Create Schedule</div>
          {error && <div className={styles.error}>{error}</div>}
          {notice && (
            <div className={styles.notice}>
              <div>{notice}</div>
              {noticeLink && (
                <a href={noticeLink} target="_blank" rel="noreferrer">Open generated report</a>
              )}
            </div>
          )}
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required />

          <label className={styles.label}>Report Type</label>
          <select className={styles.input} value={form.report_type} onChange={(e) => setForm((current) => ({ ...current, report_type: e.target.value }))}>
            <option value="attempt-summary">Attempt Summary</option>
            <option value="risk-alerts">Risk Alerts</option>
            <option value="usage">Usage</option>
          </select>

          <label className={styles.label}>Cron</label>
          <input className={styles.input} value={form.schedule_cron} onChange={(e) => setForm((current) => ({ ...current, schedule_cron: e.target.value }))} />
          <div className={styles.hint}>Example: 0 8 * * * (every day at 08:00)</div>

          <label className={styles.label}>Recipients (comma separated emails)</label>
          <input className={styles.input} value={form.recipients} onChange={(e) => setForm((current) => ({ ...current, recipients: e.target.value }))} />
          <button type="button" className={styles.hintBtn} onClick={loadSubscribers} disabled={loadingSubs}>
            {loadingSubs ? 'Loading...' : 'Load from Subscribers list'}
          </button>
          <div className={styles.hint}>Tip: subscribers (System -&gt; Subscribers) are appended automatically on run.</div>

          <div className={styles.formActions}>
            <button type="button" className={styles.secondaryBtn} onClick={resetForm} disabled={creating || loadingSubs}>
              Reset
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={creating}>
              {creating ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Scheduled Reports</div>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="report-schedule-search">Search schedules</label>
                <input
                  id="report-schedule-search"
                  className={styles.input}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, recipient, or cron..."
                />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="report-type-filter">Report type</label>
                <select
                  id="report-type-filter"
                  className={styles.input}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="ALL">All types</option>
                  <option value="attempt-summary">Attempt Summary</option>
                  <option value="risk-alerts">Risk Alerts</option>
                  <option value="usage">Usage</option>
                </select>
              </div>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.secondaryBtn} onClick={load} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                Clear filters
              </button>
            </div>
          </div>
          <div className={styles.filterMeta}>
            Showing {filteredSchedules.length} schedule{filteredSchedules.length !== 1 ? 's' : ''} across {schedules.length} loaded.
          </div>
          {listError && (
            <div className={styles.retryRow}>
              <span className={styles.muted}>{listError}</span>
              <button type="button" className={styles.secondaryBtn} onClick={load} disabled={loading}>
                Retry
              </button>
            </div>
          )}
          {loading && <div className={styles.muted}>Loading...</div>}
          {!loading && !listError && filteredSchedules.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? 'No schedules match the current filters.' : 'No schedules yet.'}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? 'Clear the search or report-type filter to restore the loaded report schedules.'
                  : 'Scheduled report runs will appear here once an automated report is created.'}
              </div>
              {hasActiveFilters && <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>Clear filters</button>}
            </div>
          )}
          <div className={styles.list}>
            {filteredSchedules.map((schedule) => (
              <div className={styles.row} key={schedule.id} data-testid="report-schedule-row">
                <div>
                  <div className={styles.rowTitle}>{schedule.name}</div>
                  <div className={styles.rowSub}>{schedule.report_type} - {schedule.schedule_cron}</div>
                  <div className={styles.rowSub}>Recipients: {(schedule.recipients || []).join(', ')}</div>
                  <div className={styles.rowMeta}>Last run: {formatDate(schedule.last_run_at)}</div>
                  <div className={styles.rowMeta}>Created: {formatDate(schedule.created_at)}</div>
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => handleRun(schedule.id)}
                    disabled={runningId === schedule.id || deletingId === schedule.id}
                  >
                    {runningId === schedule.id ? 'Running...' : 'Run now'}
                  </button>
                  {deleteConfirmId === schedule.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(schedule.id)}
                        disabled={runningId === schedule.id || deletingId === schedule.id}
                      >
                        {deletingId === schedule.id ? 'Deleting...' : 'Confirm delete'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => setDeleteConfirmId('')}
                        disabled={deletingId === schedule.id}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(schedule.id)}
                      disabled={runningId === schedule.id || deletingId === schedule.id}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
