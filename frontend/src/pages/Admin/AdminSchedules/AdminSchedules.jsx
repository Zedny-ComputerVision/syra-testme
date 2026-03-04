import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminSchedules.module.scss'

export default function AdminSchedules() {
  const [schedules, setSchedules] = useState([])
  const [exams, setExams] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ user_id: '', exam_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      adminApi.schedules(),
      adminApi.exams(),
      adminApi.users(),
    ]).then(([sRes, eRes, uRes]) => {
      setSchedules(sRes.data || [])
      setExams(eRes.data || [])
      setUsers(uRes.data || [])
    }).catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleAssign = async () => {
    try {
      await adminApi.createSchedule(form)
      setForm({ user_id: '', exam_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' })
      load()
    } catch (err) {
      console.error('Assign failed', err)
    }
  }

  const handleDelete = async (id) => {
    try {
      await adminApi.deleteSchedule(id)
      load()
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  const formatDate = (iso) => iso ? new Date(iso).toLocaleString() : '-'

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Schedules" subtitle="Assign exams to learners">
        <button className={styles.btnPrimary} onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Hide Form' : '+ Assign'}
        </button>
      </AdminPageHeader>

      {showForm && (
        <div className={styles.assignForm}>
          <h3 className={styles.assignTitle}>Assign Exam</h3>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>User</label>
              <select className={styles.select} value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">Select user...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.user_id} - {u.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Exam</label>
              <select className={styles.select} value={form.exam_id} onChange={e => setForm(f => ({ ...f, exam_id: e.target.value }))}>
                <option value="">Select exam...</option>
                {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Scheduled At</label>
              <input className={styles.input} type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Access Mode</label>
              <select className={styles.select} value={form.access_mode} onChange={e => setForm(f => ({ ...f, access_mode: e.target.value }))}>
                <option value="OPEN">Open (anytime)</option>
                <option value="RESTRICTED">Restricted (by schedule)</option>
              </select>
            </div>
          </div>
          <button className={styles.btnPrimary} onClick={handleAssign} disabled={!form.user_id || !form.exam_id}>Assign</button>
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : schedules.length === 0 ? (
          <div className={styles.empty}>No schedules yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Exam</th>
                <th>Scheduled</th>
                <th>Mode</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id}>
                  <td>{s.user_name || s.user_id || '-'}</td>
                  <td>{s.exam_title || '-'}</td>
                  <td>{formatDate(s.scheduled_at)}</td>
                  <td>
                    <span className={`${styles.modeBadge} ${s.access_mode === 'OPEN' ? styles.modeOpen : styles.modeScheduled}`}>
                      {s.access_mode || 'Scheduled'}
                    </span>
                  </td>
                  <td>{s.notes || '-'}</td>
                  <td>
                    <button className={styles.actionBtn} onClick={() => handleDelete(s.id)}>Delete</button>
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
