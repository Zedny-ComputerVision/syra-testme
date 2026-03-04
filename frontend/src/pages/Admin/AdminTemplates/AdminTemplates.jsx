import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminTemplates.module.scss'

export default function AdminTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState('{}')
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    adminApi.examTemplates().then(({ data }) => setTemplates(data || [])).catch(() => setError('Failed to load templates')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const parsed = config ? JSON.parse(config) : {}
      await adminApi.createExamTemplate({ name, description, config: parsed })
      setName(''); setDescription(''); setConfig('{}')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create template. Check JSON config.')
    }
  }

  const handleDelete = async (id) => {
    await adminApi.deleteExamTemplate(id)
    load()
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Test Templates" subtitle="Create reusable exam blueprints" />

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={handleCreate}>
          <div className={styles.sectionTitle}>New Template</div>
          {error && <div className={styles.error}>{error}</div>}
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />

          <label className={styles.label}>Description</label>
          <input className={styles.input} value={description} onChange={e => setDescription(e.target.value)} />

          <label className={styles.label}>Config JSON</label>
          <textarea className={styles.textarea} value={config} onChange={e => setConfig(e.target.value)} rows={6} />

          <button type="submit" className={styles.btnPrimary}>Save Template</button>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Saved Templates</div>
          {loading && <div className={styles.muted}>Loading...</div>}
          {!loading && templates.length === 0 && <div className={styles.muted}>No templates yet.</div>}

          <div className={styles.list}>
            {templates.map(tpl => (
              <div key={tpl.id} className={styles.row}>
                <div>
                  <div className={styles.rowTitle}>{tpl.name}</div>
                  <div className={styles.rowSub}>{tpl.description}</div>
                </div>
                <button className={styles.deleteBtn} type="button" onClick={() => handleDelete(tpl.id)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
