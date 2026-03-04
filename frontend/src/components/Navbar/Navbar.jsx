import React, { useContext, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { ThemeContext } from '../../context/ThemeContext'
import { getUnreadCount, markAllRead } from '../../services/notification.service'
import { adminApi } from '../../services/admin.service'
import { searchAll } from '../../services/search.service'
import styles from './Navbar.module.scss'

export default function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme, accent, setAccent } = useContext(ThemeContext)
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  const [unread, setUnread] = useState(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [results, setResults] = useState([])
  const menuRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    if (!user) return
    getUnreadCount().then(({ data }) => setUnread(data?.count || 0)).catch(() => {})
  }, [user])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleMarkAllRead = async () => {
    try {
      await markAllRead()
      setUnread(0)
    } catch (e) {}
  }

  const initials = (user?.name || user?.user_id || 'U').slice(0, 2).toUpperCase()

  const performSearch = async (q) => {
    const query = q.trim()
    if (!query) return
    setSearching(true)
    setSearchOpen(true)
    try {
      const { data } = await searchAll(query)
      const mapped = [
        ...(data.exams || []).map(e => ({ type: 'Exam', label: e.title, meta: e.status, to: '/admin/exams' })),
        ...(data.attempts || []).map(a => ({ type: 'Attempt', label: a.exam_title || 'Attempt', meta: a.user_name, to: `/attempts/${a.id}` })),
        ...(data.users || []).map(u => ({ type: 'User', label: u.name, meta: u.email, to: '/admin/users' })),
      ].slice(0, 8)
      setResults(mapped)
    } catch (e) {
      setResults([{ type: 'Error', label: 'Search failed', meta: 'Try again' }])
    } finally {
      setSearching(false)
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    performSearch(searchQuery)
  }

  const accents = [
    { key: 'emerald', label: 'E', color: '#10b981' },
    { key: 'indigo', label: 'I', color: '#6366f1' },
    { key: 'cyan', label: 'C', color: '#06b6d4' },
    { key: 'amber', label: 'A', color: '#f59e0b' },
    { key: 'pink', label: 'P', color: '#ec4899' },
  ]

  return (
    <header className={styles.navbar}>
      {/* Hamburger */}
      <button className={styles.hamburger} onClick={onMenuToggle} aria-label="Toggle navigation" type="button">
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
            className={styles.searchInput}
            placeholder="Search exams, attempts, users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(results.length > 0)}
          />
        </form>
        <AnimatePresence>
          {searchOpen && results.length > 0 && (
            <motion.div
              className={styles.searchResults}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
            >
              {results.map((r, i) => (
                <motion.button
                  key={i}
                  type="button"
                  className={styles.resultRow}
                  onClick={() => { setSearchOpen(false); navigate(r.to) }}
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
              ))}
            </motion.div>
          )}
          {searchOpen && searching && (
            <motion.div className={styles.searchResults} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className={styles.resultRow}>Searching...</div>
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
              className={`${styles.accentChip} ${accent === a.key ? styles.accentChipActive : ''}`}
              style={{ background: a.color }}
              onClick={() => setAccent(a.key)}
              title={`Use ${a.key} accent`}
              type="button"
            />
          ))}
        </div>

        {/* Theme toggle */}
        <button className={styles.iconBtn} onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'} type="button">
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
        <div className={styles.bellWrap}>
          <button className={styles.iconBtn} onClick={handleMarkAllRead} title="Notifications" type="button">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
          </button>
        </div>

        {/* User Avatar + Dropdown */}
        {user && (
          <div className={styles.userMenu} ref={menuRef}>
            <button
              className={styles.avatarBtn}
              onClick={() => setUserMenuOpen(o => !o)}
              type="button"
            >
              <div className={styles.avatarCircle}>{initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name || user.user_id}</span>
                <span className={styles.userRole} data-role={user.role?.toLowerCase()}>{user.role}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '0.25rem', opacity: 0.5 }}>
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
                <button className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/profile') }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  View Profile
                </button>
                <button className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/change-password') }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v4"/><path d="M10 3h4"/><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 12v2"/><path d="M15 12v2"/></svg>
                  Change Password
                </button>
                {(user.role === 'ADMIN' || user.role === 'INSTRUCTOR') && (
                  <button className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/admin/users') }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    Manage Users
                  </button>
                )}
                <button className={styles.dropdownItem} onClick={() => { setUserMenuOpen(false); navigate('/schedule') }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  My Schedule
                </button>
                <div className={styles.dropdownDivider} />
                <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={() => { setUserMenuOpen(false); logout() }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
