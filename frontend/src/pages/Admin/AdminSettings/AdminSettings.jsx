import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import useLanguage from '../../../hooks/useLanguage'
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

export default function AdminSettings() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const SYSTEM_LINKS = [
    { title: t('admin_settings_link_maintenance'), subtitle: t('admin_settings_link_maintenance_sub'), to: '/admin/maintenance' },
    { title: t('admin_settings_link_integrations'), subtitle: t('admin_settings_link_integrations_sub'), to: '/admin/integrations' },
    { title: t('admin_settings_link_subscribers'), subtitle: t('admin_settings_link_subscribers_sub'), to: '/admin/subscribers' },
    { title: t('admin_settings_link_roles'), subtitle: t('admin_settings_link_roles_sub'), to: '/admin/roles' },
  ]
  const [settings, setSettings] = useState([])
  const [edited, setEdited] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [notice, setNotice] = useState('')
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
      setLoadError(t('admin_settings_load_error'))
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
      setSaveErrors((prev) => ({ ...prev, [key]: err.response?.data?.detail || t('admin_settings_save_failed') }))
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
      setNotice(t('admin_settings_saved'))
      setTimeout(() => { setSavedKey(''); setNotice('') }, 2500)
    } catch (err) {
      setError(err.response?.data?.detail || t('admin_settings_signup_save_error'))
    } finally {
      setSavingKey('')
    }
  }

  const isDirty = (key, original) => edited[key] !== undefined && edited[key] !== original

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_settings_title')} subtitle={t('admin_settings_subtitle')} />
      {loadError && (
        <div className={styles.errorBanner}>
          <span>{loadError}</span>
          <button type="button" className={styles.retryBtn} onClick={load} disabled={loading}>
            {t('admin_settings_retry')}
          </button>
        </div>
      )}
      {error && <div className={styles.errorBanner}>{error}</div>}
      {notice && <div className={styles.successBanner}>{notice}</div>}
      {loading && <div className={styles.loadingText}>{t('admin_settings_loading')}</div>}

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>{t('admin_settings_operational_title')}</div>
          <div className={styles.settingRow}>
            <div>
              <div className={styles.rowTitle}>{t('admin_settings_self_registration')}</div>
              <div className={styles.rowSub}>
                {t('admin_settings_self_registration_desc')}
                {!settingsReady && !loading ? ` ${t('admin_settings_retry_to_edit')}` : ''}
              </div>
            </div>
            <label className={styles.toggleRow}>
              <input type="checkbox" checked={signupAllowed} disabled={!settingsReady || loading} onChange={(e) => setSignupAllowed(e.target.checked)} />
              <span>{signupAllowed ? t('admin_settings_enabled') : t('admin_settings_disabled')}</span>
            </label>
          </div>
          <div className={styles.actions}>
            {savingKey === 'allow_signup' ? (
              <span className={styles.saving}>{t('admin_settings_saving')}</span>
            ) : savedKey === 'allow_signup' ? (
              <span className={styles.saved}>{t('admin_settings_saved')}</span>
            ) : (
              <button type="button" className={styles.saveBtn} onClick={saveSignup} disabled={loading || !settingsReady || signupAllowed === savedSignupAllowed}>{t('admin_settings_save_self_registration')}</button>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>{t('admin_settings_managed_pages')}</div>
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
        <div className={styles.sectionTitle}>{t('admin_settings_advanced_title')}</div>
        <div className={`${styles.rowSub} ${styles.sectionHint}`}>
          {t('admin_settings_advanced_hint')}
        </div>
        {loadError && !loading ? (
          <div className={styles.rowSub}>{t('admin_settings_retry_unmanaged')}</div>
        ) : settings.length === 0 ? (
          <div className={styles.rowSub}>{t('admin_settings_no_unmanaged')}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>{t('admin_settings_th_key')}</th><th>{t('admin_settings_th_value')}</th><th>{t('admin_settings_th_action')}</th></tr>
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
                      <span className={styles.saving}>{t('admin_settings_saving')}</span>
                    ) : savedKey === setting.key ? (
                      <span className={styles.saved}>{t('admin_settings_saved')}</span>
                    ) : (
                      <div className={styles.actionStack}>
                        <button
                          type="button"
                          className={styles.saveBtn}
                          onClick={() => updateRaw(setting.key)}
                          disabled={!isDirty(setting.key, setting.value || '')}
                        >
                          {t('admin_settings_save')}
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
