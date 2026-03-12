import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import styles from './AdminCategories.module.scss'

const CATEGORY_OPTIONS = [
  { value: 'TEST', label: 'Test' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'SURVEY', label: 'Survey' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.value, option.label]))
const EMPTY = { name: '', type: 'TEST', description: '' }
const PAGE_SIZE = 10

function resolveError(err, fallback) {
  return err?.validation?.message || err?.response?.data?.detail || fallback
}

export default function AdminCategories() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [modalError, setModalError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await adminApi.categories()
      setCategories(data || [])
    } catch (err) {
      setError(resolveError(err, 'Failed to load categories.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = categories.filter((category) => {
    const matchSearch = !normalizedSearch
      || category.name.toLowerCase().includes(normalizedSearch)
      || (category.description || '').toLowerCase().includes(normalizedSearch)
    const matchType = typeFilter === 'ALL' || category.type === typeFilter
    return matchSearch && matchType
  })

  const sorted = [...filtered].sort((left, right) => {
    const comparison = left.name.localeCompare(right.name)
    return sortDir === 'asc' ? comparison : -comparison
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasActiveFilters = Boolean(normalizedSearch) || typeFilter !== 'ALL' || sortDir !== 'asc'
  const typeCounts = ['ALL', ...CATEGORY_OPTIONS.map((option) => option.value)].reduce((counts, type) => {
    counts[type] = type === 'ALL' ? categories.length : categories.filter((category) => category.type === type).length
    return counts
  }, {})
  const summaryCards = [
    {
      label: 'Loaded categories',
      value: categories.length,
      helper: 'All category records currently available',
    },
    {
      label: 'Visible now',
      value: sorted.length,
      helper: hasActiveFilters ? 'Matching the active search and type filters' : 'All loaded categories',
    },
    {
      label: 'Test categories',
      value: typeCounts.TEST || 0,
      helper: 'Used for test and assessment classification',
    },
    {
      label: 'Training and survey',
      value: (typeCounts.TRAINING || 0) + (typeCounts.SURVEY || 0),
      helper: 'Non-test category groups',
    },
  ]

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
    setSortDir('asc')
    setPage(1)
  }

  const openCreate = () => {
    setForm(EMPTY)
    setFieldErrors({})
    setModalError('')
    setModal('create')
  }

  const openEdit = (category) => {
    setForm({
      name: category.name || '',
      type: category.type || 'TEST',
      description: category.description || '',
    })
    setFieldErrors({})
    setModalError('')
    setModal(category)
  }

  const close = () => {
    if (saving) return
    setModal(null)
    setModalError('')
    setFieldErrors({})
  }

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim(),
    }

    if (!payload.name) {
      setFieldErrors({})
      setModalError('Category name is required.')
      return
    }

    setSaving(true)
    setModalError('')
    setNotice('')
    setFieldErrors({})
    try {
      if (modal === 'create') {
        await adminApi.createCategory(payload)
        setNotice('Category created.')
      } else {
        await adminApi.updateCategory(modal.id, payload)
        setNotice('Category updated.')
      }
      setModal(null)
      await load()
    } catch (err) {
      setFieldErrors(err?.validation?.fields || {})
      setModalError(resolveError(err, 'Failed to save category.'))
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
    setNotice('')
    setError('')
    try {
      await adminApi.deleteCategory(id)
      setNotice('Category deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err, 'Failed to delete category.'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Categories" subtitle="Organize tests, surveys, and training by category">
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>+ New Category</button>
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
            placeholder="Search categories..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <div className={styles.filterTabs}>
            {[{ value: 'ALL', label: 'All' }, ...CATEGORY_OPTIONS].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.filterTab} ${typeFilter === option.value ? styles.filterTabActive : ''}`}
                onClick={() => {
                  setTypeFilter(option.value)
                  setPage(1)
                }}
              >
                {option.label}
                <span className={styles.tabCount}>{typeCounts[option.value] || 0}</span>
              </button>
            ))}
          </div>
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
          Showing {sorted.length} matching categor{sorted.length !== 1 ? 'ies' : 'y'} across {categories.length} loaded.
        </div>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Loading categories...</div>
            <div className={styles.emptyText}>Fetching the latest category records and type counts.</div>
          </div>
        ) : sorted.length === 0 && hasActiveFilters ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No categories match the current filters.</div>
            <div className={styles.emptyText}>Clear the search or type filter to restore the full category list.</div>
            <button type="button" className={styles.actionBtn} onClick={clearFilters}>Clear filters</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No categories yet</div>
            <div className={styles.emptyText}>Create a category to organize tests, surveys, or training content.</div>
          </div>
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
              {paginated.map((category) => {
                const categoryLabel = category.name || 'this category'

                return (
                <tr key={category.id}>
                  <td className={styles.nameCell}>{category.name}</td>
                  <td>
                    <span className={`${styles.typeBadge} ${styles[`type${category.type}`] || ''}`}>
                      {CATEGORY_LABELS[category.type] || category.type || 'Test'}
                    </span>
                  </td>
                  <td className={styles.descCell}>
                    {category.description || <span className={styles.mutedCell}>No description</span>}
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button type="button" className={styles.actionBtn} onClick={() => openEdit(category)} disabled={deleteBusyId === category.id} aria-label={`Edit category ${categoryLabel}`} title={`Edit category ${categoryLabel}`}>
                        Edit
                      </button>
                      {isAdmin && (deleteConfirmId === category.id ? (
                        <>
                          <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(category.id)} disabled={deleteBusyId === category.id} aria-label={`Confirm delete for category ${categoryLabel}`}>
                            {deleteBusyId === category.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === category.id} aria-label={`Keep category ${categoryLabel}`}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" className={styles.actionBtn} onClick={() => void handleDelete(category.id)} disabled={deleteBusyId === category.id} aria-label={`Delete category ${categoryLabel}`} title={`Delete category ${categoryLabel}`}>
                          Delete
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>{sorted.length} categor{sorted.length !== 1 ? 'ies' : 'y'} | Page {page} of {totalPages}</span>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1}>Previous</button>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page === totalPages}>Next</button>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="category-dialog-title" className={styles.modalTitle}>{modal === 'create' ? 'New Category' : 'Edit Category'}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="category-name">Name</label>
              <input
                id="category-name"
                className={`${styles.input} ${fieldErrors.name ? styles.inputInvalid : ''}`}
                aria-invalid={fieldErrors.name ? 'true' : 'false'}
                value={form.name}
                onChange={(event) => {
                  setForm((currentForm) => ({ ...currentForm, name: event.target.value }))
                  setFieldErrors((current) => {
                    if (!current.name) return current
                    const next = { ...current }
                    delete next.name
                    return next
                  })
                }}
              />
              {fieldErrors.name && <div className={styles.fieldError}>{fieldErrors.name}</div>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="category-type">Type</label>
              <select
                id="category-type"
                className={`${styles.select} ${fieldErrors.type ? styles.inputInvalid : ''}`}
                aria-invalid={fieldErrors.type ? 'true' : 'false'}
                value={form.type}
                onChange={(event) => {
                  setForm((currentForm) => ({ ...currentForm, type: event.target.value }))
                  setFieldErrors((current) => {
                    if (!current.type) return current
                    const next = { ...current }
                    delete next.type
                    return next
                  })
                }}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {fieldErrors.type && <div className={styles.fieldError}>{fieldErrors.type}</div>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="category-description">Description</label>
              <input
                id="category-description"
                className={`${styles.input} ${fieldErrors.description ? styles.inputInvalid : ''}`}
                aria-invalid={fieldErrors.description ? 'true' : 'false'}
                value={form.description}
                onChange={(event) => {
                  setForm((currentForm) => ({ ...currentForm, description: event.target.value }))
                  setFieldErrors((current) => {
                    if (!current.description) return current
                    const next = { ...current }
                    delete next.description
                    return next
                  })
                }}
              />
              {fieldErrors.description && <div className={styles.fieldError}>{fieldErrors.description}</div>}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : modal === 'create' ? 'Create Category' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
