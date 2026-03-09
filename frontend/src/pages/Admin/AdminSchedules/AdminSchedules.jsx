import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../../utils/pagination'
import styles from './AdminSchedules.module.scss'

const EMPTY_FORM = { user_id: '', exam_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' }

function resolveError(err, fallback) {
  return err?.response?.data?.detail || fallback
}

export default function AdminSchedules() {
  const [schedules, setSchedules] = useState([])
  const [tests, setTests] = useState([])
  const [users, setUsers] = useState([])
  const [schedulesReady, setSchedulesReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [bootstrapMessage, setBootstrapMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [createReady, setCreateReady] = useState(false)
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    setBootstrapMessage('')
    try {
      const [sRes, tRes, uRes] = await Promise.allSettled([
        adminApi.schedules(),
        adminApi.allTests(),
        adminApi.users({ skip: 0, limit: 200 }),
      ])
      const failures = []

      if (sRes.status === 'fulfilled') {
        setSchedules(sRes.value.data || [])
        setSchedulesReady(true)
      } else {
        setSchedules([])
        setSchedulesReady(false)
        failures.push('schedules')
        setError(resolveError(sRes.reason, 'Failed to load schedules.'))
      }

      if (tRes.status === 'fulfilled') {
        setTests((tRes.value.data?.items || []).map(normalizeAdminTest))
      } else {
        setTests([])
        failures.push('tests')
      }

      if (uRes.status === 'fulfilled') {
        setUsers(readPaginatedItems(uRes.value.data))
      } else {
        setUsers([])
        failures.push('users')
      }

      setCreateReady(failures.length === 0)
      if (failures.includes('schedules')) {
        setBootstrapMessage('Existing schedules could not be loaded. Retry before editing or assigning schedules.')
      } else if (failures.length > 0) {
        setBootstrapMessage('Some assignment lookup data could not be loaded. Existing schedules remain visible, but assigning new schedules is temporarily disabled.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleAssign = async () => {
    if (!form.user_id || !form.exam_id || !form.scheduled_at) {
      setError('User, test, and scheduled time are required.')
      return
    }

    setError('')
    setNotice('')
    setSaving(true)
    try {
      await adminApi.createSchedule({
        ...form,
        notes: form.notes.trim() || null,
      })
      setForm(EMPTY_FORM)
      setNotice('Schedule assigned successfully.')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(resolveError(err, 'Failed to assign schedule'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    setError('')
    setDeleteBusyId(id)
    try {
      await adminApi.deleteSchedule(id)
      setDeleteConfirmId(null)
      setNotice('Schedule deleted.')
      await load()
    } catch (err) {
      setDeleteConfirmId(null)
      setError(resolveError(err, 'Failed to delete schedule'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : '-')

  const filteredSchedules = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return schedules.filter((schedule) => {
      if (modeFilter && String(schedule.access_mode || '').toUpperCase() !== modeFilter) return false
      if (!normalizedSearch) return true
      const haystack = [
        schedule.user_name,
        schedule.user_id,
        schedule.test_title,
        schedule.exam_title,
        schedule.notes,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(normalizedSearch)
    })
  }, [modeFilter, schedules, search])

  const hasActiveFilters = Boolean(search.trim() || modeFilter)
  const now = Date.now()
  const upcomingCount = schedules.filter((schedule) => {
    const timestamp = schedule.scheduled_at ? new Date(schedule.scheduled_at).getTime() : NaN
    return Number.isFinite(timestamp) && timestamp >= now
  }).length
  const restrictedCount = schedules.filter((schedule) => String(schedule.access_mode || '').toUpperCase() === 'RESTRICTED').length
  const summaryCards = [
    {
      label: 'Assigned schedules',
      value: schedules.length,
      helper: schedulesReady ? 'All learner schedule records currently loaded' : 'Schedule list needs a retry before editing',
    },
    {
      label: 'Visible now',
      value: filteredSchedules.length,
      helper: hasActiveFilters ? 'Matching the active filters' : 'All loaded schedules',
    },
    {
      label: 'Restricted',
      value: restrictedCount,
      helper: 'Schedule-gated access windows',
    },
    {
      label: 'Upcoming',
      value: upcomingCount,
      helper: 'Scheduled for now or later',
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setModeFilter('')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Schedules" subtitle="Assign tests to learners">
        <button type="button" className={styles.btnPrimary} onClick={() => setShowForm((current) => !current)} disabled={!createReady}>
          {showForm ? 'Hide Form' : '+ Assign'}
        </button>
      </AdminPageHeader>

      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorMsg}>{error}</div>
          <button className={styles.actionBtn} onClick={() => void load()}>Retry</button>
        </div>
      )}
      {!error && bootstrapMessage && <div className={styles.warningMsg}>{bootstrapMessage}</div>}
      {notice && <div className={styles.noticeMsg}>{notice}</div>}

      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>

      {showForm && (
        <div className={styles.assignForm}>
          <h3 className={styles.assignTitle}>Assign Test</h3>
          {!createReady && <div className={styles.errorMsg}>{bootstrapMessage || 'Assignment is disabled until schedules, tests, and users load successfully.'}</div>}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-user">User</label>
              <select id="schedule-form-user" className={styles.select} value={form.user_id} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, user_id: e.target.value }))}>
                <option value="">Select user...</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.user_id} - {user.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-test">Test</label>
              <select id="schedule-form-test" className={styles.select} value={form.exam_id} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, exam_id: e.target.value }))}>
                <option value="">Select test...</option>
                {tests.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-datetime">Scheduled At</label>
              <input id="schedule-form-datetime" className={styles.input} type="datetime-local" value={form.scheduled_at} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, scheduled_at: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-mode">Access Mode</label>
              <select id="schedule-form-mode" className={styles.select} value={form.access_mode} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, access_mode: e.target.value }))}>
                <option value="OPEN">Open (anytime)</option>
                <option value="RESTRICTED">Restricted (by schedule)</option>
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="schedule-form-notes">Notes</label>
            <textarea id="schedule-form-notes" className={styles.textarea} value={form.notes} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
          </div>
          <button type="button" className={styles.btnPrimary} onClick={() => void handleAssign()} disabled={!createReady || saving || !form.user_id || !form.exam_id || !form.scheduled_at}>
            {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarFilters}>
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="schedule-search">Search schedules</label>
              <input
                id="schedule-search"
                className={styles.input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by learner, test, or note..."
              />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="schedule-mode-filter">Mode</label>
              <select
                id="schedule-mode-filter"
                className={styles.select}
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
              >
                <option value="">All modes</option>
                <option value="OPEN">OPEN</option>
                <option value="RESTRICTED">RESTRICTED</option>
              </select>
            </div>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </button>
          </div>
        </div>
        <div className={styles.tableMeta}>
          Showing {filteredSchedules.length} schedule{filteredSchedules.length !== 1 ? 's' : ''} across {schedules.length} loaded.
        </div>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : filteredSchedules.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{hasActiveFilters ? 'No schedules match the current filters.' : 'No schedules yet.'}</div>
            <div className={styles.emptyText}>
              {hasActiveFilters
                ? 'Clear the search or mode filter to restore the current schedule list.'
                : 'Assigned learner schedules will appear here once tests are scheduled.'}
            </div>
            {hasActiveFilters && (
              <button type="button" className={styles.actionBtn} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Test</th>
                <th>Scheduled</th>
                <th>Mode</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.user_name || schedule.user_id || '-'}</td>
                  <td>{schedule.test_title || schedule.exam_title || '-'}</td>
                  <td>{formatDate(schedule.scheduled_at)}</td>
                  <td>
                    <span className={`${styles.modeBadge} ${schedule.access_mode === 'OPEN' ? styles.modeOpen : styles.modeScheduled}`}>
                      {schedule.access_mode || 'Scheduled'}
                    </span>
                  </td>
                  <td>{schedule.notes || '-'}</td>
                  <td>
                    {deleteConfirmId === schedule.id ? (
                      <span className={styles.actionGroup}>
                        <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(schedule.id)} disabled={deleteBusyId === schedule.id}>
                          {deleteBusyId === schedule.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === schedule.id}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(schedule.id)} disabled={deleteBusyId === schedule.id}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
