import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

export default function AdminAttemptVideos() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(null)
  const [videos, setVideos] = useState([])
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [selectedVideoName, setSelectedVideoName] = useState('')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    if (!attemptId || attemptId === 'undefined' || attemptId === 'null') {
      setError('Invalid attempt id')
      setLoading(false)
      return
    }

    let off = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [{ data: attemptData }, { data: videosData }, { data: eventsData }] = await Promise.all([
          adminApi.getAttempt(attemptId),
          adminApi.listAttemptVideos(attemptId),
          adminApi.getAttemptEvents(attemptId),
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
  }, [attemptId, navigate])

  const selectedVideo = useMemo(
    () => videos.find((v) => v.name === selectedVideoName) || videos[0] || null,
    [videos, selectedVideoName],
  )

  const selectedVideoUrl = selectedVideo ? toAbsoluteMediaUrl(selectedVideo.url) : ''

  const warningEvents = useMemo(
    () => (events || []).filter((e) => WARN_SEVERITIES.has(e.severity)),
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
      .sort((a, b) => a.second - b.second)
  }, [warningEvents, anchorStartMs])

  const warningCounts = useMemo(() => {
    let high = 0
    let medium = 0
    for (const e of warningEvents) {
      if (e.severity === 'HIGH') high += 1
      else if (e.severity === 'MEDIUM') medium += 1
    }
    return { high, medium, total: high + medium }
  }, [warningEvents])

  const timelineSegments = useMemo(() => {
    const bucketCount = 120
    const safeDuration = duration > 0 ? duration : Math.max(60, ...warningTimelineEvents.map((e) => e.second + 1), 60)
    const buckets = Array.from({ length: bucketCount }, () => ({ level: 0, count: 0 }))

    for (const e of warningTimelineEvents) {
      const normalized = Math.min(0.9999, Math.max(0, e.second / safeDuration))
      const idx = Math.floor(normalized * bucketCount)
      const level = e.severity === 'HIGH' ? 2 : 1
      buckets[idx].level = Math.max(buckets[idx].level, level)
      buckets[idx].count += 1
    }

    return { buckets, safeDuration }
  }, [duration, warningTimelineEvents])

  const seekTo = (second) => {
    if (!videoRef.current) return
    const target = Math.max(0, Math.min(second, duration || second))
    videoRef.current.currentTime = target
    setCurrentTime(target)
  }

  if (loading) return <div className={styles.page}>Loading recordings...</div>

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>Back</button>
        <div>
          <h2>Attempt Recordings</h2>
          <p>
            Attempt: <strong>{String(attemptId).slice(0, 8)}</strong>
            {attempt?.user_name ? ` - User: ${attempt.user_name}` : ''}
            {attempt?.exam_title ? ` - Test: ${attempt.exam_title}` : ''}
          </p>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {videos.length === 0 ? (
        <div className={styles.empty}>No video recordings are saved yet for this attempt.</div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.playerCard}>
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

            <video
              key={selectedVideo?.name}
              ref={videoRef}
              controls
              preload="metadata"
              className={styles.video}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
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
                      onClick={() => seekTo(sec)}
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
            <h3>Flagged Events</h3>
            {warningTimelineEvents.length === 0 ? (
              <div className={styles.emptySmall}>No warning events detected for this attempt.</div>
            ) : (
              <div className={styles.eventList}>
                {warningTimelineEvents.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    className={styles.eventBtn}
                    onClick={() => seekTo(e.second)}
                  >
                    <span className={`${styles.eventSeverity} ${severityClass(e.severity)}`}>{e.severity}</span>
                    <span className={styles.eventMeta}>{formatSeconds(e.second)} - {e.event_type}</span>
                    <span className={styles.eventDetail}>{e.detail || 'Warning detected'}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
