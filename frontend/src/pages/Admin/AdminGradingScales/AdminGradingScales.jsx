import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminGradingScales.module.scss'

const BAND_COLORS = ['#10b981', '#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444']
const EMPTY_BAND = { label: '', min_score: 0, max_score: 100 }

export default function AdminGradingScales() {
  const [scales, setScales] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [name, setName] = useState('')
  const [bands, setBands] = useState([{ ...EMPTY_BAND }])

  const load = () => {
    setLoading(true)
    adminApi.gradingScales()
      .then(({ data }) => setScales(data || []))
      .catch(() => setScales([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setName('')
    setBands([{ label: 'A', min_score: 90, max_score: 100 }, { label: 'B', min_score: 80, max_score: 89 }, { label: 'C', min_score: 70, max_score: 79 }, { label: 'F', min_score: 0, max_score: 69 }])
    setModal('create')
  }

  const openEdit = (scale) => {
    setName(scale.name)
    setBands(scale.bands || [{ ...EMPTY_BAND }])
    setModal(scale)
  }

  const close = () => setModal(null)

  const updateBand = (idx, field, value) => {
    setBands(prev => prev.map((b, i) => i === idx ? { ...b, [field]: field === 'label' ? value : Number(value) } : b))
  }

  const addBand = () => setBands(prev => [...prev, { ...EMPTY_BAND }])
  const removeBand = (idx) => setBands(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async () => {
    const data = { name, bands }
    try {
      if (modal === 'create') {
        await adminApi.createGradingScale(data)
      } else {
        await adminApi.updateGradingScale(modal.id, data)
      }
      close()
      load()
    } catch (err) {
      console.error('Save failed', err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this grading scale?')) return
    try {
      await adminApi.deleteGradingScale(id)
      load()
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Grading Scales" subtitle="Define grade bands for exams">
        <button className={styles.btnPrimary} onClick={openCreate}>+ New Scale</button>
      </AdminPageHeader>

      {loading ? (
        <div className={styles.empty}>Loading...</div>
      ) : scales.length === 0 ? (
        <div className={styles.empty}>No grading scales yet.</div>
      ) : (
        <div className={styles.grid}>
          {scales.map(scale => (
            <div key={scale.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{scale.name}</span>
                <div className={styles.actionBtns}>
                  <button className={styles.actionBtn} onClick={() => openEdit(scale)}>Edit</button>
                  <button className={styles.actionBtn} onClick={() => handleDelete(scale.id)}>Delete</button>
                </div>
              </div>
              <div className={styles.bands}>
                {(scale.bands || []).map((band, i) => (
                  <div key={i} className={styles.band}>
                    <span className={styles.bandLabel}>{band.label}</span>
                    <span className={styles.bandRange}>{band.min_score}-{band.max_score}%</span>
                    <div className={styles.bandBar}>
                      <div
                        className={styles.bandFill}
                        style={{
                          width: `${band.max_score - band.min_score}%`,
                          background: BAND_COLORS[i % BAND_COLORS.length]
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={close}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{modal === 'create' ? 'New Grading Scale' : 'Edit Grading Scale'}</h3>
            <div className={styles.formGroup}>
              <label className={styles.label}>Scale Name</label>
              <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard Letter Grade" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Grade Bands</label>
              {bands.map((band, i) => (
                <div key={i} className={styles.bandRow}>
                  <input className={styles.inputSmall} style={{ width: 80 }} value={band.label} onChange={e => updateBand(i, 'label', e.target.value)} placeholder="Label" />
                  <input className={styles.inputSmall} type="number" value={band.min_score} onChange={e => updateBand(i, 'min_score', e.target.value)} placeholder="Min" />
                  <span style={{ color: 'var(--color-muted)' }}>-</span>
                  <input className={styles.inputSmall} type="number" value={band.max_score} onChange={e => updateBand(i, 'max_score', e.target.value)} placeholder="Max" />
                  <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>%</span>
                  {bands.length > 1 && <button className={styles.removeBand} onClick={() => removeBand(i)}>x</button>}
                </div>
              ))}
              <button className={styles.addBandBtn} onClick={addBand}>+ Add Band</button>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={close}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={!name.trim() || bands.length === 0}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
