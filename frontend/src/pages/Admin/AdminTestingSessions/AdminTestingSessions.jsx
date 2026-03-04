import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminTestingSessions.module.scss'

export default function AdminTestingSessions() {
  const [sessions, setSessions] = useState([])
  const [exams, setExams] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ exam_id: '', user_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' })

  const load = () => {
    setLoading(true)
    Promise.all([adminApi.schedules(), adminApi.exams(), adminApi.users()])
      .then(([sRes, eRes, uRes]) => {
        setSessions(sRes.data || [])
        setExams(eRes.data || [])
        setUsers((uRes.data || []).filter(u => u.role === 'LEARNER'))
      }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = sessions.filter(s =>
    !search || s.exam_title?.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    try {
      await adminApi.createSchedule(form)
      setModal(false)
      setForm({ exam_id: '', user_id: '', scheduled_at: '', access_mode: 'OPEN', notes: '' })
      load()
    } catch (err) { console.error(err) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this session?')) return
    try { await adminApi.deleteSchedule(id); load() } catch (err) { console.error(err) }
  }

  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const isUpcoming = (iso) => iso && new Date(iso) > new Date()

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Testing Sessions" subtitle="Manage exam schedules and candidate assignments">
        <button className={styles.btnPrimary} onClick={() => setModal(true)}>+ New Session</button>
      </AdminPageHeader>

      <div className={styles.toolbar}>
        <input className={styles.search} placeholder="Search by exam name..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className={styles.empty}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No sessions found. Create one with the button above.</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(s => {
            const upcoming = isUpcoming(s.scheduled_at)
            return (
              <div key={s.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.cardTitle}>{s.exam_title || 'Exam'}</div>
                    <div className={styles.cardSub}>{s.user_name || s.user_id || 'Candidate'}</div>
                  </div>
                  <div className={styles.statusDot} style={{ background: upcoming ? '#10b981' : '#94a3b8' }} title={upcoming ? 'Upcoming' : 'Past'} />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.dateRow}>
                    <span>📅</span>
                    <span>{formatDate(s.scheduled_at)}</span>
                  </div>
                  <div style={{ marginTop: '0.35rem' }}>
                    <span className={`${styles.modeBadge} ${s.access_mode === 'OPEN' ? styles.modeOpen : styles.modeScheduled}`}>
                      {s.access_mode || 'OPEN'}
                    </span>
                  </div>
                  {s.notes && <div className={styles.notes}>{s.notes}</div>}
                </div>
                <div className={styles.cardFooter}>
                  <button className={styles.actionBtnDanger} onClick={() => handleDelete(s.id)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New Testing Session</h3>
            <div className={styles.formGroup}>
              <label className={styles.label}>Exam</label>
              <select className={styles.select} value={form.exam_id} onChange={e => setForm(f => ({ ...f, exam_id: e.target.value }))}>
                <option value="">Select exam...</option>
                {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Candidate</label>
              <select className={styles.select} value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">Select learner...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.user_id} – {u.name || u.email}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Scheduled Date & Time</label>
              <input className={styles.input} type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Access Mode</label>
              <select className={styles.select} value={form.access_mode} onChange={e => setForm(f => ({ ...f, access_mode: e.target.value }))}>
                <option value="OPEN">Open (anytime)</option>
                <option value="RESTRICTED">Restricted (by schedule)</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <textarea className={styles.textarea} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleCreate} disabled={!form.exam_id || !form.user_id}>Create Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
