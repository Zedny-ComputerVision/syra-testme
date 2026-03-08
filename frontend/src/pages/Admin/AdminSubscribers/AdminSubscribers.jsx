import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminSubscribers.module.scss'

const KEY = 'subscribers'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const parseJsonArray = (raw) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    return parsed
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry) => {
        if (!entry || seen.has(entry)) return false
        seen.add(entry)
        return true
      })
  } catch {
    return []
  }
}

const parseEmailInput = (raw) => {
  const seen = new Set()
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false
      seen.add(entry)
      return true
    })
}

export default function AdminSubscribers() {
  const [subs, setSubs] = useState([])
  const [email, setEmail] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pendingRemove, setPendingRemove] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.settings()
      const existing = (data || []).find((setting) => setting.key === KEY)
      setSubs(parseJsonArray(existing?.value))
      setError('')
      setReady(true)
    } catch {
      setSubs([])
      setError('Failed to load subscribers.')
      setReady(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const persist = async (next) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await adminApi.updateSetting(KEY, JSON.stringify(next))
      return true
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save subscribers.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const add = async () => {
    const normalizedEntries = parseEmailInput(email)
    if (normalizedEntries.length === 0) return
    const invalid = normalizedEntries.find((entry) => !EMAIL_RE.test(entry))
    if (invalid) {
      setError(`Enter a valid email address. Invalid value: ${invalid}`)
      return
    }
    const nextEntries = normalizedEntries.filter((entry) => !subs.includes(entry))
    if (nextEntries.length === 0) {
      setError('These subscribers are already in the list.')
      return
    }

    const next = [...subs, ...nextEntries]
    if (await persist(next)) {
      setSubs(next)
      setEmail('')
      setNotice(nextEntries.length === 1 ? 'Subscriber added.' : `${nextEntries.length} subscribers added.`)
    }
  }

  const remove = async (entry) => {
    if (pendingRemove !== entry) {
      setPendingRemove(entry)
      return
    }
    const next = subs.filter((subscriber) => subscriber !== entry)
    if (await persist(next)) {
      setSubs(next)
      setPendingRemove('')
      setNotice('Subscriber removed.')
    }
  }

  const filteredSubs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return subs
    return subs.filter((entry) => entry.includes(normalizedSearch))
  }, [subs, search])

  const hasActiveFilters = Boolean(search.trim())
  const uniqueDomains = new Set(subs.map((entry) => entry.split('@')[1]).filter(Boolean))
  const summaryCards = [
    {
      label: 'Subscribers',
      value: subs.length,
      helper: 'Recipients currently saved for reports',
    },
    {
      label: 'Visible now',
      value: filteredSubs.length,
      helper: hasActiveFilters ? 'Matching the active search' : 'All saved recipients',
    },
    {
      label: 'Unique domains',
      value: uniqueDomains.size,
      helper: 'Distinct email domains in the list',
    },
  ]

  const clearFilters = () => {
    setSearch('')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Subscribers" subtitle="Report notification recipients" />
      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>
      <div className={styles.card}>
        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && !ready && (
          <div className={styles.helperRow}>
            <span className={styles.empty}>Retry loading settings before editing to avoid overwriting unknown subscriber data.</span>
            <button type="button" className={styles.secondaryBtn} onClick={load}>Retry</button>
          </div>
        )}
        <div className={styles.row}>
          <input
            className={styles.input}
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || saving || !ready}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button type="button" className={styles.btn} onClick={add} disabled={!email.trim() || saving || loading || !ready}>{saving ? 'Saving...' : 'Add'}</button>
        </div>
        <div className={styles.empty}>Add one or multiple recipients separated by comma, space, or new line.</div>
        <div className={styles.toolbar}>
          <div className={styles.searchGroup}>
            <label className={styles.filterLabel} htmlFor="subscriber-search">Search subscribers</label>
            <input
              id="subscriber-search"
              className={styles.input}
              type="text"
              placeholder="Search email or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.secondaryBtn} onClick={load} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          Showing {filteredSubs.length} subscriber{filteredSubs.length !== 1 ? 's' : ''} across {subs.length} saved.
        </div>
        <div className={styles.list}>
          {loading && <div className={styles.empty}>Loading subscribers...</div>}
          {!loading && filteredSubs.map((entry) => (
            <div key={entry} className={styles.subRow}>
              <div>
                <div className={styles.subTitle}>{entry}</div>
                <div className={styles.subMeta}>Domain: {entry.split('@')[1] || 'unknown'}</div>
              </div>
              {pendingRemove === entry ? (
                <div className={styles.inlineActions}>
                  <button type="button" className={styles.deleteBtn} onClick={() => remove(entry)} disabled={saving || !ready}>{saving ? 'Removing...' : 'Confirm remove'}</button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setPendingRemove('')} disabled={saving}>Cancel</button>
                </div>
              ) : (
                <button type="button" className={styles.deleteBtn} onClick={() => remove(entry)} disabled={saving || !ready}>Remove</button>
              )}
            </div>
          ))}
          {!loading && filteredSubs.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? 'No subscribers match the current search.' : 'No subscribers yet.'}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? 'Clear the current search to restore the saved recipients.'
                  : 'Saved report recipients will appear here once you add email addresses.'}
              </div>
              {hasActiveFilters && <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>Clear filters</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
