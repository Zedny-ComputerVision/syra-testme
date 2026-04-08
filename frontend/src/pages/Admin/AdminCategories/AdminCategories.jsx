import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminCategories.module.scss'

const CATEGORY_OPTION_KEYS = [
  { value: 'TEST', labelKey: 'admin_categories_type_test' },
  { value: 'TRAINING', labelKey: 'admin_categories_type_training' },
  { value: 'SURVEY', labelKey: 'admin_categories_type_survey' },
]

const CATEGORY_LABEL_KEYS = Object.fromEntries(CATEGORY_OPTION_KEYS.map((option) => [option.value, option.labelKey]))
const EMPTY = { name: '', type: 'TEST', description: '' }
const PAGE_SIZE = 10

function resolveError(err, fallback) {
  if (err?.userMessage) return err.userMessage
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  return fallback
}

export default function AdminCategories() {
  const { user } = useAuth()
  const { t } = useLanguage()
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
      setError(resolveError(err, t('admin_categories_load_error')))
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
  const typeCounts = ['ALL', ...CATEGORY_OPTION_KEYS.map((option) => option.value)].reduce((counts, type) => {
    counts[type] = type === 'ALL' ? categories.length : categories.filter((category) => category.type === type).length
    return counts
  }, {})
  const summaryCards = [
    {
      label: t('admin_categories_loaded'),
      value: categories.length,
      helper: t('admin_categories_loaded_helper'),
    },
    {
      label: t('admin_categories_visible_now'),
      value: sorted.length,
      helper: hasActiveFilters ? t('admin_categories_matching_filters') : t('admin_categories_all_loaded'),
    },
    {
      label: t('admin_categories_test_categories'),
      value: typeCounts.TEST || 0,
      helper: t('admin_categories_test_helper'),
    },
    {
      label: t('admin_categories_training_survey'),
      value: (typeCounts.TRAINING || 0) + (typeCounts.SURVEY || 0),
      helper: t('admin_categories_training_survey_helper'),
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
      setModalError(t('admin_categories_name_required'))
      return
    }

    setSaving(true)
    setModalError('')
    setNotice('')
    setFieldErrors({})
    try {
      if (modal === 'create') {
        await adminApi.createCategory(payload)
        setNotice(t('admin_categories_created'))
      } else {
        await adminApi.updateCategory(modal.id, payload)
        setNotice(t('admin_categories_updated'))
      }
      setModal(null)
      await load()
    } catch (err) {
      setFieldErrors(err?.validation?.fields || {})
      setModalError(resolveError(err, t('admin_categories_save_error')))
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
      setNotice(t('admin_categories_deleted'))
      await load()
    } catch (err) {
      setError(resolveError(err, t('admin_categories_delete_error')))
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_categories_title')} subtitle={t('admin_categories_subtitle')}>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>{t('admin_categories_new')}</button>
      </AdminPageHeader>

      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button type="button" className={styles.actionBtn} onClick={() => void load()}>{t('retry')}</button>
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
            placeholder={t('admin_categories_search_placeholder')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <div className={styles.filterTabs}>
            {[{ value: 'ALL', labelKey: 'all' }, ...CATEGORY_OPTION_KEYS].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.filterTab} ${typeFilter === option.value ? styles.filterTabActive : ''}`}
                onClick={() => {
                  setTypeFilter(option.value)
                  setPage(1)
                }}
              >
                {t(option.labelKey)}
                <span className={styles.tabCount}>{typeCounts[option.value] || 0}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.sortBtn}
            onClick={() => setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'asc' ? t('sort_name_az') : t('sort_name_za')}
          </button>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>{t('refresh')}</button>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>{t('clear_filters')}</button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          {t('showing')} {sorted.length} {t('admin_categories_matching')} {t('admin_categories_across')} {categories.length} {t('admin_categories_loaded_label')}.
        </div>
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t('admin_categories_loading')}</div>
            <div className={styles.emptyText}>{t('admin_categories_loading_text')}</div>
          </div>
        ) : sorted.length === 0 && hasActiveFilters ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t('admin_categories_no_match')}</div>
            <div className={styles.emptyText}>{t('admin_categories_no_match_text')}</div>
            <button type="button" className={styles.actionBtn} onClick={clearFilters}>{t('clear_filters')}</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t('admin_categories_no_categories')}</div>
            <div className={styles.emptyText}>{t('admin_categories_no_categories_text')}</div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('type')}</th>
                <th>{t('description')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((category) => {
                const categoryLabel = category.name || t('admin_categories_this_category')

                return (
                <tr key={category.id}>
                  <td className={styles.nameCell}>{category.name}</td>
                  <td>
                    <span className={`${styles.typeBadge} ${styles[`type${category.type}`] || ''}`}>
                      {t(CATEGORY_LABEL_KEYS[category.type] || 'admin_categories_type_test')}
                    </span>
                  </td>
                  <td className={styles.descCell}>
                    {category.description || <span className={styles.mutedCell}>{t('admin_categories_no_description')}</span>}
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button type="button" className={styles.actionBtn} onClick={() => openEdit(category)} disabled={deleteBusyId === category.id} aria-label={`${t('edit')} ${categoryLabel}`} title={`${t('edit')} ${categoryLabel}`}>
                        {t('edit')}
                      </button>
                      {isAdmin && (deleteConfirmId === category.id ? (
                        <>
                          <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(category.id)} disabled={deleteBusyId === category.id} aria-label={`${t('confirm_delete')} ${categoryLabel}`}>
                            {deleteBusyId === category.id ? t('admin_categories_deleting') : t('confirm')}
                          </button>
                          <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === category.id} aria-label={`${t('cancel_delete')} ${categoryLabel}`}>
                            {t('cancel')}
                          </button>
                        </>
                      ) : (
                        <button type="button" className={styles.actionBtn} onClick={() => void handleDelete(category.id)} disabled={deleteBusyId === category.id} aria-label={`${t('delete')} ${categoryLabel}`} title={`${t('delete')} ${categoryLabel}`}>
                          {t('delete')}
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
          <span className={styles.pageInfo}>{sorted.length} {t('admin_categories_categories_count')} | {t('page')} {page} {t('of')} {totalPages}</span>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1}>{t('admin_candidates_previous')}</button>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page === totalPages}>{t('next')}</button>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="category-dialog-title" className={styles.modalTitle}>{modal === 'create' ? t('admin_categories_new_category') : t('admin_categories_edit_category')}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="category-name">{t('name')}</label>
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
              <label className={styles.label} htmlFor="category-type">{t('type')}</label>
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
                {CATEGORY_OPTION_KEYS.map((option) => (
                  <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                ))}
              </select>
              {fieldErrors.type && <div className={styles.fieldError}>{fieldErrors.type}</div>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="category-description">{t('description')}</label>
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
              <button type="button" className={styles.btnCancel} onClick={close} disabled={saving}>{t('cancel')}</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
                {saving ? t('saving') : modal === 'create' ? t('admin_categories_create_category') : t('admin_categories_save_changes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
