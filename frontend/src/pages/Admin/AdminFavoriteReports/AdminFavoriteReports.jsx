import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminFavoriteReports.module.scss'

const KEY = 'favorite_reports'

export default function AdminFavoriteReports() {
  const [favorites, setFavorites] = useState([])
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const { data } = await adminApi.getSetting(KEY)
      if (data?.value) setFavorites(JSON.parse(data.value))
    } catch (_) {}
  }
  useEffect(() => { load() }, [])

  const persist = async (next) => {
    setSaving(true)
    try { await adminApi.updateSetting(KEY, JSON.stringify(next)) } finally { setSaving(false) }
  }

  const add = () => {
    const next = [...favorites, { title, link }]
    setFavorites(next)
    setTitle(''); setLink('')
    persist(next)
  }

  const remove = (i) => {
    const next = favorites.filter((_, idx) => idx !== i)
    setFavorites(next)
    persist(next)
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="My Favorite Reports" subtitle="Quick links to reports you use often" />
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Add Favorite</div>
          <input className={styles.input} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <input className={styles.input} placeholder="URL or path" value={link} onChange={e => setLink(e.target.value)} />
          <button className={styles.btn} onClick={add} disabled={!title || !link || saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Saved</div>
          {favorites.length === 0 && <div className={styles.empty}>No favorites yet.</div>}
          <div className={styles.list}>
            {favorites.map((f, i) => (
              <div key={i} className={styles.row}>
                <button
                  className={styles.linkBtn}
                  onClick={() => {
                    if (f.link?.startsWith('http')) window.open(f.link, '_blank')
                    else window.location.href = f.link || '/'
                  }}
                >
                  <div className={styles.rowTitle}>{f.title}</div>
                  <div className={styles.rowSub}>{f.link}</div>
                </button>
                <button className={styles.deleteBtn} onClick={() => remove(i)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
