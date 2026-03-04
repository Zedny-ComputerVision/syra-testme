import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminMaintenance.module.scss'

export default function AdminMaintenance() {
  const [mode, setMode] = useState('off')
  const [banner, setBanner] = useState('')

  useEffect(() => {
    adminApi.settings().then(({ data }) => {
      const m = data.find(s => s.key === 'maintenance_mode')
      const b = data.find(s => s.key === 'maintenance_banner')
      if (m) setMode(m.value || 'off')
      if (b) setBanner(b.value || '')
    })
  }, [])

  const save = async () => {
    await adminApi.updateSetting('maintenance_mode', mode)
    await adminApi.updateSetting('maintenance_banner', banner)
    alert('Saved')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Maintenance" subtitle="Enable maintenance mode and banner" />
      <div className={styles.card}>
        <label className={styles.label}>Mode</label>
        <select className={styles.input} value={mode} onChange={e => setMode(e.target.value)}>
          <option value="off">Off</option>
          <option value="read-only">Read-only</option>
          <option value="down">Down</option>
        </select>
        <label className={styles.label}>Banner Message</label>
        <textarea className={styles.textarea} value={banner} onChange={e => setBanner(e.target.value)} rows={3} />
        <button className={styles.btn} onClick={save}>Save</button>
      </div>
    </div>
  )
}
