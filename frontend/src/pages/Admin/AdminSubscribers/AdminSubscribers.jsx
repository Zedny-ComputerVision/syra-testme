import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminSubscribers.module.scss'

const KEY = 'subscribers'

export default function AdminSubscribers() {
  const [subs, setSubs] = useState([])
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const { data } = await adminApi.getSetting(KEY)
      if (data?.value) setSubs(JSON.parse(data.value))
    } catch (_) {}
  }
  useEffect(() => { load() }, [])

  const persist = async (next) => {
    setSaving(true)
    try { await adminApi.updateSetting(KEY, JSON.stringify(next)) } finally { setSaving(false) }
  }

  const add = () => {
    const next = [...subs, email]
    setSubs(next)
    setEmail('')
    persist(next)
  }

  const remove = (idx) => {
    const next = subs.filter((_, i) => i !== idx)
    setSubs(next)
    persist(next)
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Subscribers" subtitle="Report notification recipients" />
      <div className={styles.card}>
        <div className={styles.row}>
          <input className={styles.input} type="email" placeholder="user@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className={styles.btn} onClick={add} disabled={!email || saving}>{saving ? 'Saving...' : 'Add'}</button>
        </div>
        <div className={styles.list}>
          {subs.map((s, i) => (
            <div key={i} className={styles.subRow}>
              <span>{s}</span>
              <button className={styles.deleteBtn} onClick={() => remove(i)}>Remove</button>
            </div>
          ))}
          {subs.length === 0 && <div className={styles.empty}>No subscribers yet.</div>}
        </div>
      </div>
    </div>
  )
}
