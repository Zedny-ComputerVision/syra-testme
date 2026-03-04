import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminSettings.module.scss'

export default function AdminSettings() {
  const [settings, setSettings] = useState([])
  const [savingKey, setSavingKey] = useState('')

  const load = async () => {
    const { data } = await adminApi.settings()
    setSettings(data || [])
  }
  useEffect(() => { load() }, [])

  const update = async (key, value) => {
    setSavingKey(key)
    await adminApi.updateSetting(key, value)
    setSavingKey('')
    load()
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Admin Settings" subtitle="System-wide configuration" />
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr><th>Key</th><th>Value</th><th /></tr>
          </thead>
          <tbody>
            {settings.map(s => (
              <tr key={s.id}>
                <td>{s.key}</td>
                <td>
                  <input
                    className={styles.input}
                    defaultValue={s.value || ''}
                    onBlur={e => update(s.key, e.target.value)}
                  />
                </td>
                <td>{savingKey === s.key ? 'Saving...' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
