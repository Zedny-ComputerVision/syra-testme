import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import { fetchAuthenticatedMediaObjectUrl, revokeObjectUrl } from '../../../utils/authenticatedMedia'
import { readPaginatedItems } from '../../../utils/pagination'
import styles from './AdminAttemptVideos.module.scss'

const WARN_SEVERITIES = new Set(['HIGH', 'MEDIUM'])
const NOT_READY_VIDEO_STATUSES = new Set(['queued', 'pending', 'uploading', 'processing', 'inprogress', 'error', 'failed'])

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

function formatVideoSource(source) {
  if (source === 'screen') return 'Screen'
  if (source === 'camera') return 'Camera'
  return 'Recording'
}

function isAbsoluteHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim())
}

function isHlsPlaybackUrl(url, playbackType) {
  if (playbackType === 'hls') return true
  return /\.m3u8($|\?)/i.test(String(url || ''))
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

function readVideoDurationValue(video) {
  const value = Number(video?.duration)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeVideoStatus(video) {
  return String(video?.status || '').trim().toLowerCase()
}

function isVideoPlayable(video) {
  if (!video?.url) return false
  const status = normalizeVideoStatus(video)
  if (status && NOT_READY_VIDEO_STATUSES.has(status)) return false
  return video.ready_to_stream !== false
}

function describeVideoAvailability(video) {
  const status = normalizeVideoStatus(video)
  if (status === 'processing' || status === 'uploading' || status === 'queued' || status === 'pending' || status === 'inprogress') {
    return 'This recording is still processing. Refresh in a moment.'
  }
  if (status === 'error' || status === 'failed') {
    return 'This recording failed to process and cannot be played.'
  }
  if (!video?.url) {
    return 'This recording does not have a playable file yet.'
  }
  if (video?.ready_to_stream === false) {
    return 'This recording is not ready to stream yet.'
  }
  return 'Loading recording...'
}

export default function AdminAttemptVideos() {
  const { attemptId } = useParams()
  const [searchParams] = useSearchParams()
  const examIdFilter = searchParams.get('exam_id')
  const inSupervisionMode = !attemptId && Boolean(examIdFilter)
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
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
  const [warning, setWarning] = useState('')
  const [selectedVideoName, setSelectedVideoName] = useState('')
  const [selectedVideoUrl, setSelectedVideoUrl] = useState('')
  const [selectedEvidenceUrl, setSelectedEvidenceUrl] = useState('')
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
    adminApi.attempts({ exam_id: examIdFilter, skip: 0, limit: 200 })
      .then(({ data }) => {
        if (cancelled) return
        const filtered = readPaginatedItems(data)
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
      setWarning('')
      setSelectedVideoName('')
      try {
        const [attemptResult, videosResult, eventsResult] = await Promise.allSettled([
          adminApi.getAttempt(resolvedId),
          adminApi.listAttemptVideos(resolvedId),
          adminApi.getAttemptEvents(resolvedId),
        ])
        if (off) return
        if (attemptResult.status !== 'fulfilled') {
          setAttempt(null)
          setVideos([])
          setEvents([])
          setError(attemptResult.reason?.response?.data?.detail || 'Failed to load attempt recordings')
          return
        }

        const warnings = []
        const attemptData = attemptResult.value.data || null
        const videosData = videosResult.status === 'fulfilled' ? (videosResult.value.data || []) : []
        const eventsData = eventsResult.status === 'fulfilled' ? (eventsResult.value.data || []) : []

        if (videosResult.status !== 'fulfilled') {
          warnings.push('Video recordings could not be loaded. Retry to fetch the saved files.')
        }
        if (eventsResult.status !== 'fulfilled') {
          warnings.push('Warning events could not be loaded. Video playback remains available.')
        }

        const sortedVideos = [...videosData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        const defaultVideo = sortedVideos.find((video) => isVideoPlayable(video)) || sortedVideos[0] || null
        setAttempt(attemptData)
        setVideos(sortedVideos)
        setEvents(eventsData)
        setSelectedVideoName((prev) => (
          prev && sortedVideos.some((video) => video.name === prev)
            ? prev
            : (defaultVideo?.name || '')
        ))
        setWarning(warnings.join(' '))
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
  const selectedVideoIsPlayable = useMemo(
    () => isVideoPlayable(selectedVideo),
    [selectedVideo],
  )
  const effectiveDuration = useMemo(
    () => (duration > 0 ? duration : readVideoDurationValue(selectedVideo)),
    [duration, selectedVideo],
  )
  const selectedVideoUsesHls = useMemo(
    () => isHlsPlaybackUrl(selectedVideoUrl || selectedVideo?.url, selectedVideo?.playback_type),
    [selectedVideo?.playback_type, selectedVideo?.url, selectedVideoUrl],
  )
  const latestPlayableVideosBySource = useMemo(() => {
    const bySource = new Map()
    for (const video of videos) {
      if (!video?.source || bySource.has(video.source)) continue
      const isPlayable = isVideoPlayable(video)
      if (isPlayable) bySource.set(video.source, video)
    }
    return bySource
  }, [videos])

  const warningEvents = useMemo(
    () => (events || []).filter((e) => e && WARN_SEVERITIES.has(e.severity)),
    [events],
  )

  const attemptStartMs = useMemo(() => {
    if (!attempt?.started_at) return null
    const startedAtMs = new Date(attempt.started_at).getTime()
    return Number.isFinite(startedAtMs) ? startedAtMs : null
  }, [attempt?.started_at])

  const selectedVideoRecordedStartMs = useMemo(() => {
    if (!selectedVideo?.recording_started_at) return null
    const recordedStartMs = new Date(selectedVideo.recording_started_at).getTime()
    return Number.isFinite(recordedStartMs) ? recordedStartMs : null
  }, [selectedVideo?.recording_started_at])

  const selectedVideoRecordedEndMs = useMemo(() => {
    if (!selectedVideo?.recording_stopped_at) return null
    const recordedEndMs = new Date(selectedVideo.recording_stopped_at).getTime()
    return Number.isFinite(recordedEndMs) ? recordedEndMs : null
  }, [selectedVideo?.recording_stopped_at])

  const selectedVideoStartMs = useMemo(() => {
    if (selectedVideoRecordedStartMs !== null) return selectedVideoRecordedStartMs
    if (!selectedVideo?.created_at || !(effectiveDuration > 0)) return null
    const createdAtMs = new Date(selectedVideo.created_at).getTime()
    if (!Number.isFinite(createdAtMs)) return null
    return createdAtMs - (effectiveDuration * 1000)
  }, [effectiveDuration, selectedVideo?.created_at, selectedVideoRecordedStartMs])

  const selectedVideoEndMs = useMemo(() => {
    if (selectedVideoRecordedEndMs !== null) return selectedVideoRecordedEndMs
    if (!(selectedVideoStartMs !== null) || !(effectiveDuration > 0)) return null
    return selectedVideoStartMs + (effectiveDuration * 1000)
  }, [effectiveDuration, selectedVideoRecordedEndMs, selectedVideoStartMs])

  const anchorStartMs = selectedVideoStartMs ?? attemptStartMs

  const warningTimelineEvents = useMemo(() => {
    const clipToleranceMs = 1000
    return warningEvents
      .map((e) => {
        if (!e) return null
        const eventTime = e.occurred_at ? new Date(e.occurred_at).getTime() : null
        let second = 0
        if (anchorStartMs && eventTime) {
          second = Math.max(0, (eventTime - anchorStartMs) / 1000)
        }
        const inSelectedVideo = selectedVideoStartMs !== null
          && selectedVideoEndMs !== null
          && eventTime !== null
          ? eventTime >= selectedVideoStartMs - clipToleranceMs && eventTime <= selectedVideoEndMs + clipToleranceMs
          : true
        return {
          ...e,
          second: selectedVideoStartMs !== null && effectiveDuration > 0
            ? Math.max(0, Math.min(effectiveDuration, second))
            : second,
          inSelectedVideo,
          attemptSecond: attemptStartMs && eventTime ? Math.max(0, (eventTime - attemptStartMs) / 1000) : second,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.second - b.second)
  }, [warningEvents, anchorStartMs, attemptStartMs, effectiveDuration, selectedVideoEndMs, selectedVideoStartMs])

  const recordingWarningEvents = useMemo(
    () => warningTimelineEvents.filter((event) => event.inSelectedVideo),
    [warningTimelineEvents],
  )

  const warningTypeOptions = useMemo(
    () => Array.from(new Set(recordingWarningEvents.map((event) => event.event_type).filter(Boolean))).sort(),
    [recordingWarningEvents],
  )

  const filteredWarningEvents = useMemo(() => (
    recordingWarningEvents.filter((event) => {
      if (severityFilter !== 'ALL' && event.severity !== severityFilter) return false
      if (eventTypeFilter !== 'ALL' && event.event_type !== eventTypeFilter) return false
      return true
    })
  ), [eventTypeFilter, recordingWarningEvents, severityFilter])

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

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSelectedVideoUrl('')

    async function loadVideoUrl() {
      if (!selectedVideo) return
      if (!selectedVideoIsPlayable) return
      if (!isAbsoluteHttpUrl(selectedVideo.url)) {
        setWarning((current) => current || 'The selected recording does not have a usable playback URL.')
        return
      }
      try {
        objectUrl = await fetchAuthenticatedMediaObjectUrl(selectedVideo.url)
        if (!active) {
          revokeObjectUrl(objectUrl)
          return
        }
        setSelectedVideoUrl(objectUrl)
      } catch {
        if (active) {
          setWarning((current) => current || 'The selected recording could not be loaded.')
        }
      }
    }

    void loadVideoUrl()
    return () => {
      active = false
      revokeObjectUrl(objectUrl)
    }
  }, [selectedVideo, selectedVideoIsPlayable])

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSelectedEvidenceUrl('')

    async function loadEvidenceUrl() {
      const evidencePath = selectedEvent?.meta?.evidence
      if (!evidencePath) return
      try {
        objectUrl = await fetchAuthenticatedMediaObjectUrl(evidencePath)
        if (!active) {
          revokeObjectUrl(objectUrl)
          return
        }
        setSelectedEvidenceUrl(objectUrl)
      } catch {
        if (active) {
          setWarning((current) => current || 'Evidence screenshots could not be loaded.')
        }
      }
    }

    void loadEvidenceUrl()
    return () => {
      active = false
      revokeObjectUrl(objectUrl)
    }
  }, [selectedEvent?.id, selectedEvent?.meta?.evidence])

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
    const finiteDuration = Number.isFinite(effectiveDuration) ? effectiveDuration : 0
    const maxEventSecond = Math.max(
      0,
      ...filteredWarningEvents.map((e) => (Number.isFinite(e.second) ? e.second : 0)),
    )
    const safeDuration = Math.max(finiteDuration, maxEventSecond + 1, finiteDuration > 0 ? finiteDuration : 1)
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
  }, [effectiveDuration, filteredWarningEvents])

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
      value: formatSeconds(effectiveDuration || timelineSegments.safeDuration),
      helper: 'Video or reconstructed event duration currently in view',
    },
  ]

  const seekTo = (second) => {
    if (!videoRef.current) return
    const target = Math.max(0, Math.min(second, effectiveDuration || second))
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
    setWarning('')
    setRetryToken((current) => current + 1)
  }

  const clearFilters = () => {
    setSeverityFilter('ALL')
    setEventTypeFilter('ALL')
  }

  const goToNextWarning = () => {
    const idx = selectedEvent ? filteredWarningEvents.indexOf(selectedEvent) : -1
    const next = filteredWarningEvents[idx + 1]
    if (next) selectEvent(next)
  }

  const goToPrevWarning = () => {
    const idx = selectedEvent ? filteredWarningEvents.indexOf(selectedEvent) : filteredWarningEvents.length
    const prev = filteredWarningEvents[idx - 1]
    if (prev) selectEvent(prev)
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

  useEffect(() => {
    const videoEl = videoRef.current
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    if (!videoEl || !selectedVideoUrl || !selectedVideoUsesHls) return undefined

    if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = selectedVideoUrl
      return () => {
        if (videoEl.src === selectedVideoUrl) {
          videoEl.removeAttribute('src')
          videoEl.load()
        }
      }
    }

    if (!Hls.isSupported()) {
      setWarning((current) => current || 'This browser cannot play the selected stream.')
      return undefined
    }

    const hls = new Hls()
    hlsRef.current = hls
    hls.loadSource(selectedVideoUrl)
    hls.attachMedia(videoEl)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      syncDurationFromVideo(videoEl)
      probeVideoDuration(videoEl)
    })
    hls.on(Hls.Events.LEVEL_LOADED, () => syncDurationFromVideo(videoEl))
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data?.fatal) {
        setWarning((current) => current || 'The selected stream could not be played.')
      }
    })

    return () => {
      if (hlsRef.current === hls) {
        hls.destroy()
        hlsRef.current = null
      }
    }
  }, [probeVideoDuration, selectedVideoUrl, selectedVideoUsesHls, syncDurationFromVideo])

  if (attemptsLoading || (loading && hasResolvedAttempt)) return <div className={`${styles.page} ${styles.loadingState}`}>Loading recordings...</div>

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <button type="button" className={styles.backBtn} onClick={() => {
          if (window.opener) { window.close(); return }
          if (window.history.length > 1) { navigate(-1); return }
          navigate('/admin/attempt-analysis')
        }}>
          {window.opener ? 'Close tab' : 'Back'}
        </button>
        <div className={styles.headContent}>
          <h2>{inSupervisionMode ? 'Supervision Mode' : 'Video Review'}</h2>
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
            <div className={styles.headMeta}>
              {attempt?.user_name && (
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Candidate</span> {attempt.user_name}
                </span>
              )}
              {(attempt?.test_title || attempt?.exam_title) && (
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Test</span> {attempt.test_title || attempt.exam_title}
                </span>
              )}
              <span className={styles.metaItem}>
                <span className={styles.metaLabel}>Attempt</span> {String(activeAttemptId).slice(0, 8)}
              </span>
              {attempt?.status && (
                <span className={`${styles.statusBadge} ${attempt.status === 'SUBMITTED' || attempt.status === 'GRADED' ? styles.statusDone : attempt.status === 'IN_PROGRESS' ? styles.statusActive : ''}`}>
                  {attempt.status}
                </span>
              )}
              {attempt?.started_at && (
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Started</span> {new Date(attempt.started_at).toLocaleString()}
                </span>
              )}
            </div>
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

      {!error && warning ? (
        <div className={styles.warning}>
          <span>{warning}</span>
          <button type="button" className={styles.warningAction} onClick={handleRetry}>
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
            <div className={styles.statsStrip}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{videos.length}</span>
                <span className={styles.statLabel}>Recordings</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{warningCounts.total}</span>
                <span className={styles.statLabel}>Warnings</span>
              </div>
              <div className={`${styles.statItem} ${warningCounts.high > 0 ? styles.statDanger : ''}`}>
                <span className={styles.statValue}>{warningCounts.high}</span>
                <span className={styles.statLabel}>High risk</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{warningCounts.medium}</span>
                <span className={styles.statLabel}>Medium</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{formatSeconds(effectiveDuration || timelineSegments.safeDuration)}</span>
                <span className={styles.statLabel}>Timeline span</span>
              </div>
            </div>

            <div className={styles.playerTop}>
              <div className={styles.recordingControls}>
                <div className={styles.sourceSwitchRow}>
                  {['camera', 'screen'].map((source) => {
                    const sourceVideo = latestPlayableVideosBySource.get(source)
                    const isActive = sourceVideo?.name && sourceVideo.name === selectedVideo?.name
                    return (
                      <button
                        key={source}
                        type="button"
                        className={`${styles.sourceSwitchBtn} ${isActive ? styles.sourceSwitchBtnActive : ''}`}
                        disabled={!sourceVideo}
                        onClick={() => {
                          if (!sourceVideo) return
                          setSelectedVideoName(sourceVideo.name)
                          setCurrentTime(0)
                          setDuration(readVideoDurationValue(sourceVideo))
                        }}
                      >
                        <span className={styles.sourceSwitchLabel}>{formatVideoSource(source)}</span>
                        <span className={styles.sourceSwitchMeta}>
                          {sourceVideo ? formatSeconds(readVideoDurationValue(sourceVideo)) : 'Not saved'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <label>
                  Recording
                  <select
                    value={selectedVideo?.name || ''}
                    onChange={(e) => {
                      const nextVideo = videos.find((video) => video.name === e.target.value)
                      setSelectedVideoName(e.target.value)
                      setCurrentTime(0)
                      setDuration(readVideoDurationValue(nextVideo))
                    }}
                  >
                    {videos.map((v) => {
                      const suffix = v.ready_to_stream === false || v.status === 'error'
                        ? ` (${v.status || 'unavailable'})`
                        : ''
                      return (
                        <option key={v.name} value={v.name}>{`${formatVideoSource(v.source)} - ${v.name}${suffix}`}</option>
                      )
                    })}
                  </select>
                </label>
              </div>
              {selectedVideoUrl ? (
                <a href={selectedVideoUrl} target="_blank" rel="noreferrer">Open file</a>
              ) : (
                <span className={styles.loadingFile}>{describeVideoAvailability(selectedVideo)}</span>
              )}
            </div>

            <div className={styles.playerViewport}>
              {selectedVideoUrl ? (
                <video
                  key={`${selectedVideo?.name || 'recording'}-${selectedVideoUsesHls ? 'hls' : 'file'}`}
                  ref={videoRef}
                  controls
                  preload="metadata"
                  className={styles.video}
                  src={selectedVideoUsesHls ? undefined : selectedVideoUrl}
                  onLoadedMetadata={(e) => {
                    syncDurationFromVideo(e.currentTarget)
                    probeVideoDuration(e.currentTarget)
                  }}
                  onDurationChange={(e) => syncDurationFromVideo(e.currentTarget)}
                  onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime || 0)
                    syncDurationFromVideo(e.currentTarget)
                  }}
                />
              ) : (
                <div className={styles.videoLoading}>{describeVideoAvailability(selectedVideo)}</div>
              )}
            </div>

            <div className={styles.timelineWrap}>
              <div className={styles.timelineHeader}>
                <strong>Warning Timeline</strong>
                <div className={styles.timelineNav}>
                  <button
                    type="button"
                    className={styles.navBtn}
                    onClick={goToPrevWarning}
                    disabled={!selectedEvent || filteredWarningEvents.indexOf(selectedEvent) <= 0}
                    title="Previous warning"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className={styles.navBtn}
                    onClick={goToNextWarning}
                    disabled={!selectedEvent || filteredWarningEvents.indexOf(selectedEvent) >= filteredWarningEvents.length - 1}
                    title="Next warning"
                  >
                    Next
                  </button>
                  <div className={styles.timeDisplay}>
                    <span className={styles.timeNow}>
                      {formatSeconds(currentTime)} / {formatSeconds(effectiveDuration || timelineSegments.safeDuration)}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={styles.timelineTrack}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={timelineSegments.safeDuration}
                aria-valuenow={currentTime}
                aria-label="Video timeline - click to seek"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  seekTo(pct * timelineSegments.safeDuration)
                }}
              >
                <div
                  className={styles.timelineFill}
                  style={{
                    width: `${timelineSegments.safeDuration > 0 ? Math.min(100, (currentTime / timelineSegments.safeDuration) * 100) : 0}%`,
                  }}
                />

                {filteredWarningEvents.map((event) => {
                  const pct = timelineSegments.safeDuration > 0
                    ? Math.min(99.5, Math.max(0.5, (event.second / timelineSegments.safeDuration) * 100))
                    : 0
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`${styles.warningTick} ${event.severity === 'HIGH' ? styles.warningTickHigh : styles.warningTickMedium}`}
                      style={{ left: `${pct}%` }}
                      title={`${event.severity} - ${event.event_type} - ${formatSeconds(event.second)}`}
                      onClick={(e) => { e.stopPropagation(); selectEvent(event) }}
                    />
                  )
                })}

                <div
                  className={styles.playhead}
                  style={{
                    left: `${timelineSegments.safeDuration > 0 ? Math.min(100, (currentTime / timelineSegments.safeDuration) * 100) : 0}%`,
                  }}
                />
              </div>

              <div className={styles.timeLabels}>
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                  <span
                    key={pct}
                    className={pct === 0 ? styles.timeLabelStart : pct === 1 ? styles.timeLabelEnd : ''}
                    style={{ left: `${pct * 100}%` }}
                  >
                    {formatSeconds(pct * timelineSegments.safeDuration)}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <aside className={styles.sideCard}>
            <div className={styles.sideHeader}>
              <div className={styles.sideHeadLeft}>
                <h3>Exam Events</h3>
                <div className={styles.eventCountRow}>
                  <span className={styles.badgeNeutral}>{warningCounts.total} total</span>
                </div>
              </div>
            </div>

            <div className={styles.eventsFilters}>
              <label>
                Severity
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                  <option value="ALL">All severities</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                </select>
              </label>
              <label>
                Event type
                <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
                  <option value="ALL">All types</option>
                  {warningTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <button type="button" className={styles.clearBtn} onClick={clearFilters} disabled={severityFilter === 'ALL' && eventTypeFilter === 'ALL'}>
                Clear filters
              </button>
            </div>

            {filteredWarningEvents.length === 0 ? (
              <div className={styles.emptySmall}>
                {warningTimelineEvents.length === 0
                  ? 'No warning events detected for this attempt.'
                  : recordingWarningEvents.length === 0
                    ? 'No warning events fall within the selected recording.'
                    : 'No warning events match the active filters.'}
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
                      <div className={styles.eventBtnTop}>
                        <span className={`${styles.eventSeverity} ${severityClass(e.severity)}`}>{e.severity}</span>
                        {typeof e.ai_confidence === 'number' && (
                          <span className={styles.eventConfidence}>{Math.round(e.ai_confidence * 100)}%</span>
                        )}
                        <span className={styles.eventTimestamp}>{formatSeconds(e.second)}</span>
                      </div>
                      <span className={styles.eventMeta}>{e.event_type}</span>
                      <span className={styles.eventDetail}>{e.detail || 'Warning detected'}</span>
                    </button>
                  ))}
                </div>
                {selectedEvent && (
                  <div className={styles.eventInspector}>
                    <div className={styles.inspectorHeader}>
                      <span className={`${styles.eventSeverity} ${severityClass(selectedEvent.severity)}`}>{selectedEvent.severity}</span>
                      <span className={styles.inspectorTime}>
                        Event {filteredWarningEvents.indexOf(selectedEvent) + 1} of {filteredWarningEvents.length} - {formatSeconds(selectedEvent.second)}
                      </span>
                    </div>
                    <div className={styles.inspectorTitle}>{selectedEvent.event_type}</div>
                    <div className={styles.inspectorDetail}>{selectedEvent.detail || 'Warning detected during monitoring.'}</div>
                    <div className={styles.inspectorMeta}>
                      <span>{selectedEvent.occurred_at ? new Date(selectedEvent.occurred_at).toLocaleString() : '-'}</span>
                    </div>
                    <div className={styles.confidenceWrap}>
                      {typeof selectedEvent.ai_confidence === 'number' ? (
                        <>
                          <div className={styles.confidenceLabel}>
                            AI Confidence: {Math.round(selectedEvent.ai_confidence * 100)}%
                          </div>
                          <div className={styles.confidenceTrack}>
                            <div
                              className={styles.confidenceBar}
                              style={{ width: `${Math.round(selectedEvent.ai_confidence * 100)}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className={styles.confidenceLabel}>Confidence unavailable</div>
                      )}
                    </div>
                    {selectedEvent.meta?.evidence && (
                      selectedEvidenceUrl ? (
                        <img
                          className={styles.inspectorImage}
                          src={selectedEvidenceUrl}
                          alt={`${selectedEvent.event_type} evidence`}
                        />
                      ) : (
                        <div className={styles.inspectorImage} />
                      )
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
