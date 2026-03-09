import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import useAuth from '../../../hooks/useAuth'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { readPaginatedItems, readPaginatedTotal } from '../../../utils/pagination'
import styles from './AdminUsers.module.scss'

const EMPTY_FORM = { user_id: '', name: '', email: '', password: '', role: 'LEARNER', is_active: true }
const ROLES = ['ADMIN', 'INSTRUCTOR', 'LEARNER']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'email_asc', label: 'Email A-Z' },
  { value: 'role_asc', label: 'Role' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
]

const SUMMARY_ROLES = ['ADMIN', 'INSTRUCTOR', 'LEARNER']

function resolveError(err) {
  return (
    err.response?.data?.detail
    || err.response?.data?.error?.message
    || err.response?.data?.error?.detail
    || err.message
    || 'Action failed.'
  )
}

function validateUserForm(form, isCreate) {
  if (!form.user_id.trim()) return 'User ID is required.'
  if (!form.name.trim()) return 'Name is required.'
  if (!form.email.trim()) return 'Email is required.'
  if (!EMAIL_RE.test(form.email.trim())) return 'Enter a valid email address.'
  if (isCreate && form.password.length < 8) return 'Password must be at least 8 characters.'
  return ''
}

function mapSortOption(sortOption) {
  if (sortOption === 'name_asc') return { sort_by: 'name', sort_dir: 'asc' }
  if (sortOption === 'name_desc') return { sort_by: 'name', sort_dir: 'desc' }
  if (sortOption === 'email_asc') return { sort_by: 'email', sort_dir: 'asc' }
  if (sortOption === 'role_asc') return { sort_by: 'role', sort_dir: 'asc' }
  if (sortOption === 'created_asc') return { sort_by: 'created_at', sort_dir: 'asc' }
  return { sort_by: 'created_at', sort_dir: 'desc' }
}

