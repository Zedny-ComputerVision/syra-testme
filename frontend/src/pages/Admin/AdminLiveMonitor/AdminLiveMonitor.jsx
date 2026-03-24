import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import api from '../../../services/api'
import styles from './AdminLiveMonitor.module.scss'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'
const WS_BASE = API_BASE.replace(/^http/, 'ws').replace(/\/api\/?$/, '/api')

function SessionCard({ session, onWatch }) {
  return (
    <div className={styles.sessionCard}>
      <div className={styles.sessionInfo}>
        <span className={styles.userName}>{session.user_name || 'Unknown'}</span>
        <span className={styles.examTitle}>{session.exam_title || 'Unknown Test'}</span>
        <span className={styles.startedAt}>Started: {session.started_at ? new Date(session.started_at).toLocaleTimeString() : '—'}</span>
        {session.viewers > 0 && <span className={styles.viewers}>{session.viewers} watching</span>}
      </div>
      <button className={styles.watchBtn} onClick={() => onWatch(session.attempt_id)}>
        Watch Live
      </button>
    </div>
  )
}

function LiveViewer({ attemptId, token, onClose }) {
  const canvasRef = useRef(null)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const reconnectCount = useRef(0)
  const intentionalClose = useRef(false)
  const [alerts, setAlerts] = useState([])
  const [summary, setSummary] = useState(null)
  const [sessionInfo, setSessionInfo] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [forceSubmitting, setForceSubmitting] = useState(false)
  const [forceSubmitted, setForceSubmitted] = useState(false)

  const connectWs = useCallback(() => {
    if (!attemptId || !token) return

    const url = `${WS_BASE}/proctoring/admin/live/${attemptId}/ws?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setError('')
      reconnectCount.current = 0
    }

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          const bytes = new Uint8Array(buf)
          if (bytes.length < 2) return
          const jpegData = bytes.slice(1)
          const blob = new Blob([jpegData], { type: 'image/jpeg' })
          const blobUrl = URL.createObjectURL(blob)
          const img = new Image()
          img.onload = () => {
            const canvas = canvasRef.current
            if (!canvas) return
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0)
            URL.revokeObjectURL(blobUrl)
          }
          img.src = blobUrl
        })
        return
      }

      try {
        const data = JSON.parse(event.data)
        if (data.type === 'connected') {
          setSessionInfo(data)
        } else if (data.type === 'alert') {
          setAlerts((prev) => [data, ...prev].slice(0, 50))
        } else if (data.type === 'live_summary') {
          setSummary(data)
        } else if (data.type === 'session_ended') {
          setError('Session ended — learner disconnected.')
          setConnected(false)
          intentionalClose.current = true
        } else if (data.type === 'force_submitted') {
          setForceSubmitted(true)
          setError('Attempt was force-submitted.')
          intentionalClose.current = true
        } else if (data.type === 'error') {
          setError(data.detail || 'Unknown error')
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect with exponential backoff (max 10s), up to 5 attempts
      if (!intentionalClose.current && reconnectCount.current < 5) {
        const delay = Math.min(1000 * 2 ** reconnectCount.current, 10000)
        reconnectCount.current += 1
        setError(`Disconnected. Reconnecting in ${Math.round(delay / 1000)}s...`)
        reconnectTimer.current = setTimeout(connectWs, delay)
      }
    }

    ws.onerror = () => {
      if (!intentionalClose.current) {
        setError('WebSocket connection failed')
      }
    }
  }, [attemptId, token])

  useEffect(() => {
    intentionalClose.current = false
    reconnectCount.current = 0
    connectWs()

    return () => {
      intentionalClose.current = true
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connectWs])

  const handleForceSubmit = async () => {
    if (!window.confirm('Are you sure you want to force-submit this attempt? This cannot be undone.')) return
    setForceSubmitting(true)
    try {
      await api.post(`/proctoring/admin/sessions/${attemptId}/force-submit`)
      setForceSubmitted(true)
      setError('Attempt was force-submitted.')
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to force-submit'
      setError(detail)
    } finally {
      setForceSubmitting(false)
    }
  }

  return (
    <div className={styles.liveViewer}>
      <div className={styles.viewerHeader}>
        <div className={styles.viewerTitle}>
          <span className={`${styles.statusDot} ${connected ? styles.connected : styles.disconnected}`} />
          {sessionInfo?.user_name || 'Loading...'} — {sessionInfo?.exam_title || ''}
        </div>
        <div className={styles.viewerActions}>
          {!forceSubmitted && (
            <button
              className={styles.forceSubmitBtn}
              onClick={handleForceSubmit}
              disabled={forceSubmitting}
            >
              {forceSubmitting ? 'Submitting...' : 'Force Submit'}
            </button>
          )}
          <button className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>

      <div className={styles.viewerBody}>
        <div className={styles.videoPanel}>
          <canvas ref={canvasRef} className={styles.videoCanvas} />
          {!connected && error && <div className={styles.errorOverlay}>{error}</div>}
          {forceSubmitted && <div className={styles.errorOverlay}>Attempt force-submitted</div>}
        </div>

        <div className={styles.sidePanel}>
          {summary && (
            <div className={styles.summaryBox}>
              <h4>Live Stats</h4>
              <div className={styles.statRow}><span>Alerts</span><strong>{summary.alerts_fired || 0}</strong></div>
              <div className={styles.statRow}><span>Risk Score</span><strong>{summary.risk_score || 0}</strong></div>
              <div className={styles.statRow}><span>Face Present</span><strong>{summary.face_present_pct || 0}%</strong></div>
              <div className={styles.statRow}><span>Attention</span><strong>{summary.attention_pct || 0}%</strong></div>
              <div className={styles.statRow}><span>Violation Score</span><strong>{summary.violation_score || 0}</strong></div>
            </div>
          )}

          <div className={styles.alertList}>
            <h4>Recent Alerts</h4>
            {alerts.length === 0 && <p className={styles.noAlerts}>No alerts yet</p>}
            {alerts.map((alert, i) => (
              <div key={i} className={`${styles.alertItem} ${styles[`severity${alert.severity}`]}`}>
                <span className={styles.alertType}>{alert.event_type}</span>
                <span className={styles.alertDetail}>{alert.detail}</span>
                <span className={styles.alertTime}>
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminLiveMonitor() {
  const { tokens } = useAuth()
  const [searchParams] = useSearchParams()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [watchingAttemptId, setWatchingAttemptId] = useState(searchParams.get('attempt') || null)
  const pollRef = useRef(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/proctoring/admin/live')
      setSessions(res.data?.active_sessions || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (watchingAttemptId) return
    fetchSessions()
    pollRef.current = setInterval(fetchSessions, 5000)
    return () => clearInterval(pollRef.current)
  }, [fetchSessions, watchingAttemptId])

  if (watchingAttemptId) {
    return (
      <div className={styles.container}>
        <LiveViewer
          attemptId={watchingAttemptId}
          token={tokens?.access_token}
          onClose={() => setWatchingAttemptId(null)}
        />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Live Proctoring Monitor</h1>
        <p className={styles.subtitle}>
          {sessions.length === 0
            ? 'No active proctoring sessions right now.'
            : `${sessions.length} active session${sessions.length !== 1 ? 's' : ''}`
          }
        </p>
      </div>

      {loading && <p>Loading...</p>}

      <div className={styles.sessionGrid}>
        {sessions.map((session) => (
          <SessionCard
            key={session.attempt_id}
            session={session}
            onWatch={setWatchingAttemptId}
          />
        ))}
      </div>
    </div>
  )
}
