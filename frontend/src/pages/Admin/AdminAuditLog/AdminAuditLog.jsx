import { Fragment, useState, useEffect, useCallback } from 'react'
import { adminApi } from '../../../services/admin.service'
import { readPaginatedItems, readPaginatedTotal } from '../../../utils/pagination'
import styles from './AdminAuditLog.module.scss'

const PAGE_SIZE = 50

const ACTION_TYPES = ['create', 'update', 'delete', 'login', 'logout', 'export', 'publish', 'archive', 'view']

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString()
}

function downloadCsv(rows) {
  const header = ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Detail', 'IP Address']
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
      setError(e?.response?.data?.detail || 'Failed to load audit logs.')
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
          <h1 className={styles.title}>Audit Log</h1>
          <p className={styles.subtitle}>{totalLogs} matching entries</p>
        </div>
        <div className={styles.headerActions}>
          {hasActiveFilters && (
            <button type="button" className={styles.refreshBtn} onClick={clearFilters} disabled={loading}>
              Clear filters
            </button>
          )}
          <button type="button" className={styles.refreshBtn} onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {logs.length > 0 && (
            <button type="button" className={styles.exportBtn} onClick={() => downloadCsv(logs)}>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.errorRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button type="button" className={styles.refreshBtn} onClick={load} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search action or resource ID..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0) }}
        />
        <select
          className={styles.filterSelect}
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0) }}
        >
          <option value="">All actions</option>
          {ACTION_TYPES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <div className={styles.dateRow}>
          <label className={styles.dateLabel}>From</label>
          <input
            type="date"
            className={styles.dateInput}
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(0) }}
          />
          <label className={styles.dateLabel}>To</label>
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
          <div className={styles.summaryLabel}>Matching entries</div>
            <div className={styles.summaryValue}>{totalLogs}</div>
          </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Visible on page</div>
          <div className={styles.summaryValue}>{visibleEntries}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Actors</div>
          <div className={styles.summaryValue}>{uniqueActors}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Actions</div>
          <div className={styles.summaryValue}>{uniqueActions}</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.loadingRow}>Loading audit logs...</div>
        ) : paginated.length === 0 ? (
          <div className={styles.emptyRow}>
            <span>No audit log entries match your filters.</span>
            {hasActiveFilters && (
              <button type="button" className={styles.inlineBtn} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Resource ID</th>
                <th>IP Address</th>
                <th>Detail</th>
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
                        {log.action}
                      </span>
                    </td>
                    <td className={styles.muteCell}>{log.resource_type || '-'}</td>
                    <td className={styles.muteCell}>{log.resource_id ? `${log.resource_id.slice(0, 12)}${log.resource_id.length > 12 ? '...' : ''}` : '-'}</td>
                    <td className={styles.muteCell}>{log.ip_address || '-'}</td>
                    <td className={styles.detailCell}>
                      <div className={styles.detailPreview}>{log.detail ? `${log.detail.slice(0, 60)}${log.detail.length > 60 ? '...' : ''}` : '-'}</div>
                      <button
                        type="button"
                        className={styles.inlineBtn}
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        aria-expanded={expanded === log.id}
                      >
                        {expanded === log.id ? 'Hide detail' : 'View detail'}
                      </button>
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr className={styles.expandedRow}>
                      <td colSpan={7}>
                        <div className={styles.expandedContent}>
                          <strong>Full Detail:</strong>
                          <pre className={styles.detailPre}>{log.detail || 'No detail'}</pre>
                          <div className={styles.expandedMeta}>
                            <span>User ID: {log.user_id || '-'}</span>
                            <span>Resource ID: {log.resource_id || '-'}</span>
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
            Page {page + 1} of {totalPages} ({totalLogs} matching)
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
          >
            Prev
          </button>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            disabled={page >= totalPages - 1 || totalPages === 0}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
