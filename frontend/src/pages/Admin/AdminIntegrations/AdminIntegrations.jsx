import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminIntegrations.module.scss'

const INTEGRATIONS = [
  { key: 'slack', name: 'Slack', desc: 'Send alerts to a Slack channel', urlLabel: 'Webhook URL' },
  { key: 'teams', name: 'Microsoft Teams', desc: 'Send alerts to Teams webhook', urlLabel: 'Webhook URL' },
  { key: 'webhook', name: 'Webhook', desc: 'POST test events to your webhook', urlLabel: 'Endpoint URL' },
]

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
      setError('Failed to load integrations.')
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
      setError(`${integration.name} requires a URL before you can ${action} it.`)
      return false
    }
    if (normalizedUrl && !URL_RE.test(normalizedUrl)) {
      setError(`${integration.name} requires an http:// or https:// URL.`)
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
      label: 'Available integrations',
      value: INTEGRATIONS.length,
      helper: 'Webhook integrations exposed in the current MVP',
    },
    {
      label: 'Visible now',
      value: visibleIntegrations.length,
      helper: hasActiveFilters ? 'Matching the active filters' : 'All available integrations',
    },
    {
      label: 'Enabled',
      value: enabledCount,
      helper: 'Currently active integrations',
    },
    {
      label: 'Draft changes',
      value: dirtyCount,
      helper: testedCount > 0 ? `${testedCount} card${testedCount === 1 ? '' : 's'} with test feedback` : 'No pending test results',
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
      setNotice(`${integration.name} ${nextState.enabled ? 'enabled' : 'disabled'}.`)
      clearSavedIndicator(key)
    } catch (e) {
      setError(e.response?.data?.detail || `Failed to update ${integration.name}.`)
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
      setNotice(`${integration.name} settings saved.`)
      clearSavedIndicator(key)
    } catch (e) {
      setError(e.response?.data?.detail || `Failed to save ${integration.name}.`)
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
      setNotice(`${integration.name} test completed.`)
    } catch (e) {
      setError(e.response?.data?.detail || 'Test failed')
    } finally {
      setTestingKey('')
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Integrations" subtitle="Connect SYRA to external systems" />
      <div className={styles.helper}>Webhook-based integrations are supported in the current MVP. Non-webhook archive providers are hidden until their storage pipeline is implemented.</div>
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
      {loading && <div className={styles.muted}>Loading integrations...</div>}
      {!loading && !ready && (
        <div className={styles.retryRow}>
          <span className={styles.muted}>Retry loading settings before editing to avoid overwriting the saved integration configuration.</span>
          <button type="button" className={styles.retryBtn} onClick={load}>Retry</button>
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.toolbarFilters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="integration-search">Search integrations</label>
            <input
              id="integration-search"
              className={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search provider or URL..."
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="integration-status-filter">Status</label>
            <select
              id="integration-status-filter"
              className={styles.input}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All integrations</option>
              <option value="ENABLED">Enabled</option>
              <option value="DISABLED">Disabled</option>
              <option value="DIRTY">Draft changes</option>
            </select>
          </div>
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.retryBtn} onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className={styles.retryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
            Clear filters
          </button>
        </div>
      </div>
      <div className={styles.filterMeta}>
        Showing {visibleIntegrations.length} integration{visibleIntegrations.length !== 1 ? 's' : ''} across {INTEGRATIONS.length} available.
      </div>
      <div className={styles.list}>
        {!loading && visibleIntegrations.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{hasActiveFilters ? 'No integrations match the current filters.' : 'No integrations available.'}</div>
            <div className={styles.emptyText}>
              {hasActiveFilters
                ? 'Clear the current search or status filter to restore the available integration cards.'
                : 'Webhook integration cards will appear here when they are exposed in the current MVP.'}
            </div>
            {hasActiveFilters && <button type="button" className={styles.retryBtn} onClick={clearFilters}>Clear filters</button>}
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
                    {state.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {dirty && <span className={styles.dirtyBadge}>Draft changes</span>}
                </div>
              </div>
              <div className={styles.fields}>
                <label className={styles.label} htmlFor={`${integration.key}-url`}>{integration.urlLabel}</label>
                <input id={`${integration.key}-url`} className={styles.input} value={state.url || ''} onChange={(e) => updateField(integration.key, 'url', e.target.value)} disabled={!ready || loading || savingKey === integration.key || Boolean(testingKey)} />
                <label className={styles.label} htmlFor={`${integration.key}-secret`}>Secret / Token (optional)</label>
                <input id={`${integration.key}-secret`} className={styles.input} value={state.secret || ''} onChange={(e) => updateField(integration.key, 'secret', e.target.value)} disabled={!ready || loading || savingKey === integration.key || Boolean(testingKey)} />
              </div>
              {testResults[integration.key] ? (
                <div className={styles.resultRow}><strong>Last test:</strong> {testResults[integration.key]}</div>
              ) : null}
              <div className={styles.actions}>
                <button type="button" className={styles.toggle} onClick={() => toggle(integration.key)} disabled={!ready || savingKey === integration.key || Boolean(testingKey) || loading} aria-label={`${state.enabled ? 'Disable' : 'Enable'} integration ${integration.name}`}>
                  {state.enabled ? 'Disable' : 'Enable'}
                </button>
                {savingKey === integration.key ? (
                  <span className={styles.savingText}>Saving...</span>
                ) : savedKey === integration.key ? (
                  <span className={styles.savedText}>Saved</span>
                ) : (
                  <button type="button" className={styles.saveBtn} onClick={() => saveIntegration(integration.key)} disabled={!ready || !dirty || Boolean(testingKey) || loading} aria-label={`Save changes for integration ${integration.name}`} title={`Save changes for integration ${integration.name}`}>Save</button>
                )}
                {dirty ? (
                  <button type="button" className={styles.testBtn} onClick={() => resetDraft(integration.key)} disabled={!ready || savingKey === integration.key || Boolean(testingKey) || loading} aria-label={`Reset draft changes for integration ${integration.name}`} title={`Reset draft changes for integration ${integration.name}`}>Reset</button>
                ) : null}
                <button type="button" className={styles.testBtn} onClick={() => sendTest(integration.key)} disabled={!ready || savingKey === integration.key || Boolean(testingKey) || loading} aria-label={`Send test event for integration ${integration.name}`} title={`Send test event for integration ${integration.name}`}>
                  {testingKey === integration.key ? 'Testing...' : 'Send Test'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
