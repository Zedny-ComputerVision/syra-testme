import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { adminApi } from '../../../services/admin.service'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import styles from './AdminTestingSessions.module.scss'

function resolveError(err, fallback) {
  return (
    err?.response?.data?.detail ||
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.detail ||
    err?.message ||
    fallback
  )
}

function utcToLocalDatetimeInput(utcString) {
  if (!utcString) return ''
  const date = new Date(utcString)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export default function AdminTestingSessions() {
  const { t } = useLanguage()
  const { hasPermission } = useAuth()
  const [sessions, setSessions] = useState([])
  const [tests, setTests] = useState([])
  const [users, setUsers] = useState([])
  const [sessionsReady, setSessionsReady] = useState(false)
  const [testsReady, setTestsReady] = useState(false)
  const [usersReady, setUsersReady] = useState(false)
  const [bootstrapMessage, setBootstrapMessage] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ exam_id: '', user_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [statusTab, setStatusTab] = useState('All')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const [editModal, setEditModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ scheduled_at: '', access_mode: 'OPEN', notes: '' })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const abortRef = useRef(null)
  const PAGE_SIZE = 20
  const canAssignSchedules = hasPermission?.('Assign Schedules')
  const canCreateSession = canAssignSchedules && sessionsReady && testsReady && usersReady
  const modalRoot = typeof document !== 'undefined' ? document.body : null

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const [sRes, tRes, uRes] = await Promise.allSettled([
        adminApi.schedules({ signal: controller.signal }),
        adminApi.schedulableTests({ signal: controller.signal }),
        adminApi.learnersForScheduling(undefined, { signal: controller.signal }),
      ])
      if (controller.signal.aborted) return
      const failures = []

      if (sRes.status === 'fulfilled') {
        setSessions(sRes.value.data || [])
        setSessionsReady(true)
      } else {
        setSessions([])
        setSessionsReady(false)
        failures.push('sessions')
        setError(resolveError(sRes.reason, t('admin_sessions_error_load_sessions')))
      }

      if (tRes.status === 'fulfilled') {
        setTests((tRes.value.data || []).map(normalizeAdminTest))
        setTestsReady(true)
      } else {
        setTests([])
        setTestsReady(false)
        failures.push('tests')
      }

      if (uRes.status === 'fulfilled') {
        setUsers((uRes.value.data || []).filter((user) => user.role === 'LEARNER'))
        setUsersReady(true)
      } else {
        setUsers([])
        setUsersReady(false)
        failures.push('users')
      }

      if (failures.includes('sessions')) {
        setBootstrapMessage(t('admin_sessions_bootstrap_sessions_failed'))
      } else if (failures.length > 0) {
        setBootstrapMessage(t('admin_sessions_bootstrap_lookup_failed'))
      } else {
        setBootstrapMessage('')
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return
      setSessions([])
      setTests([])
      setUsers([])
      setSessionsReady(false)
      setTestsReady(false)
      setUsersReady(false)
      setBootstrapMessage(t('admin_sessions_bootstrap_all_failed'))
      setError(resolveError(err, t('admin_sessions_error_load_sessions')))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [load])

  const formatDate = (iso) => (iso ? new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : '-')

  const isUpcoming = (iso) => iso && new Date(iso) > new Date()
  const testLookup = new Map(tests.map((test) => [test.id, test]))
  const describeSession = (session) => {
    const candidate = session.user_name || session.user_id || 'candidate'
    const testName = session.test_title || session.exam_title || testLookup.get(session.exam_id)?.name || 'test'
    return `${candidate} for ${testName}`
  }
  const normalizedSearch = search.trim().toLowerCase()

  const filtered = sessions.filter((session) => {
    if (normalizedSearch && ![
      session.test_title || session.exam_title,
      testLookup.get(session.exam_id)?.name,
      testLookup.get(session.exam_id)?.code,
      session.user_name,
      session.user_id,
    ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedSearch))) {
      return false
    }
    if (statusTab === 'Upcoming') return isUpcoming(session.scheduled_at)
    if (statusTab === 'Past') return !isUpcoming(session.scheduled_at)
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const da = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
    const db = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
    return sortOrder === 'asc' ? da - db : db - da
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const upcomingCount = sessions.filter((session) => isUpcoming(session.scheduled_at)).length
  const restrictedCount = sessions.filter((session) => session.access_mode === 'RESTRICTED').length
  const hasActiveFilters = Boolean(normalizedSearch) || statusTab !== 'All' || sortOrder !== 'asc'
  const editTarget = editId ? sessions.find((session) => session.id === editId) : null
  const summaryCards = [
    {
      label: t('admin_sessions_loaded_sessions'),
      value: sessions.length,
      helper: sessionsReady ? t('admin_sessions_helper_available') : t('admin_sessions_helper_needs_retry'),
    },
    {
      label: t('admin_sessions_visible_now'),
      value: sorted.length,
      helper: hasActiveFilters ? t('admin_sessions_helper_matching_filters') : t('admin_sessions_helper_all_loaded'),
    },
    {
      label: t('admin_sessions_upcoming'),
      value: upcomingCount,
      helper: t('admin_sessions_helper_scheduled_future'),
    },
    {
      label: t('admin_sessions_restricted_access'),
      value: restrictedCount,
      helper: t('admin_sessions_helper_require_window'),
    },
  ]

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const clearFilters = () => {
    setSearch('')
    setStatusTab('All')
    setSortOrder('asc')
    setPage(1)
  }

  const openEdit = (session) => {
    setEditId(session.id)
    const localDt = utcToLocalDatetimeInput(session.scheduled_at)
    setEditForm({ scheduled_at: localDt, access_mode: session.access_mode || 'OPEN', notes: session.notes || '' })
    setEditError('')
    setEditModal(true)
  }

  const handleEdit = async () => {
    if (editSaving) return
    setEditError('')
    if (!editForm.scheduled_at) {
      setEditError(t('admin_sessions_error_date_required'))
      return
    }
    setEditSaving(true)
    try {
      await adminApi.updateSchedule(editId, {
        scheduled_at: new Date(editForm.scheduled_at).toISOString(),
        access_mode: editForm.access_mode,
        notes: editForm.notes || '',
      })
      setEditModal(false)
      setEditId(null)
      setNotice(t('admin_sessions_notice_updated'))
      setTimeout(() => setNotice(''), 3000)
      await load()
    } catch (err) {
      setEditError(err.response?.data?.detail || t('admin_sessions_error_update_session'))
    } finally {
      setEditSaving(false)
    }
  }

  const handleCreate = async () => {
    if (saving) return
    setModalError('')
    if (!form.exam_id || !form.user_id) {
      setModalError(t('admin_sessions_error_select_test_learner'))
      return
    }
    if (!form.scheduled_at) {
      setModalError(t('admin_sessions_error_date_required'))
      return
    }
    setSaving(true)
    try {
      const existing = sessions.find(
        (session) =>
          String(session.exam_id) === String(form.exam_id)
          && String(session.user_id) === String(form.user_id),
      )
      const payload = {
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        access_mode: form.access_mode,
        notes: form.notes || '',
      }
      if (existing?.id) {
        await adminApi.updateSchedule(existing.id, payload)
      } else {
        await adminApi.createSchedule({
          exam_id: form.exam_id,
          user_id: form.user_id,
          ...payload,
        })
      }
      setModal(false)
      setForm({ exam_id: '', user_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' })
      setNotice(existing?.id ? t('admin_sessions_notice_updated') : t('admin_sessions_notice_created'))
      setTimeout(() => setNotice(''), 3000)
      await load()
    } catch (err) {
      setModalError(err.response?.data?.detail || t('admin_sessions_error_save_session'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (deleteBusyId) return
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    setDeleteBusyId(id)
    try {
      await adminApi.deleteSchedule(id)
      setDeleteConfirmId(null)
      setNotice(t('admin_sessions_notice_deleted'))
      setTimeout(() => setNotice(''), 3000)
      await load()
    } catch (err) {
      setDeleteConfirmId(null)
      setError(err.response?.data?.detail || t('admin_sessions_error_delete_session'))
      setTimeout(() => setError(''), 4000)
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_sessions_title')} subtitle={t('admin_sessions_subtitle')}>
        {canAssignSchedules && (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setModal(true)
              setModalError('')
            }}
            disabled={!canCreateSession || saving}
          >
            {t('admin_sessions_new_session')}
          </button>
        )}
      </AdminPageHeader>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.errorMsg}>{error}</div>}
      {bootstrapMessage && (
        <div className={styles.helperRow}>
          <span className={styles.emptyHint}>{bootstrapMessage}</span>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
            {loading ? t('admin_sessions_retrying') : t('admin_sessions_retry')}
          </button>
        </div>
      )}

      <div className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </div>
        ))}
      </div>

      <div className={styles.toolbarPanel}>
        <div className={styles.toolbar}>
          <input
            className={styles.search}
            placeholder={t('admin_sessions_search_placeholder')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <div className={styles.filterTabs}>
            {['All', 'Upcoming', 'Past'].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.filterTab} ${statusTab === tab ? styles.filterTabActive : ''}`}
                onClick={() => {
                  setStatusTab(tab)
                  setPage(1)
                }}
              >
                {tab}
                <span className={styles.filterCount}>
                  {tab === 'All'
                    ? sessions.length
                    : tab === 'Upcoming'
                      ? upcomingCount
                      : sessions.filter((session) => !isUpcoming(session.scheduled_at)).length}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.sortBtn}
            onClick={() => setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'))}
          >
            {sortOrder === 'asc' ? t('admin_sessions_sort_soonest') : t('admin_sessions_sort_latest')}
          </button>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
              {loading ? t('admin_sessions_refreshing') : t('admin_sessions_refresh')}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={clearFilters} disabled={!hasActiveFilters}>
              {t('admin_sessions_clear_filters')}
            </button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          {t('admin_sessions_showing')} {sorted.length} {t('admin_sessions_matching_session')}{sorted.length !== 1 ? t('admin_sessions_plural_s') : ''} {t('admin_sessions_across')} {sessions.length} {t('admin_sessions_loaded')}.
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_sessions_loading_title')}</div>
          <div className={styles.emptyText}>{t('admin_sessions_loading_text')}</div>
        </div>
      ) : !sessionsReady ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_sessions_unable_to_load')}</div>
          <div className={styles.emptyText}>{t('admin_sessions_unable_to_load_text')}</div>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
            {t('admin_sessions_retry')}
          </button>
        </div>
      ) : sorted.length === 0 && hasActiveFilters ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_sessions_no_match_title')}</div>
          <div className={styles.emptyText}>{t('admin_sessions_no_match_text')}</div>
          <button type="button" className={styles.btnSecondary} onClick={clearFilters}>
            {t('admin_sessions_clear_filters')}
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_sessions_no_sessions_title')}</div>
          <div className={styles.emptyText}>{t('admin_sessions_no_sessions_text')}</div>
        </div>
      ) : paginated.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_sessions_no_page_title')}</div>
          <div className={styles.emptyText}>{t('admin_sessions_no_page_text')}</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {paginated.map((session) => {
            const upcoming = isUpcoming(session.scheduled_at)
            const isRestricted = session.access_mode === 'RESTRICTED'
            const linkedTest = testLookup.get(session.exam_id)
            const testCode = linkedTest?.code || session.test_code
            const sessionLabel = describeSession(session)

            return (
              <div key={session.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.cardTitle}>{session.test_title || session.exam_title || t('admin_sessions_test')}</div>
                    <div className={styles.cardSub}>{session.user_name || session.user_id || t('admin_sessions_candidate')}</div>
                  </div>
                  <div className={styles.statusMeta}>
                    <span className={styles.statusLabel}>{upcoming ? t('admin_sessions_upcoming') : t('admin_sessions_past')}</span>
                    <div className={`${styles.statusDot} ${upcoming ? styles.statusUpcoming : styles.statusPast}`} title={upcoming ? t('admin_sessions_upcoming') : t('admin_sessions_past')} />
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.detailRow}>
                    <span>{t('admin_sessions_scheduled')}</span>
                    <span>{formatDate(session.scheduled_at)}</span>
                  </div>
                  <div className={styles.modeRow}>
                    <span className={`${styles.modeBadge} ${isRestricted ? styles.modeRestricted : styles.modeOpen}`}>
                      {session.access_mode || 'OPEN'}
                    </span>
                  </div>
                  <div className={styles.detailList}>
                    {testCode && (
                      <div className={styles.detailRow}>
                        <span>{t('admin_sessions_test_code')}</span>
                        <span>{testCode}</span>
                      </div>
                    )}
                    <div className={styles.detailRow}>
                      <span>{t('admin_sessions_candidate_id')}</span>
                      <span>{session.user_id || '-'}</span>
                    </div>
                  </div>
                  <div className={session.notes ? styles.notes : styles.notesEmpty}>
                    {session.notes || t('admin_sessions_no_notes')}
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  {canAssignSchedules && (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtnEdit}
                        onClick={() => openEdit(session)}
                        aria-label={`Edit session for ${sessionLabel}`}
                        title={`Edit session for ${sessionLabel}`}
                      >
                        {t('admin_sessions_edit_session')}
                      </button>
                      {deleteConfirmId === session.id ? (
                        <>
                          <button
                            type="button"
                            className={styles.actionBtnConfirm}
                            onClick={() => void handleDelete(session.id)}
                            disabled={deleteBusyId === session.id}
                            aria-label={`Confirm delete for session ${sessionLabel}`}
                          >
                            {deleteBusyId === session.id ? t('admin_sessions_deleting') : t('admin_sessions_confirm_delete')}
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtnCancel}
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={deleteBusyId === session.id}
                            aria-label={`Keep session for ${sessionLabel}`}
                          >
                            {t('admin_sessions_keep_session')}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.actionBtnDanger}
                          onClick={() => void handleDelete(session.id)}
                          disabled={deleteBusyId === session.id}
                          aria-label={`Delete session for ${sessionLabel}`}
                          title={`Delete session for ${sessionLabel}`}
                        >
                          {t('admin_sessions_delete_session')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>{sorted.length} {t('admin_sessions_session')}{sorted.length !== 1 ? t('admin_sessions_plural_s') : ''} | {t('admin_sessions_page')} {page} {t('admin_sessions_of')} {totalPages}</span>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1}>{t('admin_sessions_previous')}</button>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page === totalPages}>{t('admin_sessions_next')}</button>
        </div>
      )}

      {modalRoot && editModal && createPortal(
        <div className={styles.modalOverlay} onClick={() => { if (!editSaving) { setEditModal(false); setEditError('') } }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-session-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="edit-session-dialog-title" className={styles.modalTitle}>{t('admin_sessions_edit_session_title')}</h3>
            {editTarget && <div className={styles.modalMeta}>{describeSession(editTarget)}</div>}
            {editError && <div className={styles.modalError}>{editError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="edit-session-date">{t('admin_sessions_scheduled_date_time')}</label>
              <input id="edit-session-date" className={styles.input} type="datetime-local" value={editForm.scheduled_at} onChange={(event) => setEditForm((currentForm) => ({ ...currentForm, scheduled_at: event.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="edit-session-mode">{t('admin_sessions_access_mode')}</label>
              <select id="edit-session-mode" className={styles.select} value={editForm.access_mode} onChange={(event) => setEditForm((currentForm) => ({ ...currentForm, access_mode: event.target.value }))}>
                <option value="OPEN">{t('admin_sessions_open_anytime')}</option>
                <option value="RESTRICTED">{t('admin_sessions_restricted_by_schedule')}</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="edit-session-notes">{t('admin_sessions_notes')}</label>
              <textarea id="edit-session-notes" className={styles.textarea} rows={3} value={editForm.notes} onChange={(event) => setEditForm((currentForm) => ({ ...currentForm, notes: event.target.value }))} placeholder={t('admin_sessions_optional_notes')} />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={() => { if (!editSaving) { setEditModal(false); setEditError('') } }} disabled={editSaving}>{t('admin_sessions_cancel')}</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleEdit()} disabled={!editForm.scheduled_at || editSaving}>
                {editSaving ? t('admin_sessions_saving') : t('admin_sessions_save_changes')}
              </button>
            </div>
          </div>
        </div>,
        modalRoot,
      )}

      {modalRoot && modal && createPortal(
        <div className={styles.modalOverlay} onClick={() => { if (!saving) { setModal(false); setModalError('') } }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-session-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="create-session-dialog-title" className={styles.modalTitle}>{t('admin_sessions_new_session_title')}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="create-session-test">{t('admin_sessions_test')}</label>
              <select id="create-session-test" className={styles.select} value={form.exam_id} onChange={(event) => setForm((currentForm) => ({ ...currentForm, exam_id: event.target.value }))} disabled={!testsReady}>
                <option value="">{t('admin_sessions_select_test')}</option>
                {tests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.name}{test.code ? ` (${test.code})` : ''} - {test.status}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="create-session-user">{t('admin_sessions_candidate')}</label>
              <select id="create-session-user" className={styles.select} value={form.user_id} onChange={(event) => setForm((currentForm) => ({ ...currentForm, user_id: event.target.value }))} disabled={!usersReady}>
                <option value="">{t('admin_sessions_select_learner')}</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.user_id} - {user.name || user.email}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="create-session-date">Scheduled Date and Time</label>
              <input id="create-session-date" className={styles.input} type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm((currentForm) => ({ ...currentForm, scheduled_at: event.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="create-session-mode">Access Mode</label>
              <select id="create-session-mode" className={styles.select} value={form.access_mode} onChange={(event) => setForm((currentForm) => ({ ...currentForm, access_mode: event.target.value }))}>
                <option value="OPEN">{t('settings_open_anytime')}</option>
                <option value="RESTRICTED">{t('settings_restricted_by_schedule')}</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="create-session-notes">Notes</label>
              <textarea id="create-session-notes" className={styles.textarea} rows={3} value={form.notes} onChange={(event) => setForm((currentForm) => ({ ...currentForm, notes: event.target.value }))} placeholder="Optional notes..." />
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => { if (!saving) { setModal(false); setModalError('') } }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void handleCreate()}
                disabled={!form.exam_id || !form.user_id || !form.scheduled_at || !canCreateSession || saving}
              >
                {saving ? 'Saving...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>,
        modalRoot,
      )}
    </div>
  )
}
