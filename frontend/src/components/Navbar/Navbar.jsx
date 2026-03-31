import React, { useContext, useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import useLanguage from '../../hooks/useLanguage'
import { ThemeContext } from '../../context/ThemeContext'
import { getUnreadCount, markAllRead, listNotifications, markRead } from '../../services/notification.service'
import { searchAll } from '../../services/search.service'
import styles from './Navbar.module.scss'

const UNREAD_COUNT_CACHE_TTL_MS = 45000
const UNREAD_COUNT_REFRESH_INTERVAL_MS = 45000
let unreadCountCache = {
  count: 0,
  fetchedAt: 0,
  inflight: null,
}

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time_just_now')
  if (mins < 60) return `${mins}${t('time_m_ago')}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}${t('time_h_ago')}`
  const days = Math.floor(hrs / 24)
  if (days === 1) return t('time_yesterday')
  if (days < 7) return `${days}${t('time_d_ago')}`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getNotifType(notification) {
  const t = (notification.title || '').toLowerCase()
  if (t.startsWith('schedule') || t.includes('scheduled')) return 'exam'
  if (t.includes('published')) return 'exam'
  if (t.includes('cancelled') || t.includes('removed')) return 'warning'
  if (t.includes('result') || t.includes('score') || t.includes('graded')) return 'result'
  if (t.includes('proctoring') || t.includes('alert') || t.includes('violation')) return 'proctoring'
  return 'default'
}

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  const message = error?.response?.data?.message
  if (typeof message === 'string' && message.trim()) return message
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return fallback
}

async function readUnreadCount({ force = false } = {}) {
  const now = Date.now()
  if (
    !force
    && unreadCountCache.fetchedAt
    && (now - unreadCountCache.fetchedAt) < UNREAD_COUNT_CACHE_TTL_MS
  ) {
    return unreadCountCache.count
  }
  if (unreadCountCache.inflight) {
    return unreadCountCache.inflight
  }

  unreadCountCache.inflight = getUnreadCount()
    .then(({ data }) => {
      unreadCountCache.count = data?.count || 0
      unreadCountCache.fetchedAt = Date.now()
      return unreadCountCache.count
    })
    .finally(() => {
      unreadCountCache.inflight = null
    })

  return unreadCountCache.inflight
}

