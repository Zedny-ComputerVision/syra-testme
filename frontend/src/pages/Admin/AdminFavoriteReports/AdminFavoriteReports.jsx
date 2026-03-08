import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminFavoriteReports.module.scss'

const SUPPORTED_APP_ROUTE_PREFIXES = [
  '/admin/dashboard',
  '/admin/tests',
  '/admin/attempt-analysis',
  '/admin/candidates',
  '/admin/reports',
  '/admin/report-builder',
  '/admin/predefined-reports',
  '/admin/favorite-reports',
  '/admin/settings',
  '/admin/subscribers',
  '/admin/integrations',
  '/admin/maintenance',
  '/admin/users',
  '/admin/sessions',
  '/admin/templates',
  '/admin/question-pools',
  '/admin/courses',
  '/admin/surveys',
  '/admin/grading-scales',
  '/admin/categories',
  '/admin/certificates',
]

const parseJsonArray = (raw) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const isSupportedAppRoute = (value) => SUPPORTED_APP_ROUTE_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))

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
      setLoadError('Failed to load favorites.')
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
      setError('Failed to save. Please try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const add = async () => {
    const nextTitle = title.trim()
    const nextLink = link.trim()
    if (!nextTitle || !nextLink) {
      setError('Title and link are required.')
      return
    }
    if (favorites.some((favorite) => favorite.link === nextLink && favorite.title.toLowerCase() === nextTitle.toLowerCase())) {
      setError('That favorite is already saved.')
      return
    }
    if (!isValidFavoriteLink(nextLink)) {
      setError('Links must use http(s):// or a supported admin route such as /admin/reports.')
      return
    }
    const next = [...favorites, { title: nextTitle, link: nextLink, isBroken: false }]
    if (await persist(next)) {
      setFavorites(next)
      setTitle('')
      setLink('')
      setNotice('Favorite saved.')
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
      setNotice('Favorite removed.')
    }
    setRemovingIndex(null)
  }

  const openFavorite = (favorite) => {
    if (favorite.isBroken) {
      setError('This saved route is no longer available. Remove it or replace it with a supported page.')
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
      label: 'Saved favorites',
      value: favorites.length,
      helper: 'Quick links currently loaded',
    },
    {
      label: 'Visible now',
      value: filteredFavorites.length,
      helper: hasActiveFilters ? 'Matching the active filters' : 'All saved favorites',
    },
    {
      label: 'External links',
      value: externalCount,
      helper: 'Public report URLs or other external pages',
    },
    {
      label: 'Needs update',
      value: staleCount,
      helper: 'Saved internal routes that no longer exist',
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setKindFilter('ALL')
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="My Favorite Reports" subtitle="Quick links to reports you use often" />
      {loadError && (
        <div className={styles.errorBanner}>
          <div className={styles.bannerRow}>
            <span>{loadError}</span>
            <button type="button" className={styles.retryBtn} onClick={() => void load()} disabled={loading}>
              {loading ? 'Retrying...' : 'Retry'}
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
          <div className={styles.sectionTitle}>Add Favorite</div>
          <input className={styles.input} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <input className={styles.input} placeholder="URL or path" value={link} onChange={e => setLink(e.target.value)} />
          <div className={styles.empty}>Use a public URL or a supported admin route such as `/admin/reports`.</div>
          <button type="submit" className={styles.btn} disabled={!title || !link || saving}>{saving ? 'Saving...' : 'Save'}</button>
        </form>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Saved</div>
          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel} htmlFor="favorite-search">Search favorites</label>
                <input
                  id="favorite-search"
                  className={styles.input}
                  placeholder="Search title or link..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel} htmlFor="favorite-kind-filter">Type</label>
                <select
                  id="favorite-kind-filter"
                  className={styles.input}
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="ALL">All favorites</option>
                  <option value="INTERNAL">Internal routes</option>
                  <option value="EXTERNAL">External links</option>
                  <option value="STALE">Needs update</option>
                </select>
              </div>
            </div>
            <div className={styles.toolbarActions}>
              <button type="button" className={styles.retryBtn} onClick={() => void load()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" className={styles.retryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
                Clear filters
              </button>
            </div>
          </div>
          <div className={styles.filterMeta}>
            Showing {filteredFavorites.length} favorite{filteredFavorites.length !== 1 ? 's' : ''} across {favorites.length} saved.
          </div>
          {loading && <div className={styles.empty}>Loading favorites...</div>}
          {!loading && filteredFavorites.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{hasActiveFilters ? 'No favorites match the current filters.' : 'No favorites yet.'}</div>
              <div className={styles.emptyText}>
                {hasActiveFilters
                  ? 'Clear the current search or type filter to restore the saved report shortcuts.'
                  : 'Saved report shortcuts will appear here once you add internal routes or external links.'}
              </div>
              {hasActiveFilters && <button type="button" className={styles.retryBtn} onClick={clearFilters}>Clear filters</button>}
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
                    {favorite.isBroken && <span className={styles.staleBadge}>Needs update</span>}
                  </div>
                  <div className={styles.rowSub}>{favorite.link}</div>
                  <div className={styles.rowMeta}>{favorite.isBroken ? 'Internal route no longer available' : isExternal ? 'External shortcut' : 'Internal admin route'}</div>
                  {favorite.isBroken && <div className={styles.rowWarning}>This saved route no longer exists in the current MVP navigation.</div>}
                </button>
                <button type="button" className={styles.deleteBtn} onClick={() => remove(index)} disabled={saving || removingIndex === index}>
                  {removingIndex === index ? 'Removing...' : 'Remove'}
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
