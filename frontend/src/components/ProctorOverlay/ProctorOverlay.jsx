import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './ProctorOverlay.module.scss'
import { startAudioCapture, stopAudioCapture } from '../../utils/audioCapture'
import { proctoringPing } from '../../services/proctoring.service'
import { requestEntireScreenShare } from '../../utils/screenCapture'

const MAX_VISIBLE_ALERTS = 5
const ALERT_DEDUP_WINDOW_MS = 4000
const VISUAL_FRAME_INTERVAL_FLOOR_MS = 1000
const VISUAL_FRAME_INTERVAL_CEILING_MS = 1500

function getVisualFrameInterval(config) {
  const rawValue = Number(config?.frame_interval_ms || VISUAL_FRAME_INTERVAL_CEILING_MS)
  const normalized = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : VISUAL_FRAME_INTERVAL_CEILING_MS
  return Math.max(VISUAL_FRAME_INTERVAL_FLOOR_MS, Math.min(VISUAL_FRAME_INTERVAL_CEILING_MS, normalized))
}

function normalizeIncomingAlert(rawAlert) {
  if (!rawAlert || typeof rawAlert !== 'object') return null
  const eventType = String(rawAlert.event_type || rawAlert.type || 'PROCTORING_ALERT').trim().toUpperCase()
  const severity = String(rawAlert.severity || 'LOW').trim().toUpperCase()
  return {
    ...rawAlert,
    type: 'alert',
    event_type: eventType || 'PROCTORING_ALERT',
    severity: severity || 'LOW',
    detail: String(rawAlert.detail || 'Automatic proctoring alert detected.').trim(),
  }
}

