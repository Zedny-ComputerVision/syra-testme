import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminMaintenance.module.scss'

export default function AdminMaintenance() {
  const { t } = useLanguage()

  const [mode, setMode] = useState('off')
  const [banner, setBanner] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [baseline, setBaseline] = useState({ mode: 'off', banner: '' })

  const MODES = useMemo(() => [
    {
      value: 'off',
      label: t('admin_maint_mode_off'),
      audience: t('admin_maint_mode_off_audience'),
      impact: t('admin_maint_mode_off_impact'),
      defaultBanner: '',
    },
    {
      value: 'read-only',
      label: t('admin_maint_mode_readonly'),
      audience: t('admin_maint_mode_readonly_audience'),
      impact: t('admin_maint_mode_readonly_impact'),
      defaultBanner: t('admin_maint_banner_readonly_default'),
    },
    {
      value: 'down',
      label: t('admin_maint_mode_down'),
      audience: t('admin_maint_mode_down_audience'),
      impact: t('admin_maint_mode_down_impact'),
      defaultBanner: t('admin_maint_banner_down_default'),
    },
  ], [t])

  const modeMeta = useMemo(
    () => MODES.find((entry) => entry.value === mode) || MODES[0],
    [mode, MODES],
  )
  const trimmedBanner = banner.trim()
  const effectiveBanner = trimmedBanner || modeMeta.defaultBanner
  const dirty = mode !== baseline.mode || banner !== baseline.banner
  const usingDefaultBanner = !trimmedBanner && Boolean(modeMeta.defaultBanner)
  const summaryCards = [
    {
      label: t('admin_maint_selected_mode'),
      value: modeMeta.label,
      helper: modeMeta.audience,
    },
    {
      label: t('admin_maint_banner_source'),
      value: usingDefaultBanner ? t('admin_maint_default') : trimmedBanner ? t('admin_maint_custom') : t('admin_maint_none'),
      helper: usingDefaultBanner ? t('admin_maint_using_default_banner') : trimmedBanner ? t('admin_maint_custom_banner_shown') : t('admin_maint_no_banner_shown'),
    },
    {
      label: t('admin_maint_draft_state'),
      value: dirty ? t('admin_maint_unsaved') : t('admin_maint_saved'),
      helper: ready ? t('admin_maint_ready_to_edit') : t('admin_maint_retry_before_edit'),
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
      setError(t('admin_maint_load_error'))
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
      setNotice(t('admin_maint_saved_notice'))
    } catch {
      setError(t('admin_maint_save_error'))
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
      <AdminPageHeader title={t('admin_maint_title')} subtitle={t('admin_maint_subtitle')} />

      <div className={styles.summaryRow}>
        <span className={styles.summaryChip}>{t('admin_maint_mode_chip', { mode: modeMeta.label })}</span>
        <span className={styles.summaryChip}>{dirty ? t('admin_maint_unsaved_changes') : t('admin_maint_saved_state')}</span>
        <span className={styles.summaryChip}>{ready ? t('admin_maint_settings_loaded') : t('admin_maint_retry_required')}</span>
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
          {loading && <div className={styles.loadingText}>{t('admin_maint_loading')}</div>}
          {!loading && !ready && (
            <div className={styles.retryRow}>
              <span className={styles.loadingText}>{t('admin_maint_retry_hint')}</span>
              <button type="button" className={styles.retryBtn} onClick={load}>{t('admin_maint_retry')}</button>
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
            <label className={styles.label} htmlFor="maintenance-mode">{t('admin_maint_mode_label')}</label>
            <select id="maintenance-mode" className={styles.input} value={mode} onChange={(e) => setMode(e.target.value)} disabled={loading || saving || !ready}>
              {MODES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
            <div className={styles.helper}>{modeMeta.impact}</div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="maintenance-banner">{t('admin_maint_banner_label')}</label>
            <textarea
              id="maintenance-banner"
              className={styles.textarea}
              value={banner}
              onChange={(e) => setBanner(e.target.value)}
              rows={4}
              placeholder={modeMeta.defaultBanner || t('admin_maint_no_banner_required')}
              disabled={loading || saving || !ready}
            />
            <div className={styles.helper}>
              {t('admin_maint_banner_hint')}
            </div>
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={applyDefaultBanner}
                disabled={loading || saving || !ready || !modeMeta.defaultBanner || trimmedBanner === modeMeta.defaultBanner}
              >
                {t('admin_maint_use_default_banner')}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setBanner('')}
                disabled={loading || saving || !ready || banner === ''}
              >
                {t('admin_maint_clear_custom_banner')}
              </button>
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.secondaryBtn} onClick={reset} disabled={!dirty || saving || loading || !ready}>
              {t('admin_maint_reset_changes')}
            </button>
            <button type="button" className={styles.btn} onClick={save} disabled={saving || loading || !ready || !dirty}>
              {saving ? t('admin_maint_saving') : t('admin_maint_save')}
            </button>
          </div>
        </div>

        <div className={styles.previewCard}>
          <div className={styles.previewTitle}>{t('admin_maint_impact_preview')}</div>
          <div className={styles.previewSub}>{modeMeta.audience}</div>

          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>{t('admin_maint_banner_shown')}</div>
            <div className={styles.previewBanner}>{effectiveBanner || t('admin_maint_no_banner_will_show')}</div>
          </div>

          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>{t('admin_maint_admin_note')}</div>
            <div className={styles.previewMeta}>
              {t('admin_maint_admin_note_text')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
