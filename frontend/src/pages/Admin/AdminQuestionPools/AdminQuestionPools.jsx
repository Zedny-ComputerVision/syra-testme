import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminQuestionPools.module.scss'

export default function AdminQuestionPools() {
  const [pools, setPools] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [poolQuestions, setPoolQuestions] = useState({})
  const [modal, setModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const load = () => {
    setLoading(true)
    adminApi.questionPools()
      .then(({ data }) => setPools(data || []))
      .catch(() => setPools([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleExpand = async (poolId) => {
    if (expanded[poolId]) {
      setExpanded(prev => ({ ...prev, [poolId]: false }))
      return
    }
    try {
      const { data } = await adminApi.getPoolQuestions(poolId)
      setPoolQuestions(prev => ({ ...prev, [poolId]: data || [] }))
      setExpanded(prev => ({ ...prev, [poolId]: true }))
    } catch (err) {
      console.error('Failed to load pool questions', err)
    }
  }

  const handleCreate = async () => {
    try {
      await adminApi.createQuestionPool({ name, description })
      setModal(false)
      setName('')
      setDescription('')
      load()
    } catch (err) {
      console.error('Create failed', err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this question pool?')) return
    try {
      await adminApi.deleteQuestionPool(id)
      load()
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Question Pools" subtitle="Reusable question banks">
        <button className={styles.btnPrimary} onClick={() => setModal(true)}>+ New Pool</button>
      </AdminPageHeader>

      {loading ? (
        <div className={styles.empty}>Loading...</div>
      ) : pools.length === 0 ? (
        <div className={styles.empty}>No question pools yet.</div>
      ) : (
        <div className={styles.grid}>
          {pools.map(pool => (
            <div key={pool.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{pool.name}</span>
                <div className={styles.actionBtns}>
                  <button className={styles.actionBtn} onClick={() => window.location.href = `/admin/question-pools/${pool.id}`}>Open</button>
                  <button className={styles.actionBtn} onClick={() => handleDelete(pool.id)}>Delete</button>
                </div>
              </div>
              {pool.description && <div className={styles.cardMeta}>{pool.description}</div>}

              {expanded[pool.id] && poolQuestions[pool.id] && (
                <div className={styles.questionList}>
                  {poolQuestions[pool.id].length === 0 ? (
                    <div className={styles.cardMeta}>No questions in this pool.</div>
                  ) : (
                    poolQuestions[pool.id].map((q, i) => (
                      <div key={q.id || i} className={styles.questionItem}>
                        {i + 1}. {q.text}
                      </div>
                    ))
                  )}
                </div>
              )}

              <button className={styles.expandBtn} onClick={() => toggleExpand(pool.id)}>
                {expanded[pool.id] ? 'Hide Questions' : 'Show Questions'}
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New Question Pool</h3>
            <div className={styles.formGroup}>
              <label className={styles.label}>Name</label>
              <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <input className={styles.input} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleCreate} disabled={!name.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
