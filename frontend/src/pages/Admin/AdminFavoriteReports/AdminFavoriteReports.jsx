import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import { adminApi } from '../../../services/admin.service'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminFavoriteReports.module.scss'

const SUPPORTED_APP_ROUTE_PREFIXES = [
  '/admin/dashboard',
  '/admin/tests',
  '/admin/exams',
  '/admin/new',
  '/admin/attempts',
  '/admin/videos',
  '/admin/attempt-analysis',
  '/admin/candidates',
  '/admin/reports',
  '/admin/report-builder',
  '/admin/predefined-reports',
  '/admin/favorite-reports',
  '/admin/audit-log',
  '/admin/settings',
  '/admin/subscribers',
  '/admin/integrations',
  '/admin/maintenance',
  '/admin/users',
  '/admin/user-groups',
  '/admin/roles',
  '/admin/sessions',
  '/admin/templates',
  '/admin/question-pools',
  '/admin/courses',
  '/admin/surveys',
  '/admin/grading-scales',
  '/admin/categories',
  '/admin/certificates',
  '/admin/schedules',
]

const SUPPORTED_APP_ROUTE_EXACT = new Set(['/admin'])

const parseJsonArray = (raw) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const isSupportedAppRoute = (value) => (
  SUPPORTED_APP_ROUTE_EXACT.has(value)
  || SUPPORTED_APP_ROUTE_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))
)

const normalizeFavoriteEntries = (entries) => (
  Array.isArray(entries)
    ? entries.map((entry) => {
      const title = String(entry?.title || '').trim()
      const link = String(entry?.link || '').trim()
      if (!title || !link) return null
      const isExternal = /^https?:\/\//i.test(link)
      const isInternal = link.startsWith('/')
      if (!isExternal && !isInternal) return null
      return {
        title,
        link,
        isBroken: isInternal && !isSupportedAppRoute(link),
      }
    }).filter(Boolean)
    : []
)

const serializeFavorites = (entries) => entries.map(({ title, link }) => ({ title, link }))

const isValidFavoriteLink = (value) => {
  const trimmed = String(value || '').trim()
  return /^https?:\/\//i.test(trimmed) || (trimmed.startsWith('/') && isSupportedAppRoute(trimmed))
}