export default function ProctorOverlay({
  attemptId,
  token,
  onViolation,
  onForcedSubmit,
  onStreamReady,
  onScreenStreamReady,
  onRegisterScreenShareRequest,
  onStatusChange,
  onCameraStateChange,
  config = {},
}) {
  const CAMERA_BLOCKED_LUMA_HARD = 28
  const CAMERA_BLOCKED_LUMA_SOFT = 44
  const CAMERA_BLOCKED_STDDEV_MAX = 18
  const CAMERA_BLOCKED_CONSECUTIVE_FRAMES = 2

  const WS_MAX_ATTEMPTS = 5
  const WS_BASE_DELAY_MS = 2000
  const WS_MAX_DELAY_MS = 30000

  const [status, setStatus] = useState('disconnected')
  const [alerts, setAlerts] = useState([])
  const [cameraError, setCameraError] = useState('')
  const wsRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const localFrameIntervalRef = useRef(null)
  const screenIntervalRef = useRef(null)
  const darkFrameCountRef = useRef(0)
  const lastLocalCameraAlertRef = useRef(0)
  const cameraDarkRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const intentionalCloseRef = useRef(false)
  const blockingCloseRef = useRef(false)
  const recentAlertRef = useRef(new Map())

  const wsUrl = useMemo(() => {
    const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/'
    let parsed
    try {
      parsed = new URL(rawBase, window.location.origin)
    } catch {
      parsed = new URL('http://127.0.0.1:8000/api/')
    }
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const basePath = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname
    return `${wsProtocol}//${parsed.host}${basePath}/proctoring/${attemptId}/ws?token=${encodeURIComponent(token || '')}`
  }, [attemptId, token])

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  const pushAlert = useCallback((rawAlert) => {
    const event = normalizeIncomingAlert(rawAlert)
    if (!event) return
    const dedupeKey = `${event.event_type}:${event.severity}`
    const now = Date.now()
    const lastSeen = recentAlertRef.current.get(dedupeKey) || 0
    if (now - lastSeen < ALERT_DEDUP_WINDOW_MS) return
    recentAlertRef.current.set(dedupeKey, now)
    setAlerts((prev) => [event, ...prev].slice(0, MAX_VISIBLE_ALERTS))
    onViolation?.(event)
  }, [onViolation])

  const triggerForcedSubmit = useCallback((detail) => {
    intentionalCloseRef.current = true
    pushAlert({
      severity: 'HIGH',
      event_type: 'FORCED_SUBMIT',
      detail: detail || 'Test auto-submitted due to violations.',
    })
    if (onForcedSubmit) {
      void onForcedSubmit(detail)
      return
    }
    window.location.href = `/attempts/${attemptId}`
  }, [attemptId, onForcedSubmit, pushAlert])

  const handleServerPingResult = useCallback((response) => {
    const payload = response?.data ?? response
    if (!payload || typeof payload !== 'object') return
    const serverAlerts = Array.isArray(payload.alerts) ? payload.alerts : []
    serverAlerts.forEach((alert) => pushAlert(alert))
    if (payload.forced_submit) {
      triggerForcedSubmit(payload.submit_reason || 'Test auto-submitted due to violations.')
    }
  }, [pushAlert, triggerForcedSubmit])

  const emitSystemError = useCallback((detail) => {
    pushAlert({
      severity: 'LOW',
      event_type: 'PROCTORING_ERROR',
      detail: String(detail || 'Proctoring service error.').trim(),
    })
  }, [pushAlert])

  const emitLocalCameraCoveredAlert = useCallback(() => {
    const now = Date.now()
    if (now - lastLocalCameraAlertRef.current <= 15000) return
    lastLocalCameraAlertRef.current = now
    const ev = {
      type: 'alert',
      severity: 'HIGH',
      event_type: 'CAMERA_COVERED',
      detail: 'Camera view is blocked or too dark',
      confidence: 0.95,
    }
    pushAlert(ev)
    proctoringPing(attemptId, {
      focus: document.hasFocus(),
      visibility: document.visibilityState,
      blurs: 0,
      fullscreen: !!document.fullscreenElement,
      camera_dark: true,
    }).then(handleServerPingResult).catch(() => {})
  }, [attemptId, handleServerPingResult, pushAlert])

  const analyzeLocalFrame = useCallback(() => {
    if (!videoRef.current) return null
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    canvas.width = 320
    canvas.height = 240
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(videoRef.current, 0, 0, 320, 240)

    try {
      const image = ctx.getImageData(0, 0, 320, 240).data
      let total = 0
      let totalSq = 0
      let samples = 0
      for (let i = 0; i < image.length; i += (4 * 32)) {
        const luma = (image[i] + image[i + 1] + image[i + 2]) / 3
        total += luma
        totalSq += luma * luma
        samples += 1
      }
      const avgLuma = samples > 0 ? total / samples : 255
      const variance = samples > 0 ? Math.max(0, (totalSq / samples) - (avgLuma * avgLuma)) : 0
      const stdDev = Math.sqrt(variance)
      const frameLooksBlocked = avgLuma < CAMERA_BLOCKED_LUMA_HARD || (avgLuma < CAMERA_BLOCKED_LUMA_SOFT && stdDev < CAMERA_BLOCKED_STDDEV_MAX)
      if (frameLooksBlocked) darkFrameCountRef.current += 1
      else darkFrameCountRef.current = 0
      const blocked = darkFrameCountRef.current >= CAMERA_BLOCKED_CONSECUTIVE_FRAMES
      if (cameraDarkRef.current !== blocked) {
        cameraDarkRef.current = blocked
        onCameraStateChange?.(blocked)
        if (blocked) {
          emitLocalCameraCoveredAlert()
        }
      }
      if (blocked) {
        emitLocalCameraCoveredAlert()
      }
    } catch (_) {}
    return canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
  }, [CAMERA_BLOCKED_CONSECUTIVE_FRAMES, CAMERA_BLOCKED_LUMA_HARD, CAMERA_BLOCKED_LUMA_SOFT, CAMERA_BLOCKED_STDDEV_MAX, emitLocalCameraCoveredAlert, onCameraStateChange])

  // Start camera
  useEffect(() => {
    let cancelled = false
    async function startCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        onStreamReady?.(stream)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        if (!cancelled) setCameraError('Camera access denied. Proctoring may be incomplete.')
      }
    }
    startCam()
    return () => {
      cancelled = true
      onStreamReady?.(null)
      onCameraStateChange?.(false)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onCameraStateChange, onStreamReady])

  useEffect(() => {
    if (!attemptId) return
    const tickMs = getVisualFrameInterval(config)
    localFrameIntervalRef.current = setInterval(() => {
      analyzeLocalFrame()
    }, tickMs)
    return () => {
      if (localFrameIntervalRef.current) clearInterval(localFrameIntervalRef.current)
    }
  }, [attemptId, config.frame_interval_ms, analyzeLocalFrame])

  // WebSocket connection + frame streaming with exponential-backoff reconnect
  useEffect(() => {
    if (!attemptId || !token) return

    intentionalCloseRef.current = false
    blockingCloseRef.current = false
    reconnectAttemptsRef.current = 0

    function clearFrameIntervals() {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      if (screenIntervalRef.current) { clearInterval(screenIntervalRef.current); screenIntervalRef.current = null }
    }

    function startScreenCaptureLoop(screenStream) {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current)
        screenIntervalRef.current = null
      }
      const track = screenStream?.getVideoTracks?.()[0]
      if (!track) return
      const scCanvas = document.createElement('canvas')
      screenIntervalRef.current = setInterval(() => {
        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN || track.readyState !== 'live') return
        const imageCapture = new ImageCapture(track)
        imageCapture.grabFrame().then((bitmap) => {
          scCanvas.width = bitmap.width
          scCanvas.height = bitmap.height
          const ctx = scCanvas.getContext('2d')
          ctx.drawImage(bitmap, 0, 0)
          const dataUrl = scCanvas.toDataURL('image/jpeg', 0.6)
          const b64 = dataUrl.split(',')[1]
          ws.send(JSON.stringify({ type: 'screen', data: b64 }))
        }).catch(() => {})
      }, (config.screenshot_interval_sec || 60) * 1000)
    }

    function bindScreenStream(screenStream) {
      if (!screenStream) return null
      screenStreamRef.current = screenStream
      onScreenStreamReady?.(screenStream)
      const track = screenStream.getVideoTracks()[0] || null
      if (track) {
        track.onended = () => {
          if (screenIntervalRef.current) {
            clearInterval(screenIntervalRef.current)
            screenIntervalRef.current = null
          }
          if (screenStreamRef.current === screenStream) {
            screenStreamRef.current = null
            onScreenStreamReady?.(null)
          }
        }
      }
      if (config.screen_capture && wsRef.current?.readyState === WebSocket.OPEN) {
        startScreenCaptureLoop(screenStream)
      }
      return screenStream
    }

    function stopScreenStream() {
      const current = screenStreamRef.current
      if (!current) {
        onScreenStreamReady?.(null)
        return
      }
      screenStreamRef.current = null
      current.getTracks().forEach((track) => track.stop())
      onScreenStreamReady?.(null)
    }

    function ensureScreenStream() {
      const existing = screenStreamRef.current
      if (existing && existing.getVideoTracks().some((track) => track.readyState === 'live')) {
        return Promise.resolve(existing)
      }
      return requestEntireScreenShare().then(bindScreenStream)
    }

    onRegisterScreenShareRequest?.(() => ensureScreenStream())

    function connect() {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setStatus('connected')
        darkFrameCountRef.current = 0
        lastLocalCameraAlertRef.current = 0
        const frameInterval = getVisualFrameInterval(config)
        intervalRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN || !videoRef.current) return
          const base64 = analyzeLocalFrame()
          if (!base64) return
          ws.send(JSON.stringify({ type: 'frame', data: base64 }))
        }, frameInterval)

        if (config.screen_capture) {
          startScreenCaptureLoop(screenStreamRef.current)
        }

        const stream = streamRef.current
        if (stream && stream.getAudioTracks().length > 0) {
          startAudioCapture(stream, (b64) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'audio', data: b64 }))
            }
          }, config.audio_chunk_ms || 3000).catch(() => {})
        }
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'alert') {
            pushAlert(msg)
            if (msg.event_type === 'PRECHECK_BYPASS_DENIED') {
              blockingCloseRef.current = true
              intentionalCloseRef.current = true
            }
          } else if (msg.type === 'error') {
            emitSystemError(msg.detail)
          } else if (msg.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }))
            }
          } else if (msg.type === 'forced_submit') {
            triggerForcedSubmit(msg.detail || 'Test auto-submitted due to violations.')
          }
        } catch (_) {}
      }

      function scheduleReconnect() {
        if (intentionalCloseRef.current) return
        if (reconnectAttemptsRef.current >= WS_MAX_ATTEMPTS) {
          setStatus('closed')
          return
        }
        const delay = Math.min(WS_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current, WS_MAX_DELAY_MS)
        reconnectAttemptsRef.current += 1
        setStatus('disconnected')
        clearFrameIntervals()
        stopAudioCapture()
        reconnectTimerRef.current = setTimeout(connect, delay)
      }

      ws.onclose = (ev) => {
        // Code 1000 = normal closure (server-initiated graceful close)
        if (blockingCloseRef.current || ev.code === 4401 || ev.code === 4403 || ev.code === 4404) {
          setStatus('closed')
        } else if (intentionalCloseRef.current || ev.code === 1000) {
          setStatus('closed')
        } else {
          scheduleReconnect()
        }
      }
      ws.onerror = () => {
        emitSystemError('Proctoring connection encountered an error.')
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      intentionalCloseRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      clearFrameIntervals()
      stopAudioCapture()
      stopScreenStream()
      onRegisterScreenShareRequest?.(null)
      wsRef.current?.close()
    }
  }, [attemptId, token, wsUrl, config, analyzeLocalFrame, emitSystemError, onForcedSubmit, onRegisterScreenShareRequest, onScreenStreamReady, pushAlert, triggerForcedSubmit])

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Proctoring</span>
        <span className={`${styles.dot} ${styles[status]}`} title={status} />
      </div>

      <div className={styles.videoWrap}>
        <video ref={videoRef} autoPlay muted playsInline className={styles.video} />
      </div>

      <div className={styles.statusText}>
        {status === 'connected' ? 'Monitoring active' : status === 'closed' ? 'Connection closed' : reconnectAttemptsRef.current > 0 ? `Reconnecting... (${reconnectAttemptsRef.current}/${WS_MAX_ATTEMPTS})` : 'Connecting...'}
      </div>

      {cameraError && (
        <div className={styles.cameraError}>{cameraError}</div>
      )}

      {alerts.length > 0 && (
        <div className={styles.alerts}>
          <div className={styles.alertsLabel}>Recent Alerts</div>
          {alerts.map((a, idx) => (
            <div key={idx} className={`${styles.alert} ${styles['alert' + a.severity]}`}>
              <strong>{a.severity}</strong> {a.event_type}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
