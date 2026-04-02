import { Fragment, useState, useEffect, useCallback } from 'react'
import { adminApi } from '../../../services/admin.service'
import { readPaginatedItems, readPaginatedTotal } from '../../../utils/pagination'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminAuditLog.module.scss'

const PAGE_SIZE = 50

const ACTION_TYPES = ['create', 'update', 'delete', 'login', 'logout', 'export', 'publish', 'archive', 'view']

const ACTION_LABEL_KEYS = {
  USER_LOGIN: 'audit_action_user_login',
  USER_LOGOUT: 'audit_action_user_logout',
  PASSWORD_CHANGED: 'audit_action_password_changed',
  PASSWORD_RESET: 'audit_action_password_reset',
  USER_UPDATED: 'audit_action_user_updated',
  USER_ROLE_CHANGED: 'audit_action_user_role_changed',
  TEST_CREATED: 'audit_action_test_created',
  TEST_UPDATED: 'audit_action_test_updated',
  TEST_PUBLISHED: 'audit_action_test_published',
  TEST_UNPUBLISHED: 'audit_action_test_unpublished',
  TEST_ARCHIVED: 'audit_action_test_archived',
  TEST_UNARCHIVED: 'audit_action_test_unarchived',
  TEST_DELETED: 'audit_action_test_deleted',
  TEST_DUPLICATED: 'audit_action_test_duplicated',
  PROCTORING_CONFIG_UPDATED: 'audit_action_proctoring_config_updated',
  CATEGORY_CREATED: 'audit_action_category_created',
  CATEGORY_UPDATED: 'audit_action_category_updated',
  CATEGORY_DELETED: 'audit_action_category_deleted',
  GRADING_SCALE_CREATED: 'audit_action_grading_scale_created',
  GRADING_SCALE_UPDATED: 'audit_action_grading_scale_updated',
  GRADING_SCALE_DELETED: 'audit_action_grading_scale_deleted',
  QUESTION_POOL_CREATED: 'audit_action_question_pool_created',
  QUESTION_POOL_UPDATED: 'audit_action_question_pool_updated',
  QUESTION_POOL_DELETED: 'audit_action_question_pool_deleted',
  SCHEDULE_CREATED: 'audit_action_schedule_created',
  SCHEDULE_UPDATED: 'audit_action_schedule_updated',
  SCHEDULE_DELETED: 'audit_action_schedule_deleted',
  CUSTOM_REPORT_EXPORTED: 'audit_action_custom_report_exported',
  EXAM_REPORT_EXPORTED: 'audit_action_exam_report_exported',
  REPORT_SCHEDULE_CREATED: 'audit_action_report_schedule_created',
  REPORT_SCHEDULE_DELETED: 'audit_action_report_schedule_deleted',
  REPORT_SCHEDULE_RUN: 'audit_action_report_schedule_run',
  ROLE_PERMISSIONS_UPDATED: 'audit_action_role_permissions_updated',
}

const DETAIL_LABEL_KEYS = {
  'Successful login': 'audit_detail_successful_login',
  'User logged out': 'audit_detail_user_logged_out',
  'Password changed by authenticated user': 'audit_detail_password_changed',
  'Password reset via token': 'audit_detail_password_reset',
}

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString()
}

