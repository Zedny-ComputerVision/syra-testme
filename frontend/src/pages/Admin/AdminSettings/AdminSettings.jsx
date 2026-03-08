import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminSettings.module.scss'

const MANAGED_KEYS = new Set([
  'allow_signup',
  'maintenance_mode',
  'maintenance_banner',
  'integrations_config',
  'subscribers',
  'permissions_config',
])

const SYSTEM_LINKS = [
  { title: 'Maintenance', subtitle: 'Control read-only and downtime modes', to: '/admin/maintenance' },
  { title: 'Integrations', subtitle: 'Manage external hooks and delivery targets', to: '/admin/integrations' },
  { title: 'Subscribers', subtitle: 'Maintain report recipients with validation', to: '/admin/subscribers' },
  { title: 'Roles & Permissions', subtitle: 'Adjust navigation and access policy', to: '/admin/roles' },
]

export default function AdminSettings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState([])
  const [edited, setEdited] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveErrors, setSaveErrors] = useState({})
  const [signupAllowed, setSignupAllowed] = useState(false)
  const [savedSignupAllowed, setSavedSignupAllowed] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await adminApi.settings()
      const nextSettings = data || []
      const allowSignup = nextSettings.find((setting) => setting.key === 'allow_signup')?.value
      const nextSignupAllowed = String(allowSignup || '').toLowerCase() === 'true'
      setSignupAllowed(nextSignupAllowed)
      setSavedSignupAllowed(nextSignupAllowed)
      setSettings(nextSettings.filter((setting) => !MANAGED_KEYS.has(setting.key)))
      setEdited({})
      setSaveErrors({})
      setError('')
      setSettingsReady(true)
    } catch {
      setLoadError('Failed to load settings.')
      setSettings([])
      setSettingsReady(false)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const updateRaw = async (key) => {
    const value = edited[key] !== undefined ? edited[key] : (settings.find((setting) => setting.key === key)?.value || '')
    setSavingKey(key)
    setSavedKey('')
    setSaveErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    try {
      await adminApi.updateSetting(key, value)
      setSavedKey(key)
      setTimeout(() => setSavedKey(''), 2000)
      setEdited((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      await load()
    } catch (err) {
      setSaveErrors((prev) => ({ ...prev, [key]: err.response?.data?.detail || 'Save failed.' }))
    } finally {
      setSavingKey('')
    }
  }

  const saveSignup = async () => {
    setSavingKey('allow_signup')
    setSavedKey('')
    setError('')
    try {
      await adminApi.updateSetting('allow_signup', signupAllowed ? 'true' : 'false')
      setSavedSignupAllowed(signupAllowed)
      setSavedKey('allow_signup')
      setTimeout(() => setSavedKey(''), 2000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save self-registration setting.')
    } finally {
      setSavingKey('')
    }
  }

  const isDirty = (key, original) => edited[key] !== undefined && edited[key] !== original

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Admin Settings" subtitle="System-wide configuration" />
      {loadError && (
        <div className={styles.errorBanner}>
          <span>{loadError}</span>
          <button type="button" className={styles.retryBtn} onClick={load} disabled={loading}>
            Retry
          </button>
        </div>
      )}
      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && <div className={styles.loadingText}>Loading settings...</div>}

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Operational Settings</div>
          <div className={styles.settingRow}>
            <div>
              <div className={styles.rowTitle}>Self-registration</div>
              <div className={styles.rowSub}>
                Control whether new learners can create accounts from the signup page.
                {!settingsReady && !loading ? ' Retry loading settings to enable editing.' : ''}
              </div>
            </div>
            <label className={styles.toggleRow}>
              <input type="checkbox" checked={signupAllowed} disabled={!settingsReady || loading} onChange={(e) => setSignupAllowed(e.target.checked)} />
              <span>{signupAllowed ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
          <div className={styles.actions}>
            {savingKey === 'allow_signup' ? (
              <span className={styles.saving}>Saving...</span>
            ) : savedKey === 'allow_signup' ? (
              <span className={styles.saved}>Saved</span>
            ) : (
              <button type="button" className={styles.saveBtn} onClick={saveSignup} disabled={loading || !settingsReady || signupAllowed === savedSignupAllowed}>Save Self-registration</button>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Managed Pages</div>
          <div className={styles.linkGrid}>
            {SYSTEM_LINKS.map((link) => (
              <button key={link.to} type="button" className={styles.linkCard} onClick={() => navigate(link.to)}>
                <div className={styles.rowTitle}>{link.title}</div>
                <div className={styles.rowSub}>{link.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.sectionTitle}>Advanced Settings</div>
        <div className={`${styles.rowSub} ${styles.sectionHint}`}>
          Only uncommon keys remain editable here. Core system settings are managed from their dedicated pages above.
        </div>
        {loadError && !loading ? (
          <div className={styles.rowSub}>Retry to load unmanaged settings.</div>
        ) : settings.length === 0 ? (
          <div className={styles.rowSub}>No unmanaged settings found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Key</th><th>Value</th><th>Action</th></tr>
            </thead>
            <tbody>
              {settings.map((setting) => (
                <tr key={setting.id}>
                  <td className={styles.keyCell}>{setting.key}</td>
                  <td>
                    <input
                      className={styles.input}
                      value={edited[setting.key] !== undefined ? edited[setting.key] : (setting.value || '')}
                      onChange={(e) => setEdited((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                    />
                  </td>
                  <td className={styles.actionCell}>
                    {savingKey === setting.key ? (
                      <span className={styles.saving}>Saving...</span>
                    ) : savedKey === setting.key ? (
                      <span className={styles.saved}>Saved</span>
                    ) : (
                      <div className={styles.actionStack}>
                        <button
                          type="button"
                          className={styles.saveBtn}
                          onClick={() => updateRaw(setting.key)}
                          disabled={!isDirty(setting.key, setting.value || '')}
                        >
                          Save
                        </button>
                        {saveErrors[setting.key] && <span className={styles.errorText}>{saveErrors[setting.key]}</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
