import React, { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { adminApi } from '../../../services/admin.service'
import useLanguage from '../../../hooks/useLanguage'
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
  const { t } = useLanguage()
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
      setError(t('admin_subscribers_load_failed'))
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
      setError(err.response?.data?.detail || t('admin_subscribers_save_failed'))
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
      setError(t('admin_subscribers_invalid_email', { value: invalid }))
      return
    }
    const nextEntries = normalizedEntries.filter((entry) => !subs.includes(entry))
    if (nextEntries.length === 0) {
      setError(t('admin_subscribers_already_in_list'))
      return
    }

    const next = [...subs, ...nextEntries]
    if (await persist(next)) {
      setSubs(next)
      setEmail('')
      setNotice(nextEntries.length === 1 ? t('admin_subscribers_added_notice') : t('admin_subscribers_added_count_notice', { count: nextEntries.length }))
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
      setNotice(t('admin_subscribers_removed_notice'))
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
      label: t('admin_subscribers_label'),
      value: subs.length,
      helper: t('admin_subscribers_recipients_helper'),
    },
    {
      label: t('admin_stat_visible_now'),
      value: filteredSubs.length,
      helper: hasActiveFilters ? t('admin_stat_matching_search') : t('admin_subscribers_all_saved'),
    },
    {
      label: t('admin_subscribers_unique_domains'),
      value: uniqueDomains.size,
      helper: t('admin_subscribers_unique_domains_helper'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_subscribers_page_title')} subtitle={t('admin_subscribers_page_subtitle')} />
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
            <span className={styles.empty}>{t('admin_subscribers_retry_hint')}</span>
            <button type="button" className={styles.secondaryBtn} onClick={load}>{t('retry')}</button>
          </div>
        )}
        <label className={styles.filterLabel} htmlFor="subscriber-emails">{t('admin_subscribers_add_label')}</label>
        <div className={styles.row}>
          <input
            id="subscriber-emails"
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
          <button type="button" className={styles.btn} onClick={add} disabled={!email.trim() || saving || loading || !ready}>{saving ? t('saving') : t('add')}</button>
        </div>
        <div className={styles.empty}>{t('admin_subscribers_input_hint')}</div>
        <div className={styles.toolbar}>
          <div className={styles.searchGroup}>
            <label className={styles.filterLabel} htmlFor="subscriber-search">{t('admin_subscribers_search_label')}</label>
            <input
              id="subscriber-search"
              className={styles.input}
              type="text"
              placeholder={t('admin_subscribers_search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.secondaryBtn} onClick={load} disabled={loading}>
              {loading ? t('admin_refreshing') : t('admin_refresh')}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              {t('admin_clear_filters')}
            </button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          {t('admin_subscribers_showing_count', { filtered: filteredSubs.length, total: subs.length })}
        </div>
        <div className={styles.list}>
          {loading && <div className={styles.empty}>{t('admin_subscribers_loading')}</div>}
          {!loading && filteredSubs.map((entry) => (
            <div key={entry} className={styles.subRow}>
              <div>
                <div className={styles.subTitle}>{entry}</div>
                <div className={styles.subMeta}>{t('admin_subscribers_domain')}: {entry.split('@')[1] || t('admin_subscribers_unknown')}</div>
              </div>
              {pendingRemove === entry ? (
                <div className={styles.inlineActions}>
                  <button type="button" className={styles.deleteBtn} onClick={() => remove(entry)} disabled={saving || !ready}>{saving ? t('admin_removing') : t('admin_subscribers_confirm_remove')}</button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setPendingRemove('')} disabled={saving}>{t('cancel')}</button>
                </div>
              ) : (
                <button type="button" className={styles.deleteBtn} onClick={() => remove(entry)} disabled={saving || !ready}>{t('remove')}</button>
              )}
            </div>
          ))}
          {!loading && filteredSubs.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? t('admin_subscribers_no_match') : t('admin_subscribers_none_yet')}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? t('admin_subscribers_clear_search_hint')
                  : t('admin_subscribers_empty_state')}
              </div>
              {hasActiveFilters && <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>{t('admin_clear_filters')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
