import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminMaintenance.module.scss'

const MODES = [
  {
    value: 'off',
    label: 'Off',
    audience: 'Everyone can use the platform normally.',
    impact: 'No maintenance banner is required.',
    defaultBanner: '',
  },
  {
    value: 'read-only',
    label: 'Read-only',
    audience: 'Non-admins can view pages but should avoid write actions.',
    impact: 'Use this while validating data or preparing a release.',
    defaultBanner: 'Scheduled maintenance is in progress. Changes may be temporarily limited.',
  },
  {
    value: 'down',
    label: 'Down',
    audience: 'Non-admins are redirected to the maintenance screen.',
    impact: 'Use this for outages, schema changes, or deploy windows.',
    defaultBanner: 'Scheduled maintenance is in progress. Please check back shortly.',
  },
]

export default function AdminMaintenance() {
  const [mode, setMode] = useState('off')
  const [banner, setBanner] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [baseline, setBaseline] = useState({ mode: 'off', banner: '' })

  const modeMeta = useMemo(
    () => MODES.find((entry) => entry.value === mode) || MODES[0],
    [mode],
  )
  const trimmedBanner = banner.trim()
  const effectiveBanner = trimmedBanner || modeMeta.defaultBanner
  const dirty = mode !== baseline.mode || banner !== baseline.banner
  const usingDefaultBanner = !trimmedBanner && Boolean(modeMeta.defaultBanner)
  const summaryCards = [
    {
      label: 'Selected mode',
      value: modeMeta.label,
      helper: modeMeta.audience,
    },
    {
      label: 'Banner source',
      value: usingDefaultBanner ? 'Default' : trimmedBanner ? 'Custom' : 'None',
      helper: usingDefaultBanner ? 'Using the mode default banner text' : trimmedBanner ? 'Custom banner will be shown to users' : 'No banner text will be shown',
    },
    {
      label: 'Draft state',
      value: dirty ? 'Unsaved' : 'Saved',
      helper: ready ? 'Settings are ready to edit' : 'Retry loading before editing',
    },
  ]

  const load = async () => {
    setLoading(true)
    setNotice('')
    try {
      const { data } = await adminApi.settings()
      const settings = data || []
      const nextMode = settings.find((entry) => entry.key === 'maintenance_mode')?.value || 'off'
      const nextBanner = settings.find((entry) => entry.key === 'maintenance_banner')?.value || ''
      setMode(nextMode)
      setBanner(nextBanner)
      setBaseline({ mode: nextMode, banner: nextBanner })
      setError('')
      setReady(true)
    } catch {
      setError('Failed to load maintenance settings.')
      setReady(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const reset = () => {
    setMode(baseline.mode)
    setBanner(baseline.banner)
    setError('')
    setNotice('')
  }

  const save = async () => {
    setSaving(true)
    setNotice('')
    setError('')
    try {
      await adminApi.updateSetting('maintenance_mode', mode)
      await adminApi.updateSetting('maintenance_banner', trimmedBanner)
      setBaseline({ mode, banner: trimmedBanner })
      setBanner(trimmedBanner)
      setNotice('Maintenance settings saved.')
    } catch {
      setError('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const applyDefaultBanner = () => {
    setBanner(modeMeta.defaultBanner)
    setError('')
    setNotice('')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Maintenance" subtitle="Control maintenance mode, audience impact, and the public-facing banner" />

      <div className={styles.summaryRow}>
        <span className={styles.summaryChip}>Mode: {modeMeta.label}</span>
        <span className={styles.summaryChip}>{dirty ? 'Unsaved changes' : 'Saved state'}</span>
        <span className={styles.summaryChip}>{ready ? 'Settings loaded' : 'Retry required'}</span>
      </div>
      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.layout}>
        <div className={styles.card}>
          {loading && <div className={styles.loadingText}>Loading maintenance settings...</div>}
          {!loading && !ready && (
            <div className={styles.retryRow}>
              <span className={styles.loadingText}>Retry loading settings before editing to avoid overwriting the saved maintenance state.</span>
              <button type="button" className={styles.retryBtn} onClick={load}>Retry</button>
            </div>
          )}

          <div className={styles.modeGrid}>
            {MODES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={`${styles.modeCard} ${mode === entry.value ? styles.modeCardActive : ''}`}
                onClick={() => setMode(entry.value)}
                disabled={loading || saving || !ready}
              >
                <div className={styles.modeTitle}>{entry.label}</div>
                <div className={styles.modeAudience}>{entry.audience}</div>
                <div className={styles.modeImpact}>{entry.impact}</div>
              </button>
            ))}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="maintenance-mode">Mode</label>
            <select id="maintenance-mode" className={styles.input} value={mode} onChange={(e) => setMode(e.target.value)} disabled={loading || saving || !ready}>
              {MODES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
            <div className={styles.helper}>{modeMeta.impact}</div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="maintenance-banner">Banner Message</label>
            <textarea
              id="maintenance-banner"
              className={styles.textarea}
              value={banner}
              onChange={(e) => setBanner(e.target.value)}
              rows={4}
              placeholder={modeMeta.defaultBanner || 'No banner is required while maintenance mode is off.'}
              disabled={loading || saving || !ready}
            />
            <div className={styles.helper}>
              Leave the banner empty to use the default message for the selected mode.
            </div>
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={applyDefaultBanner}
                disabled={loading || saving || !ready || !modeMeta.defaultBanner || trimmedBanner === modeMeta.defaultBanner}
              >
                Use default banner
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setBanner('')}
                disabled={loading || saving || !ready || banner === ''}
              >
                Clear custom banner
              </button>
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.secondaryBtn} onClick={reset} disabled={!dirty || saving || loading || !ready}>
              Reset changes
            </button>
            <button type="button" className={styles.btn} onClick={save} disabled={saving || loading || !ready || !dirty}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className={styles.previewCard}>
          <div className={styles.previewTitle}>Impact Preview</div>
          <div className={styles.previewSub}>{modeMeta.audience}</div>

          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>Banner shown to users</div>
            <div className={styles.previewBanner}>{effectiveBanner || 'No maintenance banner will be shown.'}</div>
          </div>

          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>Admin note</div>
            <div className={styles.previewMeta}>
              Admins keep access while this mode is active, so use the preview to verify the banner text before saving.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
