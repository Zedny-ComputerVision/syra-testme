import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminUserGroups.module.scss'

export default function AdminUserGroups() {
  const [groups, setGroups] = useState([])
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await adminApi.userGroups()
    setGroups(data || [])
  }
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await adminApi.createUserGroup(form)
      setForm({ name: '', description: '' })
      load()
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    await adminApi.deleteUserGroup(id)
    load()
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="User Groups" subtitle="Organize learners into cohorts" />
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={create}>
          <div className={styles.sectionTitle}>New Group</div>
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          <button className={styles.btnPrimary} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Group'}</button>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Groups</div>
          {(groups || []).map(g => (
            <div key={g.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>{g.name}</div>
                <div className={styles.rowSub}>{g.description}</div>
              </div>
              <button type="button" className={styles.deleteBtn} onClick={() => remove(g.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
