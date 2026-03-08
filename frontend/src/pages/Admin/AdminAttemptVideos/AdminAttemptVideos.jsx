import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminAttemptVideos.module.scss'

const WARN_SEVERITIES = new Set(['HIGH', 'MEDIUM'])

function toAbsoluteMediaUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/'
  const apiUrl = new URL(rawBase, window.location.origin)
  const mediaBase = `${apiUrl.protocol}//${apiUrl.host}`
  return `${mediaBase}${path.startsWith('/') ? '' : '/'}${path}`
}

function formatSeconds(sec) {
  if (!Number.isFinite(sec)) return '--:--'
  const s = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(s / 60)
  const rs = s % 60
  const h = Math.floor(m / 60)
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(rs).padStart(2, '0')}`
  }
  return `${m}:${String(rs).padStart(2, '0')}`
}

function severityClass(severity) {
  if (severity === 'HIGH') return styles.eventHigh
  if (severity === 'MEDIUM') return styles.eventMedium
  return styles.eventLow
}

function readMediaRangeEnd(ranges) {
  try {
    if (!ranges || ranges.length < 1) return 0
    const end = ranges.end(ranges.length - 1)
    return Number.isFinite(end) && end > 0 ? end : 0
  } catch {
    return 0
  }
}

function readBestVideoDuration(videoEl) {
  if (!videoEl) return 0
  if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    return videoEl.duration
  }
  return Math.max(
    readMediaRangeEnd(videoEl.seekable),
    readMediaRangeEnd(videoEl.buffered),
  )
}

export default function AdminAttemptVideos() {
  const { attemptId } = useParams()
  const [searchParams] = useSearchParams()
  const examIdFilter = searchParams.get('exam_id')
  const inSupervisionMode = !attemptId && Boolean(examIdFilter)
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const durationProbeKeyRef = useRef('')

  // Supervision mode: exam-level attempt picker
  const [examAttempts, setExamAttempts] = useState([])
  const [selectedAttemptId, setSelectedAttemptId] = useState(attemptId || '')
  const activeAttemptId = selectedAttemptId || attemptId
  const hasResolvedAttempt = Boolean(activeAttemptId && activeAttemptId !== 'undefined' && activeAttemptId !== 'null')

  const [loading, setLoading] = useState(true)
  const [attemptsLoading, setAttemptsLoading] = useState(inSupervisionMode)
  const [attempt, setAttempt] = useState(null)
  const [videos, setVideos] = useState([])
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [selectedVideoName, setSelectedVideoName] = useState('')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [retryToken, setRetryToken] = useState(0)
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL')
  const [selectedEventId, setSelectedEventId] = useState('')

  // When in supervision mode (no attemptId, has exam_id), load all attempts for exam
  useEffect(() => {
    if (!inSupervisionMode) {
      setAttemptsLoading(false)
      setExamAttempts([])
      return
    }

    let cancelled = false
    setAttemptsLoading(true)
    setError('')
    adminApi.attempts()
      .then(({ data }) => {
        if (cancelled) return
        const filtered = (data || []).filter(a => String(a.exam_id) === String(examIdFilter))
        setExamAttempts(filtered)
        if (filtered.length > 0) {
          setSelectedAttemptId((current) => current || String(filtered[0].id))
        } else {
          setSelectedAttemptId('')
          setAttempt(null)
          setVideos([])
          setEvents([])
          setSelectedVideoName('')
          setLoading(false)
        }
      })
      .catch((e) => {
        if (cancelled) return
        setExamAttempts([])
        setSelectedAttemptId('')
        setAttempt(null)
        setVideos([])
        setEvents([])
        setSelectedVideoName('')
        setError(e.response?.data?.detail || 'Failed to load attempts for this test')
        setLoading(false)
      })
      .finally(() => {
        if (!cancelled) setAttemptsLoading(false)
      })

    return () => { cancelled = true }
  }, [inSupervisionMode, examIdFilter, retryToken])

  useEffect(() => {
    if (attemptId) {
      setSelectedAttemptId(attemptId)
      setDuration(0)
      setCurrentTime(0)
    }
  }, [attemptId])

  useEffect(() => {
    const resolvedId = activeAttemptId
    if (!resolvedId || resolvedId === 'undefined' || resolvedId === 'null') {
      setAttempt(null)
      setVideos([])
      setEvents([])
      setSelectedVideoName('')
      if (!inSupervisionMode) {
        setError('Invalid attempt id')
      }
      if (!attemptsLoading) setLoading(false)
      return
    }

    let off = false
    async function load() {
      setLoading(true)
      setError('')
      setSelectedVideoName('')
      try {
        const [{ data: attemptData }, { data: videosData }, { data: eventsData }] = await Promise.all([
          adminApi.getAttempt(resolvedId),
          adminApi.listAttemptVideos(resolvedId),
          adminApi.getAttemptEvents(resolvedId),
        ])
        if (off) return
        const sortedVideos = [...(videosData || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setAttempt(attemptData || null)
        setVideos(sortedVideos)
        setEvents(eventsData || [])
        setSelectedVideoName((prev) => prev || (sortedVideos[0]?.name || ''))
      } catch (e) {
        if (off) return
        setError(e.response?.data?.detail || 'Failed to load attempt recordings')
      } finally {
        if (!off) setLoading(false)
      }
    }
    load()
    return () => { off = true }
  }, [activeAttemptId, attemptsLoading, inSupervisionMode, retryToken])

  const selectedVideo = useMemo(
    () => videos.find((v) => v.name === selectedVideoName) || videos[0] || null,
    [videos, selectedVideoName],
  )

  const selectedVideoUrl = selectedVideo ? toAbsoluteMediaUrl(selectedVideo.url) : ''

  const warningEvents = useMemo(
    () => (events || []).filter((e) => e && WARN_SEVERITIES.has(e.severity)),
    [events],
  )

  const anchorStartMs = useMemo(() => {
    if (selectedVideo?.created_at && duration > 0) {
      return new Date(selectedVideo.created_at).getTime() - (duration * 1000)
    }
    return attempt?.started_at ? new Date(attempt.started_at).getTime() : null
  }, [selectedVideo?.created_at, duration, attempt?.started_at])

  const warningTimelineEvents = useMemo(() => {
    return warningEvents
      .map((e) => {
        if (!e) return null
        const eventTime = e.occurred_at ? new Date(e.occurred_at).getTime() : null
        let second = 0
        if (anchorStartMs && eventTime) {
          second = Math.max(0, (eventTime - anchorStartMs) / 1000)
        }
        return {
          ...e,
          second,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.second - b.second)
  }, [warningEvents, anchorStartMs])

  const warningTypeOptions = useMemo(
    () => Array.from(new Set(warningTimelineEvents.map((event) => event.event_type).filter(Boolean))).sort(),
    [warningTimelineEvents],
  )

  const filteredWarningEvents = useMemo(() => (
    warningTimelineEvents.filter((event) => {
      if (severityFilter !== 'ALL' && event.severity !== severityFilter) return false
      if (eventTypeFilter !== 'ALL' && event.event_type !== eventTypeFilter) return false
      return true
    })
  ), [eventTypeFilter, severityFilter, warningTimelineEvents])

  useEffect(() => {
    if (filteredWarningEvents.length === 0) {
      setSelectedEventId('')
      return
    }
    if (!selectedEventId || !filteredWarningEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(filteredWarningEvents[0].id)
    }
  }, [filteredWarningEvents, selectedEventId])

  const selectedEvent = useMemo(
    () => filteredWarningEvents.find((event) => event.id === selectedEventId) || filteredWarningEvents[0] || null,
    [filteredWarningEvents, selectedEventId],
  )

  const warningCounts = useMemo(() => {
    let high = 0
    let medium = 0
    for (const e of filteredWarningEvents) {
      if (e.severity === 'HIGH') high += 1
      else if (e.severity === 'MEDIUM') medium += 1
    }
    return { high, medium, total: high + medium }
  }, [filteredWarningEvents])

  const timelineSegments = useMemo(() => {
    const bucketCount = 120
    const finiteDuration = Number.isFinite(duration) ? duration : 0
    const safeDuration = finiteDuration > 0 ? finiteDuration : Math.max(60, ...filteredWarningEvents.map((e) => (Number.isFinite(e.second) ? e.second + 1 : 1)), 60)
    const buckets = Array.from({ length: bucketCount }, () => ({ level: 0, count: 0 }))

    for (const e of filteredWarningEvents) {
      if (!e || !Number.isFinite(e.second)) continue
      const normalized = Math.min(0.9999, Math.max(0, e.second / safeDuration))
      const idx = Math.floor(normalized * bucketCount)
      if (!Number.isInteger(idx) || idx < 0 || idx >= bucketCount) continue
      const level = e.severity === 'HIGH' ? 2 : 1
      buckets[idx].level = Math.max(buckets[idx].level, level)
      buckets[idx].count += 1
    }

    return { buckets, safeDuration }
  }, [duration, filteredWarningEvents])

  const videoSummaryCards = [
    {
      label: 'Recordings',
      value: videos.length,
      helper: videos.length > 0 ? 'All saved browser recordings for this attempt' : 'No recording files saved yet',
    },
    {
      label: 'Warnings',
      value: warningCounts.total,
      helper: 'Current filtered warning count shown on the timeline',
    },
    {
      label: 'High risk',
      value: warningCounts.high,
      helper: 'High-severity events in the active filter set',
    },
    {
      label: 'Timeline span',
      value: formatSeconds(duration || timelineSegments.safeDuration),
      helper: 'Video or reconstructed event duration currently in view',
    },
  ]

  const seekTo = (second) => {
    if (!videoRef.current) return
    const target = Math.max(0, Math.min(second, duration || second))
    videoRef.current.currentTime = target
    setCurrentTime(target)
  }

  const selectEvent = (event) => {
    if (!event) return
    setSelectedEventId(event.id)
    seekTo(event.second)
  }

  const handleRetry = () => {
    setDuration(0)
    setCurrentTime(0)
    setSelectedEventId('')
    setRetryToken((current) => current + 1)
  }

  const clearFilters = () => {
    setSeverityFilter('ALL')
    setEventTypeFilter('ALL')
  }

  const showEmptyAttemptsState = inSupervisionMode && !attemptsLoading && !hasResolvedAttempt && examAttempts.length === 0 && !error

  const syncDurationFromVideo = useCallback((videoEl) => {
    const nextDuration = readBestVideoDuration(videoEl)
    setDuration(nextDuration > 0 ? nextDuration : 0)
  }, [])

  const probeVideoDuration = useCallback((videoEl) => {
    if (!videoEl) return
    const sourceKey = videoEl.currentSrc || selectedVideoUrl || selectedVideo?.name || ''
    if (!sourceKey || durationProbeKeyRef.current === sourceKey) return
    durationProbeKeyRef.current = sourceKey

    if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
      syncDurationFromVideo(videoEl)
      return
    }

    const originalTime = videoEl.currentTime || 0
    let settled = false
    let timeoutId = null

    const finish = () => {
      if (settled) return
      settled = true
      videoEl.removeEventListener('timeupdate', handleResolvedDuration)
      videoEl.removeEventListener('durationchange', handleResolvedDuration)
      if (timeoutId) window.clearTimeout(timeoutId)
      try {
        videoEl.currentTime = originalTime
      } catch {
        // ignore seek reset failures
      }
      syncDurationFromVideo(videoEl)
    }

    const handleResolvedDuration = () => finish()

    videoEl.addEventListener('timeupdate', handleResolvedDuration, { once: true })
    videoEl.addEventListener('durationchange', handleResolvedDuration, { once: true })

    try {
      videoEl.currentTime = 1e101
      timeoutId = window.setTimeout(finish, 1500)
    } catch {
      finish()
    }
  }, [selectedVideo?.name, selectedVideoUrl, syncDurationFromVideo])

  useEffect(() => {
    durationProbeKeyRef.current = ''
  }, [selectedVideoUrl])

  if (attemptsLoading || (loading && hasResolvedAttempt)) return <div className={`${styles.page} ${styles.loadingState}`}>Loading recordings...</div>

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>Back</button>
        <div className={styles.headContent}>
          <h2>{inSupervisionMode ? 'Supervision Mode' : 'Attempt Recordings'}</h2>
          {inSupervisionMode ? (
            <div className={styles.supervisionRow}>
              <label className={styles.supervisionLabel} htmlFor="attempt-videos-candidate-select">Candidate:</label>
              {examAttempts.length === 0 ? (
                <span className={styles.supervisionHint}>No attempts yet</span>
              ) : (
                <select
                  id="attempt-videos-candidate-select"
                  className={styles.supervisionSelect}
                  value={selectedAttemptId}
                  onChange={e => { setSelectedAttemptId(e.target.value); setDuration(0); setCurrentTime(0) }}
                >
                  {examAttempts.map(a => (
                    <option key={a.id} value={a.id}>{a.user_name || a.user_id || a.id} - {a.status}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <p>
              Attempt: <strong>{String(activeAttemptId).slice(0, 8)}</strong>
              {attempt?.user_name ? ` - User: ${attempt.user_name}` : ''}
              {attempt?.test_title || attempt?.exam_title ? ` - Test: ${attempt?.test_title || attempt?.exam_title}` : ''}
            </p>
          )}
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.refreshBtn} onClick={handleRetry} disabled={loading || attemptsLoading}>
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className={styles.error}>
          <span>{error}</span>
          <button type="button" className={styles.errorAction} onClick={handleRetry}>
            Retry
          </button>
        </div>
      ) : null}

      {showEmptyAttemptsState ? (
        <div className={styles.empty}>No attempts found for this test yet.</div>
      ) : videos.length === 0 ? (
        <div className={styles.empty}>No video recordings are saved yet for this attempt.</div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.playerCard}>
            <div className={styles.summaryGrid}>
              {videoSummaryCards.map((card) => (
                <div key={card.label} className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>{card.label}</div>
                  <div className={styles.summaryValue}>{card.value}</div>
                  <div className={styles.summaryHelper}>{card.helper}</div>
                </div>
              ))}
            </div>
            <div className={styles.playerTop}>
              <label>
                Recording
                <select
                  value={selectedVideo?.name || ''}
                  onChange={(e) => {
                    setSelectedVideoName(e.target.value)
                    setCurrentTime(0)
                    setDuration(0)
                  }}
                >
                  {videos.map((v) => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))}
                </select>
              </label>
              <a href={selectedVideoUrl} target="_blank" rel="noreferrer">Open file</a>
            </div>

            <div className={styles.filterRow}>
              <label>
                Severity
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                  <option value="ALL">All</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                </select>
              </label>
              <label>
                Event type
                <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
                  <option value="ALL">All warnings</option>
                  {warningTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            </div>

            <video
              key={selectedVideo?.name}
              ref={videoRef}
              controls
              preload="metadata"
              className={styles.video}
              onLoadedMetadata={(e) => {
                syncDurationFromVideo(e.currentTarget)
                probeVideoDuration(e.currentTarget)
              }}
              onDurationChange={(e) => syncDurationFromVideo(e.currentTarget)}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime || 0)
                syncDurationFromVideo(e.currentTarget)
              }}
            >
              <source src={selectedVideoUrl} type="video/mp4" />
              <source src={selectedVideoUrl} type="video/webm" />
            </video>

            <div className={styles.timelineWrap}>
              <div className={styles.timelineHeader}>
                <strong>Warning Timeline</strong>
                <span>{formatSeconds(currentTime)} / {formatSeconds(duration)}</span>
              </div>

              <div className={styles.timelineGrid}>
                {timelineSegments.buckets.map((b, i) => {
                  const className = b.level === 2
                    ? `${styles.segment} ${styles.segmentHigh}`
                    : b.level === 1
                      ? `${styles.segment} ${styles.segmentMedium}`
                      : styles.segment
                  const sec = (i / timelineSegments.buckets.length) * timelineSegments.safeDuration
                  return (
                    <button
                      key={`${i}-${b.level}-${b.count}`}
                      type="button"
                      className={className}
                      title={b.count > 0 ? `${b.count} warning(s) around ${formatSeconds(sec)}` : formatSeconds(sec)}
                      onClick={() => {
                        seekTo(sec)
                        const nearest = filteredWarningEvents.reduce((best, event) => {
                          if (!best) return event
                          return Math.abs(event.second - sec) < Math.abs(best.second - sec) ? event : best
                        }, null)
                        if (nearest) setSelectedEventId(nearest.id)
                      }}
                    />
                  )
                })}
              </div>

              <div className={styles.summaryRow}>
                <span className={styles.badgeNeutral}>Warnings: {warningCounts.total}</span>
                <span className={styles.badgeHigh}>High: {warningCounts.high}</span>
                <span className={styles.badgeMedium}>Medium: {warningCounts.medium}</span>
              </div>
            </div>
          </section>

          <aside className={styles.sideCard}>
            <div className={styles.sideHeader}>
              <h3>Flagged Events</h3>
              <button type="button" className={styles.clearBtn} onClick={clearFilters} disabled={severityFilter === 'ALL' && eventTypeFilter === 'ALL'}>
                Clear filters
              </button>
            </div>
            {filteredWarningEvents.length === 0 ? (
              <div className={styles.emptySmall}>
                {warningTimelineEvents.length === 0 ? 'No warning events detected for this attempt.' : 'No warning events match the active filters.'}
              </div>
            ) : (
              <>
                <div className={styles.eventList}>
                  {filteredWarningEvents.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      className={`${styles.eventBtn} ${selectedEventId === e.id ? styles.eventBtnActive : ''}`}
                      onClick={() => selectEvent(e)}
                    >
                      <span className={`${styles.eventSeverity} ${severityClass(e.severity)}`}>{e.severity}</span>
                      <span className={styles.eventMeta}>{formatSeconds(e.second)} - {e.event_type}</span>
                      <span className={styles.eventDetail}>{e.detail || 'Warning detected'}</span>
                    </button>
                  ))}
                </div>
                {selectedEvent && (
                  <div className={styles.eventInspector}>
                    <div className={styles.inspectorHeader}>
                      <span className={`${styles.eventSeverity} ${severityClass(selectedEvent.severity)}`}>{selectedEvent.severity}</span>
                      <span className={styles.inspectorTime}>{formatSeconds(selectedEvent.second)}</span>
                    </div>
                    <div className={styles.inspectorTitle}>{selectedEvent.event_type}</div>
                    <div className={styles.inspectorDetail}>{selectedEvent.detail || 'Warning detected during monitoring.'}</div>
                    <div className={styles.inspectorMeta}>
                      <span>{selectedEvent.occurred_at ? new Date(selectedEvent.occurred_at).toLocaleString() : '-'}</span>
                      <span>{typeof selectedEvent.ai_confidence === 'number' ? `${Math.round(selectedEvent.ai_confidence * 100)}% confidence` : 'Confidence unavailable'}</span>
                    </div>
                    {selectedEvent.meta?.evidence && (
                      <img
                        className={styles.inspectorImage}
                        src={toAbsoluteMediaUrl(selectedEvent.meta.evidence)}
                        alt={`${selectedEvent.event_type} evidence`}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
