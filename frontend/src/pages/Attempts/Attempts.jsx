import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAttempts } from '../../services/attempt.service'
import { isAttemptCompletedStatus, normalizeAttempt } from '../../utils/assessmentAdapters'
import styles from './Attempts.module.scss'

const STATUS_CLASSES = {
  SUBMITTED: styles.badgeCompleted,
  GRADED: styles.badgeCompleted,
  IN_PROGRESS: styles.badgeInProgress,
  COMPLETED: styles.badgeCompleted,
  TIMED_OUT: styles.badgeTimedOut,
}

const PAGE_SIZE = 20
const STAT_LABELS = {
  total: 'Total attempts value',
  completed: 'Completed attempts value',
  average: 'Average score value',
  best: 'Best score value',
}

export default function Attempts() {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('All')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()

  const loadAttempts = async () => {
    setLoading(true)
    try {
      const { data } = await listAttempts()
      setAttempts((data || []).map(normalizeAttempt))
      setLoadError('')
    } catch {
      setLoadError('Failed to load attempts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAttempts()
  }, [])

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
    return `${minutes} min`
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
        <h2 className={styles.title}>Your Attempts</h2>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue} aria-label={STAT_LABELS.total}>{attempts.length}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} aria-label={STAT_LABELS.completed}>{completed.length}</div>
          <div className={styles.statLabel}>Completed</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} aria-label={STAT_LABELS.average}>{avgScore}%</div>
          <div className={styles.statLabel}>Avg Score</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} aria-label={STAT_LABELS.best}>{bestScore}%</div>
          <div className={styles.statLabel}>Best</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search by test name..."
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1) }}
        />
        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={(event) => { setSortBy(event.target.value); setPage(1) }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="score_desc">Score: High to Low</option>
          <option value="score_asc">Score: Low to High</option>
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
            {tab}
            <span className={styles.tabCount}>{tabCount(tab)}</span>
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : loadError ? (
          <div className={styles.errorRow}>
            <div className={styles.empty}>{loadError}</div>
            <button type="button" className={styles.secondaryBtn} onClick={() => void loadAttempts()}>Retry</button>
          </div>
        ) : paginated.length === 0 ? (
          <div className={styles.empty}>{attempts.length === 0 ? 'No attempts yet. Take a test to get started.' : 'No attempts match your filters.'}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Test</th>
                <th>Status</th>
                <th>Score</th>
                <th>Date</th>
                <th>Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((attempt) => (
                <tr key={attempt.id}>
                  <td>
                    <span className={styles.testName}>{attempt.test_title || attempt.exam_title || 'Test'}</span>
                    {attempt.certificate_eligible && <span className={styles.certBadge} title="Certificate eligible">CERT</span>}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_CLASSES[attempt.status] || ''}`}>
                      {attempt.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className={attempt.score != null && attempt.score < 60 ? styles.scoreFail : attempt.score != null ? styles.scorePass : ''}>
                    {attempt.score != null ? `${attempt.score}%` : '-'}
                  </td>
                  <td className={styles.mutedCell}>{formatDate(attempt.started_at)}</td>
                  <td className={styles.mutedCell}>{formatDuration(attempt.started_at, attempt.submitted_at)}</td>
                  <td>
                    <button type="button" className={styles.actionBtn} onClick={() => openAttempt(attempt)}>
                      {attempt.status === 'IN_PROGRESS' ? 'Resume' : 'View Result'}
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
          <span className={styles.pageInfo}>{sortedFiltered.length} attempt{sortedFiltered.length !== 1 ? 's' : ''} - Page {page} of {totalPages}</span>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Prev</button>
          <button type="button" className={styles.pageBtn} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </div>
  )
}
