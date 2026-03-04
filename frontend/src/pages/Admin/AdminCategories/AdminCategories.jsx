import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminCategories.module.scss'

const EMPTY = { name: '', type: 'EXAM', description: '' }

export default function AdminCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | category object (edit)
  const [form, setForm] = useState(EMPTY)

  const load = () => {
    setLoading(true)
    adminApi.categories()
      .then(({ data }) => setCategories(data || []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setModal('create') }
  const openEdit = (cat) => { setForm({ name: cat.name, type: cat.type || 'EXAM', description: cat.description || '' }); setModal(cat) }
  const close = () => setModal(null)

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        await adminApi.createCategory(form)
      } else {
        await adminApi.updateCategory(modal.id, form)
      }
      close()
      load()
    } catch (err) {
      console.error('Save failed', err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this category?')) return
    try {
      await adminApi.deleteCategory(id)
      load()
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Categories" subtitle="Organize exams by category">
        <button className={styles.btnPrimary} onClick={openCreate}>+ New Category</button>
      </AdminPageHeader>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : categories.length === 0 ? (
          <div className={styles.empty}>No categories yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td><span className={styles.typeBadge}>{cat.type || 'EXAM'}</span></td>
                  <td>{cat.description || '-'}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.actionBtn} onClick={() => openEdit(cat)}>Edit</button>
                      <button className={styles.actionBtn} onClick={() => handleDelete(cat.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{modal === 'create' ? 'New Category' : 'Edit Category'}</h3>
            <div className={styles.formGroup}>
              <label className={styles.label}>Name</label>
              <input className={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Type</label>
              <select className={styles.select} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="EXAM">Exam</option>
                <option value="QUIZ">Quiz</option>
                <option value="SURVEY">Survey</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <input className={styles.input} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={close}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={!form.name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