export default function Navbar({ onMenuToggle }) {
  const { user, logout, hasPermission } = useAuth()
  const { lang, t, setLanguage, languages: availableLanguages } = useLanguage()
  const { theme, toggleTheme, accent, setAccent } = useContext(ThemeContext)
  const navigate = useNavigate()
  const isDark = theme === 'dark'
  const isAdmin = user?.role === 'ADMIN'
  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'INSTRUCTOR'
  const canManageUsers = hasPermission?.('Manage Users')
  const canViewOwnSchedule = hasPermission?.('View Own Schedule')

  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [results, setResults] = useState([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState('')
  const [notifSyncError, setNotifSyncError] = useState('')
  const [notifActionLoading, setNotifActionLoading] = useState(false)
  const menuRef = useRef(null)
  const bellRef = useRef(null)
  const searchRef = useRef(null)
  const searchInputRef = useRef(null)
  const searchDebounce = useRef(null)
  const latestSearchRequest = useRef(0)

  useEffect(() => {
    if (!user) {
      setUnread(0)
      setNotifications([])
      setNotifError('')
      setNotifSyncError('')
      return
    }
    let cancelled = false
    const loadUnread = async ({ force = false } = {}) => {
      if (document.visibilityState === 'hidden') {
        return
      }
      try {
        const count = await readUnreadCount({ force })
        if (!cancelled) {
          setUnread(count)
          setNotifSyncError('')
        }
      } catch (error) {
        if (!cancelled) {
          setNotifSyncError(getErrorMessage(error, t('nav_sync_error')))
        }
      }
    }

    void loadUnread()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadUnread()
      }
    }
    const handleWindowFocus = () => {
      void loadUnread()
    }
    const intervalId = window.setInterval(() => {
      void loadUnread({ force: true })
    }, UNREAD_COUNT_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [user])

  useEffect(() => () => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
  }, [])

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target
      const isTypingTarget = target instanceof HTMLElement && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )

      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select?.()
        return
      }

      if (event.key === 'Escape') {
        setSearchOpen(false)
        setNotifOpen(false)
        setUserMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const openNotifications = async () => {
    const next = !notifOpen
    setNotifOpen(next)
    if (next) {
      setNotifLoading(true)
      setNotifError('')
      try {
        const { data } = await listNotifications()
        setNotifications(data || [])
        setNotifSyncError('')
      } catch (error) {
        setNotifError(getErrorMessage(error, t('nav_notification_load_error')))
      } finally {
        setNotifLoading(false)
      }
    }
  }

  const handleMarkAllRead = async () => {
    if (notifActionLoading) return
    setNotifActionLoading(true)
    setNotifError('')
    try {
      await markAllRead()
      unreadCountCache.count = 0
      unreadCountCache.fetchedAt = Date.now()
      setUnread(0)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch (error) {
      setNotifError(getErrorMessage(error, t('nav_mark_read_error')))
    } finally {
      setNotifActionLoading(false)
    }
  }

  const initials = (user?.name || user?.user_id || 'U').slice(0, 2).toUpperCase()

  const performSearch = useCallback(async (q) => {
    const query = q.trim()
    if (!query) {
      latestSearchRequest.current += 1
      setResults([])
      setSearchOpen(false)
      setSearching(false)
      return
    }
    if (query.length < 2) {
      latestSearchRequest.current += 1
      setResults([{
        type: 'Tip',
        label: t('nav_keep_typing'),
        meta: t('nav_search_after_2_chars'),
      }])
      setSearchOpen(true)
      setSearching(false)
      return
    }

    const requestId = latestSearchRequest.current + 1
    latestSearchRequest.current = requestId
    setSearching(true)
    setSearchOpen(true)
    try {
      const { data } = await searchAll(query)
      if (requestId !== latestSearchRequest.current) {
        return
      }
      const examResults = (data.exams || []).map((e) => ({
        type: t('nav_type_test'),
        label: e.title,
        meta: e.status,
        to: isAdmin ? `/admin/tests/${e.id}/manage` : `/tests/${e.id}`,
      }))
      const userResults = isPrivileged
        ? (data.users || []).map((u) => ({
            type: t('nav_type_user'),
            label: u.name,
            meta: `${u.user_id || ''}${u.email ? ` | ${u.email}` : ''}`,
            to: `/admin/users?search=${encodeURIComponent(u.user_id || u.email || u.name || '')}`,
          }))
        : []
      const mapped = [
        ...examResults,
        ...(data.attempts || []).map(a => ({
          type: t('nav_type_attempt'),
          label: a.test_title || a.exam_title || t('nav_type_attempt'),
          meta: a.user_name,
          to: isPrivileged ? `/admin/attempt-analysis?id=${a.id}` : `/attempts/${a.id}`,
        })),
        ...userResults,
      ].slice(0, 8)
      setResults(
        mapped.length > 0
          ? mapped
          : [{ type: 'Info', label: t('no_results'), meta: `for "${query}"` }],
      )
    } catch (error) {
      if (requestId === latestSearchRequest.current) {
        setResults([{
          type: 'Error',
          label: t('nav_search_failed'),
          meta: getErrorMessage(error, t('nav_try_again')),
        }])
      }
    } finally {
      if (requestId === latestSearchRequest.current) {
        setSearching(false)
      }
    }
  }, [isAdmin, isPrivileged, t])

  const clearSearch = () => {
    latestSearchRequest.current += 1
    if (searchDebounce.current) {
      clearTimeout(searchDebounce.current)
      searchDebounce.current = null
    }
    setSearchQuery('')
    setResults([])
    setSearchOpen(false)
    setSearching(false)
    searchInputRef.current?.focus()
  }

  const handleSearchChange = (e) => {
    const q = e.target.value
    setSearchQuery(q)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => performSearch(q), 350)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    performSearch(searchQuery)
  }

  const handleSearchResultNavigate = (event, target) => {
    event.preventDefault()
    setSearchOpen(false)
    navigate(target)
  }

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await markRead(notification.id)
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n))
        setUnread(prev => Math.max(0, prev - 1))
        unreadCountCache.count = Math.max(0, unreadCountCache.count - 1)
        unreadCountCache.fetchedAt = Date.now()
      } catch { /* silent — badge will self-correct on next poll */ }
    }
    if (!notification?.link) return
    setNotifOpen(false)
    navigate(notification.link)
  }

  const accents = [
    { key: 'emerald', label: 'E', toneClass: styles.accentChipEmerald },
    { key: 'indigo', label: 'I', toneClass: styles.accentChipIndigo },
    { key: 'cyan', label: 'C', toneClass: styles.accentChipCyan },
    { key: 'amber', label: 'A', toneClass: styles.accentChipAmber },
    { key: 'pink', label: 'P', toneClass: styles.accentChipPink },
  ]

  return (
    <header className={styles.navbar}>
      {/* Hamburger */}
      <button className={styles.hamburger} onClick={onMenuToggle} aria-label={t('nav_toggle')} type="button">
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
      </button>

      {/* Search bar */}
      <div className={styles.searchWrap} ref={searchRef}>
        <span className={styles.searchIcon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
          <input
            ref={searchInputRef}
            className={styles.searchInput}
            placeholder={t('nav_search_placeholder')}
            type="search"
            aria-label={t('nav_search_aria')}
            aria-expanded={searchOpen}
            aria-controls="navbar-search-results"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => {
              if (results.length > 0) {
                setSearchOpen(true)
              } else if (searchQuery.trim().length >= 2) {
                void performSearch(searchQuery)
              }
            }}
          />
        </form>
        {searchQuery ? (
          <button
            type="button"
            className={styles.searchClear}
            onClick={clearSearch}
            aria-label={t('nav_clear_search')}
            title={t('nav_clear_search')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
        <span className={styles.searchShortcut} aria-hidden="true">/</span>
        <AnimatePresence>
          {searchOpen && results.length > 0 && (
            <motion.div
              id="navbar-search-results"
              className={styles.searchResults}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
            >
              {results.map((r, i) => (
                r.to ? (
                  <motion.button
                    key={i}
                    type="button"
                    className={styles.resultRow}
                    onMouseDown={(event) => handleSearchResultNavigate(event, r.to)}
                    onClick={(event) => handleSearchResultNavigate(event, r.to)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.resultType}>{r.type}</div>
                    <div className={styles.resultLabel}>{r.label}</div>
                    {r.meta && <div className={styles.resultMeta}>{r.meta}</div>}
                  </motion.button>
                ) : (
                  <motion.div
                    key={i}
                    className={`${styles.resultRow} ${styles.resultRowStatic}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <div className={styles.resultType}>{r.type}</div>
                    <div className={styles.resultLabel}>{r.label}</div>
                    {r.meta && <div className={styles.resultMeta}>{r.meta}</div>}
                  </motion.div>
                )
              ))}
            </motion.div>
          )}
          {searchOpen && searching && (
            <motion.div className={styles.searchResults} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className={styles.resultRow}>{t('nav_searching')}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.spacer} />

      <div className={styles.controls}>
        {/* Accent chips */}
        <div className={styles.accentRow} aria-label="Accent color picker">
          {accents.map(a => (
            <button
              key={a.key}
              className={`${styles.accentChip} ${a.toneClass} ${accent === a.key ? styles.accentChipActive : ''}`}
              onClick={() => setAccent(a.key)}
              aria-label={`${t('nav_use_accent')} ${a.key}`}
              aria-pressed={accent === a.key}
              title={`${t('nav_use_accent')} ${a.key}`}
              type="button"
            />
          ))}
        </div>

        {/* Language Switcher */}
        <div className={styles.langSwitcher}>
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className={styles.langSelect}
            aria-label="Language"
          >
            {availableLanguages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName}
              </option>
            ))}
          </select>
        </div>

        {/* Theme toggle */}
        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label={isDark ? t('nav_switch_to_light') : t('nav_switch_to_dark')}
          title={isDark ? t('light_mode') : t('dark_mode')}
          type="button"
        >
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          )}
        </button>

        {/* Notification bell */}
        <div className={styles.bellWrap} ref={bellRef}>
          <button
            className={styles.iconBtn}
            onClick={openNotifications}
            aria-label={t('nav_open_notifications')}
            aria-expanded={notifOpen}
            aria-haspopup="dialog"
            title={t('nav_notifications')}
            type="button"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
          </button>
          {notifOpen && (
            <div className={styles.notifDropdown}>
              <div className={styles.notifHeader}>
                <span className={styles.notifTitle}>{t('nav_notifications')}</span>
                {unread > 0 && (
                  <button
                    type="button"
                    className={styles.notifMarkAll}
                    onClick={handleMarkAllRead}
                    disabled={notifActionLoading}
                  >
                    {notifActionLoading ? t('nav_marking') : t('nav_mark_all_read')}
                  </button>
                )}
              </div>
              {notifSyncError && !notifError && (
                <div className={styles.notifNotice}>{notifSyncError}</div>
              )}
              <div className={styles.notifList}>
                {notifLoading ? (
                  <div className={styles.notifEmpty}>{t('loading')}</div>
                ) : notifError ? (
                  <div className={styles.notifEmpty}>{notifError}</div>
                ) : notifications.length === 0 ? (
                  <div className={styles.notifEmpty}>{t('nav_no_notifications')}</div>
                ) : (
                  notifications.map((n, i) => {
                    const type = getNotifType(n)
                    return (
                      <button
                        key={n.id || i}
                        type="button"
                        className={`${styles.notifItem} ${!n.is_read ? styles.notifUnread : ''} ${styles[`notifType_${type}`] || ''} ${n.link ? styles.notifItemLinked : ''}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <span className={`${styles.notifIcon} ${styles[`notifIcon_${type}`] || ''}`} aria-hidden="true">
                          {type === 'exam' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                          {type === 'result' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                          {type === 'warning' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                          {type === 'proctoring' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                          {type === 'default' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>}
                        </span>
                        <div className={styles.notifContent}>
                          {n.title && <div className={styles.notifItemTitle}>{n.title}</div>}
                          <div className={styles.notifMsg}>{n.message || n.title || t('nav_notification')}</div>
                          {n.created_at && <div className={styles.notifTime}>{timeAgo(n.created_at, t)}</div>}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
              <div className={styles.notifFooter}>
                <span className={styles.notifCount}>{unread > 0 ? `${unread} ${t('nav_unread')}` : t('nav_all_caught_up')}</span>
                <button type="button" className={styles.notifClose} onClick={() => setNotifOpen(false)}>
                  {t('close')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar + Dropdown */}
        {user && (
          <div className={styles.userMenu} ref={menuRef}>
            <button
              className={styles.avatarBtn}
              onClick={() => setUserMenuOpen(o => !o)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              type="button"
            >
              <div className={styles.avatarCircle}>{initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name || user.user_id}</span>
                <span className={styles.userRole} data-role={user.role?.toLowerCase()}>{user.role}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.userChevron}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {userMenuOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownHeader}>
                  <div className={styles.dropdownAvatar}>{initials}</div>
                  <div>
                    <div className={styles.dropdownName}>{user.name || user.user_id}</div>
                    <div className={styles.dropdownEmail}>{user.email || user.role}</div>
                  </div>
                </div>
                <div className={styles.dropdownDivider} />
                <button type="button" className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/profile') }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {t('nav_view_profile')}
                </button>
                <button type="button" className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/change-password') }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v4"/><path d="M10 3h4"/><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 12v2"/><path d="M15 12v2"/></svg>
                  {t('nav_change_password')}
                </button>
                {isPrivileged && canManageUsers && (
                  <button type="button" className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/admin/users') }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    {t('nav_manage_users')}
                  </button>
                )}
                {canViewOwnSchedule && (
                  <button type="button" className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/schedule') }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {t('nav_my_schedule')}
                  </button>
                )}
                <div className={styles.dropdownDivider} />
                <button type="button" className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={() => { setUserMenuOpen(false); logout() }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  {t('logout')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