function downloadCsv(rows, t) {
  const header = [t('admin_audit_csv_timestamp'), t('admin_audit_csv_user'), t('admin_audit_csv_action'), t('admin_audit_csv_resource_type'), t('admin_audit_csv_resource_id'), t('admin_audit_csv_detail'), t('admin_audit_csv_ip_address')]
  const lines = rows.map((row) => [
    formatDate(row.created_at),
    row.user?.email || row.user_id || '-',
    row.action,
    row.resource_type || '-',
    row.resource_id || '-',
    (row.detail || '').replace(/,/g, ';'),
    row.ip_address || '-',
  ].map((value) => `"${value}"`).join(','))
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-log-${Date.now()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminAuditLog() {
  const { t } = useLanguage()
  const [logs, setLogs] = useState([])
  const [totalLogs, setTotalLogs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)

  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }
      if (q.trim()) params.q = q.trim()
      if (action) params.action = action
      if (fromDate) params.from_date = new Date(fromDate).toISOString()
      if (toDate) params.to_date = new Date(`${toDate}T23:59:59`).toISOString()
      const res = await adminApi.auditLog(params)
      setLogs(readPaginatedItems(res.data))
      setTotalLogs(readPaginatedTotal(res.data))
      setExpanded(null)
    } catch (e) {
      setError(e?.response?.data?.detail || t('admin_audit_load_error'))
    } finally {
      setLoading(false)
    }
  }, [action, fromDate, page, q, toDate])

  useEffect(() => {
    void load()
  }, [load])

  const paginated = logs
  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE))
  const hasActiveFilters = Boolean(q.trim() || action || fromDate || toDate)
  const visibleEntries = paginated.length
  const uniqueActors = new Set(logs.map((log) => log.user?.email || log.user_id).filter(Boolean)).size
  const uniqueActions = new Set(logs.map((log) => log.action).filter(Boolean)).size

  const clearFilters = () => {
    setQ('')
    setAction('')
    setFromDate('')
    setToDate('')
    setExpanded(null)
    setPage(0)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('admin_audit_title')}</h1>
          <p className={styles.subtitle}>{t('admin_audit_matching_entries', { count: totalLogs })}</p>
        </div>
        <div className={styles.headerActions}>
          {hasActiveFilters && (
            <button type="button" className={styles.refreshBtn} onClick={clearFilters} disabled={loading}>
              {t('admin_audit_clear_filters')}
            </button>
          )}
          <button type="button" className={styles.refreshBtn} onClick={load} disabled={loading}>
            {loading ? t('admin_audit_loading_btn') : t('admin_audit_refresh')}
          </button>
          {logs.length > 0 && (
            <button type="button" className={styles.exportBtn} onClick={() => downloadCsv(logs, t)}>
              {t('admin_audit_export_csv')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.errorRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button type="button" className={styles.refreshBtn} onClick={load} disabled={loading}>
            {t('admin_audit_retry')}
          </button>
        </div>
      )}

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('admin_audit_search_placeholder')}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0) }}
        />
        <select
          className={styles.filterSelect}
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0) }}
        >
          <option value="">{t('admin_audit_all_actions')}</option>
          {ACTION_TYPES.map((item) => (
            <option key={item} value={item}>{t(`audit_filter_${item}`)}</option>
          ))}
        </select>
        <div className={styles.dateRow}>
          <label className={styles.dateLabel}>{t('admin_audit_from')}</label>
          <input
            type="date"
            className={styles.dateInput}
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(0) }}
          />
          <label className={styles.dateLabel}>{t('admin_audit_to')}</label>
          <input
            type="date"
            className={styles.dateInput}
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(0) }}
          />
        </div>
      </div>

      <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('admin_audit_matching_entries_label')}</div>
            <div className={styles.summaryValue}>{totalLogs}</div>
          </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('admin_audit_visible_on_page')}</div>
          <div className={styles.summaryValue}>{visibleEntries}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('admin_audit_actors')}</div>
          <div className={styles.summaryValue}>{uniqueActors}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('admin_audit_actions')}</div>
          <div className={styles.summaryValue}>{uniqueActions}</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.loadingRow}>{t('admin_audit_loading')}</div>
        ) : paginated.length === 0 ? (
          <div className={styles.emptyRow}>
            <span>{t('admin_audit_no_match')}</span>
            {hasActiveFilters && (
              <button type="button" className={styles.inlineBtn} onClick={clearFilters}>
                {t('admin_audit_clear_filters')}
              </button>
            )}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin_audit_th_timestamp')}</th>
                <th>{t('admin_audit_th_user')}</th>
                <th>{t('admin_audit_th_action')}</th>
                <th>{t('admin_audit_th_resource')}</th>
                <th>{t('admin_audit_th_resource_id')}</th>
                <th>{t('admin_audit_th_ip')}</th>
                <th>{t('admin_audit_th_detail')}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((log) => (
                <Fragment key={log.id}>
                  <tr className={styles.row}>
                    <td className={styles.tsCell}>{formatDate(log.created_at)}</td>
                    <td className={styles.userCell}>{log.user?.email || log.user_id?.slice(0, 8) || '-'}</td>
                    <td>
                      <span className={`${styles.actionBadge} ${styles[`action_${log.action?.split('_')[0]}`] || ''}`}>
                        {ACTION_LABEL_KEYS[log.action] ? t(ACTION_LABEL_KEYS[log.action]) : log.action}
                      </span>
                    </td>
                    <td className={styles.muteCell}>{log.resource_type || '-'}</td>
                    <td className={styles.muteCell}>{log.resource_id ? `${log.resource_id.slice(0, 12)}${log.resource_id.length > 12 ? '...' : ''}` : '-'}</td>
                    <td className={styles.muteCell}>{log.ip_address || '-'}</td>
                    <td className={styles.detailCell}>
                      <div className={styles.detailPreview}>{log.detail ? (() => { const translated = DETAIL_LABEL_KEYS[log.detail] ? t(DETAIL_LABEL_KEYS[log.detail]) : log.detail; return `${translated.slice(0, 60)}${translated.length > 60 ? '...' : ''}`; })() : '-'}</div>
                      <button
                        type="button"
                        className={styles.inlineBtn}
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        aria-expanded={expanded === log.id}
                      >
                        {expanded === log.id ? t('admin_audit_hide_detail') : t('admin_audit_view_detail')}
                      </button>
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr className={styles.expandedRow}>
                      <td colSpan={7}>
                        <div className={styles.expandedContent}>
                          <strong>{t('admin_audit_full_detail')}</strong>
                          <pre className={styles.detailPre}>{log.detail ? (DETAIL_LABEL_KEYS[log.detail] ? t(DETAIL_LABEL_KEYS[log.detail]) : log.detail) : t('admin_audit_no_detail')}</pre>
                          <div className={styles.expandedMeta}>
                            <span>{t('admin_audit_user_id')}: {log.user_id || '-'}</span>
                            <span>{t('admin_audit_resource_id')}: {log.resource_id || '-'}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            {t('admin_audit_page_info', { current: page + 1, total: totalPages, matching: totalLogs })}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
          >
            {t('admin_audit_prev')}
          </button>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            disabled={page >= totalPages - 1 || totalPages === 0}
          >
            {t('admin_audit_next')}
          </button>
        </div>
      )}
    </div>
  )
}
