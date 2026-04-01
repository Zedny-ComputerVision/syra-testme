import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminGradingScales.module.scss'

const EMPTY_BAND = { label: '', min_score: 0, max_score: 100 }
const BAND_COLORS = ['bandTone0', 'bandTone1', 'bandTone2', 'bandTone3', 'bandTone4', 'bandTone5']

const normalizeScale = (scale) => ({
  ...scale,
  bands: Array.isArray(scale?.bands)
    ? scale.bands
    : Array.isArray(scale?.labels)
      ? scale.labels
      : [],
})

function resolveError(err, fallback) {
  return err?.response?.data?.detail || fallback
}

function validateBands(bands, t) {
  if (bands.length === 0) return t('admin_grading_add_at_least_one_band')
  const seenLabels = new Set()
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index]
    const position = index + 1
    const label = String(band.label || '').trim()
    if (!label) return `${t('admin_grading_band')} ${position} ${t('admin_grading_label_required')}`
    const labelKey = label.toLowerCase()
    if (seenLabels.has(labelKey)) return t('admin_grading_labels_unique')
    seenLabels.add(labelKey)
    if (!Number.isFinite(Number(band.min_score)) || !Number.isFinite(Number(band.max_score))) {
      return `${t('admin_grading_band')} ${position} ${t('admin_grading_scores_numeric')}`
    }
    if (Number(band.min_score) < 0 || Number(band.min_score) > 100 || Number(band.max_score) < 0 || Number(band.max_score) > 100) {
      return `${t('admin_grading_band')} ${position} ${t('admin_grading_scores_0_100')}`
    }
    if (Number(band.min_score) > Number(band.max_score)) {
      return t('admin_grading_min_exceeds_max')
    }
  }

  const ordered = bands
    .map((band) => ({
      min_score: Number(band.min_score),
      max_score: Number(band.max_score),
    }))
    .sort((left, right) => left.min_score - right.min_score || left.max_score - right.max_score)

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].min_score <= ordered[index - 1].max_score) {
      return t('admin_grading_bands_overlap')
    }
  }

  return ''
}

