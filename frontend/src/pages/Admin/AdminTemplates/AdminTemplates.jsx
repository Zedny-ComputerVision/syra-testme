import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
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
  const { t } = useLanguage()
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
      setLoadError(resolveError(err) || t('admin_templates_load_error'))
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
      label: t('admin_templates_saved_templates'),
      value: templates.length,
      helper: t('admin_templates_blueprints_helper'),
    },
    {
      label: t('admin_stat_visible_now'),
      value: filteredTemplates.length,
      helper: hasActiveFilters ? t('admin_stat_matching_filters') : t('admin_templates_all_loaded'),
    },
    {
      label: t('admin_templates_owned_by_you'),
      value: ownTemplatesCount,
      helper: t('admin_templates_owned_helper'),
    },
    {
      label: t('admin_templates_read_only'),
      value: readOnlyCount,
      helper: t('admin_templates_read_only_helper'),
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
      setError(t('admin_templates_name_required'))
      return
    }
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const parsed = config ? JSON.parse(config) : {}
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error(t('admin_templates_config_must_be_object'))
      }
      if (editingId) {
        await adminApi.updateExamTemplate(editingId, {
          name: trimmedName,
          description: description.trim() || null,
          config: parsed,
        })
        setNotice(t('admin_templates_updated_notice'))
      } else {
        await adminApi.createExamTemplate({
          name: trimmedName,
          description: description.trim() || null,
          config: parsed,
        })
        setNotice(t('admin_templates_created_notice'))
      }
      resetForm()
      await load()
    } catch (err) {
      setError(resolveError(err) || err.message || t('admin_templates_save_failed'))
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
      setNotice(t('admin_templates_deleted_notice'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_templates_delete_failed'))
      setDeleteConfirmId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className={styles.page}>
      <AdminPageHeader title={t('admin_templates_page_title')} subtitle={t('admin_templates_page_subtitle')} />
      {loadError && (
        <div className={styles.helperRow}>
          <div className={styles.error}>{loadError}</div>
          <button className={styles.editBtn} type="button" onClick={() => void load()}>{t('retry')}</button>
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
          <div className={styles.sectionTitle}>{editingId ? t('admin_templates_edit_template') : t('admin_templates_new_template')}</div>
          {error && <div className={styles.error}>{error}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}
          <label className={styles.label}>{t('admin_templates_name_label')}</label>
          <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} required />

          <label className={styles.label}>{t('admin_templates_description_label')}</label>
          <input className={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} />

          <label className={styles.label}>{t('admin_templates_config_json_label')}</label>
          <textarea className={styles.textarea} value={config} onChange={(event) => setConfig(event.target.value)} rows={6} />

          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? t('saving') : editingId ? t('admin_templates_update_template') : t('admin_templates_save_template')}</button>
            {editingId && <button type="button" className={styles.btnCancel} onClick={resetForm}>{t('cancel')}</button>}
          </div>
        </form>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>{t('admin_templates_saved_section')}</div>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="template-search">{t('admin_templates_search_label')}</label>
                <input
                  id="template-search"
                  className={styles.input}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('admin_templates_search_placeholder')}
                />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="template-ownership-filter">{t('admin_templates_ownership_label')}</label>
                <select
                  id="template-ownership-filter"
                  className={styles.input}
                  value={ownershipFilter}
                  onChange={(event) => setOwnershipFilter(event.target.value)}
                >
                  <option value="ALL">{t('admin_templates_filter_all')}</option>
                  <option value="MINE">{t('admin_templates_owned_by_you')}</option>
                  <option value="READ_ONLY">{t('admin_templates_filter_read_only')}</option>
                </select>
              </div>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.editBtn} onClick={() => setSortDir((current) => (current === 'ASC' ? 'DESC' : 'ASC'))}>
                {t('admin_sort_name')} {sortDir === 'ASC' ? 'A-Z' : 'Z-A'}
              </button>
              <button type="button" className={styles.editBtn} onClick={() => void load()} disabled={loading}>
                {loading ? t('admin_refreshing') : t('admin_refresh')}
              </button>
              <button type="button" className={styles.editBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                {t('admin_clear_filters')}
              </button>
            </div>
          </div>
          <div className={styles.filterMeta}>
            {t('admin_templates_showing_count', { filtered: filteredTemplates.length, total: templates.length })}
          </div>
          {loading && <div className={styles.muted}>{t('loading')}</div>}
          {!loading && !loadError && filteredTemplates.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? t('admin_templates_no_match') : t('admin_templates_none_yet')}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? t('admin_templates_clear_filters_hint')
                  : t('admin_templates_empty_state')}
              </div>
              {hasActiveFilters && <button type="button" className={styles.editBtn} onClick={clearFilters}>{t('admin_clear_filters')}</button>}
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
                        ? t('admin_templates_owned_by_you')
                        : t('admin_templates_editable_as_admin')
                      : t('admin_templates_read_only_shared')}
                    {' · '}
                    {t('admin_templates_config_fields_count', { count: Object.keys(template?.config || {}).length })}
                  </div>
                  {!canManageTemplate(template) && <div className={styles.rowSub}>{t('admin_templates_read_only_notice')}</div>}
                </div>
                <div className={styles.rowBtns}>
                  {canManageTemplate(template) && <button className={styles.editBtn} type="button" onClick={() => startEdit(template)} aria-label={`${t('edit')} ${template.name || t('admin_templates_this_template')}`} title={`${t('edit')} ${template.name || t('admin_templates_this_template')}`}>{t('edit')}</button>}
                  {isAdmin && (deleteConfirmId === template.id ? (
                    <>
                      <button className={`${styles.deleteBtn} ${styles.dangerBtn}`} type="button" onClick={() => handleDelete(template.id)} disabled={deletingId === template.id} aria-label={`${t('confirm')} ${t('delete')} ${template.name || t('admin_templates_this_template')}`}>
                        {deletingId === template.id ? t('admin_deleting') : t('confirm')}
                      </button>
                      <button className={styles.editBtn} type="button" onClick={() => setDeleteConfirmId(null)} disabled={deletingId === template.id} aria-label={`${t('admin_templates_keep')} ${template.name || t('admin_templates_this_template')}`}>{t('cancel')}</button>
                    </>
                  ) : (
                    <button className={styles.deleteBtn} type="button" onClick={() => handleDelete(template.id)} disabled={deletingId === template.id} aria-label={`${t('delete')} ${template.name || t('admin_templates_this_template')}`} title={`${t('delete')} ${template.name || t('admin_templates_this_template')}`}>{t('delete')}</button>
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
