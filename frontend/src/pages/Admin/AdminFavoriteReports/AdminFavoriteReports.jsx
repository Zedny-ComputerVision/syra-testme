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
  const [modal, setModal] = useState(false)
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [removingIndex, setRemovingIndex] = useState(null)
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null)
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

  const resetModal = () => {
    if (saving) return
    setModal(false)
    setTitle('')
    setLink('')
    setModalError('')
  }

  const handleCreate = async () => {
    const nextTitle = title.trim()
    const nextLink = link.trim()
    if (!nextTitle || !nextLink) {
      setModalError(t('admin_favorites_title_link_required'))
      return
    }
    if (favorites.some((favorite) => favorite.link === nextLink && favorite.title.toLowerCase() === nextTitle.toLowerCase())) {
      setModalError(t('admin_favorites_already_saved'))
      return
    }
    if (!isValidFavoriteLink(nextLink)) {
      setModalError(t('admin_favorites_invalid_link'))
      return
    }
    setSaving(true)
    setModalError('')
    setNotice('')
    const next = [...favorites, { title: nextTitle, link: nextLink, isBroken: false }]
    try {
      await adminApi.updateMyPreference('favorite_reports', serializeFavorites(next))
      setFavorites(next)
      setNotice(t('admin_favorites_saved_notice'))
      resetModal()
    } catch {
      setModalError(t('admin_favorites_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (index) => {
    setRemovingIndex(index)
    setDeleteConfirmIndex(null)
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
      <AdminPageHeader title={t('admin_favorites_page_title')} subtitle={t('admin_favorites_page_subtitle')}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => {
            setModal(true)
            setModalError('')
          }}
        >
          {t('admin_favorites_add_favorite')}
        </button>
      </AdminPageHeader>

      {loadError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{loadError}</div>
          <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>
            {loading ? t('admin_favorites_retrying') : t('retry')}
          </button>
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

      <div className={styles.toolbarPanel}>
        <div className={styles.toolbar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('admin_favorites_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className={styles.sortBtn}
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value)}
          >
            <option value="ALL">{t('admin_favorites_filter_all')}</option>
            <option value="INTERNAL">{t('admin_favorites_filter_internal')}</option>
            <option value="EXTERNAL">{t('admin_favorites_filter_external')}</option>
            <option value="STALE">{t('admin_favorites_needs_update')}</option>
          </select>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionBtn} onClick={() => void load()} disabled={loading}>
              {loading ? t('admin_refreshing') : t('admin_refresh')}
            </button>
            <button type="button" className={styles.actionBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
              {t('admin_clear_filters')}
            </button>
          </div>
        </div>
        <div className={styles.filterMeta}>
          {t('admin_favorites_showing_count', { filtered: filteredFavorites.length, total: favorites.length })}
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_favorites_loading')}</div>
          <div className={styles.emptyText}>{t('admin_favorites_loading_sub')}</div>
        </div>
      ) : filteredFavorites.length === 0 && hasActiveFilters ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_favorites_no_match')}</div>
          <div className={styles.emptyText}>{t('admin_favorites_clear_filters_hint')}</div>
          <button type="button" className={styles.actionBtn} onClick={clearFilters}>{t('admin_clear_filters')}</button>
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('admin_favorites_none_yet')}</div>
          <div className={styles.emptyText}>{t('admin_favorites_empty_state')}</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredFavorites.map((favorite) => {
            const index = favorites.findIndex((entry) => entry.title === favorite.title && entry.link === favorite.link)
            const isExternal = /^https?:\/\//i.test(favorite.link)
            const favoriteLabel = favorite.title || t('admin_favorites_this_favorite')

            return (
              <div key={`${favorite.title}-${favorite.link}`} className={`${styles.card} ${favorite.isBroken ? styles.cardBroken : ''}`}>
                {favorite.isBroken && (
                  <div className={styles.staleBanner}>{t('admin_favorites_needs_update')}</div>
                )}
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.cardTitle}>{favorite.title}</span>
                    <span className={styles.typeBadge}>
                      {isExternal ? t('admin_favorites_external_shortcut') : t('admin_favorites_internal_route')}
                    </span>
                  </div>
                  <div className={styles.actionBtns}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => openFavorite(favorite)}
                      disabled={favorite.isBroken}
                      aria-label={`${t('admin_favorites_open')} ${favoriteLabel}`}
                      title={`${t('admin_favorites_open')} ${favoriteLabel}`}
                    >
                      {t('admin_favorites_open')}
                    </button>
                    {deleteConfirmIndex === index ? (
                      <>
                        <button
                          type="button"
                          className={styles.actionBtnDanger}
                          onClick={() => void remove(index)}
                          disabled={removingIndex === index}
                          aria-label={`${t('confirm_delete')} ${favoriteLabel}`}
                        >
                          {removingIndex === index ? t('admin_removing') : t('confirm')}
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => setDeleteConfirmIndex(null)}
                          disabled={removingIndex === index}
                        >
                          {t('cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setDeleteConfirmIndex(index)}
                        disabled={saving || removingIndex === index}
                        aria-label={`${t('remove')} ${favoriteLabel}`}
                        title={`${t('remove')} ${favoriteLabel}`}
                      >
                        {t('remove')}
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.cardMeta}>{favorite.link}</div>
                {favorite.isBroken && (
                  <div className={styles.cardWarning}>{t('admin_favorites_route_gone_warning')}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={resetModal}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="favorite-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="favorite-dialog-title" className={styles.modalTitle}>{t('admin_favorites_modal_title')}</h3>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="favorite-title">{t('admin_favorites_title_label')}</label>
              <input id="favorite-title" className={styles.input} placeholder={t('admin_favorites_title_placeholder')} value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="favorite-link">{t('admin_favorites_link_label')}</label>
              <input id="favorite-link" className={styles.input} placeholder={t('admin_favorites_link_placeholder')} value={link} onChange={(event) => setLink(event.target.value)} />
              <div className={styles.fieldHint}>{t('admin_favorites_link_hint')}</div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={resetModal} disabled={saving}>{t('cancel')}</button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleCreate()} disabled={saving || !title.trim() || !link.trim()}>
                {saving ? t('admin_favorites_creating') : t('admin_favorites_create_favorite')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
