import React, { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
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

function validateBands(bands) {
  if (bands.length === 0) return 'Add at least one grade band.'
  const seenLabels = new Set()
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index]
    const position = index + 1
    const label = String(band.label || '').trim()
    if (!label) return `Band ${position} label is required.`
    const labelKey = label.toLowerCase()
    if (seenLabels.has(labelKey)) return 'Band labels must be unique.'
    seenLabels.add(labelKey)
    if (!Number.isFinite(Number(band.min_score)) || !Number.isFinite(Number(band.max_score))) {
      return `Band ${position} scores must be numeric.`
    }
    if (Number(band.min_score) < 0 || Number(band.min_score) > 100 || Number(band.max_score) < 0 || Number(band.max_score) > 100) {
      return `Band ${position} scores must be between 0 and 100.`
    }
    if (Number(band.min_score) > Number(band.max_score)) {
      return 'Band minimum scores cannot exceed the maximum.'
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
      return 'Grade bands cannot overlap.'
    }
  }

  return ''
}

export default function AdminGradingScales() {
  const { user } = useAuth()
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
      setLoadError(resolveError(err, 'Failed to load grading scales.'))
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
      label: 'Loaded scales',
      value: scales.length,
      helper: 'All grading scales available for test configuration',
    },
    {
      label: 'Visible now',
      value: filteredScales.length,
      helper: hasActiveFilters ? 'Matching the active search and sort state' : 'All loaded grading scales',
    },
    {
      label: 'Total bands',
      value: totalBands,
      helper: 'Grade bands across the currently loaded scales',
    },
    {
      label: 'Average bands',
      value: scales.length ? (totalBands / scales.length).toFixed(1) : '0.0',
      helper: 'Average number of grade bands per scale',
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
      ? 'Scale name is required.'
      : validateBands(bands)
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
        setNotice('Grading scale created.')
      } else {
        await adminApi.updateGradingScale(modal.id, data)
        setNotice('Grading scale updated.')
      }
      setModal(null)
      await load()
    } catch (err) {
      setModalError(resolveError(err, 'Save failed'))
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
      setNotice('Grading scale deleted.')
      await load()
    } catch (err) {
      setDeleteConfirmId(null)
      setDeleteError(resolveError(err, 'Failed to delete grading scale.'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Grading Scales" subtitle="Define grade bands for tests">
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>+ New Scale</button>
      </AdminPageHeader>

      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {deleteError && <div className={styles.errorBanner}>{deleteError}</div>}
      {loadError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{loadError}</div>
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
            aria-label="Search scales"
            type="text"
            className={styles.searchInput}
            placeholder="Search scales..."
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
          Showing {filteredScales.length} matching scale{filteredScales.length !== 1 ? 's' : ''} across {scales.length} loaded.
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>Loading grading scales...</div>
          <div className={styles.emptyText}>Fetching the current scale library and grade-band definitions.</div>
        </div>
      ) : filteredScales.length === 0 && hasActiveFilters ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No grading scales match the current filters.</div>
          <div className={styles.emptyText}>Clear the search or reset sorting to restore the full scale library.</div>
          <button type="button" className={styles.actionBtn} onClick={clearFilters}>Clear filters</button>
        </div>
      ) : filteredScales.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No grading scales yet.</div>
          <div className={styles.emptyText}>Create a scale to define how scores map to grades on your tests.</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredScales.map((scale) => {
            const scaleLabel = scale.name || 'this grading scale'

            return (
            <div key={scale.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardTitle}>{scale.name}</span>
                  <span className={styles.bandCount}>{(scale.bands || []).length} band{(scale.bands || []).length !== 1 ? 's' : ''}</span>
                </div>
                <div className={styles.actionBtns}>
                  <button type="button" className={styles.actionBtn} onClick={() => openEdit(scale)} disabled={deleteBusyId === scale.id} aria-label={`Edit grading scale ${scaleLabel}`} title={`Edit grading scale ${scaleLabel}`}>
                    Edit
                  </button>
                  {isAdmin && (deleteConfirmId === scale.id ? (
                    <>
                      <button type="button" className={styles.actionBtnDanger} onClick={() => void handleDelete(scale.id)} disabled={deleteBusyId === scale.id} aria-label={`Confirm delete for grading scale ${scaleLabel}`}>
                        {deleteBusyId === scale.id ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === scale.id} aria-label={`Keep grading scale ${scaleLabel}`}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirmId(scale.id)} disabled={deleteBusyId === scale.id} aria-label={`Delete grading scale ${scaleLabel}`} title={`Delete grading scale ${scaleLabel}`}>
                      Delete
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
            <h3 id="grading-scale-dialog-title" className={styles.modalTitle}>{modal === 'create' ? 'New Grading Scale' : 'Edit Grading Scale'}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="grading-scale-name">Scale Name</label>
              <input id="grading-scale-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Standard Letter Grade" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Grade Bands</label>
              {bands.map((band, index) => (
                <div key={index} className={styles.bandRow}>
                  <input aria-label={`Band ${index + 1} label`} className={`${styles.inputSmall} ${styles.inputSmallLabel}`} value={band.label} onChange={(event) => updateBand(index, 'label', event.target.value)} placeholder="Label" />
                  <input aria-label={`Band ${index + 1} minimum score`} className={styles.inputSmall} type="number" value={band.min_score} onChange={(event) => updateBand(index, 'min_score', event.target.value)} placeholder="Min" />
                  <span className={styles.bandSeparator}>-</span>
                  <input aria-label={`Band ${index + 1} maximum score`} className={styles.inputSmall} type="number" value={band.max_score} onChange={(event) => updateBand(index, 'max_score', event.target.value)} placeholder="Max" />
                  <span className={styles.percentSuffix}>%</span>
                  {bands.length > 1 && (
                    <button className={styles.removeBand} type="button" onClick={() => removeBand(index)} disabled={saving} aria-label={`Remove band ${index + 1}`} title={`Remove band ${index + 1}`}>
                      x
                    </button>
                  )}
                </div>
              ))}
              <button className={styles.addBandBtn} type="button" onClick={addBand} disabled={saving}>+ Add Band</button>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving || !name.trim() || bands.length === 0}>
                {saving ? 'Saving...' : 'Save scale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
