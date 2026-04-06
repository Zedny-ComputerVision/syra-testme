import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { fetchAuthenticatedMediaObjectUrl, revokeObjectUrl } from '../../../utils/authenticatedMedia'
import useLanguage from '../../../hooks/useLanguage'
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

function formatDate(value, t) {
  if (!value) return t('admin_reports_never')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('admin_reports_never')
  return date.toLocaleString()
}

export default function AdminReports() {
  const { t } = useLanguage()
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
  const [openingNoticeLink, setOpeningNoticeLink] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [modal, setModal] = useState(false)
  const [modalError, setModalError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.reportSchedules()
      setSchedules(data || [])
      setListError('')
    } catch (err) {
      setSchedules([])
      setListError(err.response?.data?.detail || t('admin_reports_failed_load_schedules'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const validateForm = () => {
    if (!form.name.trim()) {
      setModalError(t('admin_reports_name_required'))
      return null
    }
    if (!REPORT_TYPES.has(form.report_type)) {
      setModalError(t('admin_reports_select_valid_type'))
      return null
    }
    if (!form.schedule_cron.trim()) {
      setModalError(t('admin_reports_cron_required'))
      return null
    }
    const recipients = parseRecipients(form.recipients)
    const invalidRecipient = recipients.find((entry) => !EMAIL_RE.test(entry))
    if (invalidRecipient) {
      setModalError(`${t('admin_reports_invalid_recipient_email')}: ${invalidRecipient}`)
      return null
    }
    return recipients
  }

  const resetModal = () => {
    if (creating) return
    setModal(false)
    setForm({ name: '', report_type: 'attempt-summary', schedule_cron: '0 8 * * *', recipients: '' })
    setModalError('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setModalError('')
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
      setNotice(t('admin_reports_schedule_created'))
      resetModal()
      await load()
    } catch (err) {
      setModalError(err.response?.data?.detail || t('admin_reports_could_not_create'))
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
      setNotice(t('admin_reports_schedule_deleted'))
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || t('admin_reports_could_not_delete'))
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
      setNotice(data?.detail || t('admin_reports_run_completed'))
      setNoticeLink(data?.report_url || '')
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || t('admin_reports_could_not_run'))
    } finally {
      setRunningId(null)
    }
  }

  const handleOpenGeneratedReport = async () => {
    if (!noticeLink) return
    setOpeningNoticeLink(true)
    try {
      const objectUrl = await fetchAuthenticatedMediaObjectUrl(noticeLink)
      const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer')
      if (!opened) {
        setError(t('admin_reports_popup_blocked'))
      }
      window.setTimeout(() => revokeObjectUrl(objectUrl), 60_000)
    } catch {
      setError(t('admin_reports_could_not_open_report'))
    } finally {
      setOpeningNoticeLink(false)
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
        setModalError(t('admin_reports_no_subscribers'))
        return
      }
      const merged = [...new Set([...parseRecipients(form.recipients), ...subscribers])]
      setForm((current) => ({ ...current, recipients: merged.join(', ') }))
      setModalError('')
    } catch {
      setModalError(t('admin_reports_could_not_load_subscribers'))
    } finally {
      setLoadingSubs(false)
    }
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
      label: t('admin_reports_scheduled_reports'),
      value: schedules.length,
      helper: t('admin_reports_automation_jobs_loaded'),
    },
    {
      label: t('admin_reports_visible_now'),
      value: filteredSchedules.length,
      helper: hasActiveFilters ? t('admin_reports_matching_active_filters') : t('admin_reports_all_loaded_schedules'),
    },
    {
      label: t('admin_reports_recipients'),
      value: uniqueRecipientCount,
      helper: t('admin_reports_unique_delivery_targets'),
    },
    {
      label: t('admin_reports_run_at_least_once'),
      value: ranAtLeastOnceCount,
      helper: t('admin_reports_schedules_with_history'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_reports_title')} subtitle={t('admin_reports_subtitle')}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => {
            setModal(true)
            setModalError('')
          }}
        >
          {t('admin_report_schedules_new_schedule')}
        </button>
      </AdminPageHeader>

      {notice && (
        <div className={styles.noticeBanner}>
          <div>{notice}</div>
          {noticeLink && (
            <a
              href={noticeLink}
              className={styles.noticeLink}
              onClick={(event) => {
                event.preventDefault()
                void handleOpenGeneratedReport()
              }}
              aria-disabled={openingNoticeLink ? 'true' : 'false'}
            >
              {openingNoticeLink ? t('admin_reports_opening_report') : t('admin_reports_open_generated_report')}
            </a>
          )}
        </div>
      )}
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button type="button" className={styles.actionBtn} onClick={() => void load()}>{t('admin_reports_retry')}</button>
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
            type="text"
            className={styles.searchInput}
            placeholder={t('admin_reports_search_placeholder')}
            aria-label={t('admin_reports_search_schedules')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">{t('admin_reports_all_types')}</option>
            <option value="attempt-summary">{t('admin_reports_attempt_summary')}</option>
            <option value="risk-alerts">{t('admin_reports_risk_alerts')}</option>
            <option value="usage">{t('admin_reports_usage')}</option>
          </select>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>
              {loading ? t('admin_reports_refreshing') : t('admin_reports_refresh')}
            </button>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              {t('admin_reports_clear_filters')}
            </button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          {t('admin_reports_showing')} {filteredSchedules.length} {filteredSchedules.length !== 1 ? t('admin_reports_schedules') : t('admin_reports_schedule')} {t('admin_reports_across')} {schedules.length} {t('admin_reports_loaded')}.
        </div>
      </div>

      {listError && (
        <div className={styles.helperRow}>
          <span className={styles.errorBanner}>{listError}</span>
          <button type="button" className={styles.actionBtn} onClick={load} disabled={loading}>
            {t('admin_reports_retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_reports_loading')}</div>
        </div>
      ) : filteredSchedules.length === 0 && hasActiveFilters ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_reports_no_match_filters')}</div>
          <div className={styles.emptyText}>{t('admin_reports_clear_filters_hint')}</div>
          <button type="button" className={styles.actionBtn} onClick={clearFilters}>{t('admin_reports_clear_filters')}</button>
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_reports_no_schedules_yet')}</div>
          <div className={styles.emptyText}>{t('admin_reports_empty_hint')}</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredSchedules.map((schedule) => (
            <div className={styles.card} key={schedule.id} data-testid="report-schedule-row">
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardTitle}>{schedule.name}</span>
                  <span className={styles.typeBadge}>{schedule.report_type}</span>
                </div>
                <div className={styles.actionBtns}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleRun(schedule.id)}
                    disabled={runningId === schedule.id || deletingId === schedule.id}
                  >
                    {runningId === schedule.id ? t('admin_reports_running') : t('admin_reports_run_now')}
                  </button>
                  {deleteConfirmId === schedule.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtnDanger}
                        onClick={() => handleDelete(schedule.id)}
                        disabled={runningId === schedule.id || deletingId === schedule.id}
                      >
                        {deletingId === schedule.id ? t('admin_reports_deleting') : t('admin_reports_confirm_delete')}
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setDeleteConfirmId('')}
                        disabled={deletingId === schedule.id}
                      >
                        {t('admin_reports_cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => handleDelete(schedule.id)}
                      disabled={runningId === schedule.id || deletingId === schedule.id}
                    >
                      {t('admin_reports_delete')}
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.cardMeta}>
                {t('admin_report_schedules_cron_label')}: {schedule.schedule_cron}
              </div>
              <div className={styles.cardMeta}>
                {t('admin_reports_recipients')}: {(schedule.recipients || []).join(', ')}
              </div>
              <div className={styles.cardMetaMuted}>
                {t('admin_reports_last_run')}: {formatDate(schedule.last_run_at, t)} &middot; {t('admin_reports_created')}: {formatDate(schedule.created_at, t)}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={resetModal}>
          <form
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-schedule-dialog-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h3 id="report-schedule-dialog-title" className={styles.modalTitle}>{t('admin_report_schedules_new_schedule_title')}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="report-schedule-name">{t('admin_reports_name')}</label>
              <input id="report-schedule-name" className={styles.input} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="report-schedule-type">{t('admin_reports_report_type')}</label>
              <select id="report-schedule-type" className={styles.input} value={form.report_type} onChange={(e) => setForm((current) => ({ ...current, report_type: e.target.value }))}>
                <option value="attempt-summary">{t('admin_reports_attempt_summary')}</option>
                <option value="risk-alerts">{t('admin_reports_risk_alerts')}</option>
                <option value="usage">{t('admin_reports_usage')}</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="report-schedule-cron">{t('admin_reports_cron')}</label>
              <input id="report-schedule-cron" className={styles.input} value={form.schedule_cron} onChange={(e) => setForm((current) => ({ ...current, schedule_cron: e.target.value }))} />
              <div className={styles.hint}>{t('admin_reports_cron_example')}</div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="report-schedule-recipients">{t('admin_reports_recipients_label')}</label>
              <input id="report-schedule-recipients" className={styles.input} value={form.recipients} onChange={(e) => setForm((current) => ({ ...current, recipients: e.target.value }))} />
              <button type="button" className={styles.hintBtn} onClick={loadSubscribers} disabled={loadingSubs}>
                {loadingSubs ? t('admin_reports_loading') : t('admin_reports_load_from_subscribers')}
              </button>
              <div className={styles.hint}>{t('admin_reports_subscribers_tip')}</div>
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={resetModal} disabled={creating}>
                {t('admin_reports_cancel')}
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={creating || !form.name.trim()}>
                {creating ? t('admin_reports_saving') : t('admin_reports_save_schedule')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
