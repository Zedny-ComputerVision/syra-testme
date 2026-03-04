import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminIntegrations.module.scss'

const INTEGRATIONS = [
  { key: 'slack', name: 'Slack', desc: 'Send alerts to a Slack channel', urlLabel: 'Webhook URL' },
  { key: 'teams', name: 'Microsoft Teams', desc: 'Send alerts to Teams webhook', urlLabel: 'Webhook URL' },
  { key: 'webhook', name: 'Webhook', desc: 'POST exam events to your webhook', urlLabel: 'Endpoint URL' },
  { key: 's3', name: 'S3 Storage', desc: 'Archive reports to S3', urlLabel: 'S3 bucket/path' },
]

const KEY = 'integrations_config'

export default function AdminIntegrations() {
  const [state, setState] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.getSetting(KEY).then(({ data }) => {
      if (data?.value) setState(JSON.parse(data.value))
    }).catch(() => {})
  }, [])

  const persist = async (next) => {
    setSaving(true)
    setError('')
    try { await adminApi.updateSetting(KEY, JSON.stringify(next)) } catch (e) { setError(e.response?.data?.detail || 'Save failed') } finally { setSaving(false) }
  }

  const toggle = (key) => {
    const next = { ...state, [key]: { ...(state[key] || {}), enabled: !(state[key]?.enabled) } }
    setState(next)
    persist(next)
  }

  const updateField = (key, field, value) => {
    const next = { ...state, [key]: { ...(state[key] || {}), [field]: value } }
    setState(next)
    persist(next)
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const { data } = await adminApi.testIntegrations(state)
      setResults(data?.results || {})
    } catch (e) {
      setError(e.response?.data?.detail || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Integrations" subtitle="Connect SYRA to external systems" />
      {error && <div className={styles.error}>{error}</div>}
      {results && (
        <div className={styles.results}>
          {Object.entries(results).map(([k, v]) => (
            <div key={k} className={styles.resultRow}><strong>{k}</strong>: {v}</div>
          ))}
        </div>
      )}
      <div className={styles.list}>
        {INTEGRATIONS.map(integ => (
          <div key={integ.key} className={styles.card}>
            <div>
              <div className={styles.title}>{integ.name}</div>
              <div className={styles.sub}>{integ.desc}</div>
            </div>
            <div className={styles.fields}>
              <label className={styles.label}>{integ.urlLabel}</label>
              <input className={styles.input} value={state[integ.key]?.url || ''} onChange={e => updateField(integ.key, 'url', e.target.value)} />
              <label className={styles.label}>Secret / Token (optional)</label>
              <input className={styles.input} value={state[integ.key]?.secret || ''} onChange={e => updateField(integ.key, 'secret', e.target.value)} />
            </div>
            <div className={styles.actions}>
              <button className={styles.toggle} onClick={() => toggle(integ.key)} disabled={saving}>
                {state[integ.key]?.enabled ? 'Enabled' : 'Enable'}
              </button>
              <button className={styles.testBtn} onClick={sendTest} disabled={testing}>Send Test</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
