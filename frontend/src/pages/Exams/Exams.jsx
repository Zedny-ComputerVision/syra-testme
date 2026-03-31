import React, { useEffect, useMemo, useState } from 'react'
import { listTests } from '../../services/test.service'
import useLanguage from '../../hooks/useLanguage'
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

export default function Exams() {
  const { t } = useLanguage()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const formatFreshnessLabel = (value) => {
    if (!value) return t('exams_available_now')
    const timestamp = new Date(value).getTime()
    if (!Number.isFinite(timestamp)) return t('exams_recently_updated')
    const diff = Date.now() - timestamp
    if (diff < 0) return t('exams_recently_updated')
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('exams_updated_just_now')
    if (minutes < 60) return `${t('exams_updated')} ${minutes}${t('exams_m_ago')}`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${t('exams_updated')} ${hours}${t('exams_h_ago')}`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${t('exams_updated')} ${days}${t('exams_d_ago')}`
    return t('exams_updated_earlier')
  }

  const getAttemptSummary = (test) => {
    const maxAttempts = Number(test.max_attempts) || 1
    return maxAttempts === 1 ? t('exams_single_attempt_flow') : `${maxAttempts} ${t('exams_attempts_allowed')}`
  }

  const loadTests = () => {
    setLoading(true)
    setError('')
    listTests({ skip: 0, limit: 50 })
      .then(({ data }) => setTests(readPaginatedItems(data).map(normalizeTest)))
      .catch((err) => setError(err.response?.data?.detail || err.message || t('exams_failed_to_load')))
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
          <h1 className={styles.heading}>{t('exams_available_tests')}</h1>
          <p className={styles.sub}>{t('exams_review_readiness')}</p>
        </ScrollReveal>
        <Loader label={t('exams_loading_tests')} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <ScrollReveal className={styles.header}>
        <h1 className={styles.heading}>{t('exams_available_tests')}</h1>
        <p className={styles.sub}>{t('exams_review_readiness')}</p>
      </ScrollReveal>

      <ScrollReveal as="section" className={styles.summaryGrid} delay={60}>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('exams_available_now')}</div>
          <div className={styles.summaryValue}>{tests.length}</div>
          <div className={styles.summarySub}>{t('exams_tests_currently_available')}</div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('exams_timed_tests')}</div>
          <div className={styles.summaryValue}>{timedTests}</div>
          <div className={styles.summarySub}>{t('exams_tests_with_countdown')}</div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('exams_single_attempt')}</div>
          <div className={styles.summaryValue}>{singleAttemptTests}</div>
          <div className={styles.summarySub}>{t('exams_must_complete_one_run')}</div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('exams_scored_tests')}</div>
          <div className={styles.summaryValue}>{scoredTests}</div>
          <div className={styles.summarySub}>{t('exams_explicit_passing_score')}</div>
        </article>
      </ScrollReveal>

      <ScrollReveal className={styles.toolbar} delay={110}>
        <div className={styles.searchGroup}>
          <label className={styles.filterLabel} htmlFor="tests-search">{t('exams_search_tests')}</label>
          <input
            id="tests-search"
            className={styles.searchInput}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('exams_search_placeholder')}
          />
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.secondaryBtn} onClick={loadTests}>
            {t('refresh')}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setSearch('')}
            disabled={!hasActiveFilters}
          >
            {t('clear_filters')}
          </button>
        </div>
      </ScrollReveal>

      {error && (
        <ScrollReveal className={styles.errorRow} delay={140}>
          <div className={styles.error}>{error}</div>
          <button type="button" className={styles.retryBtn} onClick={loadTests}>
            {t('retry')}
          </button>
        </ScrollReveal>
      )}

      {!error && (
        <ScrollReveal className={styles.filterMeta} delay={150}>
          {t('showing')} {filteredTests.length} {t('exams_tests_across')} {tests.length} {t('exams_available')}.
        </ScrollReveal>
      )}

      {!error && tests.length === 0 && (
        <ScrollReveal className={styles.emptyState} delay={180}>
          <div className={styles.emptyTitle}>{t('exams_no_tests_available')}</div>
          <div className={styles.emptyText}>{t('exams_assigned_tests_appear')}</div>
        </ScrollReveal>
      )}

      {!error && tests.length > 0 && filteredTests.length === 0 && (
        <ScrollReveal className={styles.emptyState} delay={180}>
          <div className={styles.emptyTitle}>{t('exams_no_tests_match')}</div>
          <div className={styles.emptyText}>{t('exams_clear_search_restore')}</div>
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
                  {index === 0 && <span className={styles.latestBadge}>{t('exams_latest_release')}</span>}
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
                <span className={styles.contextPill}>{test.course_title || t('exams_assigned_test')}</span>
                {test.node_title && <span className={styles.contextPill}>{test.node_title}</span>}
              </div>
              <div className={styles.cardMetaGrid}>
                <div className={styles.metaBlock}>
                  <div className={styles.metaLabel}>{t('duration')}</div>
                  <div className={styles.metaValue}>{test.time_limit_minutes ? `${test.time_limit_minutes} ${t('time_min')}` : t('exams_untimed')}</div>
                </div>
                <div className={styles.metaBlock}>
                  <div className={styles.metaLabel}>{t('attempts')}</div>
                  <div className={styles.metaValue}>{test.max_attempts} {t('attempts_label')}</div>
                </div>
                <div className={styles.metaBlock}>
                  <div className={styles.metaLabel}>{t('exams_passing')}</div>
                  <div className={styles.metaValue}>{test.passing_score != null ? `${test.passing_score}%` : t('exams_no_cutoff')}</div>
                </div>
              </div>
              <div className={styles.cardInsight}>
                <div className={styles.insightTitle}>{t('exams_what_opens_next')}</div>
                <div className={styles.insightText}>{t('exams_what_opens_next_text')}</div>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardHint}>{index === 0 ? t('exams_newest_pinned') : t('exams_ready_whenever')}</span>
                <PrefetchLink
                  className={styles.cardCta}
                  to={`/tests/${test.id}`}
                  aria-label={`${t('exams_open_instructions_for')} ${test.title}`}
                >
                  {t('exams_open_instructions')}
                </PrefetchLink>
              </div>
            </article>
          </ScrollReveal>
        ))}
      </div>
    </div>
  )
}
