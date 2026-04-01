import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminIntegrations.module.scss'

const KEY = 'integrations_config'
const URL_RE = /^https?:\/\//i

const parseJsonObject = (raw) => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const normalizeConfig = (config = {}) => Object.fromEntries(
  Object.entries(config).map(([key, value]) => [
    key,
    {
      enabled: value?.enabled === true,
      url: String(value?.url || '').trim(),
      secret: String(value?.secret || '').trim(),
    },
  ]),
)

export default function AdminIntegrations() {
  const { t } = useLanguage()

  const INTEGRATIONS = [
    { key: 'slack', name: t('admin_integrations_slack'), desc: t('admin_integrations_slack_desc'), urlLabel: t('admin_integrations_webhook_url') },
    { key: 'teams', name: t('admin_integrations_teams'), desc: t('admin_integrations_teams_desc'), urlLabel: t('admin_integrations_webhook_url') },
    { key: 'webhook', name: t('admin_integrations_webhook'), desc: t('admin_integrations_webhook_desc'), urlLabel: t('admin_integrations_endpoint_url') },
  ]

  const [saved, setSaved] = useState({})
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [testingKey, setTestingKey] = useState('')
  const [testResults, setTestResults] = useState({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const load = async () => {
    setLoading(true)
    setDrafts({})
    setSavedKey('')
    setSavingKey('')
    setTestingKey('')
    setTestResults({})
    setNotice('')
    try {
      const { data } = await adminApi.settings()
      const existing = (data || []).find((setting) => setting.key === KEY)
      setSaved(normalizeConfig(parseJsonObject(existing?.value)))
      setError('')
      setReady(true)
    } catch {
      setSaved({})
      setError(t('admin_integrations_load_error'))
      setReady(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const getState = (key) => ({ ...(saved[key] || {}), ...(drafts[key] || {}) })

  const clearSavedIndicator = (key) => {
    setSavedKey(key)
    setTimeout(() => {
      setSavedKey((current) => (current === key ? '' : current))
    }, 2000)
  }

  const persist = async (next) => {
    await adminApi.updateSetting(KEY, JSON.stringify(next))
  }

  const validateConfig = (integration, nextState, action = 'save') => {
    const normalizedUrl = String(nextState.url || '').trim()
    if (nextState.enabled && !normalizedUrl) {
      setError(t('admin_integrations_url_required', { name: integration.name, action }))
      return false
    }
    if (normalizedUrl && !URL_RE.test(normalizedUrl)) {
      setError(t('admin_integrations_url_invalid', { name: integration.name }))
      return false
    }
    return true
  }

  const updateField = (key, field, value) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  const isDirty = (key) => {
    const draft = drafts[key]
    if (!draft) return false
    return Object.keys(draft).some((field) => draft[field] !== (saved[key]?.[field] ?? ''))
  }

  const visibleIntegrations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return INTEGRATIONS.filter((integration) => {
      const state = getState(integration.key)
      const dirty = isDirty(integration.key)
      if (statusFilter === 'ENABLED' && state.enabled !== true) return false
      if (statusFilter === 'DISABLED' && state.enabled === true) return false
      if (statusFilter === 'DIRTY' && !dirty) return false
      if (!normalizedSearch) return true
      return [integration.name, integration.desc, state.url]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(normalizedSearch)
    })
  }, [search, statusFilter, drafts, saved])

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== 'ALL')
  const enabledCount = INTEGRATIONS.filter((integration) => getState(integration.key).enabled === true).length
  const dirtyCount = INTEGRATIONS.filter((integration) => isDirty(integration.key)).length
  const testedCount = Object.keys(testResults).filter((key) => testResults[key]).length
  const summaryCards = [
    {
      label: t('admin_integrations_available'),
      value: INTEGRATIONS.length,
      helper: t('admin_integrations_available_helper'),
    },
    {
      label: t('admin_integrations_visible_now'),
      value: visibleIntegrations.length,
      helper: hasActiveFilters ? t('admin_integrations_matching_filters') : t('admin_integrations_all_available'),
    },
    {
      label: t('admin_integrations_enabled'),
      value: enabledCount,
      helper: t('admin_integrations_enabled_helper'),
    },
    {
      label: t('admin_integrations_draft_changes'),
      value: dirtyCount,
      helper: testedCount > 0 ? t('admin_integrations_cards_with_feedback', { count: testedCount }) : t('admin_integrations_no_test_results'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('ALL')
  }

  const resetDraft = (key) => {
    setDrafts((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
    setError('')
  }

  const toggle = async (key) => {
    const integration = INTEGRATIONS.find((entry) => entry.key === key)
    const currentState = getState(key)
    const nextState = {
      enabled: currentState.enabled !== true,
      url: String(currentState.url || '').trim(),
      secret: String(currentState.secret || '').trim(),
    }
    if (!validateConfig(integration, nextState, nextState.enabled ? 'enable' : 'disable')) return

    const nextConfig = normalizeConfig({ ...saved, [key]: nextState })
    setSavingKey(key)
    setError('')
    setNotice('')
    setTestingKey('')
    setTestResults((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })

    try {
      await persist(nextConfig)
      setSaved(nextConfig)
      setDrafts((prev) => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
      setNotice(nextState.enabled ? t('admin_integrations_enabled_notice', { name: integration.name }) : t('admin_integrations_disabled_notice', { name: integration.name }))
      clearSavedIndicator(key)
    } catch (e) {
      setError(e.response?.data?.detail || t('admin_integrations_update_failed', { name: integration.name }))
    } finally {
      setSavingKey('')
    }
  }

  const saveIntegration = async (key) => {
    const integration = INTEGRATIONS.find((entry) => entry.key === key)
    const currentState = getState(key)
    const nextState = {
      enabled: currentState.enabled === true,
      url: String(currentState.url || '').trim(),
      secret: String(currentState.secret || '').trim(),
    }
    if (!validateConfig(integration, nextState)) return

    const nextConfig = normalizeConfig({ ...saved, [key]: nextState })
    setSavingKey(key)
    setError('')
    setNotice('')
    setTestingKey('')
    setTestResults((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })

    try {
      await persist(nextConfig)
      setSaved(nextConfig)
      setDrafts((prev) => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
      setNotice(t('admin_integrations_saved_notice', { name: integration.name }))
      clearSavedIndicator(key)
    } catch (e) {
      setError(e.response?.data?.detail || t('admin_integrations_save_failed', { name: integration.name }))
    } finally {
      setSavingKey('')
    }
  }

  const sendTest = async (key) => {
    const integration = INTEGRATIONS.find((entry) => entry.key === key)
    const currentState = getState(key)
    const runtimeConfig = {
      [key]: {
        enabled: true,
        url: String(currentState.url || '').trim(),
        secret: String(currentState.secret || '').trim(),
      },
    }
    if (!validateConfig(integration, runtimeConfig[key], 'test')) {
      return
    }

    setTestingKey(key)
    setError('')
    setNotice('')
    setTestResults((prev) => ({ ...prev, [key]: '' }))
    try {
      const { data } = await adminApi.testIntegrations(runtimeConfig)
      setTestResults((prev) => ({ ...prev, [key]: data?.results?.[key] || 'sent' }))
      setNotice(t('admin_integrations_test_completed', { name: integration.name }))
    } catch (e) {
      setError(e.response?.data?.detail || t('admin_integrations_test_failed'))
    } finally {
      setTestingKey('')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_integrations_title')} subtitle={t('admin_integrations_subtitle')} />
      <div className={styles.helper}>{t('admin_integrations_helper')}</div>
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
      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.muted}>{t('admin_integrations_loading')}</div>}
      {!loading && !ready && (
        <div className={styles.retryRow}>
          <span className={styles.muted}>{t('admin_integrations_retry_hint')}</span>
          <button type="button" className={styles.retryBtn} onClick={load}>{t('admin_integrations_retry')}</button>
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.toolbarFilters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="integration-search">{t('admin_integrations_search_label')}</label>
            <input
              id="integration-search"
              className={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin_integrations_search_placeholder')}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="integration-status-filter">{t('admin_integrations_status_label')}</label>
            <select
              id="integration-status-filter"
              className={styles.input}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">{t('admin_integrations_filter_all')}</option>
              <option value="ENABLED">{t('admin_integrations_filter_enabled')}</option>
              <option value="DISABLED">{t('admin_integrations_filter_disabled')}</option>
              <option value="DIRTY">{t('admin_integrations_filter_dirty')}</option>
            </select>
          </div>
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.retryBtn} onClick={load} disabled={loading}>
            {loading ? t('admin_integrations_refreshing') : t('admin_integrations_refresh')}
          </button>
          <button type="button" className={styles.retryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
            {t('admin_integrations_clear_filters')}
          </button>
        </div>
      </div>
      <div className={styles.filterMeta}>
        {t('admin_integrations_showing', { visible: visibleIntegrations.length, total: INTEGRATIONS.length })}
      </div>
      <div className={styles.list}>
        {!loading && visibleIntegrations.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{hasActiveFilters ? t('admin_integrations_no_match') : t('admin_integrations_none_available')}</div>
            <div className={styles.emptyText}>
              {hasActiveFilters
                ? t('admin_integrations_clear_to_restore')
                : t('admin_integrations_cards_appear')}
            </div>
            {hasActiveFilters && <button type="button" className={styles.retryBtn} onClick={clearFilters}>{t('admin_integrations_clear_filters')}</button>}
          </div>
        ) : visibleIntegrations.map((integration) => {
          const state = getState(integration.key)
          const dirty = isDirty(integration.key)
          return (
            <div key={integration.key} className={styles.card} data-testid={`integration-card-${integration.key}`}>
              <div>
                <div className={styles.title}>{integration.name}</div>
                <div className={styles.sub}>{integration.desc}</div>
                <div className={styles.cardMeta}>
                  <span className={`${styles.statusBadge} ${state.enabled ? styles.statusEnabled : styles.statusDisabled}`}>
                    {state.enabled ? t('admin_integrations_enabled') : t('admin_integrations_disabled')}
                  </span>
                  {dirty && <span className={styles.dirtyBadge}>{t('admin_integrations_draft_changes')}</span>}
                </div>
              </div>
              <div className={styles.fields}>
                <label className={styles.label} htmlFor={`${integration.key}-url`}>{integration.urlLabel}</label>
                <input id={`${integration.key}-url`} className={styles.input} value={state.url || ''} onChange={(e) => updateField(integration.key, 'url', e.target.value)} disabled={!ready || loading || savingKey === integration.key || Boolean(testingKey)} />
                <label className={styles.label} htmlFor={`${integration.key}-secret`}>{t('admin_integrations_secret_label')}</label>
                <input id={`${integration.key}-secret`} className={styles.input} value={state.secret || ''} onChange={(e) => updateField(integration.key, 'secret', e.target.value)} disabled={!ready || loading || savingKey === integration.key || Boolean(testingKey)} />
              </div>
              {testResults[integration.key] ? (
                <div className={styles.resultRow}><strong>{t('admin_integrations_last_test')}</strong> {testResults[integration.key]}</div>
              ) : null}
              <div className={styles.actions}>
                <button type="button" className={styles.toggle} onClick={() => toggle(integration.key)} disabled={!ready || savingKey === integration.key || Boolean(testingKey) || loading} aria-label={state.enabled ? t('admin_integrations_disable_aria', { name: integration.name }) : t('admin_integrations_enable_aria', { name: integration.name })}>
                  {state.enabled ? t('admin_integrations_disable') : t('admin_integrations_enable')}
                </button>
                {savingKey === integration.key ? (
                  <span className={styles.savingText}>{t('admin_integrations_saving')}</span>
                ) : savedKey === integration.key ? (
                  <span className={styles.savedText}>{t('admin_integrations_saved')}</span>
                ) : (
                  <button type="button" className={styles.saveBtn} onClick={() => saveIntegration(integration.key)} disabled={!ready || !dirty || Boolean(testingKey) || loading} aria-label={t('admin_integrations_save_aria', { name: integration.name })} title={t('admin_integrations_save_aria', { name: integration.name })}>{t('admin_integrations_save')}</button>
                )}
                {dirty ? (
                  <button type="button" className={styles.testBtn} onClick={() => resetDraft(integration.key)} disabled={!ready || savingKey === integration.key || Boolean(testingKey) || loading} aria-label={t('admin_integrations_reset_aria', { name: integration.name })} title={t('admin_integrations_reset_aria', { name: integration.name })}>{t('admin_integrations_reset')}</button>
                ) : null}
                <button type="button" className={styles.testBtn} onClick={() => sendTest(integration.key)} disabled={!ready || savingKey === integration.key || Boolean(testingKey) || loading} aria-label={t('admin_integrations_test_aria', { name: integration.name })} title={t('admin_integrations_test_aria', { name: integration.name })}>
                  {testingKey === integration.key ? t('admin_integrations_testing') : t('admin_integrations_send_test')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
