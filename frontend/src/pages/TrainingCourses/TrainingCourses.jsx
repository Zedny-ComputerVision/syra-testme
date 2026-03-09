import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listTests } from '../../services/test.service'
import api from '../../services/api'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { readPaginatedItems } from '../../utils/pagination'
import styles from './TrainingCourses.module.scss'

export default function TrainingCourses() {
  const [courses, setCourses] = useState([])
  const [nodes, setNodes] = useState({})
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

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
        throw new Error('Failed to load training courses.')
      }

      const nextCourses = courseRes.value.data || []
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
        setNotice('Some training details are temporarily unavailable. Course information is shown, but module or test links may be incomplete.')
      }
    } catch {
      setCourses([])
      setTests([])
      setNodes({})
      setError('Failed to load training courses.')
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
      label: 'Courses',
      value: courses.length,
      helper: 'Available training collections',
    },
    {
      label: 'Visible now',
      value: filteredCourses.length,
      helper: hasActiveFilters ? 'Matching the active search' : 'All available courses',
    },
    {
      label: 'Modules',
      value: totalModules,
      helper: 'Modules currently loaded across courses',
    },
    {
      label: 'Linked tests',
      value: totalTests,
      helper: 'Tests currently attached to course modules',
    },
  ]

  const clearFilters = () => {
    setSearch('')
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Training Courses</h1>
          {!loading && !error && (
            <p className={styles.subtitle}>{courses.length} course{courses.length === 1 ? '' : 's'} available</p>
          )}
        </div>
        {!loading && (
          <button type="button" className={styles.retryBtn} onClick={() => void load()}>
            Refresh
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
          <label className={styles.filterLabel} htmlFor="training-course-search">Search courses</label>
          <input
            id="training-course-search"
            className={styles.searchInput}
            type="text"
            placeholder="Search course, module, or test..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={loading}
          />
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
      {!loading && !error && (
        <div className={styles.filterMeta}>
          Showing {filteredCourses.length} course{filteredCourses.length === 1 ? '' : 's'} across {courses.length} available.
        </div>
      )}
      {loading && <div className={styles.empty}>Loading courses...</div>}
      {!loading && error && <div className={styles.errorBanner}>{error}</div>}
      {!loading && error && (
        <button type="button" className={styles.retryBtn} onClick={() => void load()}>
          Retry
        </button>
      )}
      {!loading && !error && notice && <div className={styles.noticeBanner}>{notice}</div>}
      {!loading && !error && filteredCourses.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{hasActiveFilters ? 'No courses match the current search.' : 'No courses available.'}</div>
          <div className={styles.emptyText}>
            {hasActiveFilters
              ? 'Clear the current search to restore the loaded courses, modules, and linked tests.'
              : 'Assigned training courses will appear here once they are published to your account.'}
          </div>
          {hasActiveFilters && (
            <button type="button" className={styles.retryBtn} onClick={clearFilters}>
              Clear filters
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
                <span className={styles.countBadge}>{courseTestCount(c.id)} tests</span>
              </div>
              <div className={styles.courseSub}>{c.description || 'No course description provided.'}</div>
              <div className={styles.courseMeta}>
                <span>{courseModuleCount(c.id)} module{courseModuleCount(c.id) === 1 ? '' : 's'}</span>
                <span>{courseTestCount(c.id)} linked test{courseTestCount(c.id) === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className={styles.modules}>
              {(nodes[c.id] || []).length === 0 && (
                <div className={styles.moduleEmpty}>No modules are available for this course right now.</div>
              )}
              {(nodes[c.id] || []).map(n => (
                <div key={n.id} className={styles.module}>
                  <div className={styles.moduleHeader}>
                    <div className={styles.moduleTitle}>{n.title}</div>
                    <span className={styles.countBadge}>{testsForNode(n.id).length} tests</span>
                  </div>
                  <div className={styles.exams}>
                    {testsForNode(n.id).map((test) => (
                      <button key={test.id} type="button" className={styles.examBtn} onClick={() => navigate(`/tests/${test.id}`)}>
                        {test.title}
                      </button>
                    ))}
                    {testsForNode(n.id).length === 0 && <span className={styles.empty}>No tests available</span>}
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