export default function AdminGradingScales() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const isAdmin = user?.role === 'ADMIN'
  const [scales, setScales] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [name, setName] = useState('')
  const [bands, setBands] = useState([{ ...EMPTY_BAND }])
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('asc')

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await adminApi.gradingScales()
      setScales((data || []).map(normalizeScale))
    } catch (err) {
      setScales([])
      setLoadError(resolveError(err, t('admin_grading_load_error')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setName('')
    setBands([
      { label: 'A', min_score: 90, max_score: 100 },
      { label: 'B', min_score: 80, max_score: 89 },
      { label: 'C', min_score: 70, max_score: 79 },
      { label: 'F', min_score: 0, max_score: 69 },
    ])
    setModalError('')
    setModal('create')
  }

  const openEdit = (scale) => {
    setName(scale.name)
    setBands((scale.bands || scale.labels || [{ ...EMPTY_BAND }]).map((band) => ({ ...band })))
    setModalError('')
    setModal(scale)
  }

  const close = () => {
    if (saving) return
    setModal(null)
    setModalError('')
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredScales = useMemo(() => [...scales]
    .filter((scale) => !normalizedSearch || scale.name.toLowerCase().includes(normalizedSearch))
    .sort((left, right) => (sortDir === 'asc'
      ? left.name.localeCompare(right.name)
      : right.name.localeCompare(left.name))), [normalizedSearch, scales, sortDir])
  const hasActiveFilters = Boolean(normalizedSearch) || sortDir !== 'asc'
  const totalBands = scales.reduce((sum, scale) => sum + (scale.bands || []).length, 0)
  const summaryCards = [
    {
      label: t('admin_grading_loaded_scales'),
      value: scales.length,
      helper: t('admin_grading_loaded_scales_helper'),
    },
    {
      label: t('admin_grading_visible_now'),
      value: filteredScales.length,
      helper: hasActiveFilters ? t('admin_grading_matching_filters') : t('admin_grading_all_loaded'),
    },
    {
      label: t('admin_grading_total_bands'),
      value: totalBands,
      helper: t('admin_grading_total_bands_helper'),
    },
    {
      label: t('admin_grading_average_bands'),
      value: scales.length ? (totalBands / scales.length).toFixed(1) : '0.0',
      helper: t('admin_grading_average_bands_helper'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setSortDir('asc')
  }

  const updateBand = (indexToUpdate, field, value) => {
    setBands((prev) => prev.map((band, index) => (
      index === indexToUpdate
        ? { ...band, [field]: field === 'label' ? value : Number(value) }
        : band
    )))
  }

  const addBand = () => setBands((prev) => [...prev, { ...EMPTY_BAND }])
  const removeBand = (indexToRemove) => setBands((prev) => prev.filter((_, index) => index !== indexToRemove))

  const handleSave = async () => {
    const validationError = !name.trim()
      ? t('admin_grading_name_required')
      : validateBands(bands, t)
    if (validationError) {
      setModalError(validationError)
      return
    }

    const data = {
      name: name.trim(),
      labels: bands.map((band) => ({
        label: band.label.trim(),
        min_score: Number(band.min_score),
        max_score: Number(band.max_score),
      })),
    }

    setSaving(true)
    setModalError('')
    setNotice('')
    try {
      if (modal === 'create') {
        await adminApi.createGradingScale(data)
        setNotice(t('admin_grading_created'))
      } else {
        await adminApi.updateGradingScale(modal.id, data)
        setNotice(t('admin_grading_updated'))
      }
      setModal(null)
      await load()
    } catch (err) {
      setModalError(resolveError(err, t('admin_grading_save_error')))
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
    setDeleteError('')
    setNotice('')
    try {
      await adminApi.deleteGradingScale(id)
      setDeleteConfirmId(null)
      setNotice(t('admin_grading_deleted'))
      await load()
    } catch (err) {
      setDeleteConfirmId(null)
      setDeleteError(resolveError(err, t('admin_grading_delete_error')))
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_grading_title')} subtitle={t('admin_grading_subtitle')}>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>{t('admin_grading_new_scale')}</button>
      </AdminPageHeader>

      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {deleteError && <div className={styles.errorBanner}>{deleteError}</div>}
      {loadError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{loadError}</div>
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
            aria-label={t('admin_grading_search_scales')}
            type="text"
            className={styles.searchInput}
            placeholder={t('admin_grading_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
          {t('showing')} {filteredScales.length} {t('admin_grading_matching_scales')} {t('admin_grading_across')} {scales.length} {t('admin_grading_loaded_label')}.
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_grading_loading')}</div>
          <div className={styles.emptyText}>{t('admin_grading_loading_text')}</div>
        </div>
      ) : filteredScales.length === 0 && hasActiveFilters ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_grading_no_match')}</div>
          <div className={styles.emptyText}>{t('admin_grading_no_match_text')}</div>
          <button type="button" className={styles.actionBtn} onClick={clearFilters}>{t('clear_filters')}</button>
        </div>
      ) : filteredScales.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_grading_no_scales')}</div>
          <div className={styles.emptyText}>{t('admin_grading_no_scales_text')}</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredScales.map((scale) => {
            const scaleLabel = scale.name || t('admin_grading_this_scale')

            return (
            <div key={scale.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardTitle}>{scale.name}</span>
                  <span className={styles.bandCount}>{(scale.bands || []).length} {t('admin_grading_bands_count')}</span>
                </div>
                <div className={styles.actionBtns}>
                  <button type="button" className={styles.actionBtn} onClick={() => openEdit(scale)} disabled={deleteBusyId === scale.id} aria-label={`${t('edit')} ${t('admin_grading_grading_scale')} ${scaleLabel}`} title={`${t('edit')} ${t('admin_grading_grading_scale')} ${scaleLabel}`}>
                    {t('edit')}
                  </button>
                  {isAdmin && (deleteConfirmId === scale.id ? (
                    <>
                      <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(scale.id)} disabled={deleteBusyId === scale.id} aria-label={`${t('confirm_delete')} ${t('admin_grading_grading_scale')} ${scaleLabel}`}>
                        {deleteBusyId === scale.id ? t('admin_grading_deleting') : t('confirm')}
                      </button>
                      <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === scale.id} aria-label={`${t('admin_grading_keep')} ${t('admin_grading_grading_scale')} ${scaleLabel}`}>
                        {t('cancel')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(scale.id)} disabled={deleteBusyId === scale.id} aria-label={`${t('delete')} ${t('admin_grading_grading_scale')} ${scaleLabel}`} title={`${t('delete')} ${t('admin_grading_grading_scale')} ${scaleLabel}`}>
                      {t('delete')}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.bands}>
                {(scale.bands || []).map((band, index) => (
                  <div key={`${scale.id}-${index}`} className={styles.band}>
                    <span className={styles.bandLabel}>{band.label}</span>
                    <span className={styles.bandRange}>{band.min_score}-{band.max_score}%</span>
                    <div className={styles.bandBar}>
                      <div
                        className={`${styles.bandFill} ${styles[`bandTone${index % BAND_COLORS.length}`]}`}
                        style={{ width: `${Math.max(Number(band.max_score) - Number(band.min_score), 1)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="grading-scale-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="grading-scale-dialog-title" className={styles.modalTitle}>{modal === 'create' ? t('admin_grading_new_grading_scale') : t('admin_grading_edit_grading_scale')}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="grading-scale-name">{t('admin_grading_scale_name')}</label>
              <input id="grading-scale-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('admin_grading_name_placeholder')} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t('admin_grading_grade_bands')}</label>
              {bands.map((band, index) => (
                <div key={index} className={styles.bandRow}>
                  <input aria-label={`${t('admin_grading_band')} ${index + 1} ${t('admin_grading_label')}`} className={`${styles.inputSmall} ${styles.inputSmallLabel}`} value={band.label} onChange={(event) => updateBand(index, 'label', event.target.value)} placeholder={t('admin_grading_label')} />
                  <input aria-label={`${t('admin_grading_band')} ${index + 1} ${t('admin_grading_minimum_score')}`} className={styles.inputSmall} type="number" value={band.min_score} onChange={(event) => updateBand(index, 'min_score', event.target.value)} placeholder={t('admin_grading_min')} />
                  <span className={styles.bandSeparator}>-</span>
                  <input aria-label={`${t('admin_grading_band')} ${index + 1} ${t('admin_grading_maximum_score')}`} className={styles.inputSmall} type="number" value={band.max_score} onChange={(event) => updateBand(index, 'max_score', event.target.value)} placeholder={t('admin_grading_max')} />
                  <span className={styles.percentSuffix}>%</span>
                  {bands.length > 1 && (
                    <button className={styles.removeBand} type="button" onClick={() => removeBand(index)} disabled={saving} aria-label={`${t('admin_grading_remove_band')} ${index + 1}`} title={`${t('admin_grading_remove_band')} ${index + 1}`}>
                      x
                    </button>
                  )}
                </div>
              ))}
              <button className={styles.addBandBtn} type="button" onClick={addBand} disabled={saving}>{t('admin_grading_add_band')}</button>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={close} disabled={saving}>{t('cancel')}</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving || !name.trim() || bands.length === 0}>
                {saving ? t('saving') : t('admin_grading_save_scale')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
