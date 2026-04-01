import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useLanguage from '../../../hooks/useLanguage'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../../utils/pagination'
import styles from './AdminSchedules.module.scss'

const EMPTY_FORM = { user_id: '', exam_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' }

function resolveError(err, fallback) {
  return err?.response?.data?.detail || fallback
}

export default function AdminSchedules() {
  const { t } = useLanguage()
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
        setError(resolveError(sRes.reason, t('admin_schedules_load_failed')))
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
        setBootstrapMessage(t('admin_schedules_bootstrap_schedules_failed'))
      } else if (failures.length > 0) {
        setBootstrapMessage(t('admin_schedules_bootstrap_partial_failed'))
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
      setError(t('admin_schedules_required_fields'))
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
      setNotice(t('admin_schedules_assigned'))
      setShowForm(false)
      await load()
    } catch (err) {
      setError(resolveError(err, t('admin_schedules_assign_failed')))
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
      setNotice(t('admin_schedules_deleted'))
      await load()
    } catch (err) {
      setDeleteConfirmId(null)
      setError(resolveError(err, t('admin_schedules_delete_failed')))
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
      label: t('admin_schedules_assigned_schedules'),
      value: schedules.length,
      helper: schedulesReady ? t('admin_schedules_all_loaded') : t('admin_schedules_needs_retry'),
    },
    {
      label: t('admin_schedules_visible_now'),
      value: filteredSchedules.length,
      helper: hasActiveFilters ? t('admin_schedules_matching_filters') : t('admin_schedules_all_schedules'),
    },
    {
      label: t('admin_schedules_restricted'),
      value: restrictedCount,
      helper: t('admin_schedules_restricted_helper'),
    },
    {
      label: t('admin_schedules_upcoming'),
      value: upcomingCount,
      helper: t('admin_schedules_upcoming_helper'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setModeFilter('')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_schedules_title')} subtitle={t('admin_schedules_subtitle')}>
        <button type="button" className={styles.btnPrimary} onClick={() => setShowForm((current) => !current)} disabled={!createReady}>
          {showForm ? t('admin_schedules_hide_form') : t('admin_schedules_assign_btn')}
        </button>
      </AdminPageHeader>

      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorMsg}>{error}</div>
          <button className={styles.actionBtn} onClick={() => void load()}>{t('retry')}</button>
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
          <h3 className={styles.assignTitle}>{t('admin_schedules_assign_test')}</h3>
          {!createReady && <div className={styles.errorMsg}>{bootstrapMessage || t('admin_schedules_assignment_disabled')}</div>}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-user">{t('admin_schedules_user')}</label>
              <select id="schedule-form-user" className={styles.select} value={form.user_id} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, user_id: e.target.value }))}>
                <option value="">{t('admin_schedules_select_user')}</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.user_id} - {user.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-test">{t('admin_schedules_test')}</label>
              <select id="schedule-form-test" className={styles.select} value={form.exam_id} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, exam_id: e.target.value }))}>
                <option value="">{t('admin_schedules_select_test')}</option>
                {tests.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-datetime">{t('admin_schedules_scheduled_at')}</label>
              <input id="schedule-form-datetime" className={styles.input} type="datetime-local" value={form.scheduled_at} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, scheduled_at: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="schedule-form-mode">{t('admin_schedules_access_mode')}</label>
              <select id="schedule-form-mode" className={styles.select} value={form.access_mode} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, access_mode: e.target.value }))}>
                <option value="OPEN">{t('admin_schedules_mode_open')}</option>
                <option value="RESTRICTED">{t('admin_schedules_mode_restricted')}</option>
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="schedule-form-notes">{t('admin_schedules_notes')}</label>
            <textarea id="schedule-form-notes" className={styles.textarea} value={form.notes} disabled={!createReady || saving} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
          </div>
          <button type="button" className={styles.btnPrimary} onClick={() => void handleAssign()} disabled={!createReady || saving || !form.user_id || !form.exam_id || !form.scheduled_at}>
            {saving ? t('admin_schedules_assigning') : t('admin_schedules_assign')}
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarFilters}>
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="schedule-search">{t('admin_schedules_search_label')}</label>
              <input
                id="schedule-search"
                className={styles.input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin_schedules_search_placeholder')}
              />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="schedule-mode-filter">{t('admin_schedules_mode_label')}</label>
              <select
                id="schedule-mode-filter"
                className={styles.select}
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
              >
                <option value="">{t('admin_schedules_all_modes')}</option>
                <option value="OPEN">OPEN</option>
                <option value="RESTRICTED">RESTRICTED</option>
              </select>
            </div>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>
              {loading ? t('admin_schedules_refreshing') : t('admin_schedules_refresh')}
            </button>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              {t('admin_schedules_clear_filters')}
            </button>
          </div>
        </div>
        <div className={styles.tableMeta}>
          {t('admin_schedules_showing')} {filteredSchedules.length} {t('admin_schedules_schedule_count')} {t('admin_schedules_across')} {schedules.length} {t('admin_schedules_loaded')}.
        </div>
        {loading ? (
          <div className={styles.empty}>{t('loading')}</div>
        ) : filteredSchedules.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{hasActiveFilters ? t('admin_schedules_no_match') : t('admin_schedules_no_schedules')}</div>
            <div className={styles.emptyText}>
              {hasActiveFilters
                ? t('admin_schedules_clear_filters_hint')
                : t('admin_schedules_empty_hint')}
            </div>
            {hasActiveFilters && (
              <button type="button" className={styles.actionBtn} onClick={clearFilters}>
                {t('admin_schedules_clear_filters')}
              </button>
            )}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin_schedules_user')}</th>
                <th>{t('admin_schedules_test')}</th>
                <th>{t('admin_schedules_scheduled')}</th>
                <th>{t('admin_schedules_mode_label')}</th>
                <th>{t('admin_schedules_notes')}</th>
                <th>{t('admin_schedules_actions')}</th>
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
                      {schedule.access_mode || t('admin_schedules_scheduled')}
                    </span>
                  </td>
                  <td>{schedule.notes || '-'}</td>
                  <td>
                    {deleteConfirmId === schedule.id ? (
                      <span className={styles.actionGroup}>
                        <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(schedule.id)} disabled={deleteBusyId === schedule.id}>
                          {deleteBusyId === schedule.id ? t('admin_schedules_deleting') : t('confirm')}
                        </button>
                        <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === schedule.id}>
                          {t('cancel')}
                        </button>
                      </span>
                    ) : (
                      <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(schedule.id)} disabled={deleteBusyId === schedule.id}>
                        {t('delete')}
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
