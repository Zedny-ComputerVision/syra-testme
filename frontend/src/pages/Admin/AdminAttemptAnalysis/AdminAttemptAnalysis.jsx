import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { fetchAuthenticatedMediaObjectUrl, revokeObjectUrl } from '../../../utils/authenticatedMedia'
import { readPaginatedItems } from '../../../utils/pagination'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminAttemptAnalysis.module.scss'

const TABS = ['Overview', 'Timeline', 'Answers', 'Evidence']

function getSeverityClass(prefix, severity, styles) {
  if (!severity) return ''
  const normalized = `${severity}`.charAt(0).toUpperCase() + `${severity}`.slice(1).toLowerCase()
  return styles[`${prefix}${normalized}`] || ''
}

function formatConfidence(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}% confidence` : 'Confidence unavailable'
}

function resolveError(err, fallback) {
  return (
    err?.response?.data?.detail ||
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.detail ||
    err?.message ||
    fallback
  )
}

function evidenceKeyForEvent(event, index) {
  return String(event?.id || event?.meta?.evidence || index)
}

export default function AdminAttemptAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [attempts, setAttempts] = useState([])
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '')
  const [attempt, setAttempt] = useState(null)
  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('Overview')
  const [listLoading, setListLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState([])
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailWarning, setDetailWarning] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState(null)
  const [evidenceUrls, setEvidenceUrls] = useState({})
  const evidenceUrlsRef = useRef({})
  const [listReloadKey, setListReloadKey] = useState(0)
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadAttempts() {
      setListLoading(true)
      setListError('')

      try {
        const { data } = await adminApi.attempts({ skip: 0, limit: 200 })
        if (cancelled) return

        const rows = readPaginatedItems(data)
        setAttempts(rows)

        if (!searchParams.get('id') && rows.length > 0) {
          setSelectedId(rows[0].id)
          setSearchParams({ id: rows[0].id }, { replace: true })
        }
      } catch (err) {
        if (cancelled) return
        setAttempts([])
        setListError(resolveError(err, 'Failed to load attempts list.'))
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }

    void loadAttempts()

    return () => {
      cancelled = true
    }
  }, [listReloadKey, setSearchParams])

  useEffect(() => {
    setSelectedId(searchParams.get('id') || '')
  }, [searchParams])

  useEffect(() => {
    let cancelled = false

    async function loadAttemptDetails() {
      if (!selectedId) {
        setAttempt(null)
        setEvents([])
        setAnswers([])
        setDetailError('')
        setDetailWarning('')
        setSelectedEvidence(null)
        return
      }

      setLoading(true)
      setDetailError('')
      setDetailWarning('')
      setSelectedEvidence(null)
      setAttempt(null)
      setEvents([])
      setAnswers([])

      const [attemptResponse, eventsResponse, answersResponse] = await Promise.allSettled([
        adminApi.getAttempt(selectedId),
        adminApi.getAttemptEvents(selectedId),
        adminApi.getAttemptAnswers(selectedId),
      ])

      if (cancelled) return

      if (attemptResponse.status !== 'fulfilled') {
        setDetailError(resolveError(attemptResponse.reason, 'Failed to load attempt details.'))
        setLoading(false)
        return
      }

      setAttempt(attemptResponse.value.data || null)
      setEvents(eventsResponse.status === 'fulfilled' ? eventsResponse.value.data || [] : [])
      setAnswers(answersResponse.status === 'fulfilled' ? answersResponse.value.data || [] : [])

      const missingSections = []
      if (eventsResponse.status !== 'fulfilled') missingSections.push('timeline and evidence')
      if (answersResponse.status !== 'fulfilled') missingSections.push('answers')
      if (missingSections.length > 0) {
        setDetailWarning(`Some analysis data could not be loaded (${missingSections.join(', ')}). Retry to refresh.`)
      }

      setLoading(false)
    }

    void loadAttemptDetails()

    return () => {
      cancelled = true
    }
  }, [selectedId, detailReloadKey])

  useEffect(() => {
    evidenceUrlsRef.current = evidenceUrls
  }, [evidenceUrls])

  useEffect(() => {
    return () => {
      Object.values(evidenceUrlsRef.current).forEach(revokeObjectUrl)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const evidenceEvents = events.filter((event) => event?.meta?.evidence)

    if (evidenceEvents.length === 0) {
      setEvidenceUrls((current) => {
        Object.values(current).forEach(revokeObjectUrl)
        return {}
      })
      return undefined
    }

    async function loadEvidenceUrls() {
      const nextEntries = await Promise.all(
        evidenceEvents.map(async (event, index) => {
          const key = evidenceKeyForEvent(event, index)
          try {
            const url = await fetchAuthenticatedMediaObjectUrl(event.meta.evidence)
            return [key, url]
          } catch {
            return [key, '']
          }
        }),
      )

      if (cancelled) {
        nextEntries.forEach(([, url]) => revokeObjectUrl(url))
        return
      }

      setEvidenceUrls((current) => {
        Object.values(current).forEach(revokeObjectUrl)
        return Object.fromEntries(nextEntries)
      })
    }

    void loadEvidenceUrls()

    return () => {
      cancelled = true
    }
  }, [events])

  useEffect(() => {
    if (!selectedEvidence) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') setSelectedEvidence(null)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedEvidence])

  const highCount = events.filter((event) => event.severity === 'HIGH').length
  const medCount = events.filter((event) => event.severity === 'MEDIUM').length
  const lowCount = events.filter((event) => event.severity === 'LOW').length
  const integrity = Math.max(0, 100 - highCount * 18 - medCount * 9 - lowCount * 3)
  const integrityToneClass = integrity >= 70 ? styles.toneGood : integrity >= 40 ? styles.toneWarn : styles.toneBad

  const buildHeatmap = () => {
    if (!attempt?.started_at || events.length === 0) return Array(15).fill(0)
    const start = new Date(attempt.started_at).getTime()
    const end = attempt.submitted_at ? new Date(attempt.submitted_at).getTime() : Date.now()
    const duration = end - start || 1
    const buckets = Array(15).fill(0)

    events.forEach((event) => {
      const timestamp = new Date(event.occurred_at).getTime()
      if (!Number.isFinite(timestamp)) return
      const index = Math.min(14, Math.floor(((timestamp - start) / duration) * 15))
      buckets[index] += 1
    })

    return buckets
  }

  const heatmap = buildHeatmap()
  const maxBucket = Math.max(1, ...heatmap)
  const violationCounts = {}
  events.forEach((event) => {
    const key = event.event_type || 'unknown'
    if (!violationCounts[key]) violationCounts[key] = { type: key, severity: event.severity, count: 0 }
    violationCounts[key].count += 1
  })
  const evidenceEvents = events.filter((event) => event.meta?.evidence)
  const initials = (attempt?.user_name || attempt?.user_id || '??').slice(0, 2).toUpperCase()

  const formatTime = (iso) => {
    if (!iso || !attempt?.started_at) return '-'
    const diff = (new Date(iso) - new Date(attempt.started_at)) / 1000
    const minutes = Math.floor(diff / 60)
    const seconds = Math.floor(diff % 60)
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  const showNoAttempts = !listLoading && !listError && attempts.length === 0
  const showSelectionHint = !listLoading && !listError && attempts.length > 0 && !selectedId

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Attempt Analysis" subtitle="Deep proctoring report" />

      <div className={styles.selector}>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(event) => {
            const nextId = event.target.value
            setSelectedId(nextId)
            setDetailReloadKey(0)
            if (nextId) setSearchParams({ id: nextId })
            else setSearchParams({})
          }}
          disabled={listLoading || attempts.length === 0}
        >
          <option value="">
            {listLoading
              ? 'Loading attempts...'
              : attempts.length === 0
                ? 'No attempts available'
                : 'Select an attempt...'}
          </option>
          {attempts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.test_title || entry.exam_title || 'Test'} - {entry.user_name || entry.user_id || 'User'} ({entry.status})
            </option>
          ))}
        </select>
      </div>

      {listError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{listError}</div>
          <button type="button" className={styles.retryBtn} onClick={() => setListReloadKey((current) => current + 1)} disabled={listLoading}>
            {listLoading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}
      {detailError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{detailError}</div>
          <button type="button" className={styles.retryBtn} onClick={() => setDetailReloadKey((current) => current + 1)} disabled={loading}>
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}
      {detailWarning && <div className={styles.warningBanner}>{detailWarning}</div>}
      {listLoading && <div className={styles.loading}>Loading attempts...</div>}
      {showNoAttempts && <div className={styles.empty}>No attempts are available yet.</div>}
      {showSelectionHint && <div className={styles.empty}>Select an attempt to review its integrity timeline, answers, and evidence.</div>}
      {loading && <div className={styles.loading}>Loading analysis...</div>}

      {!loading && attempt && (
        <>
          <div className={styles.candidateCard}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.candidateInfo}>
              <div className={styles.candidateName}>{attempt.user_name || attempt.user_id}</div>
              <div className={styles.candidateMeta}>
                Started: {attempt.started_at ? new Date(attempt.started_at).toLocaleString() : '-'}
                {attempt.submitted_at && <> | Duration: {formatTime(attempt.submitted_at)}</>}
              </div>
            </div>
            <div className={styles.gaugeWrap}>
              <div className={styles.gaugeLabel}>Integrity</div>
              <div className={`${styles.gaugeValue} ${integrityToneClass}`}>{integrity}%</div>
            </div>
          </div>

          <div className={styles.metricsGrid}>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{attempt.score ?? '-'}</div>
              <div className={styles.metricLabel}>Score</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{events.length}</div>
              <div className={styles.metricLabel}>Violations</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${styles.toneBad}`}>{highCount}</div>
              <div className={styles.metricLabel}>High</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${styles.toneWarn}`}>{medCount}</div>
              <div className={styles.metricLabel}>Medium</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${styles.toneInfo}`}>{lowCount}</div>
              <div className={styles.metricLabel}>Low</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${integrityToneClass}`}>{integrity}%</div>
              <div className={styles.metricLabel}>Integrity</div>
            </div>
          </div>

          <div className={styles.tabs}>
            {TABS.map((tabName) => (
              <button
                key={tabName}
                type="button"
                className={`${styles.tab} ${tab === tabName ? styles.tabActive : ''}`}
                onClick={() => setTab(tabName)}
              >
                {tabName}
              </button>
            ))}
          </div>

          {tab === 'Overview' && (
            <>
              <div className={styles.heatmapWrap}>
                <div className={styles.heatmapTitle}>Activity Heatmap</div>
                <div className={styles.heatmap}>
                  {heatmap.map((value, index) => {
                    const pct = value / maxBucket
                    const toneClass = pct > 0.7 ? styles.heatmapHot : pct > 0.4 ? styles.heatmapWarm : pct > 0 ? styles.heatmapCool : styles.heatmapEmpty
                    const heightClass = pct > 0 ? styles[`heatmapHeight${Math.max(1, Math.min(10, Math.ceil(pct * 10)))}`] : styles.heatmapHeight1

                    return (
                      <div
                        key={index}
                        className={`${styles.heatmapBar} ${toneClass} ${heightClass}`}
                        title={`Bucket ${index + 1}: ${value} events`}
                      />
                    )
                  })}
                </div>
              </div>

              {Object.keys(violationCounts).length > 0 && (
                <table className={styles.violationsTable}>
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Severity</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(violationCounts).map((violation) => (
                      <tr key={violation.type}>
                        <td>{violation.type.replace(/_/g, ' ')}</td>
                        <td>
                          <span className={`${styles.severityBadge} ${getSeverityClass('severity', violation.severity, styles)}`}>
                            {violation.severity}
                          </span>
                        </td>
                        <td>{violation.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === 'Timeline' && (
            <div className={styles.timeline}>
              {events.length === 0 ? (
                <div className={styles.empty}>No events recorded.</div>
              ) : (
                events.map((event, index) => (
                  <div key={`${event.id || event.occurred_at || index}`} className={`${styles.timelineEvent} ${getSeverityClass('event', event.severity, styles)}`}>
                    <div className={styles.eventTime}>{formatTime(event.occurred_at)}</div>
                    <div className={styles.eventContent}>
                      <div className={styles.eventType}>
                        {event.event_type?.replace(/_/g, ' ')}{' '}
                        <span className={`${styles.severityBadge} ${getSeverityClass('severity', event.severity, styles)}`}>{event.severity}</span>
                      </div>
                      <div className={styles.eventDetail}>
                        {event.detail || formatConfidence(event.ai_confidence)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'Answers' && (
            <div>
              {answers.length === 0 ? (
                <div className={styles.empty}>No answers recorded for this attempt.</div>
              ) : (
                <table className={styles.violationsTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question</th>
                      <th>Answer Given</th>
                      <th>Result</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answers.map((answer, index) => {
                      const resultClass = answer.is_correct === true
                        ? styles.answerCorrect
                        : answer.is_correct === false
                          ? styles.answerWrong
                          : styles.answerUnknown
                      const resultText = answer.is_correct === true
                        ? 'Correct'
                        : answer.is_correct === false
                          ? 'Wrong'
                          : '-'

                      return (
                        <tr key={answer.id || index}>
                          <td className={styles.answerIndex}>{index + 1}</td>
                          <td className={styles.questionCell}>{answer.question_text || answer.question_id}</td>
                          <td className={styles.answerCell}>
                            {answer.answer ?? '-'}
                          </td>
                          <td>
                            <span className={resultClass}>{resultText}</span>
                          </td>
                          <td>{answer.points_earned != null ? answer.points_earned : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'Evidence' && (
            <div className={styles.evidenceGrid}>
              {evidenceEvents.length === 0 ? (
                <div className={styles.empty}>No evidence screenshots captured.</div>
              ) : (
                evidenceEvents.map((event, index) => (
                  <button
                    key={`${event.id || event.occurred_at || index}`}
                    type="button"
                    className={styles.evidenceCard}
                    aria-label={`Evidence ${index + 1}`}
                    onClick={() => setSelectedEvidence(event)}
                  >
                    {evidenceUrls[evidenceKeyForEvent(event, index)] ? (
                      <img className={styles.evidenceImg} src={evidenceUrls[evidenceKeyForEvent(event, index)]} alt={`Evidence ${index + 1}`} />
                    ) : (
                      <div className={styles.evidenceImg} />
                    )}
                    <div className={styles.evidenceMeta}>
                      <div className={styles.evidenceMetaTop}>
                        <span className={`${styles.severityBadge} ${getSeverityClass('severity', event.severity, styles)}`}>{event.severity}</span>
                        <span>{formatConfidence(event.ai_confidence)}</span>
                      </div>
                      <div className={styles.evidenceLabel}>{event.event_type?.replace(/_/g, ' ')}</div>
                      <div>{event.detail || 'Evidence captured during proctoring review.'}</div>
                      <div className={styles.evidenceTimestamp}>Captured at {formatTime(event.occurred_at)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}

      {selectedEvidence && (
        <div className={styles.lightboxBackdrop} role="dialog" aria-modal="true" aria-label="Evidence preview" onClick={() => setSelectedEvidence(null)}>
          <div className={styles.lightboxCard} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.lightboxClose} onClick={() => setSelectedEvidence(null)}>
              Close
            </button>
            {evidenceUrls[evidenceKeyForEvent(selectedEvidence, 0)] ? (
              <img
                className={styles.lightboxImg}
                src={evidenceUrls[evidenceKeyForEvent(selectedEvidence, 0)]}
                alt={`${selectedEvidence.event_type?.replace(/_/g, ' ')} evidence`}
              />
            ) : (
              <div className={styles.lightboxImg} />
            )}
            <div className={styles.lightboxMeta}>
              <div className={styles.lightboxHeader}>
                <span className={styles.lightboxTitle}>{selectedEvidence.event_type?.replace(/_/g, ' ')}</span>
                <span className={`${styles.severityBadge} ${getSeverityClass('severity', selectedEvidence.severity, styles)}`}>
                  {selectedEvidence.severity}
                </span>
              </div>
              <div>{selectedEvidence.detail || 'Evidence captured during proctoring review.'}</div>
              <div>{formatConfidence(selectedEvidence.ai_confidence)}</div>
              <div>Captured at {formatTime(selectedEvidence.occurred_at)}</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !attempt && selectedId && !detailError && (
        <div className={styles.empty}>Attempt not found.</div>
      )}
    </div>
  )
}
