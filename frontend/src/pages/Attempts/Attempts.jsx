import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useLanguage from '../../hooks/useLanguage'
import Skeleton from '../../components/Skeleton/Skeleton'
import { listAttempts } from '../../services/attempt.service'
import { isAttemptCompletedStatus, normalizeAttempt } from '../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../utils/pagination'
import styles from './Attempts.module.scss'

const STATUS_CLASSES = {
  SUBMITTED: styles.badgeCompleted,
  GRADED: styles.badgeCompleted,
  IN_PROGRESS: styles.badgeInProgress,
  COMPLETED: styles.badgeCompleted,
  TIMED_OUT: styles.badgeTimedOut,
}

const PAGE_SIZE = 20

export default function Attempts() {
  const { t } = useLanguage()
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('All')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const emptyRetryTimeoutRef = useRef(null)
  const navigate = useNavigate()

  const STAT_LABELS = {
    total: t('attempts_total_value'),
    completed: t('attempts_completed_value'),
    average: t('attempts_average_value'),
    best: t('attempts_best_value'),
  }

  const loadAttempts = useCallback(async ({ allowEmptyRetry = false } = {}) => {
    setLoading(true)
    try {
      const { data } = await listAttempts({ skip: 0, limit: 50 })
      const nextAttempts = readPaginatedItems(data).map(normalizeAttempt)
      setAttempts(nextAttempts)
      setLoadError('')
      if (emptyRetryTimeoutRef.current) {
        window.clearTimeout(emptyRetryTimeoutRef.current)
        emptyRetryTimeoutRef.current = null
      }
      if (allowEmptyRetry && nextAttempts.length === 0) {
        emptyRetryTimeoutRef.current = window.setTimeout(() => {
          void loadAttempts({ allowEmptyRetry: false })
        }, 1200)
      }
    } catch {
      setLoadError(t('attempts_failed_to_load'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAttempts({ allowEmptyRetry: true })
    return () => {
      if (emptyRetryTimeoutRef.current) {
        window.clearTimeout(emptyRetryTimeoutRef.current)
      }
    }
  }, [loadAttempts])

  const completed = attempts.filter((attempt) => attempt.is_completed || isAttemptCompletedStatus(attempt.status))
  const avgScore = completed.length
    ? Math.round(completed.reduce((sum, attempt) => sum + (attempt.score || 0), 0) / completed.length)
    : 0
  const bestScore = completed.length
    ? Math.max(...completed.map((attempt) => attempt.score || 0))
    : 0

  const filtered = attempts.filter((attempt) => {
    const query = search.toLowerCase()
    const matchSearch = !query || (attempt.test_title || attempt.exam_title || '').toLowerCase().includes(query)
    let matchStatus = true
    if (statusTab === 'Completed') matchStatus = ['SUBMITTED', 'GRADED', 'COMPLETED'].includes(attempt.status)
    else if (statusTab === 'In Progress') matchStatus = attempt.status === 'IN_PROGRESS'
    else if (statusTab === 'Timed Out') matchStatus = attempt.status === 'TIMED_OUT'
    return matchSearch && matchStatus
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.started_at || 0) - new Date(b.started_at || 0)
    if (sortBy === 'score_desc') return (b.score ?? -1) - (a.score ?? -1)
    if (sortBy === 'score_asc') return (a.score ?? 999) - (b.score ?? 999)
    return new Date(b.started_at || 0) - new Date(a.started_at || 0)
  })

  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE)
  const paginated = sortedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const tabCount = (tab) => {
    if (tab === 'All') return attempts.length
    if (tab === 'Completed') return attempts.filter((attempt) => ['SUBMITTED', 'GRADED', 'COMPLETED'].includes(attempt.status)).length
    if (tab === 'In Progress') return attempts.filter((attempt) => attempt.status === 'IN_PROGRESS').length
    if (tab === 'Timed Out') return attempts.filter((attempt) => attempt.status === 'TIMED_OUT').length
    return 0
  }

  const tabLabel = (tab) => {
    if (tab === 'All') return t('all')
    if (tab === 'Completed') return t('attempts_completed')
    if (tab === 'In Progress') return t('attempts_in_progress')
    if (tab === 'Timed Out') return t('attempts_timed_out')
    return tab
  }

  const formatDate = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (start, end) => {
    if (!start || !end) return '-'
    const milliseconds = new Date(end) - new Date(start)
    const minutes = Math.floor(milliseconds / 60000)
    return `${minutes} ${t('time_min')}`
  }

  const openAttempt = (attempt) => {
    if (!attempt?.id) return
    if (attempt.status === 'IN_PROGRESS') {
      navigate(`/attempts/${attempt.id}/take`)
      return
    }
    navigate(`/attempts/${attempt.id}`)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('attempts_your_attempts')}</h2>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </span>
          <div className={styles.statBody}>
            <div className={styles.statValue} aria-label={STAT_LABELS.total}>{attempts.length}</div>
            <div className={styles.statLabel}>{t('attempts_total')}</div>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.statSuccess}`}>
          <span className={`${styles.statIcon} ${styles.statIconSuccess}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </span>
          <div className={styles.statBody}>
            <div className={styles.statValue} aria-label={STAT_LABELS.completed}>{completed.length}</div>
            <div className={styles.statLabel}>{t('attempts_completed')}</div>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.statBlue}`}>
          <span className={`${styles.statIcon} ${styles.statIconBlue}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </span>
          <div className={styles.statBody}>
            <div className={styles.statValue} aria-label={STAT_LABELS.average}>{avgScore}%</div>
            <div className={styles.statLabel}>{t('attempts_avg_score')}</div>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.statWarning}`}>
          <span className={`${styles.statIcon} ${styles.statIconWarning}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
          </span>
          <div className={styles.statBody}>
            <div className={styles.statValue} aria-label={STAT_LABELS.best}>{bestScore}%</div>
            <div className={styles.statLabel}>{t('attempts_best_score')}</div>
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t('attempts_search_placeholder')}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1) }}
        />
        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={(event) => { setSortBy(event.target.value); setPage(1) }}
        >
          <option value="newest">{t('newest_first')}</option>
          <option value="oldest">{t('oldest_first')}</option>
          <option value="score_desc">{t('attempts_score_high_low')}</option>
          <option value="score_asc">{t('attempts_score_low_high')}</option>
        </select>
      </div>

      <div className={styles.statusTabs}>
        {['All', 'Completed', 'In Progress', 'Timed Out'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.statusTab} ${statusTab === tab ? styles.statusTabActive : ''}`}
            onClick={() => { setStatusTab(tab); setPage(1) }}
          >
            {tabLabel(tab)}
            <span className={styles.tabCount}>{tabCount(tab)}</span>
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.tableSkeleton}>
            <Skeleton variant="table" rows={6} />
          </div>
        ) : loadError ? (
          <div className={styles.errorRow}>
            <div className={styles.empty}>{loadError}</div>
            <button type="button" className={styles.secondaryBtn} onClick={() => void loadAttempts()}>
              {t('attempts_retry_loading')}
            </button>
          </div>
        ) : paginated.length === 0 ? (
          <div className={styles.empty}>{attempts.length === 0 ? t('attempts_no_attempts_yet') : t('attempts_no_match_filters')}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('attempts_th_test')}</th>
                <th>{t('status')}</th>
                <th>{t('score')}</th>
                <th>{t('date')}</th>
                <th>{t('duration')}</th>
                <th>{t('attempts_th_action')}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((attempt) => (
                <tr key={attempt.id} data-status={attempt.status}>
                  <td>
                    <span className={styles.testName}>{attempt.test_title || attempt.exam_title || t('attempts_test')}</span>
                    {attempt.certificate_eligible && <span className={styles.certBadge} title={t('attempts_cert_eligible')}>CERT</span>}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_CLASSES[attempt.status] || ''}`}>
                      {attempt.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {attempt.score != null ? (
                      <div className={styles.scoreCell}>
                        <span className={attempt.score < 60 ? styles.scoreFail : styles.scorePass}>
                          {attempt.score}%
                        </span>
                        <div className={styles.scoreTrack}>
                          <div
                            className={attempt.score < 60 ? styles.scoreBarFail : styles.scoreBarPass}
                            style={{ width: `${Math.min(attempt.score, 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : <span className={styles.mutedCell}>—</span>}
                  </td>
                  <td className={styles.mutedCell}>{formatDate(attempt.started_at)}</td>
                  <td className={styles.mutedCell}>{formatDuration(attempt.started_at, attempt.submitted_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${attempt.status === 'IN_PROGRESS' ? styles.actionBtnResume : ''}`}
                      onClick={() => openAttempt(attempt)}
                      aria-label={`${attempt.status === 'IN_PROGRESS' ? t('attempts_resume_attempt_for') : t('attempts_open_result_for')} ${attempt.test_title || attempt.exam_title || t('attempts_this_test')}`}
                      title={`${attempt.status === 'IN_PROGRESS' ? t('attempts_resume_attempt_for') : t('attempts_open_result_for')} ${attempt.test_title || attempt.exam_title || t('attempts_this_test')}`}
                    >
                      {attempt.status === 'IN_PROGRESS' ? t('attempts_resume_attempt') : t('attempts_open_result')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>{sortedFiltered.length} {t('attempts_label')} - {t('page')} {page} {t('of')} {totalPages}</span>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>{t('previous_page')}</button>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>{t('next_page')}</button>
        </div>
      )}
    </div>
  )
}
