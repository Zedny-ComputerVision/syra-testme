import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './ProctorOverlay.module.scss'
import { startAudioCapture, stopAudioCapture } from '../../utils/audioCapture'
import { proctoringPing } from '../../services/proctoring.service'
import { requestEntireScreenShare } from '../../utils/screenCapture'

const MAX_VISIBLE_ALERTS = 5
const ALERT_DEDUP_WINDOW_MS = 4000
const VISUAL_FRAME_INTERVAL_FLOOR_MS = 500
const VISUAL_FRAME_INTERVAL_DEFAULT_MS = 750
const STANDARD_CAPTURE_RESOLUTION = { width: 640, height: 480 }
const HIGH_DETAIL_CAPTURE_RESOLUTION = { width: 960, height: 720 }
const DETECTOR_STATUS_LABELS = {
  face_detection: 'Face',
  multi_face: 'Multiple faces',
  object_detection: 'Forbidden objects',
  eye_tracking: 'Eye tracking',
  head_pose_detection: 'Head pose',
  audio_detection: 'Audio',
  mouth_detection: 'Mouth movement',
}

function readNumber(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function getVisualFrameInterval(config) {
  const rawValue = readNumber(config?.frame_interval_ms, VISUAL_FRAME_INTERVAL_DEFAULT_MS)
  const normalized = rawValue > 0 ? rawValue : VISUAL_FRAME_INTERVAL_DEFAULT_MS
  return Math.max(VISUAL_FRAME_INTERVAL_FLOOR_MS, normalized)
}

function needsVideoCapture(config) {
  return Boolean(
    config?.camera_required
    || config?.lighting_required
    || config?.identity_required
    || config?.face_detection
    || config?.multi_face
    || config?.eye_tracking
    || config?.head_pose_detection
    || config?.object_detection
    || config?.mouth_detection
  )
}

function needsAudioCapture(config) {
  return Boolean(config?.mic_required || config?.audio_detection)
}

function needsRealtimeMonitoring(config) {
  return Boolean(
    needsVideoCapture(config)
    || needsAudioCapture(config)
    || config?.screen_capture
    || config?.screen_required
    || (Array.isArray(config?.alert_rules) && config.alert_rules.length > 0)
  )
}

function getCaptureResolution(config) {
  return config?.object_detection ? HIGH_DETAIL_CAPTURE_RESOLUTION : STANDARD_CAPTURE_RESOLUTION
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
  onRegisterSendClientEvent,
  onRegisterWsRawSend,
  onStatusChange,
  onCameraStateChange,
  initialScreenStream,
  config = {},
}) {
  const WS_MAX_ATTEMPTS = 50
  const WS_BASE_DELAY_MS = 2000
  const WS_MAX_DELAY_MS = 15000

  const [status, setStatus] = useState('disconnected')
  const [alerts, setAlerts] = useState([])
  const [cameraError, setCameraError] = useState('')
  const [detectorStatus, setDetectorStatus] = useState({})
  const [detectorStatusReady, setDetectorStatusReady] = useState(false)
  const wsRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const localFrameIntervalRef = useRef(null)
  const screenIntervalRef = useRef(null)
  const hardDarkFrameCountRef = useRef(0)
  const softDarkFrameCountRef = useRef(0)
  const lastLocalCameraAlertRef = useRef(0)
  const cameraDarkRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const intentionalCloseRef = useRef(false)
  const blockingCloseRef = useRef(false)
  const recentAlertRef = useRef(new Map())
  const keepaliveLastMessageRef = useRef(Date.now())
  const systemErrorCooldownRef = useRef(new Map())
  const audioStartedRef = useRef(false)
  // Adaptive frame rate: slow down when calm, speed up on violation
  const adaptiveIntervalRef = useRef(null) // current effective interval ms
  const lastViolationTimeRef = useRef(0)
  const ADAPTIVE_SLOW_MS = 2000   // no violation for 30 s → mild slowdown (was 5000ms)
  const ADAPTIVE_CALM_WINDOW = 30000

  const wsUrl = useMemo(() => {
    const rawBase = import.meta.env.VITE_API_BASE_URL || '/api/'
    let parsed
    try {
      parsed = new URL(rawBase, window.location.origin)
    } catch {
      parsed = new URL('/api/', window.location.origin)
    }
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const basePath = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname
    return `${wsProtocol}//${parsed.host}${basePath}/proctoring/${attemptId}/ws?token=${encodeURIComponent(token || '')}`
  }, [attemptId, token])
  const videoRequired = useMemo(() => needsVideoCapture(config), [config])
  const audioRequired = useMemo(() => needsAudioCapture(config), [config])
  const realtimeMonitoring = useMemo(() => needsRealtimeMonitoring(config), [config])
  const visualFrameInterval = useMemo(() => getVisualFrameInterval(config), [config])
  const audioChunkInterval = useMemo(() => Math.max(250, readNumber(config.audio_chunk_ms, 500)), [config])
  const screenshotIntervalMs = useMemo(() => Math.max(1000, readNumber(config.screenshot_interval_sec, 60) * 1000), [config])
  const screenCaptureEnabled = useMemo(() => Boolean(config.screen_capture), [config.screen_capture])
  const captureResolution = useMemo(() => getCaptureResolution(config), [config])
  const captureJpegQuality = useMemo(() => (config?.object_detection ? 0.82 : 0.75), [config?.object_detection])
  const cameraBlockedLumaHard = useMemo(() => readNumber(config.camera_cover_hard_luma, 20), [config.camera_cover_hard_luma])
  const cameraBlockedLumaSoft = useMemo(() => readNumber(config.camera_cover_soft_luma, 40), [config.camera_cover_soft_luma])
  const cameraBlockedStddevMax = useMemo(() => readNumber(config.camera_cover_stddev_max, 16), [config.camera_cover_stddev_max])
  const cameraBlockedHardConsecutiveFrames = useMemo(
    () => Math.max(1, Math.round(readNumber(config.camera_cover_hard_consecutive_frames, 1))),
    [config.camera_cover_hard_consecutive_frames],
  )
  const cameraBlockedSoftConsecutiveFrames = useMemo(
    () => Math.max(1, Math.round(readNumber(config.camera_cover_soft_consecutive_frames, 2))),
    [config.camera_cover_soft_consecutive_frames],
  )

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  useEffect(() => {
    setDetectorStatus({})
    setDetectorStatusReady(false)
  }, [attemptId])

  const detectorHealth = useMemo(() => (
    Object.entries(DETECTOR_STATUS_LABELS)
      .filter(([key]) => Boolean(config?.[key]))
      .map(([key, label]) => {
        let state = 'pending'
        if (detectorStatusReady) {
          state = detectorStatus[key] === false ? 'degraded' : 'active'
        }
        return { key, label, state }
      })
  ), [config, detectorStatus, detectorStatusReady])
  const detectorIssues = useMemo(
    () => detectorHealth.filter((entry) => entry.state === 'degraded'),
    [detectorHealth],
  )
  const detectorSummary = useMemo(() => {
    if (detectorHealth.length === 0) return ''
    if (!detectorStatusReady) return 'Checking detector availability...'
    if (detectorIssues.length === 0) return 'All enabled detectors are active.'
    return `${detectorIssues.length} detector${detectorIssues.length === 1 ? '' : 's'} unavailable: ${detectorIssues.map((entry) => entry.label).join(', ')}.`
  }, [detectorHealth, detectorIssues, detectorStatusReady])

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
    // Adaptive frame rate: reset to fast interval on any violation
    if (event.severity === 'HIGH' || event.severity === 'MEDIUM') {
      lastViolationTimeRef.current = now
      adaptiveIntervalRef.current = null // will reset to base on next interval tick
    }
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

  const emitRateLimitedSystemError = useCallback((key, detail, cooldownMs = 8000) => {
    const now = Date.now()
    const lastSeen = systemErrorCooldownRef.current.get(key) || 0
    if (now - lastSeen < cooldownMs) return
    systemErrorCooldownRef.current.set(key, now)
    emitSystemError(detail)
  }, [emitSystemError])

  const emitLocalCameraCoveredAlert = useCallback(() => {
    const now = Date.now()
    if (now - lastLocalCameraAlertRef.current <= 6000) return
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
    }).then(handleServerPingResult).catch(() => {
      emitRateLimitedSystemError('camera_dark_ping', 'Unable to sync the blocked-camera alert with the server.')
    })
  }, [attemptId, emitRateLimitedSystemError, handleServerPingResult, pushAlert])

  const analyzeLocalFrame = useCallback(() => {
    if (!videoRef.current) return null
    const { width, height } = captureResolution
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    // Preserve more detail for small-object detection, especially phones.
    ctx.drawImage(videoRef.current, 0, 0, width, height)

    try {
      const image = ctx.getImageData(0, 0, width, height).data
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
      const hardBlocked = avgLuma < cameraBlockedLumaHard
      const softBlocked = hardBlocked || (avgLuma < cameraBlockedLumaSoft && stdDev < cameraBlockedStddevMax)
      hardDarkFrameCountRef.current = hardBlocked ? hardDarkFrameCountRef.current + 1 : 0
      softDarkFrameCountRef.current = softBlocked ? softDarkFrameCountRef.current + 1 : 0
      const blocked = hardDarkFrameCountRef.current >= cameraBlockedHardConsecutiveFrames
        || softDarkFrameCountRef.current >= cameraBlockedSoftConsecutiveFrames
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
    } catch (error) {
      emitRateLimitedSystemError('camera_frame_read', error?.message || 'Unable to inspect the current camera frame for proctoring.', 10000)
    }
    return canvas.toDataURL('image/jpeg', captureJpegQuality).split(',')[1]
  }, [cameraBlockedHardConsecutiveFrames, cameraBlockedLumaHard, cameraBlockedLumaSoft, cameraBlockedSoftConsecutiveFrames, cameraBlockedStddevMax, captureJpegQuality, captureResolution, emitLocalCameraCoveredAlert, emitRateLimitedSystemError, onCameraStateChange])

  // Start camera
  useEffect(() => {
    if (!videoRequired && !audioRequired) {
      setCameraError('')
      onStreamReady?.(null)
      onCameraStateChange?.(false)
      return undefined
    }
    let cancelled = false
    async function startCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoRequired,
          audio: audioRequired,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        setCameraError('')
        onStreamReady?.(stream)
        if (videoRequired && videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {
            emitRateLimitedSystemError('camera_preview', 'Camera stream started, but the preview could not begin playing automatically.')
          })
        }
      } catch (error) {
        if (!cancelled) {
          const blocked = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
          setCameraError(blocked ? 'Camera or microphone access was denied. Proctoring may be incomplete until access is granted.' : 'Unable to start the required camera or microphone stream.')
        }
      }
    }
    startCam()
    return () => {
      cancelled = true
      onStreamReady?.(null)
      onCameraStateChange?.(false)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [audioRequired, emitRateLimitedSystemError, onCameraStateChange, onStreamReady, videoRequired])

  // Retry audio capture when stream becomes ready (fixes race with WebSocket)
  useEffect(() => {
    if (!audioRequired || audioStartedRef.current) return
    const interval = setInterval(() => {
      if (audioStartedRef.current) { clearInterval(interval); return }
      const ws = wsRef.current
      const stream = streamRef.current
      if (ws && ws.readyState === WebSocket.OPEN && stream && stream.getAudioTracks().length > 0) {
        audioStartedRef.current = true
        startAudioCapture(stream, (b64, sampleRate) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'audio', data: b64, sample_rate: sampleRate || 16000 }))
          }
        }, audioChunkInterval).then(() => {
          clearInterval(interval)
        }).catch(() => {
          audioStartedRef.current = false
        })
        clearInterval(interval)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [audioRequired, audioChunkInterval])

  useEffect(() => {
    if (!attemptId || !videoRequired) return
    localFrameIntervalRef.current = setInterval(() => {
      analyzeLocalFrame()
    }, visualFrameInterval)
    return () => {
      if (localFrameIntervalRef.current) clearInterval(localFrameIntervalRef.current)
    }
  }, [attemptId, analyzeLocalFrame, videoRequired, visualFrameInterval])

  // WebSocket connection + frame streaming with exponential-backoff reconnect
  useEffect(() => {
    if (!attemptId || !token || !realtimeMonitoring) {
      setStatus('closed')
      onRegisterScreenShareRequest?.(null)
      onRegisterSendClientEvent?.(null)
      onRegisterWsRawSend?.(null)
      return undefined
    }

    intentionalCloseRef.current = false
    blockingCloseRef.current = false
    reconnectAttemptsRef.current = 0

    function clearFrameIntervals() {
      if (intervalRef.current) {
        // intervalRef may be a setInterval id (number) or our adaptive timer object
        if (typeof intervalRef.current === 'number') {
          clearInterval(intervalRef.current)
        } else if (intervalRef.current?.clear) {
          intervalRef.current.clear()
        }
        intervalRef.current = null
      }
      if (screenIntervalRef.current) { clearInterval(screenIntervalRef.current); screenIntervalRef.current = null }
      audioStartedRef.current = false
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
        if (typeof ImageCapture === 'undefined') {
          emitRateLimitedSystemError('screen_capture_support', 'This browser cannot read shared-screen frames for proctoring.')
          return
        }
        let imageCapture
        try {
          imageCapture = new ImageCapture(track)
        } catch (error) {
          emitRateLimitedSystemError('screen_capture_support', error?.message || 'This browser cannot read shared-screen frames for proctoring.')
          return
        }
        imageCapture.grabFrame().then((bitmap) => {
          scCanvas.width = bitmap.width
          scCanvas.height = bitmap.height
          const ctx = scCanvas.getContext('2d')
          ctx.drawImage(bitmap, 0, 0)
          const dataUrl = scCanvas.toDataURL('image/jpeg', 0.85)
          const b64 = dataUrl.split(',')[1]
          ws.send(JSON.stringify({ type: 'screen', data: b64 }))
        }).catch(() => {
          emitRateLimitedSystemError('screen_capture', 'Unable to capture shared-screen frames. Re-share your full screen if this continues.')
        })
      }, screenshotIntervalMs)
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
      if (screenCaptureEnabled && wsRef.current?.readyState === WebSocket.OPEN) {
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

    function tryStartAudio(ws) {
      if (audioStartedRef.current) return
      const stream = streamRef.current
      if (!stream || stream.getAudioTracks().length === 0) return
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      audioStartedRef.current = true
      startAudioCapture(stream, (b64, sampleRate) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'audio', data: b64, sample_rate: sampleRate || 16000 }))
        }
      }, audioChunkInterval).catch(() => {
        audioStartedRef.current = false
        emitRateLimitedSystemError('audio_capture', 'Unable to capture microphone audio for proctoring.')
      })
    }

    function connect() {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        reconnectAttemptsRef.current = 0
        keepaliveLastMessageRef.current = Date.now()
        setStatus('connected')
        hardDarkFrameCountRef.current = 0
        softDarkFrameCountRef.current = 0
        lastLocalCameraAlertRef.current = 0
        lastViolationTimeRef.current = Date.now()
        adaptiveIntervalRef.current = null
        // Register a function so Proctoring.jsx can send browser-level violations
        onRegisterSendClientEvent?.((evType, severity, detail) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'client_event', event_type: evType, severity, detail }))
          }
        })
        // Register raw JSON send for answer_timing, keystroke_anomaly etc.
        onRegisterWsRawSend?.((payload) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload))
          }
        })
        // Adaptive frame rate: self-rescheduling timer
        let frameTimerRef = { id: null, stopped: false }
        const scheduleNextFrame = () => {
          if (frameTimerRef.stopped) return
          // Stop scheduling if WS is no longer open or closing
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return
          const sinceLast = Date.now() - lastViolationTimeRef.current
          let currentInterval = sinceLast >= ADAPTIVE_CALM_WINDOW
            ? Math.min(ADAPTIVE_SLOW_MS, visualFrameInterval * 1.5)
            : Math.max(VISUAL_FRAME_INTERVAL_FLOOR_MS, visualFrameInterval)
          // Respect server slow_mode signal if active
          if (adaptiveIntervalRef.current != null) {
            currentInterval = Math.max(currentInterval, adaptiveIntervalRef.current)
            // Decay: gradually return to normal after 10 frames
            adaptiveIntervalRef.current = adaptiveIntervalRef.current * 0.9
            if (adaptiveIntervalRef.current <= currentInterval * 0.5) {
              adaptiveIntervalRef.current = null
            }
          }
          frameTimerRef.id = setTimeout(() => {
            if (frameTimerRef.stopped) return
            if (ws.readyState === WebSocket.OPEN && videoRef.current) {
              const base64 = analyzeLocalFrame()
              if (base64) ws.send(JSON.stringify({ type: 'frame', data: base64 }))
            }
            scheduleNextFrame()
          }, currentInterval)
        }
        scheduleNextFrame()
        // WS keepalive: if no message received in 45s, close and reconnect
        // Server heartbeat is every 10s, so 45s = ~4 missed heartbeats before we give up
        const keepaliveInterval = setInterval(() => {
          if (Date.now() - keepaliveLastMessageRef.current > 45000 && ws.readyState === WebSocket.OPEN) {
            ws.close(4000, 'keepalive timeout')
          }
        }, 10000)
        // Store cleanup handle in intervalRef
        intervalRef.current = {
          frameTimerRef,
          clear: () => {
            frameTimerRef.stopped = true
            if (frameTimerRef.id) clearTimeout(frameTimerRef.id)
            clearInterval(keepaliveInterval)
          },
        }

        if (screenCaptureEnabled) {
          startScreenCaptureLoop(screenStreamRef.current)
        }

        // Try to start audio capture (may fail if stream not ready yet — retried in stream useEffect)
        tryStartAudio(ws)
      }

      ws.onmessage = (ev) => {
        keepaliveLastMessageRef.current = Date.now()
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'alert') {
            pushAlert(msg)
            if (msg.event_type === 'PRECHECK_BYPASS_DENIED') {
              blockingCloseRef.current = true
              intentionalCloseRef.current = true
            }
          } else if (msg.type === 'error') {
            if (typeof msg.detail === 'string') {
              if (msg.detail.includes('Object detection model unavailable')) {
                setDetectorStatus((prev) => ({ ...prev, object_detection: false }))
                setDetectorStatusReady(true)
              } else if (msg.detail.includes('Face detection model unavailable')) {
                setDetectorStatus((prev) => ({ ...prev, face_detection: false, multi_face: false }))
                setDetectorStatusReady(true)
              }
            }
            emitSystemError(msg.detail)
          } else if (msg.type === 'detection_status') {
            setDetectorStatus(msg)
            setDetectorStatusReady(true)
            // Server reports which detection modules are actually active
            const disabled = Object.entries(msg)
              .filter(([k, v]) => k !== 'type' && v === false)
              .map(([k]) => k.replace(/_/g, ' '))
            if (disabled.length > 0) {
              emitRateLimitedSystemError(
                'detection_status',
                `Some detectors are disabled (model unavailable): ${disabled.join(', ')}`,
                60000,
              )
            }
          } else if (msg.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }))
            }
          } else if (msg.type === 'slow_mode') {
            // Server is overloaded — temporarily increase frame interval
            const serverInterval = Number(msg.interval_ms)
            if (Number.isFinite(serverInterval) && serverInterval > 0) {
              adaptiveIntervalRef.current = Math.max(serverInterval, VISUAL_FRAME_INTERVAL_FLOOR_MS)
            }
          } else if (msg.type === 'server_shutdown') {
            // Server is shutting down gracefully — will auto-reconnect via onclose
            intentionalCloseRef.current = false
          } else if (msg.type === 'forced_submit') {
            triggerForcedSubmit(msg.detail || 'Test auto-submitted due to violations.')
          }
        } catch (error) {
          emitRateLimitedSystemError('socket_payload', error?.message || 'Received an unexpected proctoring message.', 10000)
        }
      }

      function scheduleReconnect() {
        if (intentionalCloseRef.current) return
        if (reconnectTimerRef.current) return
        if (reconnectAttemptsRef.current >= WS_MAX_ATTEMPTS) {
          setStatus('closed')
          pushAlert({
            severity: 'HIGH',
            event_type: 'PROCTORING_OFFLINE',
            detail: 'Proctoring connection could not be restored. Your answers are still being saved.',
          })
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
        if (wsRef.current === ws) {
          wsRef.current = null
        }
        // Code 1000 = normal closure (server-initiated graceful close)
        if (blockingCloseRef.current || ev.code === 4401 || ev.code === 4403 || ev.code === 4404) {
          intentionalCloseRef.current = true
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
          }
          setStatus('closed')
        } else if (intentionalCloseRef.current || ev.code === 1000) {
          setStatus('closed')
        } else {
          scheduleReconnect()
        }
      }
      ws.onerror = () => {
        console.debug('[ProctorOverlay] WebSocket error, will reconnect')
        // Don't schedule reconnect here — onclose will fire next and handle it
        // Scheduling here too causes double-reconnect or infinite loops on auth rejection
      }
    }

    connect()

    // Bind pre-established screen stream from RulesPage (if available and still live)
    if (initialScreenStream && initialScreenStream.getVideoTracks().some(t => t.readyState === 'live')) {
      bindScreenStream(initialScreenStream)
    }

    return () => {
      intentionalCloseRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      clearFrameIntervals()
      stopAudioCapture()
      // Don't stop screen tracks here — the WS effect re-runs on dep changes
      // (e.g., token refresh) and stopping tracks would kill the screen share
      // mid-exam. Track cleanup is handled by Proctoring.jsx on unmount.
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current)
        screenIntervalRef.current = null
      }
      screenStreamRef.current = null
      onRegisterScreenShareRequest?.(null)
      onRegisterSendClientEvent?.(null)
      onRegisterWsRawSend?.(null)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [analyzeLocalFrame, attemptId, audioChunkInterval, emitRateLimitedSystemError, emitSystemError, initialScreenStream, onForcedSubmit, onRegisterScreenShareRequest, onRegisterSendClientEvent, onRegisterWsRawSend, onScreenStreamReady, pushAlert, realtimeMonitoring, screenCaptureEnabled, screenshotIntervalMs, token, triggerForcedSubmit, visualFrameInterval, wsUrl])

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
        {status === 'connected' ? 'Monitoring active' : status === 'closed' ? 'Connection closed' : reconnectAttemptsRef.current > 0 ? 'Reconnecting...' : 'Connecting...'}
      </div>

      {cameraError && (
        <div className={styles.cameraError}>{cameraError}</div>
      )}

      {detectorHealth.length > 0 && (
        <div className={styles.detectorPanel}>
          <div className={styles.detectorHeader}>
            <span className={styles.detectorTitle}>Detector Health</span>
            <span className={`${styles.detectorSummary} ${detectorIssues.length > 0 ? styles.detectorSummaryWarn : ''}`}>
              {detectorSummary}
            </span>
          </div>
          <div className={styles.detectorGrid}>
            {detectorHealth.map((entry) => (
              <div
                key={entry.key}
                className={`${styles.detectorChip} ${styles[`detectorChip${entry.state.charAt(0).toUpperCase()}${entry.state.slice(1)}`]}`}
              >
                <span className={styles.detectorChipLabel}>{entry.label}</span>
                <span className={styles.detectorChipState}>
                  {entry.state === 'active' ? 'Active' : entry.state === 'degraded' ? 'Unavailable' : 'Checking'}
                </span>
              </div>
            ))}
          </div>
        </div>
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
