import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminExams.module.scss'

export default function AdminExams() {
  const [exams, setExams] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    adminApi.exams()
      .then(({ data }) => setExams(data || []))
      .catch(() => setExams([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = exams.filter(e =>
    e.title?.toLowerCase().includes(search.toLowerCase())
  )

  const handleToggleStatus = async (exam) => {
    const newStatus = exam.status === 'OPEN' ? 'CLOSED' : 'OPEN'
    if (newStatus === 'OPEN' && exam.question_count !== undefined && exam.question_count < 1) {
      alert('Add at least one question before opening/publishing.')
      return
    }
    try {
      await adminApi.updateExam(exam.id, { status: newStatus })
      load()
    } catch (err) {
      console.error('Toggle failed', err)
      alert(err.response?.data?.detail || 'Unable to change status (check questions exist).')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await adminApi.deleteExam(deleteId)
      setDeleteId(null)
      load()
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Exams" subtitle="Manage all exams">
        <button
          className={styles.actionBtn}
          style={{ background: 'var(--color-primary)', color: '#0b111d', border: 'none', padding: '0.6rem 1.1rem', fontWeight: 600, borderRadius: '8px' }}
          onClick={() => navigate('/admin/exams/new')}
        >
          + New Exam
        </button>
      </AdminPageHeader>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search exams..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>No exams found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Category</th>
                <th>Time Limit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exam => (
                <tr key={exam.id}>
                  <td>{exam.title}</td>
                  <td><span className={styles.typeBadge}>{exam.exam_type}</span></td>
                  <td>
                    <span className={`${styles.badge} ${exam.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}`}>
                      {exam.status}
                    </span>
                  </td>
                  <td>{exam.category_name || '-'}</td>
                  <td>{exam.time_limit_minutes ? `${exam.time_limit_minutes} min` : 'None'}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.actionBtn} onClick={() => navigate(`/admin/exams/new?edit=${exam.id}`)}>Edit</button>
                      <button
                        className={styles.actionBtn}
                        onClick={() => {
                          if (exam.status !== 'OPEN') {
                            alert('Publish/open the exam first to preview as learner.')
                          } else {
                            navigate(`/exams/${exam.id}`)
                          }
                        }}
                      >
                        Preview
                      </button>
                      <button className={styles.actionBtn} onClick={() => handleToggleStatus(exam)}>
                        {exam.status === 'OPEN' ? 'Close' : 'Open'}
                      </button>
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setDeleteId(exam.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleteId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete Exam?</h3>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
              This action cannot be undone. All associated questions and attempts will be affected.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.actionBtn} onClick={() => setDeleteId(null)}>Cancel</button>
              <button className={styles.actionBtn} style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