export default function AdminUsers() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const searchParamValue = searchParams.get('search') || ''
  const [users, setUsers] = useState([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState(searchParamValue)
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected, setSelected] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [fieldErrors, setFieldErrors] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState('created_desc')
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetPwValue, setResetPwValue] = useState('')
  const [resetPwSaving, setResetPwSaving] = useState(false)
  const isAdmin = user?.role === 'ADMIN'
  const modalBusy = saving || resetPwSaving

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { sort_by, sort_dir } = mapSortOption(sortBy)
      const params = {
        skip: (page - 1) * pageSize,
        limit: pageSize,
        sort_by,
        sort_dir,
      }
      if (search.trim()) params.search = search.trim()
      if (roleFilter !== 'All') params.role = roleFilter
      if (statusFilter === 'Active') params.is_active = true
      if (statusFilter === 'Inactive') params.is_active = false

      const { data } = await adminApi.users(params)
      const nextUsers = readPaginatedItems(data)
      const nextTotal = readPaginatedTotal(data)
      setUsers(nextUsers)
      setTotalUsers(nextTotal)
      setSelected((prev) => prev.filter((id) => nextUsers.some((nextUser) => nextUser.id === id)))
      setError('')
    } catch (err) {
      setUsers([])
      setTotalUsers(0)
      setLoadError(resolveError(err) || 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, roleFilter, search, sortBy, statusFilter])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    setSearch(searchParamValue)
    setPage(1)
  }, [searchParamValue])

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize))
  const pageUsers = users
  const activeUsers = users.filter((listedUser) => listedUser.is_active !== false).length
  const inactiveUsers = Math.max(users.length - activeUsers, 0)
  const hasActiveFilters = Boolean(search.trim() || roleFilter !== 'All' || statusFilter !== 'All')
  const summaryCards = [
    { label: 'Matching users', value: totalUsers, sub: hasActiveFilters ? 'Server-side filters are active' : 'All users matching the current sort' },
    { label: 'Users on page', value: users.length, sub: `Page ${page} of ${totalPages}` },
    { label: 'Active on page', value: activeUsers, sub: `${inactiveUsers} inactive account${inactiveUsers !== 1 ? 's' : ''} on this page` },
    { label: isAdmin ? 'Selected users' : 'Your access', value: isAdmin ? selected.length : 'Read-only', sub: isAdmin ? 'Bulk actions use the current page selection' : 'Mutation controls stay hidden for non-admins' },
  ]
  const roleSummary = SUMMARY_ROLES.map((role) => ({
    role,
    count: users.filter((listedUser) => listedUser.role === role).length,
  }))

  const exportCSV = () => {
    const rows = [
      ['User ID', 'Name', 'Email', 'Role', 'Status'],
      ...pageUsers.map((u) => [u.user_id || '', u.name || '', u.email || '', u.role || '', u.is_active !== false ? 'Active' : 'Inactive']),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'users-export.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
  const allPageSelected = isAdmin && pageUsers.length > 0 && pageUsers.every((listedUser) => selected.includes(listedUser.id))

  const clearFilters = () => {
    setSearch('')
    setRoleFilter('All')
    setStatusFilter('All')
    setSortBy('created_desc')
    setPageSize(10)
    setPage(1)
  }


  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const toggleSelect = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  const toggleAll = () => setSelected((prev) => {
    const pageIds = pageUsers.map((listedUser) => listedUser.id)
    if (allPageSelected) {
      return prev.filter((id) => !pageIds.includes(id))
    }
    return Array.from(new Set([...prev, ...pageIds]))
  })

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setFieldErrors({})
    setShowResetPw(false)
    setResetPwValue('')
    setError('')
    setNotice('')
    setModal('create')
  }

  const openEdit = (listedUser) => {
    setForm({
      user_id: listedUser.user_id || '',
      name: listedUser.name || '',
      email: listedUser.email || '',
      password: '',
      role: listedUser.role || 'LEARNER',
      is_active: listedUser.is_active !== false,
    })
    setFieldErrors({})
    setShowResetPw(false)
    setResetPwValue('')
    setError('')
    setNotice('')
    setModal(listedUser)
  }

  const handleResetPassword = async () => {
    if (!resetPwValue.trim() || resetPwValue.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setResetPwSaving(true)
    setError('')
    setNotice('')
    try {
      await adminApi.resetUserPassword(modal.id, resetPwValue)
      setNotice('Password reset successfully.')
      setShowResetPw(false)
      setResetPwValue('')
    } catch (err) {
      setError(resolveError(err) || 'Failed to reset password.')
    } finally {
      setResetPwSaving(false)
    }
  }

  const handleSave = async () => {
    const validationError = validateUserForm(form, modal === 'create')
    if (validationError) {
      setFieldErrors({})
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    setFieldErrors({})
    try {
      const payload = {
        ...form,
        user_id: form.user_id.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
      }
      if (modal === 'create') {
        await adminApi.createUser(payload)
        setNotice('User created.')
      } else {
        await adminApi.updateUser(modal.id, {
          user_id: payload.user_id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          is_active: payload.is_active,
        })
        setNotice('User updated.')
      }
      setModal(null)
      if (page !== 1) {
        setPage(1)
      } else {
        await load()
      }
    } catch (err) {
      setFieldErrors(err.validation?.fields || {})
      setError(resolveError(err) || 'Could not save user changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    setError('')
    setNotice('')
    setDeleteBusyId(id)
    try {
      await adminApi.deleteUser(id)
      setDeleteId(null)
      setNotice('User deleted.')
      if (page > 1 && users.length === 1) {
        setPage(page - 1)
      } else {
        await load()
      }
    } catch (err) {
      setError(resolveError(err) || 'Could not delete user.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    setError('')
    setNotice('')
    let failed = 0
    for (const id of selected) {
      try {
        await adminApi.deleteUser(id)
      } catch {
        failed += 1
      }
    }
    setSelected([])
    if (page > 1 && selected.length === users.length) {
      setPage(page - 1)
    } else {
      await load()
    }
    if (failed > 0) {
      setError(`${failed} user(s) could not be deleted.`)
    } else {
      setNotice('Selected users deleted.')
    }
    setBulkDeleting(false)
  }

  const initials = (listedUser) => (listedUser.name || listedUser.user_id || '?').slice(0, 2).toUpperCase()

  return (
    <div className={styles.page}>
      <AdminPageHeader title="User Profiles" subtitle="Manage system users">
        {isAdmin ? (
          <button type="button" className={styles.btnPrimary} onClick={openCreate} disabled={Boolean(deleteBusyId)}>+ New User</button>
        ) : (
          <span className={styles.readOnlyHint}>Read-only access</span>
        )}
      </AdminPageHeader>
      {loadError && (
        <div className={styles.loadError}>
          <div className={styles.loadErrorRow}>
            <span>{loadError}</span>
            <button type="button" className={styles.retryBtn} onClick={() => void load()} disabled={loading}>
              {loading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.roleChips}>
        {roleSummary.map((item) => (
          <span key={item.role} className={`${styles.roleChip} ${styles['roleChip' + item.role]}`}>
            {item.role}: {item.count}
          </span>
        ))}
      </div>

      <div className={styles.toolbarPanel}>
        <div className={styles.toolbar}>
          <input className={styles.search} placeholder="Search by name, email, ID..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
          <select className={styles.filterSelect} value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}>
            <option value="All">All Roles</option>
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select className={styles.filterSelect} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <select className={styles.filterSelect} value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1) }}>
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select className={`${styles.filterSelect} ${styles.pageSizeSelect}`} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
          <button type="button" className={styles.exportBtn} onClick={exportCSV} disabled={pageUsers.length === 0}>
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
            Showing {users.length} user{users.length !== 1 ? 's' : ''} on this page across {totalUsers} matching.
          </div>
        </div>
      </div>

      {isAdmin && selected.length > 0 && (
        <div className={styles.bulkBar}>
          <span>{selected.length} selected on this page</span>
          <button type="button" className={styles.btnDanger} onClick={handleBulkDelete} disabled={bulkDeleting}>
            {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading user profiles...</div>
        ) : totalUsers === 0 && hasActiveFilters ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No matches</div>
            <div className={styles.emptyText}>No users match the current filters. Clear the filters to see the full directory again.</div>
            <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No users yet</div>
            <div className={styles.emptyText}>Create the first account to start assigning roles, schedules, and tests.</div>
          </div>
        ) : pageUsers.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No matches</div>
            <div className={styles.emptyText}>No users match the current filters. Clear the filters to see the full directory again.</div>
            <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {isAdmin && <th><input type="checkbox" checked={allPageSelected} onChange={toggleAll} /></th>}
                <th>Avatar</th>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageUsers.map((listedUser) => (
                <tr key={listedUser.id}>
                  {isAdmin && <td><input type="checkbox" checked={selected.includes(listedUser.id)} onChange={() => toggleSelect(listedUser.id)} /></td>}
                  <td><div className={styles.avatar}>{initials(listedUser)}</div></td>
                  <td className={styles.codeCell}>{listedUser.user_id}</td>
                  <td>{listedUser.name || '-'}</td>
                  <td className={styles.emailCell}>{listedUser.email || '-'}</td>
                  <td><span className={`${styles.roleBadge} ${styles['role' + listedUser.role]}`}>{listedUser.role}</span></td>
                  <td><span className={`${styles.statusBadge} ${listedUser.is_active !== false ? styles.statusActive : styles.statusInactive}`}>{listedUser.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                  {isAdmin && (
                    <td>
                      <div className={styles.actionBtns}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => openEdit(listedUser)}
                          disabled={deleteBusyId === listedUser.id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtnDanger}
                          onClick={() => setDeleteId(listedUser.id)}
                          disabled={deleteBusyId === listedUser.id}
                        >
                          {deleteBusyId === listedUser.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>{totalUsers} matching user{totalUsers !== 1 ? 's' : ''} | Page {page} of {totalPages}</span>
          <button type="button" className={styles.pageBtn} disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <button type="button" className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      )}

      {isAdmin && modal && (
        <div className={styles.modalOverlay} onClick={() => { if (!modalBusy) setModal(null) }}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>{modal === 'create' ? 'Create User' : 'Edit User'}</h3>
            {['user_id', 'name', 'email'].map((field) => (
              <div key={field} className={styles.formGroup}>
                <label className={styles.label}>{field === 'user_id' ? 'User ID' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <input
                  className={`${styles.input} ${fieldErrors[field] ? styles.inputInvalid : ''}`}
                  aria-invalid={fieldErrors[field] ? 'true' : 'false'}
                  value={form[field]}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, [field]: event.target.value }))
                    setFieldErrors((current) => {
                      if (!current[field]) return current
                      const next = { ...current }
                      delete next[field]
                      return next
                    })
                  }}
                />
                {fieldErrors[field] && <div className={styles.fieldError}>{fieldErrors[field]}</div>}
              </div>
            ))}
            {modal === 'create' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Password</label>
                <input
                  type="password"
                  className={`${styles.input} ${fieldErrors.password ? styles.inputInvalid : ''}`}
                  aria-invalid={fieldErrors.password ? 'true' : 'false'}
                  value={form.password}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, password: event.target.value }))
                    setFieldErrors((current) => {
                      if (!current.password) return current
                      const next = { ...current }
                      delete next.password
                      return next
                    })
                  }}
                />
                {fieldErrors.password && <div className={styles.fieldError}>{fieldErrors.password}</div>}
              </div>
            )}
            {modal !== 'create' && (
              <div className={styles.formGroup}>
                <button
                  type="button"
                  className={styles.btnReset}
                  onClick={() => { setShowResetPw((value) => !value); setResetPwValue('') }}
                  disabled={modalBusy}
                >
                  {showResetPw ? 'Cancel Reset' : 'Reset Password'}
                </button>
                {showResetPw && (
                  <div className={styles.resetPwRow}>
                    <input
                      type="password"
                      className={styles.input}
                      placeholder="New password (min 8 chars)"
                      value={resetPwValue}
                      onChange={(event) => setResetPwValue(event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={handleResetPassword}
                      disabled={resetPwSaving || resetPwValue.length < 8}
                    >
                      {resetPwSaving ? 'Saving...' : 'Set Password'}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.label}>Role</label>
              <select
                className={`${styles.select} ${fieldErrors.role ? styles.inputInvalid : ''}`}
                aria-invalid={fieldErrors.role ? 'true' : 'false'}
                value={form.role}
                onChange={(event) => {
                  setForm((current) => ({ ...current, role: event.target.value }))
                  setFieldErrors((current) => {
                    if (!current.role) return current
                    const next = { ...current }
                    delete next.role
                    return next
                  })
                }}
              >
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              {fieldErrors.role && <div className={styles.fieldError}>{fieldErrors.role}</div>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
                <span className={styles.checkboxText}>Active</span>
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(null)} disabled={modalBusy}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && deleteId && (
        <div className={styles.modalOverlay} onClick={() => { if (deleteBusyId !== deleteId) setDeleteId(null) }}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete User?</h3>
            <p className={styles.modalWarning}>This cannot be undone.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setDeleteId(null)} disabled={deleteBusyId === deleteId}>Cancel</button>
              <button type="button" className={styles.btnDanger} onClick={() => handleDelete(deleteId)} disabled={deleteBusyId === deleteId}>
                {deleteBusyId === deleteId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
