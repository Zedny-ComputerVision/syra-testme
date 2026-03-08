import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { normalizeAdminTest } from '../../../utils/assessmentAdapters'
import styles from './AdminExams.module.scss'

const COLUMN_STORAGE_KEY = 'admin-tests-columns'
const DEFAULT_COLUMNS = {
  name: true,
  code: true,
  type: true,
  status: true,
  time_limit_minutes: true,
  testing_sessions: true,
  updated_at: true,
}
const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50]
const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'updated_at:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
]

function loadStoredColumns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_COLUMNS, ...parsed } : DEFAULT_COLUMNS
  } catch {
    return DEFAULT_COLUMNS
  }
}

function statusLabel(status) {
  if (status === 'PUBLISHED') return 'Published'
  if (status === 'ARCHIVED') return 'Archived'
  return 'Draft'
}

function resolveError(err) {
  return (
    err.response?.data?.detail ||
    err.response?.data?.error?.message ||
    err.response?.data?.error?.detail ||
    'Action failed.'
  )
}

function visibleRange(page, pageSize, total) {
  if (total === 0) return '0-0'
  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  return `${start}-${end}`
}

export default function AdminExams() {
  const navigate = useNavigate()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showColumns, setShowColumns] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [columnDraft, setColumnDraft] = useState(loadStoredColumns)
  const [columns, setColumns] = useState(loadStoredColumns)
  const [filters, setFilters] = useState({ status: '', type: '' })
  const [filterDraft, setFilterDraft] = useState({ status: '', type: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState(SORT_OPTIONS[0].value)
  const [total, setTotal] = useState(0)
  const [busyId, setBusyId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [reportBusyId, setReportBusyId] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [openMenuId, setOpenMenuId] = useState('')

  const load = async ({
    nextSearch = search,
    nextFilters = filters,
    nextPage = page,
    nextPageSize = pageSize,
    nextSort = sort,
  } = {}) => {
    setLoading(true)
    setError('')
    try {
      const params = {
        page: nextPage,
        page_size: nextPageSize,
        sort: nextSort,
      }
      if (nextSearch.trim()) params.search = nextSearch.trim()
      if (nextFilters.status) params.status = nextFilters.status
      if (nextFilters.type) params.type = nextFilters.type
      const { data } = await adminApi.tests(params)
      setTests((data?.items || []).map(normalizeAdminTest))
      setTotal(data?.total || 0)
    } catch (err) {
      setError(resolveError(err) || 'Failed to load tests.')
      setTests([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 250)
    return () => clearTimeout(timer)
  }, [search, filters.status, filters.type, page, pageSize, sort])

  useEffect(() => {
    if (!openMenuId) return undefined
    const handlePointerDown = (event) => {
      if (event.target.closest('[data-admin-test-menu]')) return
      setOpenMenuId('')
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenMenuId('')
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuId])

  const saveColumns = () => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnDraft))
    setColumns(columnDraft)
    setShowColumns(false)
  }

  const resetColumns = () => {
    setColumnDraft(DEFAULT_COLUMNS)
  }

  const applyFilters = () => {
    setPage(1)
    setFilters(filterDraft)
  }

  const clearFilters = () => {
    const cleared = { status: '', type: '' }
    setSearch('')
    setFilterDraft(cleared)
    setFilters(cleared)
    setPage(1)
  }

  const withBusy = async (id, actionName, action, successMessage) => {
    setBusyId(id)
    setBusyAction(actionName)
    setError('')
    setNotice('')
    try {
      const result = await action()
      if (successMessage) {
        setNotice(successMessage)
        window.setTimeout(() => setNotice(''), 2500)
      }
      await load()
      return result
    } catch (err) {
      setError(resolveError(err))
      return null
    } finally {
      setBusyId('')
      setBusyAction('')
    }
  }

  const handleDelete = async (test) => {
    const result = await withBusy(test.id, 'delete', () => adminApi.deleteTest(test.id), 'Test deleted.')
    if (result) {
      setDeleteConfirmId('')
      setOpenMenuId('')
    }
  }

  const handleDuplicate = async (test) => {
    const result = await withBusy(test.id, 'duplicate', () => adminApi.duplicateTest(test.id), 'Test duplicated.')
    const duplicated = result?.data
    if (duplicated?.id) {
      setOpenMenuId('')
      navigate(`/admin/tests/${duplicated.id}/manage`)
    }
  }

  const handleOpenReport = async (test) => {
    setError('')
    setReportBusyId(test.id)
    setOpenMenuId('')
    try {
      const { data } = await adminApi.downloadTestReport(test.id)
      const reportWindow = window.open('', '_blank', 'noopener,noreferrer')
      if (!reportWindow) {
        setError('Popup blocked. Allow pop-ups to open the report preview.')
        return
      }
      reportWindow.document.write(data)
      reportWindow.document.close()
    } catch (err) {
      setError(resolveError(err) || 'Failed to open report.')
    } finally {
      setReportBusyId('')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasActiveFilters = Boolean(search.trim() || filters.status || filters.type)
  const activeFilterCount = useMemo(
    () => [search.trim(), filters.status, filters.type].filter(Boolean).length,
    [search, filters.status, filters.type],
  )

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Tests" subtitle="Manage all tests">
        <button
          className={styles.primaryBtn}
          type="button"
          onClick={() => navigate('/admin/tests/new')}
        >
          + New Test
        </button>
      </AdminPageHeader>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <div className={styles.toolbarGroup}>
          <label className={styles.filterField}>
            <span>Sort</span>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Rows</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className={styles.actionBtn} onClick={() => setShowColumns((prev) => !prev)}>
          Displayed columns
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => setShowFilters((prev) => !prev)}>
          Filter
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => load()} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        {hasActiveFilters && <span className={styles.filterBadge}>{activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}</span>}
      </div>

      {showColumns && (
        <div className={styles.columnsPanel}>
          {Object.keys(DEFAULT_COLUMNS).map((key) => {
            const label = key === 'name'
              ? 'Name'
              : key === 'code'
                ? 'Code'
                : key === 'type'
                  ? 'Type'
                  : key === 'status'
                    ? 'Status'
                    : key === 'time_limit_minutes'
                      ? 'Time limit'
                      : key === 'testing_sessions'
                        ? 'Testing sessions'
                        : 'Updated'
            return (
              <label key={key} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={Boolean(columnDraft[key])}
                  onChange={(e) => setColumnDraft((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                <span>{label}</span>
              </label>
            )
          })}
          <div className={styles.panelActions}>
            <button type="button" className={styles.actionBtn} onClick={resetColumns}>
              Reset to default
            </button>
            <button type="button" className={styles.actionBtn} onClick={saveColumns}>
              Save displayed column set
            </button>
          </div>
        </div>
      )}

      {showFilters && (
        <div className={styles.filterPanel}>
          <label className={styles.filterField}>
            <span>Status</span>
            <select value={filterDraft.status} onChange={(e) => setFilterDraft((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Type</span>
            <select value={filterDraft.type} onChange={(e) => setFilterDraft((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="">All</option>
              <option value="MCQ">MCQ</option>
              <option value="MULTI">MULTI</option>
              <option value="TRUEFALSE">TRUEFALSE</option>
              <option value="TEXT">TEXT</option>
            </select>
          </label>
          <div className={styles.panelActions}>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear
            </button>
            <button type="button" className={styles.actionBtn} onClick={applyFilters}>Apply</button>
          </div>
        </div>
      )}

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && (
        <div className={styles.errorRow}>
          <div className={styles.error}>{error}</div>
          <div className={styles.errorActions}>
            <button type="button" className={styles.actionBtn} onClick={() => load()} disabled={loading}>
              Retry
            </button>
            {hasActiveFilters && (
              <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={loading}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : tests.length === 0 ? (
          <div className={styles.empty}>
            <strong>{hasActiveFilters ? 'No tests match the current filters.' : 'No tests created yet.'}</strong>
            <span>{hasActiveFilters ? 'Adjust or clear the filters to widen the list.' : 'Create the first test to start assigning sessions and candidates.'}</span>
            <div className={styles.emptyActions}>
              {hasActiveFilters ? (
                <button type="button" className={styles.actionBtn} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <button type="button" className={styles.primaryBtn} onClick={() => navigate('/admin/tests/new')}>
                  + New Test
                </button>
              )}
            </div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.name && <th>Name</th>}
                {columns.code && <th>Code</th>}
                {columns.type && <th>Type</th>}
                {columns.status && <th>Status</th>}
                {columns.time_limit_minutes && <th>Time Limit</th>}
                {columns.testing_sessions && <th>Sessions</th>}
                {columns.updated_at && <th>Updated</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  {columns.name && (
                    <td className={styles.nameCell}>
                      <div className={styles.testIdentity}>
                        <button
                          type="button"
                          className={styles.nameLink}
                          title={test.name}
                          onClick={() => navigate(`/admin/tests/${test.id}/manage`)}
                        >
                          {test.name}
                        </button>
                        <div className={styles.testMeta}>
                          <span className={styles.metaPill}>{test.question_count ?? 0} question{Number(test.question_count ?? 0) === 1 ? '' : 's'}</span>
                          <span className={styles.metaPill}>{test.testing_sessions ?? 0} session{Number(test.testing_sessions ?? 0) === 1 ? '' : 's'}</span>
                          {test.course_title && <span className={styles.metaPill}>{test.course_title}</span>}
                        </div>
                      </div>
                    </td>
                  )}
                  {columns.code && <td className={styles.compactCell}>{test.code || '-'}</td>}
                  {columns.type && <td className={styles.compactCell}><span className={styles.typeBadge}>{test.type}</span></td>}
                  {columns.status && (
                    <td className={styles.compactCell}>
                      <span className={`${styles.badge} ${styles[`status${test.status}`]}`}>
                        {statusLabel(test.status)}
                      </span>
                    </td>
                  )}
                  {columns.time_limit_minutes && <td className={styles.compactCell}>{test.time_limit_minutes ? `${test.time_limit_minutes} min` : '-'}</td>}
                  {columns.testing_sessions && <td className={styles.compactCell}>{test.testing_sessions ?? 0}</td>}
                  {columns.updated_at && (
                    <td className={styles.compactCell}>
                      {test.updated_at ? (
                        <div className={styles.updatedCell}>
                          <span>{new Date(test.updated_at).toLocaleDateString()}</span>
                          <span>{new Date(test.updated_at).toLocaleTimeString()}</span>
                        </div>
                      ) : '-'}
                    </td>
                  )}
                  <td className={styles.actionsCell}>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.manageBtn}`}
                        disabled={busyId === test.id}
                        onClick={() => navigate(`/admin/tests/${test.id}/manage`)}
                      >
                        Manage
                      </button>
                      <div className={styles.menuWrap} data-admin-test-menu>
                        <button
                          type="button"
                          className={styles.menuToggle}
                          aria-label={`More actions for ${test.name}`}
                          aria-expanded={openMenuId === test.id}
                          onClick={() => {
                            setDeleteConfirmId((current) => (current === test.id ? current : ''))
                            setOpenMenuId((current) => (current === test.id ? '' : test.id))
                          }}
                        >
                          More
                        </button>
                        {openMenuId === test.id && (
                          <div className={styles.menu}>
                            <button type="button" className={styles.menuItem} onClick={() => { setOpenMenuId(''); navigate(`/admin/tests/${test.id}/manage?tab=sessions`) }}>
                              Testing sessions
                            </button>
                            <button type="button" className={styles.menuItem} onClick={() => { setOpenMenuId(''); navigate(`/admin/tests/${test.id}/manage?tab=candidates`) }}>
                              Candidates
                            </button>
                            <button type="button" className={styles.menuItem} disabled={busyId === test.id} onClick={() => handleDuplicate(test)}>
                              {busyId === test.id && busyAction === 'duplicate' ? 'Duplicating...' : 'Duplicate'}
                            </button>
                            <button type="button" className={styles.menuItem} disabled={reportBusyId === test.id || busyId === test.id} onClick={() => handleOpenReport(test)}>
                              {reportBusyId === test.id ? 'Opening report...' : 'Open report'}
                            </button>
                            {test.status === 'DRAFT' && (
                              <button type="button" className={styles.menuItem} disabled={busyId === test.id} onClick={() => { setOpenMenuId(''); withBusy(test.id, 'publish', () => adminApi.publishTest(test.id), 'Test published.') }}>
                                {busyId === test.id && busyAction === 'publish' ? 'Publishing...' : 'Publish'}
                              </button>
                            )}
                            {test.status === 'PUBLISHED' && (
                              <button type="button" className={styles.menuItem} disabled={busyId === test.id} onClick={() => { setOpenMenuId(''); withBusy(test.id, 'archive', () => adminApi.archiveTest(test.id), 'Test archived.') }}>
                                {busyId === test.id && busyAction === 'archive' ? 'Archiving...' : 'Archive'}
                              </button>
                            )}
                            {test.status === 'ARCHIVED' && (
                              <button type="button" className={styles.menuItem} disabled={busyId === test.id} onClick={() => { setOpenMenuId(''); withBusy(test.id, 'unarchive', () => adminApi.unarchiveTest(test.id), 'Test unarchived.') }}>
                                {busyId === test.id && busyAction === 'unarchive' ? 'Unarchiving...' : 'Unarchive'}
                              </button>
                            )}
                            {deleteConfirmId === test.id ? (
                              <>
                                <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} disabled={busyId === test.id} onClick={() => handleDelete(test)}>
                                  {busyId === test.id && busyAction === 'delete' ? 'Deleting...' : 'Confirm delete'}
                                </button>
                                <button type="button" className={styles.menuItem} disabled={busyId === test.id} onClick={() => setDeleteConfirmId('')}>
                                  Cancel delete
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={`${styles.menuItem} ${styles.menuDanger}`}
                                disabled={busyId === test.id}
                                onClick={() => setDeleteConfirmId(test.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.pageInfo}>
          Showing {visibleRange(page, pageSize, total)} of {total} tests
        </span>
        <div className={styles.pagination}>
          <button type="button" className={styles.actionBtn} onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading}>
            Prev
          </button>
          <span className={styles.pageInfo}>Page {page} / {totalPages}</span>
          <button type="button" className={styles.actionBtn} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
