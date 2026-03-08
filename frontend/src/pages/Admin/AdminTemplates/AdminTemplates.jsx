import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import styles from './AdminTemplates.module.scss'

function resolveError(err) {
  return (
    err.response?.data?.detail ||
    err.response?.data?.error?.message ||
    err.response?.data?.error?.detail ||
    err.message ||
    'Action failed.'
  )
}

export default function AdminTemplates() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const currentUserId = String(user?.id || '')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState('{}')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [search, setSearch] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState('ALL')
  const [sortDir, setSortDir] = useState('ASC')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.examTemplates()
      setTemplates(data || [])
      setLoadError('')
    } catch (err) {
      setLoadError(resolveError(err) || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const canManageTemplate = (template) => isAdmin || String(template?.created_by_id || '') === currentUserId
  const normalizedSearch = search.trim().toLowerCase()

  const filteredTemplates = useMemo(() => {
    const next = templates.filter((template) => {
      const isOwned = String(template?.created_by_id || '') === currentUserId
      if (ownershipFilter === 'MINE' && !isOwned) return false
      if (ownershipFilter === 'READ_ONLY' && canManageTemplate(template)) return false
      if (!normalizedSearch) return true
      const haystack = [
        template?.name,
        template?.description,
        template?.created_by_id,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(normalizedSearch)
    })

    next.sort((left, right) => {
      const result = String(left?.name || '').localeCompare(String(right?.name || ''), undefined, { sensitivity: 'base' })
      return sortDir === 'ASC' ? result : result * -1
    })
    return next
  }, [templates, ownershipFilter, normalizedSearch, sortDir, currentUserId, isAdmin])

  const hasActiveFilters = Boolean(normalizedSearch || ownershipFilter !== 'ALL')
  const ownTemplatesCount = templates.filter((template) => String(template?.created_by_id || '') === currentUserId).length
  const readOnlyCount = templates.filter((template) => !canManageTemplate(template)).length
  const summaryCards = [
    {
      label: 'Saved templates',
      value: templates.length,
      helper: 'Reusable blueprints currently loaded',
    },
    {
      label: 'Visible now',
      value: filteredTemplates.length,
      helper: hasActiveFilters ? 'Matching the active filters' : 'All loaded templates',
    },
    {
      label: 'Owned by you',
      value: ownTemplatesCount,
      helper: 'Templates you can edit directly',
    },
    {
      label: 'Read-only',
      value: readOnlyCount,
      helper: 'Shared templates owned by other users',
    },
  ]

  const resetForm = () => {
    setName('')
    setDescription('')
    setConfig('{}')
    setEditingId(null)
    setError('')
  }

  const startEdit = (template) => {
    setEditingId(template.id)
    setName(template.name || '')
    setDescription(template.description || '')
    setConfig(template.config ? JSON.stringify(template.config, null, 2) : '{}')
    setError('')
    setNotice('')
  }

  const clearFilters = () => {
    setSearch('')
    setOwnershipFilter('ALL')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Template name is required.')
      return
    }
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const parsed = config ? JSON.parse(config) : {}
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('Config must be a JSON object.')
      }
      if (editingId) {
        await adminApi.updateExamTemplate(editingId, {
          name: trimmedName,
          description: description.trim() || null,
          config: parsed,
        })
        setNotice('Template updated.')
      } else {
        await adminApi.createExamTemplate({
          name: trimmedName,
          description: description.trim() || null,
          config: parsed,
        })
        setNotice('Template created.')
      }
      resetForm()
      await load()
    } catch (err) {
      setError(resolveError(err) || err.message || 'Could not save template. Check JSON config.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    setDeletingId(id)
    if (editingId === id) resetForm()
    setError('')
    setNotice('')
    try {
      await adminApi.deleteExamTemplate(id)
      setDeleteConfirmId(null)
      setNotice('Template deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to delete template.')
      setDeleteConfirmId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className={styles.page}>
      <AdminPageHeader title="Test Templates" subtitle="Create reusable test blueprints" />
      {loadError && (
        <div className={styles.helperRow}>
          <div className={styles.error}>{loadError}</div>
          <button className={styles.editBtn} type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}

      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>

      <section className={styles.grid}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.sectionTitle}>{editingId ? 'Edit Template' : 'New Template'}</div>
          {error && <div className={styles.error}>{error}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} required />

          <label className={styles.label}>Description</label>
          <input className={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} />

          <label className={styles.label}>Config JSON</label>
          <textarea className={styles.textarea} value={config} onChange={(event) => setConfig(event.target.value)} rows={6} />

          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Template' : 'Save Template'}</button>
            {editingId && <button type="button" className={styles.btnCancel} onClick={resetForm}>Cancel</button>}
          </div>
        </form>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>Saved Templates</div>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="template-search">Search templates</label>
                <input
                  id="template-search"
                  className={styles.input}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or description..."
                />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="template-ownership-filter">Ownership</label>
                <select
                  id="template-ownership-filter"
                  className={styles.input}
                  value={ownershipFilter}
                  onChange={(event) => setOwnershipFilter(event.target.value)}
                >
                  <option value="ALL">All templates</option>
                  <option value="MINE">Owned by you</option>
                  <option value="READ_ONLY">Read-only shared</option>
                </select>
              </div>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.editBtn} onClick={() => setSortDir((current) => (current === 'ASC' ? 'DESC' : 'ASC'))}>
                Sort: name {sortDir === 'ASC' ? 'A-Z' : 'Z-A'}
              </button>
              <button type="button" className={styles.editBtn} onClick={() => void load()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" className={styles.editBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                Clear filters
              </button>
            </div>
          </div>
          <div className={styles.filterMeta}>
            Showing {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} across {templates.length} loaded.
          </div>
          {loading && <div className={styles.muted}>Loading...</div>}
          {!loading && !loadError && filteredTemplates.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? 'No templates match the current filters.' : 'No templates yet.'}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? 'Clear the search or ownership filter to restore the current template list.'
                  : 'Saved reusable templates will appear here once you create or import them.'}
              </div>
              {hasActiveFilters && <button type="button" className={styles.editBtn} onClick={clearFilters}>Clear filters</button>}
            </div>
          )}

          <section className={styles.list}>
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                data-template-row="true"
                className={`${styles.row} ${editingId === template.id ? styles.rowActive : ''}`}
              >
                <div>
                  <div className={styles.rowTitle}>{template.name}</div>
                  <div className={styles.rowSub}>{template.description}</div>
                  <div className={styles.rowMeta}>
                    {canManageTemplate(template)
                      ? String(template?.created_by_id || '') === currentUserId
                        ? 'Owned by you'
                        : 'Editable as admin'
                      : 'Read-only shared template'}
                    {' · '}
                    {Object.keys(template?.config || {}).length} config field{Object.keys(template?.config || {}).length !== 1 ? 's' : ''}
                  </div>
                  {!canManageTemplate(template) && <div className={styles.rowSub}>Read-only template. Only the owner or an admin can edit this template.</div>}
                </div>
                <div className={styles.rowBtns}>
                  {canManageTemplate(template) && <button className={styles.editBtn} type="button" onClick={() => startEdit(template)}>Edit</button>}
                  {isAdmin && (deleteConfirmId === template.id ? (
                    <>
                      <button className={`${styles.deleteBtn} ${styles.dangerBtn}`} type="button" onClick={() => handleDelete(template.id)} disabled={deletingId === template.id}>
                        {deletingId === template.id ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button className={styles.editBtn} type="button" onClick={() => setDeleteConfirmId(null)} disabled={deletingId === template.id}>Cancel</button>
                    </>
                  ) : (
                    <button className={styles.deleteBtn} type="button" onClick={() => handleDelete(template.id)} disabled={deletingId === template.id}>Delete</button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </section>
      </section>
    </section>
  )
}
