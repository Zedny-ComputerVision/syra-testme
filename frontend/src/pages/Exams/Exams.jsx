import React, { useEffect, useMemo, useState } from 'react'
import { listTests } from '../../services/test.service'
import Loader from '../../components/common/Loader/Loader'
import ScrollReveal from '../../components/ScrollReveal/ScrollReveal'
import PrefetchLink from '../../components/common/PrefetchLink/PrefetchLink'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../utils/pagination'
import styles from './Exams.module.scss'

function sortNewestFirst(items) {
  return [...items].sort((left, right) => {
    const leftTimestamp = new Date(left.updated_at || left.created_at || 0).getTime()
    const rightTimestamp = new Date(right.updated_at || right.created_at || 0).getTime()
    if (rightTimestamp !== leftTimestamp) return rightTimestamp - leftTimestamp
    return String(left.title || '').localeCompare(String(right.title || ''))
  })
}

function formatFreshnessLabel(value) {
  if (!value) return 'Available now'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Recently updated'
  const diff = Date.now() - timestamp
  if (diff < 0) return 'Recently updated'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Updated ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Updated ${days}d ago`
  return 'Updated earlier'
}

function getAttemptSummary(test) {
  const maxAttempts = Number(test.max_attempts) || 1
  return maxAttempts === 1 ? 'Single-attempt flow' : `${maxAttempts} attempts allowed`
}

export default function Exams() {
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const loadTests = () => {
    setLoading(true)
    setError('')
    listTests({ skip: 0, limit: 50 })
      .then(({ data }) => setTests(readPaginatedItems(data).map(normalizeTest)))
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Failed to load tests'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTests()
  }, [])

  const filteredTests = useMemo(() => {
    const query = search.trim().toLowerCase()
    const visibleTests = !query
      ? tests
      : tests.filter((test) =>
          [
            test.title,
            test.course_title,
            test.node_title,
            test.exam_type,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
    return sortNewestFirst(visibleTests)
  }, [search, tests])

  const timedTests = tests.filter((test) => Number(test.time_limit_minutes) > 0).length
  const singleAttemptTests = tests.filter((test) => Number(test.max_attempts) === 1).length
  const scoredTests = tests.filter((test) => test.passing_score != null).length
  const hasActiveFilters = Boolean(search.trim())

  if (loading) {
    return (
      <div className={styles.page}>
        <ScrollReveal className={styles.header}>
          <h1 className={styles.heading}>Available Tests</h1>
          <p className={styles.sub}>Review readiness details, then open the instructions for any available test.</p>
        </ScrollReveal>
        <Loader label="Loading tests..." />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <ScrollReveal className={styles.header}>
        <h1 className={styles.heading}>Available Tests</h1>
        <p className={styles.sub}>Review readiness details, then open the instructions for any available test.</p>
      </ScrollReveal>

      <ScrollReveal as="section" className={styles.summaryGrid} delay={60}>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Available now</div>
          <div className={styles.summaryValue}>{tests.length}</div>
          <div className={styles.summarySub}>Tests currently available to start</div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Timed tests</div>
          <div className={styles.summaryValue}>{timedTests}</div>
          <div className={styles.summarySub}>Tests with a countdown limit</div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Single-attempt</div>
          <div className={styles.summaryValue}>{singleAttemptTests}</div>
          <div className={styles.summarySub}>Attempts that must be completed in one run</div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Scored tests</div>
          <div className={styles.summaryValue}>{scoredTests}</div>
          <div className={styles.summarySub}>Tests with an explicit passing score</div>
        </article>
      </ScrollReveal>

      <ScrollReveal className={styles.toolbar} delay={110}>
        <div className={styles.searchGroup}>
          <label className={styles.filterLabel} htmlFor="tests-search">Search tests</label>
          <input
            id="tests-search"
            className={styles.searchInput}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, course, module, or type"
          />
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.secondaryBtn} onClick={loadTests}>
            Refresh
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setSearch('')}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
        </div>
      </ScrollReveal>

      {error && (
        <ScrollReveal className={styles.errorRow} delay={140}>
          <div className={styles.error}>{error}</div>
          <button type="button" className={styles.retryBtn} onClick={loadTests}>
            Retry
          </button>
        </ScrollReveal>
      )}

      {!error && (
        <ScrollReveal className={styles.filterMeta} delay={150}>
          Showing {filteredTests.length} tests across {tests.length} available.
        </ScrollReveal>
      )}

      {!error && tests.length === 0 && (
        <ScrollReveal className={styles.emptyState} delay={180}>
          <div className={styles.emptyTitle}>No tests available right now</div>
          <div className={styles.emptyText}>Your assigned tests will appear here as soon as they are published or scheduled.</div>
        </ScrollReveal>
      )}

      {!error && tests.length > 0 && filteredTests.length === 0 && (
        <ScrollReveal className={styles.emptyState} delay={180}>
          <div className={styles.emptyTitle}>No tests match the current search</div>
          <div className={styles.emptyText}>Clear the search to restore the full list of available tests.</div>
        </ScrollReveal>
      )}

      <div className={styles.grid}>
        {filteredTests.map((test, index) => (
          <ScrollReveal
            key={test.id}
            className={styles.revealCard}
            delay={Math.min(index, 7) * 45}
          >
            <article className={`${styles.card} ${index === 0 ? styles.latestCard : ''}`}>
              <div className={styles.cardTop}>
                <div className={styles.cardFlags}>
                  {index === 0 && <span className={styles.latestBadge}>Latest release</span>}
                  <span className={styles.freshnessBadge}>{formatFreshnessLabel(test.updated_at || test.created_at)}</span>
                </div>
                <h3 className={styles.cardTitle}>{test.title}</h3>
              </div>
              <div className={styles.cardTypeRow}>
                <span className={`${styles.badge} ${test.exam_type === 'MCQ' ? styles.badgeMcq : styles.badgeText}`}>
                  {test.exam_type}
                </span>
                <span className={styles.flowBadge}>{getAttemptSummary(test)}</span>
              </div>
              <div className={styles.courseRow}>
                <span className={styles.contextPill}>{test.course_title || 'Assigned test'}</span>
                {test.node_title && <span className={styles.contextPill}>{test.node_title}</span>}
              </div>
              <div className={styles.cardMetaGrid}>
                <div className={styles.metaBlock}>
                  <div className={styles.metaLabel}>Duration</div>
                  <div className={styles.metaValue}>{test.time_limit_minutes ? `${test.time_limit_minutes} min` : 'Untimed'}</div>
                </div>
                <div className={styles.metaBlock}>
                  <div className={styles.metaLabel}>Attempts</div>
                  <div className={styles.metaValue}>{test.max_attempts} attempt{test.max_attempts !== 1 ? 's' : ''}</div>
                </div>
                <div className={styles.metaBlock}>
                  <div className={styles.metaLabel}>Passing</div>
                  <div className={styles.metaValue}>{test.passing_score != null ? `${test.passing_score}%` : 'No cutoff'}</div>
                </div>
              </div>
              <div className={styles.cardInsight}>
                <div className={styles.insightTitle}>What opens next</div>
                <div className={styles.insightText}>Instructions, readiness checks, identity verification, and the monitored test flow.</div>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardHint}>{index === 0 ? 'Newest available test is pinned first.' : 'Ready whenever you are.'}</span>
                <PrefetchLink
                  className={styles.cardCta}
                  to={`/tests/${test.id}`}
                  aria-label={`Open instructions for ${test.title}`}
                >
                  Open instructions
                </PrefetchLink>
              </div>
            </article>
          </ScrollReveal>
        ))}
      </div>
    </div>
  )
}
