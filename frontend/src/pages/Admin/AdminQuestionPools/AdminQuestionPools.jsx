import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import styles from './AdminQuestionPools.module.scss'

function resolveError(err, fallback) {
  return err?.response?.data?.detail || fallback
}

export default function AdminQuestionPools() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const currentUserId = String(user?.id || '')
  const [pools, setPools] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [poolQuestions, setPoolQuestions] = useState({})
  const [expandLoadingId, setExpandLoadingId] = useState(null)
  const [modal, setModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [modalError, setModalError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('asc')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await adminApi.questionPools()
      setPools(data || [])
    } catch (err) {
      setError(resolveError(err, 'Failed to load question pools.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const canManagePool = (pool) => isAdmin || String(pool?.created_by_id || '') === currentUserId
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = [...pools]
    .filter((pool) => !normalizedSearch
      || pool.name.toLowerCase().includes(normalizedSearch)
      || (pool.description || '').toLowerCase().includes(normalizedSearch))
    .sort((left, right) => (sortDir === 'asc'
      ? left.name.localeCompare(right.name)
      : right.name.localeCompare(left.name)))
  const hasActiveFilters = Boolean(normalizedSearch) || sortDir !== 'asc'
  const totalQuestions = pools.reduce((sum, pool) => sum + Number(pool.question_count || 0), 0)
  const readOnlyPools = pools.filter((pool) => !canManagePool(pool)).length
  const summaryCards = [
    {
      label: 'Loaded pools',
      value: pools.length,
      helper: 'All reusable question banks in the current workspace',
    },
    {
      label: 'Visible now',
      value: filtered.length,
      helper: hasActiveFilters ? 'Matching the current search and sort state' : 'All loaded pools',
    },
    {
      label: 'Indexed questions',
      value: totalQuestions,
      helper: 'Questions already attached to the loaded pools',
    },
    {
      label: 'Read-only pools',
      value: readOnlyPools,
      helper: 'Owned by another author and visible without edit rights',
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setSortDir('asc')
  }

  const toggleExpand = async (poolId) => {
    if (expanded[poolId]) {
      setExpanded((prev) => ({ ...prev, [poolId]: false }))
      return
    }

    setExpandLoadingId(poolId)
    setError('')
    try {
      const { data } = await adminApi.getPoolQuestions(poolId)
      setPoolQuestions((prev) => ({ ...prev, [poolId]: data || [] }))
      setExpanded((prev) => ({ ...prev, [poolId]: true }))
    } catch (err) {
      setError(resolveError(err, 'Failed to load pool questions.'))
    } finally {
      setExpandLoadingId(null)
    }
  }

  const resetModal = () => {
    if (saving) return
    setModal(false)
    setName('')
    setDescription('')
    setModalError('')
  }

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setModalError('Pool name is required.')
      return
    }

    setSaving(true)
    setModalError('')
    setNotice('')
    try {
      await adminApi.createQuestionPool({ name: trimmedName, description: description.trim() || null })
      setNotice('Question pool created.')
      resetModal()
      await load()
    } catch (err) {
      setModalError(resolveError(err, 'Failed to create pool.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }

    setDeleteBusyId(id)
    setDeleteConfirmId(null)
    setError('')
    setNotice('')
    try {
      await adminApi.deleteQuestionPool(id)
      setNotice('Question pool deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err, 'Failed to delete pool.'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Question Pools" subtitle="Reusable question banks for test authoring">
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => {
            setModal(true)
            setModalError('')
          }}
        >
          + New Pool
        </button>
      </AdminPageHeader>

      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button type="button" className={styles.actionBtn} onClick={() => void load()}>Retry</button>
        </div>
      )}

      <div className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </div>
        ))}
      </div>

      <div className={styles.toolbarPanel}>
        <div className={styles.toolbar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search pools..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className={styles.sortBtn}
            onClick={() => setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'asc' ? 'Sort: name A-Z' : 'Sort: name Z-A'}
          </button>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>Refresh</button>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>Clear filters</button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          Showing {filtered.length} matching pool{filtered.length !== 1 ? 's' : ''} across {pools.length} loaded.
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>Loading question pools...</div>
          <div className={styles.emptyText}>Fetching reusable banks and question counts.</div>
        </div>
      ) : filtered.length === 0 && hasActiveFilters ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No pools match the current filters.</div>
          <div className={styles.emptyText}>Clear the search or reset sorting to restore the full pool library.</div>
          <button type="button" className={styles.actionBtn} onClick={clearFilters}>Clear filters</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No question pools yet</div>
          <div className={styles.emptyText}>Create a pool to build reusable banks for future tests.</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((pool) => {
            const poolLabel = pool.name || 'this question pool'

            return (
            <div key={pool.id} className={styles.card}>
              {!canManagePool(pool) && (
                <div className={styles.readOnlyNote}>Read-only - only the owner or an admin can manage this pool.</div>
              )}
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardTitle}>{pool.name}</span>
                  {pool.question_count != null && (
                    <span className={styles.qCountBadge}>{pool.question_count} questions</span>
                  )}
                </div>
                <div className={styles.actionBtns}>
                  <button type="button" className={styles.actionBtn} onClick={() => navigate(`/admin/question-pools/${pool.id}`)} disabled={deleteBusyId === pool.id} aria-label={`Open question pool ${poolLabel}`} title={`Open question pool ${poolLabel}`}>
                    Open
                  </button>
                  {canManagePool(pool) && (
                    deleteConfirmId === pool.id ? (
                      <>
                        <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(pool.id)} disabled={deleteBusyId === pool.id} aria-label={`Confirm delete for question pool ${poolLabel}`}>
                          {deleteBusyId === pool.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === pool.id} aria-label={`Keep question pool ${poolLabel}`}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className={styles.actionBtn} onClick={() => void handleDelete(pool.id)} disabled={deleteBusyId === pool.id} aria-label={`Delete question pool ${poolLabel}`} title={`Delete question pool ${poolLabel}`}>
                        Delete
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className={pool.description ? styles.cardMeta : styles.cardMetaMuted}>
                {pool.description || 'No description provided for this pool.'}
              </div>

              {expanded[pool.id] && poolQuestions[pool.id] && (
                <div className={styles.questionList}>
                  {poolQuestions[pool.id].length === 0 ? (
                    <div className={styles.questionEmpty}>No questions in this pool yet.</div>
                  ) : (
                    poolQuestions[pool.id].map((question, index) => (
                      <div key={question.id || index} className={styles.questionItem}>
                        <span className={styles.questionIndex}>{index + 1}.</span>
                        <span>{question.text}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button type="button" className={styles.expandBtn} onClick={() => void toggleExpand(pool.id)} disabled={expandLoadingId === pool.id}>
                {expandLoadingId === pool.id ? 'Loading questions...' : expanded[pool.id] ? 'Hide questions' : 'Show questions'}
              </button>
            </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={resetModal}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="question-pool-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="question-pool-dialog-title" className={styles.modalTitle}>New Question Pool</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="pool-name">Name</label>
              <input id="pool-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="pool-description">Description</label>
              <input id="pool-description" className={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={resetModal} disabled={saving}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleCreate()} disabled={saving || !name.trim()}>
                {saving ? 'Creating...' : 'Create Pool'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