export default function AdminFavoriteReports() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [favorites, setFavorites] = useState([])
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [removingIndex, setRemovingIndex] = useState(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('ALL')
  const storageKey = `favorite_reports:${user?.id || 'anonymous'}`

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await adminApi.getMyPreference('favorite_reports')
      const storedFavorites = normalizeFavoriteEntries(data?.value)
      if (storedFavorites.length > 0) {
        setFavorites(storedFavorites)
        setError('')
        return
      }
      const legacyFavorites = normalizeFavoriteEntries(parseJsonArray(localStorage.getItem(storageKey)))
      if (legacyFavorites.length > 0) {
        await adminApi.updateMyPreference('favorite_reports', serializeFavorites(legacyFavorites))
        localStorage.removeItem(storageKey)
        setFavorites(legacyFavorites)
        setError('')
        return
      }
      setFavorites([])
      setError('')
    } catch {
      setFavorites([])
      setLoadError(t('admin_fav_reports_failed_load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [storageKey])

  const persist = async (next) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await adminApi.updateMyPreference('favorite_reports', serializeFavorites(next))
      return true
    } catch {
      setError(t('admin_favorites_save_failed'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const add = async () => {
    const nextTitle = title.trim()
    const nextLink = link.trim()
    if (!nextTitle || !nextLink) {
      setError(t('admin_favorites_title_link_required'))
      return
    }
    if (favorites.some((favorite) => favorite.link === nextLink && favorite.title.toLowerCase() === nextTitle.toLowerCase())) {
      setError(t('admin_favorites_already_saved'))
      return
    }
    if (!isValidFavoriteLink(nextLink)) {
      setError(t('admin_favorites_invalid_link'))
      return
    }
    const next = [...favorites, { title: nextTitle, link: nextLink, isBroken: false }]
    if (await persist(next)) {
      setFavorites(next)
      setTitle('')
      setLink('')
      setNotice(t('admin_favorites_saved_notice'))
    }
  }

  const handleAddSubmit = async (event) => {
    event.preventDefault()
    await add()
  }

  const remove = async (index) => {
    setRemovingIndex(index)
    const next = favorites.filter((_, idx) => idx !== index)
    if (await persist(next)) {
      setFavorites(next)
      setNotice(t('admin_favorites_removed_notice'))
    }
    setRemovingIndex(null)
  }

  const openFavorite = (favorite) => {
    if (favorite.isBroken) {
      setError(t('admin_favorites_route_unavailable'))
      return
    }
    if (favorite.link?.startsWith('http')) {
      window.open(favorite.link, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(favorite.link || '/')
  }

  const filteredFavorites = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return favorites.filter((favorite) => {
      const isExternal = /^https?:\/\//i.test(favorite.link)
      if (kindFilter === 'INTERNAL' && isExternal) return false
      if (kindFilter === 'EXTERNAL' && !isExternal) return false
      if (kindFilter === 'STALE' && !favorite.isBroken) return false
      if (!normalizedSearch) return true
      return [favorite.title, favorite.link]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(normalizedSearch)
    })
  }, [favorites, kindFilter, search])

  const hasActiveFilters = Boolean(search.trim() || kindFilter !== 'ALL')
  const staleCount = favorites.filter((favorite) => favorite.isBroken).length
  const externalCount = favorites.filter((favorite) => /^https?:\/\//i.test(favorite.link)).length
  const summaryCards = [
    {
      label: t('admin_favorites_saved_favorites'),
      value: favorites.length,
      helper: t('admin_favorites_quick_links_helper'),
    },
    {
      label: t('admin_stat_visible_now'),
      value: filteredFavorites.length,
      helper: hasActiveFilters ? t('admin_stat_matching_filters') : t('admin_favorites_all_saved'),
    },
    {
      label: t('admin_favorites_external_links'),
      value: externalCount,
      helper: t('admin_favorites_external_links_helper'),
    },
    {
      label: t('admin_favorites_needs_update'),
      value: staleCount,
      helper: t('admin_favorites_stale_routes_helper'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setKindFilter('ALL')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_favorites_page_title')} subtitle={t('admin_favorites_page_subtitle')} />
      {loadError && (
        <div className={styles.errorBanner}>
          <div className={styles.bannerRow}>
            <span>{loadError}</span>
            <button type="button" className={styles.retryBtn} onClick={() => void load()} disabled={loading}>
              {loading ? t('admin_favorites_retrying') : t('retry')}
            </button>
          </div>
        </div>
      )}
      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}
      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={handleAddSubmit}>
          <div className={styles.sectionTitle}>{t('admin_favorites_add_favorite')}</div>
          <label className={styles.filterLabel} htmlFor="favorite-title">{t('admin_favorites_title_label')}</label>
          <input id="favorite-title" className={styles.input} placeholder={t('admin_favorites_title_placeholder')} value={title} onChange={e => setTitle(e.target.value)} />
          <label className={styles.filterLabel} htmlFor="favorite-link">{t('admin_favorites_link_label')}</label>
          <input id="favorite-link" className={styles.input} placeholder={t('admin_favorites_link_placeholder')} value={link} onChange={e => setLink(e.target.value)} />
          <div className={styles.empty}>{t('admin_favorites_link_hint')}</div>
          <button type="submit" className={styles.btn} disabled={!title || !link || saving}>{saving ? t('saving') : t('save')}</button>
        </form>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>{t('admin_favorites_saved_section')}</div>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel} htmlFor="favorite-search">{t('admin_favorites_search_label')}</label>
                <input
                  id="favorite-search"
                  className={styles.input}
                  placeholder={t('admin_favorites_search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel} htmlFor="favorite-kind-filter">{t('admin_favorites_type_label')}</label>
                <select
                  id="favorite-kind-filter"
                  className={styles.input}
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="ALL">{t('admin_favorites_filter_all')}</option>
                  <option value="INTERNAL">{t('admin_favorites_filter_internal')}</option>
                  <option value="EXTERNAL">{t('admin_favorites_filter_external')}</option>
                  <option value="STALE">{t('admin_favorites_needs_update')}</option>
                </select>
              </div>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.retryBtn} onClick={() => void load()} disabled={loading}>
                {loading ? t('admin_refreshing') : t('admin_refresh')}
              </button>
              <button type="button" className={styles.retryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                {t('admin_clear_filters')}
              </button>
            </div>
          </div>
          <div className={styles.filterMeta}>
            {t('admin_favorites_showing_count', { filtered: filteredFavorites.length, total: favorites.length })}
          </div>
          {loading && <div className={styles.empty}>{t('admin_favorites_loading')}</div>}
          {!loading && filteredFavorites.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? t('admin_favorites_no_match') : t('admin_favorites_none_yet')}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? t('admin_favorites_clear_filters_hint')
                  : t('admin_favorites_empty_state')}
              </div>
              {hasActiveFilters && <button type="button" className={styles.retryBtn} onClick={clearFilters}>{t('admin_clear_filters')}</button>}
            </div>
          )}
          <div className={styles.list}>
            {filteredFavorites.map((favorite) => {
              const index = favorites.findIndex((entry) => entry.title === favorite.title && entry.link === favorite.link)
              const isExternal = /^https?:\/\//i.test(favorite.link)
              return (
              <div key={`${favorite.title}-${favorite.link}`} className={`${styles.row} ${favorite.isBroken ? styles.rowBroken : ''}`}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => openFavorite(favorite)}
                  disabled={favorite.isBroken}
                >
                  <div className={styles.rowTitle}>
                    {favorite.title}
                    {favorite.isBroken && <span className={styles.staleBadge}>{t('admin_favorites_needs_update')}</span>}
                  </div>
                  <div className={styles.rowSub}>{favorite.link}</div>
                  <div className={styles.rowMeta}>{favorite.isBroken ? t('admin_favorites_route_unavailable_label') : isExternal ? t('admin_favorites_external_shortcut') : t('admin_favorites_internal_route')}</div>
                  {favorite.isBroken && <div className={styles.rowWarning}>{t('admin_favorites_route_gone_warning')}</div>}
                </button>
                <button type="button" className={styles.deleteBtn} onClick={() => remove(index)} disabled={saving || removingIndex === index}>
                  {removingIndex === index ? t('admin_removing') : t('remove')}
                </button>
              </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
