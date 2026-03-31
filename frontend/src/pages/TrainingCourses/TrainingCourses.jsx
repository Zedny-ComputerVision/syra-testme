import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listTests } from '../../services/test.service'
import api from '../../services/api'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../utils/pagination'
import useLanguage from '../../hooks/useLanguage'
import styles from './TrainingCourses.module.scss'

const INTERNAL_POOL_LIBRARY_TITLE = 'Question Pool Library'
const INTERNAL_POOL_LIBRARY_DESCRIPTION = 'Hidden library course for question pool storage'

function isVisibleTrainingCourse(course) {
  const title = String(course?.title || '').trim()
  const description = String(course?.description || '').trim()
  return !(
    title === INTERNAL_POOL_LIBRARY_TITLE
    && description === INTERNAL_POOL_LIBRARY_DESCRIPTION
  )
}

export default function TrainingCourses() {
  const [courses, setCourses] = useState([])
  const [nodes, setNodes] = useState({})
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { t } = useLanguage()

  const load = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const [courseRes, examRes, nodeRes] = await Promise.allSettled([
        api.get('courses/'),
        listTests({ skip: 0, limit: 200 }),
        api.get('nodes/'),
      ])

      if (courseRes.status !== 'fulfilled') {
        throw new Error(t('training_load_error'))
      }

      const nextCourses = (courseRes.value.data || []).filter(isVisibleTrainingCourse)
      let nextTests = []
      let nextNodes = []
      const partialFailures = []

      if (examRes.status === 'fulfilled') {
        nextTests = readPaginatedItems(examRes.value.data).map(normalizeTest)
      } else {
        partialFailures.push('tests')
      }

      if (nodeRes.status === 'fulfilled') {
        nextNodes = nodeRes.value.data || []
      } else {
        partialFailures.push('modules')
      }

      const nodeMap = nextNodes.reduce((acc, node) => {
        const courseNodes = acc[node.course_id] || []
        courseNodes.push(node)
        acc[node.course_id] = courseNodes
        return acc
      }, {})

      setCourses(nextCourses)
      setTests(nextTests)
      setNodes(nodeMap)

      if (partialFailures.length > 0) {
        setNotice(t('training_partial_notice'))
      }
    } catch {
      setCourses([])
      setTests([])
      setNodes({})
      setError(t('training_load_error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const testsForNode = (nodeId) => (tests || []).filter((test) => test.node_id === nodeId)
  const courseTestCount = (courseId) => (nodes[courseId] || []).reduce((count, node) => count + testsForNode(node.id).length, 0)
  const courseModuleCount = (courseId) => (nodes[courseId] || []).length

  const filteredCourses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return courses
    return courses.filter((course) => {
      const courseNodes = nodes[course.id] || []
      const courseTests = courseNodes.flatMap((node) => testsForNode(node.id))
      return [
        course.title,
        course.description,
        ...courseNodes.map((node) => node.title),
        ...courseTests.map((test) => test.title),
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(normalizedSearch)
    })
  }, [courses, nodes, tests, search])

  const totalModules = courses.reduce((count, course) => count + courseModuleCount(course.id), 0)
  const totalTests = courses.reduce((count, course) => count + courseTestCount(course.id), 0)
  const hasActiveFilters = Boolean(search.trim())
  const summaryCards = [
    {
      label: t('training_courses'),
      value: courses.length,
      helper: t('training_available_collections'),
    },
    {
      label: t('training_visible_now'),
      value: filteredCourses.length,
      helper: hasActiveFilters ? t('training_matching_search') : t('training_all_available'),
    },
    {
      label: t('training_modules'),
      value: totalModules,
      helper: t('training_modules_loaded'),
    },
    {
      label: t('training_linked_tests'),
      value: totalTests,
      helper: t('training_tests_attached'),
    },
  ]

  const clearFilters = () => {
    setSearch('')
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('training_title')}</h1>
          {!loading && !error && (
            <p className={styles.subtitle}>{courses.length} {courses.length === 1 ? t('training_course_singular') : t('training_course_plural')} {t('training_available_label')}</p>
          )}
        </div>
        {!loading && (
          <button type="button" className={styles.retryBtn} onClick={() => void load()}>
            {t('refresh')}
          </button>
        )}
      </div>
      <section className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </article>
        ))}
      </section>
      <div className={styles.toolbar}>
        <div className={styles.searchGroup}>
          <label className={styles.filterLabel} htmlFor="training-course-search">{t('training_search_courses')}</label>
          <input
            id="training-course-search"
            className={styles.searchInput}
            type="text"
            placeholder={t('training_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={loading}
          />
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.retryBtn} onClick={() => void load()} disabled={loading}>
            {loading ? t('refreshing') : t('refresh')}
          </button>
          <button type="button" className={styles.retryBtn} onClick={clearFilters} disabled={!hasActiveFilters}>
            {t('clear_filters')}
          </button>
        </div>
      </div>
      {!loading && !error && (
        <div className={styles.filterMeta}>
          {t('showing')} {filteredCourses.length} {filteredCourses.length === 1 ? t('training_course_singular') : t('training_course_plural')} {t('training_across')} {courses.length} {t('training_available_label')}.
        </div>
      )}
      {loading && <div className={styles.empty}>{t('training_loading')}</div>}
      {!loading && error && <div className={styles.errorBanner}>{error}</div>}
      {!loading && error && (
        <button type="button" className={styles.retryBtn} onClick={() => void load()}>
          {t('retry')}
        </button>
      )}
      {!loading && !error && notice && <div className={styles.noticeBanner}>{notice}</div>}
      {!loading && !error && filteredCourses.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{hasActiveFilters ? t('training_no_match') : t('training_no_courses')}</div>
          <div className={styles.emptyText}>
            {hasActiveFilters
              ? t('training_clear_search_hint')
              : t('training_assigned_appear')}
          </div>
          {hasActiveFilters && (
            <button type="button" className={styles.retryBtn} onClick={clearFilters}>
              {t('clear_filters')}
            </button>
          )}
        </div>
      )}
      <div className={styles.grid}>
        {!loading && !error && filteredCourses.map(c => (
          <div key={c.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.courseTitleRow}>
                <div className={styles.courseTitle}>{c.title}</div>
                <span className={styles.countBadge}>{courseTestCount(c.id)} {t('training_tests')}</span>
              </div>
              <div className={styles.courseSub}>{c.description || t('training_no_description')}</div>
              <div className={styles.courseMeta}>
                <span>{courseModuleCount(c.id)} {courseModuleCount(c.id) === 1 ? t('training_module_singular') : t('training_module_plural')}</span>
                <span>{courseTestCount(c.id)} {courseTestCount(c.id) === 1 ? t('training_linked_test_singular') : t('training_linked_test_plural')}</span>
              </div>
            </div>
            <div className={styles.modules}>
              {(nodes[c.id] || []).length === 0 && (
                <div className={styles.moduleEmpty}>{t('training_no_modules')}</div>
              )}
              {(nodes[c.id] || []).map(n => (
                <div key={n.id} className={styles.module}>
                  <div className={styles.moduleHeader}>
                    <div className={styles.moduleTitle}>{n.title}</div>
                    <span className={styles.countBadge}>{testsForNode(n.id).length} {t('training_tests')}</span>
                  </div>
                  <div className={styles.exams}>
                    {testsForNode(n.id).map((test) => (
                      <button key={test.id} type="button" className={styles.examBtn} onClick={() => navigate(`/tests/${test.id}`)}>
                        {test.title}
                      </button>
                    ))}
                    {testsForNode(n.id).length === 0 && <span className={styles.empty}>{t('training_no_tests')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
