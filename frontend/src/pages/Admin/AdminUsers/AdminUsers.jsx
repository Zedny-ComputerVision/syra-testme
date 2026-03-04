import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminUsers.module.scss'

const EMPTY_FORM = { user_id: '', name: '', email: '', password: '', role: 'LEARNER', is_active: true }
const ROLES = ['ADMIN', 'INSTRUCTOR', 'LEARNER']
const PAGE_SIZE = 10

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected, setSelected] = useState([])
  const [modal, setModal] = useState(null) // null | 'create' | user_object
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState(null)

  const load = () => {
    setLoading(true)
    adminApi.users()
      .then(({ data }) => setUsers(data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.user_id?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    const matchRole = roleFilter === 'All' || u.role === roleFilter
    const matchStatus = statusFilter === 'All' || (statusFilter === 'Active' ? u.is_active !== false : u.is_active === false)
    return matchSearch && matchRole && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageUsers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () => setSelected(prev => prev.length === pageUsers.length ? [] : pageUsers.map(u => u.id))

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setModal('create') }
  const openEdit = (u) => {
    setForm({ user_id: u.user_id || '', name: u.name || '', email: u.email || '', password: '', role: u.role || 'LEARNER', is_active: u.is_active !== false })
    setModal(u)
  }

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        await adminApi.createUser(form)
      } else {
        const { password, ...rest } = form
        await adminApi.updateUser(modal.id, password ? form : rest)
      }
      setModal(null)
      load()
    } catch (err) {
      console.error('Save failed', err)
    }
  }

  const handleDelete = async (id) => {
    try { await adminApi.deleteUser(id); setDeleteId(null); load() } catch (err) { console.error(err) }
  }

  const handleBulkDelete = async () => {
    for (const id of selected) {
      try { await adminApi.deleteUser(id) } catch (e) {}
    }
    setSelected([])
    load()
  }

  const initials = (u) => (u.name || u.user_id || '?').slice(0, 2).toUpperCase()

  return (
    <div className={styles.page}>
      <AdminPageHeader title="User Profiles" subtitle="Manage system users">
        <button className={styles.btnPrimary} onClick={openCreate}>+ New User</button>
      </AdminPageHeader>

      <div className={styles.toolbar}>
        <input className={styles.search} placeholder="Search by name, email, ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select className={styles.filterSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="All">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className={styles.bulkBar}>
          <span>{selected.length} selected</span>
          <button className={styles.btnDanger} onClick={handleBulkDelete}>Delete Selected</button>
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : pageUsers.length === 0 ? (
          <div className={styles.empty}>No users found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th><input type="checkbox" checked={selected.length === pageUsers.length && pageUsers.length > 0} onChange={toggleAll} /></th>
                <th>Avatar</th>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.map(u => (
                <tr key={u.id}>
                  <td><input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleSelect(u.id)} /></td>
                  <td><div className={styles.avatar}>{initials(u)}</div></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{u.user_id}</td>
                  <td>{u.name || '-'}</td>
                  <td style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>{u.email || '-'}</td>
                  <td><span className={`${styles.roleBadge} ${styles['role' + u.role]}`}>{u.role}</span></td>
                  <td><span className={`${styles.statusBadge} ${u.is_active !== false ? styles.statusActive : styles.statusInactive}`}>{u.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.actionBtn} onClick={() => openEdit(u)}>Edit</button>
                      <button className={styles.actionBtnDanger} onClick={() => setDeleteId(u.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>{filtered.length} users • Page {page}/{totalPages}</span>
          <button className={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{modal === 'create' ? 'Create User' : 'Edit User'}</h3>
            {['user_id', 'name', 'email'].map(field => (
              <div key={field} className={styles.formGroup}>
                <label className={styles.label}>{field === 'user_id' ? 'User ID' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <input className={styles.input} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            {modal === 'create' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Password</label>
                <input type="password" className={styles.input} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.label}>Role</label>
              <select className={styles.select} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span className={styles.label} style={{ margin: 0 }}>Active</span>
              </label>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setModal(null)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={!form.user_id.trim() || !form.email.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete User?</h3>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>This cannot be undone.</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteId(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={() => handleDelete(deleteId)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
