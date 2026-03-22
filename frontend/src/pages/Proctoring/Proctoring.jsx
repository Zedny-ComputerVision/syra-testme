import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ProctorOverlay from '../../components/ProctorOverlay/ProctorOverlay'
import ViolationToast from '../../components/ViolationToast/ViolationToast'
import useAuth from '../../hooks/useAuth'
import { getAttempt, getAttemptAnswers, submitAnswer, submitAttempt } from '../../services/attempt.service'
import { getTestQuestions, getTest } from '../../services/test.service'
import { proctoringPing, reportProctoringVideoUploadProgress, uploadProctoringVideo } from '../../services/proctoring.service'
import { normalizeQuestion, normalizeTest } from '../../utils/assessmentAdapters'
import { getJourneyRequirements, normalizeProctoringConfig } from '../../utils/proctoringRequirements'
import { requestEntireScreenShare, ENTIRE_SCREEN_REQUIRED } from '../../utils/screenCapture'
import { consumeScreenStream } from '../../utils/screenShareState'
import styles from './Proctoring.module.scss'

const DEFAULT_PROCTORING = {
  tab_switch_detect: false,
  fullscreen_enforce: false,
  face_detection: false,
  multi_face: false,
  eye_tracking: false,
  head_pose_detection: false,
  audio_detection: false,
  object_detection: false,
  mouth_detection: false,
  copy_paste_block: false,
  screen_capture: false,
  object_confidence_threshold: 0.5,
  multi_face_min_area_ratio: 0.008,
  max_face_absence_sec: 1.5,
  frame_interval_ms: 500,
  audio_chunk_ms: 2000,
  audio_consecutive_chunks: 2,
  audio_speech_consecutive_chunks: 2,
  audio_speech_min_rms: 0.03,
  audio_speech_baseline_multiplier: 1.35,
  audio_window: 5,
  camera_cover_hard_luma: 20,
  camera_cover_soft_luma: 40,
  camera_cover_stddev_max: 16,
  camera_cover_hard_consecutive_frames: 1,
  camera_cover_soft_consecutive_frames: 2,
  screenshot_interval_sec: 60,
  max_tab_blurs: 0,
}

const VIDEO_UPLOAD_PROGRESS_STEP = 5
const VIDEO_UPLOAD_PROGRESS_INTERVAL_MS = 1000

function clampUploadPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(100, Math.max(0, Math.round(numeric)))
}

function normalizeProctoringAlert(rawAlert) {
  if (!rawAlert || typeof rawAlert !== 'object') return null
  const eventType = String(rawAlert.event_type || rawAlert.type || 'PROCTORING_ALERT').trim().toUpperCase()
  const severity = String(rawAlert.severity || 'LOW').trim().toUpperCase()
  return {
    ...rawAlert,
    event_type: eventType || 'PROCTORING_ALERT',
    severity: severity || 'LOW',
    detail: String(rawAlert.detail || 'Automatic proctoring alert detected.').trim(),
  }
}

function createRecordingController(source) {
  return {
    source,
    recorder: null,
    sessionId: null,
    mimeType: 'video/webm',
    startedAt: null,
    stoppedAt: null,
    finalizing: false,
    finalized: false,
    chunks: [],
    bytesRecorded: 0,
  }
}

function createVideoSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
}

function serializeAnswer(answer) {
  if (Array.isArray(answer)) return JSON.stringify(answer)
  if (answer && typeof answer === 'object') return JSON.stringify(answer)
  return answer
}

function parsePersistedAnswer(rawAnswer) {
  if (typeof rawAnswer !== 'string') return rawAnswer
  const trimmed = rawAnswer.trim()
  if (!trimmed) return ''
  if (!['[', '{', '"'].includes(trimmed[0])) return rawAnswer
  try {
    return JSON.parse(trimmed)
  } catch {
    return rawAnswer
  }
}

function hasAnswerValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value != null
}

function useAutoSave(attemptId, delay = 2000) {
  const pending = useRef({})
  const timer = useRef(null)
  const [saveState, setSaveState] = useState('idle')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [saveError, setSaveError] = useState('')

  const save = useCallback((questionId, answer) => {
    pending.current[questionId] = answer
    setSaveState('pending')
    setSaveError('')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const entries = { ...pending.current }
      pending.current = {}
      const failedEntries = {}
      let hadFailure = false
      setSaveState('saving')
      for (const [qId, ans] of Object.entries(entries)) {
        try {
          await submitAnswer(attemptId, qId, serializeAnswer(ans))
        } catch {
          failedEntries[qId] = ans
          hadFailure = true
        }
      }
      if (hadFailure) {
        pending.current = { ...failedEntries, ...pending.current }
        setSaveState('error')
        setSaveError('Some answers have not been saved yet. They will retry on your next change or submit.')
        return
      }
      setSaveState('saved')
      setLastSavedAt(new Date())
    }, delay)
  }, [attemptId, delay])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const entries = { ...pending.current }
    pending.current = {}
    if (Object.keys(entries).length === 0) return
    const failedEntries = {}
    let hadFailure = false
    setSaveState('saving')
    for (const [qId, ans] of Object.entries(entries)) {
      try {
        await submitAnswer(attemptId, qId, serializeAnswer(ans))
      } catch {
        failedEntries[qId] = ans
        hadFailure = true
      }
    }
    if (hadFailure) {
      pending.current = { ...failedEntries, ...pending.current }
      setSaveState('error')
      setSaveError('Some answers could not be saved before submission. Please wait a moment and try again.')
      throw new Error('Failed to save pending answers')
    }
    setSaveState('saved')
    setLastSavedAt(new Date())
  }, [attemptId])

  return { save, flush, saveState, lastSavedAt, saveError }
}

export default function Proctoring() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const { tokens } = useAuth()

  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(null)
  const [violations, setViolations] = useState({ HIGH: 0, MEDIUM: 0 })
  const [toast, setToast] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitPhase, setSubmitPhase] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [restoreWarning, setRestoreWarning] = useState('')
  const [proctorCfg, setProctorCfg] = useState({})
  const [tabBlurs, setTabBlurs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cameraStream, setCameraStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [cameraRecordingStatus, setCameraRecordingStatus] = useState('idle')
  const [screenRecordingStatus, setScreenRecordingStatus] = useState('disabled')
  const [screenShareBusy, setScreenShareBusy] = useState(false)
  const [screenShareRequestReady, setScreenShareRequestReady] = useState(false)
  const [proctorStatus, setProctorStatus] = useState('connecting')
  const [cameraDark, setCameraDark] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const wsConnectedRef = useRef(false)
  const screenShareRequestRef = useRef(null)
  const screenShareEstablishedRef = useRef(false)
  const screenShareLossHandledRef = useRef(false)
  const screenSharePickerOpenRef = useRef(false)
  const screenShareGraceRef = useRef(false)
  const [screenShareGranted, setScreenShareGranted] = useState(false)
  const [screenShareGateError, setScreenShareGateError] = useState('')
  const [screenShareGateLoading, setScreenShareGateLoading] = useState(false)
  const screenStreamCleanupRef = useRef(null)
  const isMountedRef = useRef(true)

  const { save, flush, saveState, lastSavedAt, saveError } = useAutoSave(attemptId)
  const cameraRecordingRef = useRef(createRecordingController('camera'))
  const screenRecordingRef = useRef(createRecordingController('screen'))
  const wsWarnedRef = useRef(false)
  const lastToastBlursRef = useRef(0)
  const timerExpiredRef = useRef(false)
  const submittedRef = useRef(false)
  const proctorNoticeCooldownRef = useRef(new Map())
  const lastTabSwitchEventRef = useRef(0)
  const preparedRecordingUploadsRef = useRef({})
  const [reloadKey, setReloadKey] = useState(0)
  const sendClientEventRef = useRef(null)
  // Raw WS send (any JSON payload); registered by ProctorOverlay
  const wsRawSendRef = useRef(null)

  // ── Answer timing ─────────────────────────────────────────────────────────
  // Tracks when the current question was first shown so we can report fast answers
  const questionStartTimeRef = useRef(Date.now())

  // ── Keystroke dynamics ────────────────────────────────────────────────────
  // Tracks inter-key intervals inside any text input / textarea
  const lastKeyTimeRef = useRef(0)
  const keyIntervalsRef = useRef([])    // rolling window of inter-key ms values
  const KEY_INTERVAL_WINDOW = 20        // analyse last N key gaps
  const KEY_ANOMALY_THRESHOLD_MS = 50   // avg < 50 ms → suspiciously fast (macro/autofill)
  const lastKeystrokeAlertRef = useRef(0)

  // ── Mouse inactivity ──────────────────────────────────────────────────────
  const lastMouseMoveRef = useRef(Date.now())
  const mouseInactiveAlertedRef = useRef(false)
  const MOUSE_INACTIVE_MS = 120000      // 2 minutes

  // Keep screen stream cleanup ref in sync with state
  useEffect(() => { screenStreamCleanupRef.current = screenStream }, [screenStream])

  useEffect(() => {
    if (!proctorCfg.screen_capture || screenStream || screenShareGranted) return
    const storedStream = consumeScreenStream()
    if (!storedStream) return
    const isLive = storedStream.getVideoTracks?.().some((track) => track.readyState === 'live')
    if (!isLive) {
      storedStream.getTracks?.().forEach((track) => track.stop())
      return
    }
    setScreenStream(storedStream)
    // Don't set screenShareEstablishedRef here — it races with the loss-detection
    // useEffect (which runs in the same render cycle while screenStream is still null).
    // The loss-detection useEffect sets it when screenStream becomes non-null.
    setScreenShareGranted(true)
    setScreenShareGateError('')
  }, [proctorCfg.screen_capture, screenShareGranted, screenStream])

  // If the screen stream dies mid-exam (user clicked "Stop sharing"), re-gate
  useEffect(() => {
    if (screenShareGranted && !screenStream && proctorCfg.screen_capture) {
      // During setup the stream can briefly go null — don't re-gate during grace period
      if (screenShareGraceRef.current || screenSharePickerOpenRef.current) return
      setScreenShareGranted(false)
      setScreenShareGateError('Screen sharing was stopped. You must share your screen again to continue.')
    }
  }, [screenStream, screenShareGranted, proctorCfg.screen_capture])

  // Stop screen tracks on component unmount to prevent orphaned MediaStreams
  useEffect(() => {
    return () => { screenStreamCleanupRef.current?.getTracks?.().forEach(t => t.stop()) }
  }, [])

  // Load attempt, exam, and questions
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      setRestoreWarning('')
      if (!attemptId) {
        setExam(null)
        setQuestions([])
        setAnswers({})
        setLoadError('Invalid attempt link. Return to your attempts list and try again.')
        setLoading(false)
        return
      }
      try {
        const attemptRes = await getAttempt(attemptId)
        const att = attemptRes.data
        const [examRes, qRes, answersRes] = await Promise.allSettled([
          getTest(att.exam_id),
          getTestQuestions(att.exam_id),
          getAttemptAnswers(attemptId),
        ])
        if (cancelled) return
        if (examRes.status !== 'fulfilled' || qRes.status !== 'fulfilled') {
          throw new Error('Failed to load test. Please refresh and try again.')
        }
        const ex = normalizeTest(examRes.value.data)
        if (cancelled) return
        setExam(ex)
        const merged = { ...DEFAULT_PROCTORING, ...normalizeProctoringConfig(ex.proctoring_config || {}) }
        setProctorCfg(merged)

        setQuestions((qRes.value.data || []).map(normalizeQuestion))
        if (answersRes.status === 'fulfilled') {
          setAnswers(
            (answersRes.value.data || []).reduce((acc, answerRow) => {
              acc[answerRow.question_id] = parsePersistedAnswer(answerRow.answer)
              return acc
            }, {})
          )
        } else {
          setAnswers({})
          setRestoreWarning('Previously saved answers could not be restored. New answers will still be saved.')
        }
        if (ex.time_limit_minutes) {
          const started = new Date(att.started_at).getTime()
          const limit = ex.time_limit_minutes * 60
          const elapsed = Math.floor((Date.now() - started) / 1000)
          setTimeLeft(Math.max(0, limit - elapsed))
        }
      } catch (e) {
        if (!cancelled) {
          setExam(null)
          setQuestions([])
          setAnswers({})
          setLoadError(e.response?.data?.detail || e.message || 'Failed to load test. Please refresh and try again.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [attemptId, reloadKey])

  useEffect(() => {
    if (proctorStatus === 'connected') {
      wsWarnedRef.current = false
      wsConnectedRef.current = true
      return
    }
    if (proctorStatus === 'disconnected') {
      // WS is reconnecting — update ref but don't fire an alert.
      // The ProctorOverlay already shows "Reconnecting..." in its status.
      wsConnectedRef.current = false
      return
    }
    if (proctorStatus === 'closed' && wsConnectedRef.current && !wsWarnedRef.current) {
      wsWarnedRef.current = true
      wsConnectedRef.current = false
      setToast({ severity: 'MEDIUM', event_type: 'PROCTORING_CONNECTION', detail: 'Proctoring connection interrupted. Your answers are still being saved.' })
    }
  }, [proctorStatus])

  const journeyRequirements = getJourneyRequirements(proctorCfg)
  const proctoringEnabled = Boolean(
    proctorCfg.tab_switch_detect
    || proctorCfg.fullscreen_enforce
    || proctorCfg.face_detection
    || proctorCfg.multi_face
    || proctorCfg.eye_tracking
    || proctorCfg.head_pose_detection
    || proctorCfg.audio_detection
    || proctorCfg.object_detection
    || proctorCfg.mouth_detection
    || proctorCfg.screen_capture
    || journeyRequirements.systemCheckRequired
    || journeyRequirements.identityRequired
    || (Array.isArray(proctorCfg.alert_rules) && proctorCfg.alert_rules.length > 0)
  )

  const screenShareRequired = Boolean(proctorCfg.screen_capture) && !screenShareGranted
  const requiredRecordingSources = React.useMemo(() => {
    const sources = []
    if (journeyRequirements.cameraRequired) sources.push('camera')
    if (journeyRequirements.screenRequired) sources.push('screen')
    return sources
  }, [journeyRequirements.cameraRequired, journeyRequirements.screenRequired])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleScreenShareGate = useCallback(async () => {
    setScreenShareGateError('')
    setScreenShareGateLoading(true)
    screenSharePickerOpenRef.current = true
    screenShareGraceRef.current = true

    const MAX_SCREEN_SHARE_ATTEMPTS = 2

    for (let attempt = 0; attempt < MAX_SCREEN_SHARE_ATTEMPTS; attempt++) {
      try {
        const stream = await requestEntireScreenShare()
        setScreenStream(stream)
        screenShareEstablishedRef.current = true
        setScreenShareGranted(true)

        // Enter fullscreen after delay — calling requestFullscreen()
        // immediately after getDisplayMedia() can kill the screen share track
        // in some browsers. The delay lets the track stabilize first.
        if (proctorCfg.fullscreen_enforce && !document.fullscreenElement) {
          await new Promise((resolve) => setTimeout(resolve, 800))
          if (stream.getVideoTracks().some((t) => t.readyState === 'live')) {
            try { await document.documentElement.requestFullscreen() } catch { /* non-blocking */ }
          }
          // Verify screen share survived fullscreen transition
          await new Promise((resolve) => setTimeout(resolve, 1000))
          if (!stream.getVideoTracks().some((t) => t.readyState === 'live')) {
            // Screen share died after fullscreen — exit and retry
            if (document.fullscreenElement) {
              try { await document.exitFullscreen() } catch { /* ignore */ }
            }
            stream.getTracks().forEach((t) => t.stop())
            if (attempt < MAX_SCREEN_SHARE_ATTEMPTS - 1) continue
            setScreenShareGateError('Screen sharing stopped after entering fullscreen. Please try again.')
            setScreenShareGranted(false)
            screenShareEstablishedRef.current = false
            break
          }
        }
        // Success — exit retry loop
        break
      } catch (err) {
        if (err.code === ENTIRE_SCREEN_REQUIRED) {
          setScreenShareGateError('You must share your entire screen (not a window or tab). Please try again and select "Entire screen".')
        } else if (err.name === 'NotAllowedError') {
          setScreenShareGateError('Screen sharing was denied. You must share your screen to continue with this test.')
        } else {
          setScreenShareGateError(err.message || 'Failed to start screen sharing. Please try again.')
        }
        break
      }
    }

    screenSharePickerOpenRef.current = false
    screenShareGraceRef.current = true
    window.setTimeout(() => { screenShareGraceRef.current = false }, 5000)
    setScreenShareGateLoading(false)
  }, [proctorCfg.fullscreen_enforce])

  const registerSendClientEvent = useCallback((fn) => {
    sendClientEventRef.current = fn || null
  }, [])

  const registerWsRawSend = useCallback((fn) => {
    wsRawSendRef.current = fn || null
  }, [])

  const handleViolation = useCallback((event) => {
    if (event.severity === 'HIGH' || event.severity === 'MEDIUM') {
      setViolations(prev => ({
        ...prev,
        [event.severity]: prev[event.severity] + 1
      }))
    }
    setToast(event)
  }, [])

  const emitProctoringNotice = useCallback((key, detail, severity = 'LOW', eventType = 'PROCTORING_ERROR', cooldownMs = 8000) => {
    const now = Date.now()
    const lastSeen = proctorNoticeCooldownRef.current.get(key) || 0
    if (now - lastSeen < cooldownMs) return
    proctorNoticeCooldownRef.current.set(key, now)
    const event = {
      severity,
      event_type: eventType,
      detail,
    }
    if (severity === 'HIGH' || severity === 'MEDIUM') {
      handleViolation(event)
      return
    }
    setToast(event)
  }, [handleViolation])

  // Send a browser-level violation. If WS is connected the backend creates a
  // ProctoringEvent and echoes back an alert → handleViolation. If not connected
  // we fall back to a local-only toast.
  const sendBrowserViolation = useCallback((eventType, severity, detail) => {
    if (sendClientEventRef.current) {
      sendClientEventRef.current(eventType, severity, detail)
    } else {
      handleViolation({ event_type: eventType, severity, detail })
    }
  }, [handleViolation])

  const handleAnswer = (questionId, answer) => {
    setShowSubmitConfirm(false)
    setAnswers(prev => ({ ...prev, [questionId]: answer }))
    save(questionId, answer)
    // Report answer timing if question was answered suspiciously fast
    const elapsed = Date.now() - questionStartTimeRef.current
    if (elapsed > 0 && elapsed < 3000 && wsRawSendRef.current) {
      wsRawSendRef.current({
        type: 'answer_timing',
        question_id: questionId,
        question_index: currentIdx,
        elapsed_ms: elapsed,
      })
    }
  }

  const setRecordingStatusForSource = useCallback((source, value) => {
    if (!isMountedRef.current) return
    if (source === 'screen') {
      setScreenRecordingStatus(value)
      return
    }
    setCameraRecordingStatus(value)
  }, [])

  const registerScreenShareRequest = useCallback((requestFn) => {
    screenShareRequestRef.current = requestFn || null
    setScreenShareRequestReady(Boolean(requestFn))
  }, [])

  const requestRequiredScreenShare = useCallback(async () => {
    const requestFn = screenShareRequestRef.current
    if (!requestFn || screenShareBusy) return
    setScreenShareBusy(true)
    setScreenRecordingStatus('checking')
    screenSharePickerOpenRef.current = true
    try {
      await requestFn()
      // Do NOT call requestFullscreen() after screen share — it kills the
      // screen share track. Fullscreen was entered on RulesPage and the
      // screen recording is more important than re-entering fullscreen.
    } catch (error) {
      setScreenRecordingStatus('failed')
      emitProctoringNotice(
        'screen_share_request',
        error?.message || 'Screen sharing could not be started. Choose your entire screen to continue.',
        'MEDIUM',
        'SCREEN_SHARE_REQUIRED',
        5000,
      )
    } finally {
      screenSharePickerOpenRef.current = false
      // Grace period: suppress fullscreen/tab-switch violations for 5s after
      // picker closes so the fullscreen re-entry transition and focus shifts
      // from the picker dialog don't trigger false violations.
      screenShareGraceRef.current = true
      window.setTimeout(() => { screenShareGraceRef.current = false }, 5000)
      setScreenShareBusy(false)
    }
  }, [emitProctoringNotice, screenShareBusy])

  const pickRecorderMimeType = (stream) => {
    const hasAudio = Boolean(stream?.getAudioTracks?.().length)
    const candidates = hasAudio
      ? [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ]
      : [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ]
    const supported = candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m))
    return supported || 'video/webm'
  }

  const startRecordingSession = useCallback(async (stream, source) => {
    if (!attemptId || !stream || !window.MediaRecorder) return
    const recording = source === 'screen' ? screenRecordingRef.current : cameraRecordingRef.current
    if (recording.recorder || recording.sessionId || recording.finalizing) return
    try {
      const mimeType = pickRecorderMimeType(stream)
      recording.mimeType = mimeType
      recording.finalized = false
      recording.sessionId = createVideoSessionId()
      recording.startedAt = new Date().toISOString()
      recording.stoppedAt = null
      recording.chunks = []
      recording.bytesRecorded = 0
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (event) => {
        if (!recording.sessionId || !event.data || event.data.size === 0) return
        recording.chunks.push(event.data)
        recording.bytesRecorded += event.data.size
      }
      recorder.onerror = (e) => {
        setRecordingStatusForSource(source, 'failed')
        const msg = `Recording interrupted (${source}) — your exam continues but video may be incomplete.`
        console.error(`MediaRecorder error (${source}):`, e?.error || e)
        setToast({ severity: 'MEDIUM', event_type: 'RECORDING_ERROR', detail: msg })
        emitProctoringNotice(`recorder_error_${source}`, msg, 'LOW', 'RECORDING_ERROR', 60000)
      }
      recorder.start(2000)
      recording.recorder = recorder
      setRecordingStatusForSource(source, 'recording')
    } catch (error) {
      setRecordingStatusForSource(source, 'failed')
      emitProctoringNotice(`recording_start_${source}`, error?.message || `Unable to start ${source} recording.`, 'LOW')
    }
  }, [attemptId, emitProctoringNotice, setRecordingStatusForSource])

  const prepareSingleRecordingUpload = useCallback(async (source, { required = false } = {}) => {
    const existingPayload = preparedRecordingUploadsRef.current[source]
    if (existingPayload) {
      return existingPayload
    }
    const recording = source === 'screen' ? screenRecordingRef.current : cameraRecordingRef.current
    const recorder = recording.recorder
    const sessionId = recording.sessionId
    if (!recorder && !sessionId) {
      if (required) {
        throw new Error(`Required ${source} recording is not ready yet.`)
      }
      return
    }
    if (recording.finalizing || recording.finalized) return
    recording.finalizing = true
    setRecordingStatusForSource(source, 'saving')
    if (recorder && recorder.state !== 'inactive') {
      // Request final data chunk before stopping to avoid losing the tail end
      try { recorder.requestData?.() } catch (error) {
        console.error(`Failed to request final ${source} recorder data before stopping.`, error)
      }
      // Brief wait for the final dataavailable event to fire
      await new Promise((resolve) => setTimeout(resolve, 250))
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000)
        recorder.addEventListener('stop', () => {
          recording.stoppedAt = recording.stoppedAt || new Date().toISOString()
          clearTimeout(timeout)
          resolve()
        }, { once: true })
        recorder.stop()
      })
    }
    recording.stoppedAt = recording.stoppedAt || new Date().toISOString()
    if (!recording.chunks.length || !sessionId) {
      setRecordingStatusForSource(source, 'failed')
      recording.finalizing = false
      if (required) {
        throw new Error(`Required ${source} recording did not capture any video data.`)
      }
      return
    }

    const extension = recording.mimeType.includes('mp4') ? 'mp4' : 'webm'
    const filename = `${attemptId}_${source}_${sessionId}.${extension}`
    const blob = new Blob(recording.chunks, { type: recording.mimeType || `video/${extension}` })
    try {
      recording.finalized = true
      const payload = {
        attemptId,
        sessionId,
        source,
        filename,
        blob,
        metadata: {
          recording_started_at: recording.startedAt,
          recording_stopped_at: recording.stoppedAt,
        },
      }
      preparedRecordingUploadsRef.current[source] = payload
      recording.sessionId = null
      recording.recorder = null
      recording.startedAt = null
      recording.stoppedAt = null
      recording.chunks = []
      recording.bytesRecorded = 0
      return payload
    } catch (error) {
      setRecordingStatusForSource(source, 'failed')
      emitProctoringNotice(
        `recording_finalize_${source}`,
        error?.response?.data?.detail || error?.message || `Unable to save the ${source} recording.`,
        'LOW',
      )
      if (required) {
        throw error
      }
    } finally {
      recording.finalizing = false
    }
  }, [attemptId, emitProctoringNotice, setRecordingStatusForSource])

  const prepareRecordingUploads = useCallback(async (sources = []) => {
    const normalizedSources = Array.from(new Set((sources || []).filter(Boolean)))
    if (normalizedSources.length === 0) return []
    const payloads = await Promise.all(
      normalizedSources.map((source) => prepareSingleRecordingUpload(source, { required: true })),
    )
    return payloads.filter(Boolean)
  }, [prepareSingleRecordingUpload])

  const uploadPreparedRecording = useCallback(async (payload) => {
    const { attemptId: uploadAttemptId, sessionId, source, filename, blob, metadata } = payload
    const progressState = {
      lastReportedPercent: null,
      lastReportedAt: 0,
      lastStatus: '',
    }
    const totalBytes = Number(blob?.size) > 0 ? Number(blob.size) : 0

    const sendUploadProgress = async ({ uploadedBytes = 0, progressPercent, status = 'uploading' }) => {
      let normalizedPercent = progressPercent == null
        ? (totalBytes > 0 ? clampUploadPercent((Number(uploadedBytes || 0) / totalBytes) * 100) : 0)
        : clampUploadPercent(progressPercent)

      if (status === 'complete') {
        normalizedPercent = 100
      } else if (status !== 'error' && progressState.lastReportedPercent != null) {
        normalizedPercent = Math.max(normalizedPercent, progressState.lastReportedPercent)
      }

      if (status === 'uploading' || status === 'processing') {
        normalizedPercent = Math.min(99, normalizedPercent)
      }

      const now = Date.now()
      const statusChanged = progressState.lastStatus !== status
      const percentAdvanced = progressState.lastReportedPercent == null
        || normalizedPercent >= progressState.lastReportedPercent + VIDEO_UPLOAD_PROGRESS_STEP
      const heartbeatElapsed = (
        progressState.lastReportedPercent != null
        && normalizedPercent !== progressState.lastReportedPercent
        && (now - progressState.lastReportedAt) >= VIDEO_UPLOAD_PROGRESS_INTERVAL_MS
      )

      if (!statusChanged && !percentAdvanced && !heartbeatElapsed) return

      progressState.lastReportedPercent = normalizedPercent
      progressState.lastReportedAt = now
      progressState.lastStatus = status

      try {
        await reportProctoringVideoUploadProgress(uploadAttemptId, {
          session_id: sessionId,
          source,
          uploaded_bytes: Math.max(0, Math.round(Number(uploadedBytes || 0))),
          total_bytes: totalBytes,
          progress_percent: normalizedPercent,
          status,
        })
      } catch (error) {
        console.warn(`Failed to report ${source} video upload progress.`, error)
      }
    }

    await sendUploadProgress({ uploadedBytes: 0, progressPercent: 0, status: 'uploading' })

    let lastError = null
    for (let i = 0; i < 3; i += 1) {
      try {
        await uploadProctoringVideo(uploadAttemptId, sessionId, source, filename, blob, metadata, {
          onUploadProgress: (event) => {
            const uploadedBytes = Number(event?.loaded || 0)
            const eventTotal = Number(event?.total || 0)
            const effectiveTotal = eventTotal > 0 ? eventTotal : totalBytes
            const progressPercent = effectiveTotal > 0
              ? (uploadedBytes / effectiveTotal) * 100
              : (uploadedBytes > 0 ? 100 : 0)
            void sendUploadProgress({
              uploadedBytes,
              progressPercent,
              status: progressPercent >= 100 ? 'processing' : 'uploading',
            })
          },
        })
        await sendUploadProgress({
          uploadedBytes: totalBytes || Number(blob?.size || 0),
          progressPercent: 100,
          status: 'complete',
        })
        delete preparedRecordingUploadsRef.current[source]
        lastError = null
        break
      } catch (error) {
        lastError = error
        const backoffMs = 1000 * Math.pow(2, i) + Math.random() * 1000
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
    if (lastError) {
      await sendUploadProgress({
        uploadedBytes: 0,
        progressPercent: progressState.lastReportedPercent ?? 0,
        status: 'error',
      })
      throw lastError
    }
    setRecordingStatusForSource(source, 'saved')
  }, [setRecordingStatusForSource])

  const uploadRecordingSources = useCallback(async (sources = []) => {
    const payloads = await prepareRecordingUploads(sources)
    await Promise.all(payloads.map(async (payload) => {
      try {
        await uploadPreparedRecording(payload)
      } catch (error) {
        setRecordingStatusForSource(payload.source, 'failed')
        if (isMountedRef.current) {
          emitProctoringNotice(
            `recording_finalize_${payload.source}`,
            error?.response?.data?.detail || error?.message || `Unable to save the ${payload.source} recording.`,
            'LOW',
          )
        } else {
          console.error(`Recording upload failed for ${payload.source}.`, error)
        }
        throw error
      }
    }))
  }, [emitProctoringNotice, prepareRecordingUploads, setRecordingStatusForSource, uploadPreparedRecording])

  useEffect(() => {
    if (!proctorCfg.screen_capture) {
      setScreenRecordingStatus('disabled')
      screenShareEstablishedRef.current = false
      screenShareLossHandledRef.current = false
      return
    }
    setScreenRecordingStatus((current) => {
      if (current === 'recording' || current === 'saving' || current === 'saved') return current
      return screenStream ? 'ready' : 'waiting'
    })
  }, [proctorCfg.screen_capture, screenStream])

  useEffect(() => {
    if (!attemptId || !cameraStream || !window.MediaRecorder) return
    void startRecordingSession(cameraStream, 'camera')
  }, [attemptId, cameraStream, startRecordingSession])

  useEffect(() => {
    if (!attemptId || !proctorCfg.screen_capture || !screenStream || !window.MediaRecorder) return
    // If the previous screen recorder died (stream was lost and re-established),
    // reset the recording state so a fresh session can start.
    const rec = screenRecordingRef.current
    if (rec.recorder && rec.recorder.state === 'inactive') {
      rec.recorder = null
      rec.sessionId = null
      rec.startedAt = null
      rec.stoppedAt = null
      rec.finalized = false
      rec.finalizing = false
      rec.chunks = []
      rec.bytesRecorded = 0
    }
    void startRecordingSession(screenStream, 'screen')
  }, [attemptId, proctorCfg.screen_capture, screenStream, startRecordingSession])

  const handleSubmitRequest = () => {
    setShowSubmitConfirm(true)
  }

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitPhase('Saving your latest answers...')
    setSubmitError('')
    try {
      await Promise.race([
        flush(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Save timed out')), 8000)),
      ]).catch(() => { /* best-effort flush — proceed with submission */ })
      // Submit the attempt first so the learner isn't blocked
      setSubmitPhase('Submitting your attempt...')
      await submitAttempt(attemptId)
      submittedRef.current = true
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch((error) => {
          emitProctoringNotice('exit_fullscreen', error?.message || 'Unable to exit fullscreen cleanly after submission.', 'LOW')
        })
      }
      // Upload recordings in the background — don't block navigation
      if (requiredRecordingSources.length > 0) {
        uploadRecordingSources(requiredRecordingSources).catch((error) => {
          console.warn('Background recording upload failed:', error)
        })
      }
      navigate(`/attempts/${attemptId}`)
    } catch (e) {
      setSubmitError(e.response?.data?.detail || e.message || 'Submission failed. Please try again.')
      setSubmitPhase('')
      setSubmitting(false)
    }
  }, [attemptId, emitProctoringNotice, flush, navigate, requiredRecordingSources, submitting, uploadRecordingSources])

  const handleForcedSubmit = useCallback((detail = 'Test auto-submitted due to violations.') => {
    const event = normalizeProctoringAlert({
      severity: 'HIGH',
      event_type: 'FORCED_SUBMIT',
      detail,
    })
    if (event) {
      handleViolation(event)
    }
    void handleSubmit()
  }, [handleSubmit, handleViolation])

  const applyPingResponse = useCallback((response) => {
    const payload = response?.data ?? response
    if (!payload || typeof payload !== 'object') return
    const serverAlerts = Array.isArray(payload.alerts) ? payload.alerts : []
    serverAlerts.forEach((alert) => {
      const event = normalizeProctoringAlert(alert)
      if (event) {
        handleViolation(event)
      }
    })
    if (payload.forced_submit) {
      handleForcedSubmit(payload.submit_reason || 'Test auto-submitted due to violations.')
    }
  }, [handleForcedSubmit, handleViolation])

  // Fullscreen enforcement
  useEffect(() => {
    if (!proctoringEnabled) {
      setProctorStatus('closed')
      setCameraDark(false)
    }
  }, [proctoringEnabled])

  useEffect(() => {
    if (!proctorCfg.fullscreen_enforce || document.fullscreenElement) return undefined
    // When screen capture is active, do NOT request fullscreen here —
    // it was already entered on RulesPage, and calling requestFullscreen()
    // now would kill the screen share track.
    if (proctorCfg.screen_capture) return undefined
    const timeoutId = window.setTimeout(() => {
      document.documentElement.requestFullscreen?.().catch(() => {
        emitProctoringNotice(
          'fullscreen_entry',
          'Fullscreen could not be enabled automatically. Use the browser prompt to continue.',
          'LOW',
        )
      })
    }, 200)
    return () => window.clearTimeout(timeoutId)
  }, [emitProctoringNotice, proctorCfg.fullscreen_enforce, proctorCfg.screen_capture])

  useEffect(() => {
    if (!proctorCfg.fullscreen_enforce) return undefined
    const handleFullscreenChange = () => {
      // Suppress fullscreen violations while the screen share picker is open,
      // during the grace period after it closes, or when screen capture is
      // enabled (getDisplayMedia and requestFullscreen fight each other in
      // browsers — toggling one always exits the other).
      const screenShareTransition = screenSharePickerOpenRef.current || screenShareGraceRef.current
      const screenCaptureActive = proctorCfg.screen_capture && screenShareEstablishedRef.current
      const screenSharePending = proctorCfg.screen_capture && !screenShareEstablishedRef.current

      if (screenShareTransition || screenSharePending) {
        // Don't enforce fullscreen while screen share picker is open, during
        // grace period, or before screen share is established — the picker
        // dialog forces the browser out of fullscreen.
        return
      }

      if (attemptId) {
        proctoringPing(attemptId, {
          focus: document.hasFocus(),
          visibility: document.visibilityState,
          blurs: tabBlurs,
          fullscreen: !!document.fullscreenElement,
          camera_dark: cameraDark,
        }).then(applyPingResponse).catch(() => {
          emitProctoringNotice('fullscreen_ping', 'Unable to sync fullscreen status with the server.', 'LOW')
        })
      }
      if (!document.fullscreenElement) {
        // When screen capture is active, do NOT call requestFullscreen() —
        // it kills the screen share track. Warn the user but keep recording.
        if (screenCaptureActive) {
          sendBrowserViolation('FULLSCREEN_EXIT', 'MEDIUM', 'Fullscreen exited while screen is being recorded')
          return
        }
        sendBrowserViolation('FULLSCREEN_EXIT', 'HIGH', 'Fullscreen mode exited during exam')
        document.documentElement.requestFullscreen?.().catch(() => {
          emitProctoringNotice('fullscreen_restore', 'Fullscreen is required for this test. Re-enter fullscreen to continue.', 'MEDIUM', 'FULLSCREEN_REQUIRED', 5000)
        })
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [applyPingResponse, attemptId, cameraDark, emitProctoringNotice, proctorCfg.fullscreen_enforce, sendBrowserViolation, tabBlurs])

  useEffect(() => {
    if (!proctorCfg.screen_capture) {
      screenShareEstablishedRef.current = false
      screenShareLossHandledRef.current = false
      return
    }
    if (screenStream) {
      screenShareEstablishedRef.current = true
      screenShareLossHandledRef.current = false
      return
    }
    if (loading || submitting) return
    if (!screenShareEstablishedRef.current || screenShareLossHandledRef.current) return
    // During the initial screen-share + fullscreen setup the stream can briefly
    // become null before stabilising. Skip loss detection while the grace period is active.
    if (screenShareGraceRef.current) return
    screenShareLossHandledRef.current = true

    // Screen share lost — warn the learner and give them a chance to re-share.
    // Never auto-submit on screen share loss; just log a violation and retry.
    sendBrowserViolation('SCREEN_SHARE_LOST', 'MEDIUM', 'Screen sharing was interrupted. Please re-share your entire screen.')
    setToast({
      severity: 'MEDIUM',
      event_type: 'SCREEN_SHARE_LOST',
      detail: 'Screen sharing stopped. Please re-share your entire screen to continue.',
    })
    // Reset the loss flag after a delay so the watcher fires again if still not re-shared
    window.setTimeout(() => { screenShareLossHandledRef.current = false }, 8000)
  }, [loading, proctorCfg.screen_capture, screenStream, sendBrowserViolation, submitting])

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          timerExpiredRef.current = true
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timeLeft])

  useEffect(() => {
    if (timeLeft !== 0 || !timerExpiredRef.current) return
    timerExpiredRef.current = false
    void handleSubmit()
  }, [timeLeft, handleSubmit])

  const formatTime = (secs) => {
    if (secs === null) return '--:--'
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const autosaveLabel = () => {
    if (saveState === 'saving') return 'Autosave: Saving...'
    if (saveState === 'pending') return 'Autosave: Pending changes'
    if (saveState === 'saved') {
      return `Autosave: Saved ${lastSavedAt ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}`.trim()
    }
    if (saveState === 'error') return 'Autosave: Save failed'
    return 'Autosave: Ready'
  }

  // Tab blur / visibility tracking
  useEffect(() => {
    if (!proctorCfg.tab_switch_detect) return
    const reportTabSwitch = (count, detail, visibility) => {
      // Suppress tab switch violations while screen share picker is open or grace period
      if (screenSharePickerOpenRef.current || screenShareGraceRef.current) return count
      const now = Date.now()
      if (now - lastTabSwitchEventRef.current < 750) return count
      lastTabSwitchEventRef.current = now
      const next = count + 1
      sendBrowserViolation('TAB_SWITCH', 'MEDIUM', detail)
      if (attemptId) {
        proctoringPing(attemptId, {
          focus: false,
          visibility,
          blurs: next,
          fullscreen: !!document.fullscreenElement,
          camera_dark: cameraDark,
        }).then(applyPingResponse).catch(() => {
          emitProctoringNotice('tab_switch_ping', 'Unable to sync the tab-switch event with the server.', 'LOW')
        })
      }
      return next
    }
    const onVisibility = () => {
      if (document.hidden) {
        setTabBlurs((count) => reportTabSwitch(count, `Tab hidden / switched (switch #${count + 1})`, 'hidden'))
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [applyPingResponse, attemptId, cameraDark, emitProctoringNotice, proctorCfg.tab_switch_detect, sendBrowserViolation])

  useEffect(() => {
    const max = proctorCfg.max_tab_blurs
    if (max && tabBlurs > max) {
      setToast({ severity: 'HIGH', event_type: 'TAB_SWITCH', detail: 'Too many tab switches — exam will be submitted' })
      lastToastBlursRef.current = tabBlurs
      void handleSubmit()
    } else if (tabBlurs > 0 && tabBlurs !== lastToastBlursRef.current && proctorCfg.tab_switch_detect) {
      lastToastBlursRef.current = tabBlurs
      setToast({ severity: 'MEDIUM', event_type: 'TAB_SWITCH', detail: `Tab switches: ${tabBlurs}` })
    }
  }, [handleSubmit, tabBlurs, proctorCfg.max_tab_blurs, proctorCfg.tab_switch_detect])

  // ── Copy / cut / paste blocking ────────────────────────────────────────────
  useEffect(() => {
    if (!proctorCfg.copy_paste_block) return
    const lastAlert = { t: 0 }
    const handler = (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastAlert.t > 6000) {
        lastAlert.t = now
        sendBrowserViolation('COPY_PASTE_ATTEMPT', 'MEDIUM',
          `${e.type.toUpperCase()} attempt blocked during exam`)
      }
    }
    document.addEventListener('copy', handler)
    document.addEventListener('cut', handler)
    document.addEventListener('paste', handler)
    return () => {
      document.removeEventListener('copy', handler)
      document.removeEventListener('cut', handler)
      document.removeEventListener('paste', handler)
    }
  }, [proctorCfg.copy_paste_block, sendBrowserViolation])

  // ── Keyboard shortcut blocking (DevTools, PrintScreen, view-source…) ───────
  useEffect(() => {
    if (!proctoringEnabled) return
    const lastAlert = {}
    const throttled = (key, ms = 12000) => {
      const now = Date.now()
      if (now - (lastAlert[key] || 0) < ms) return false
      lastAlert[key] = now
      return true
    }
    const handler = (e) => {
      const key = e.key?.toLowerCase() || ''
      const ctrl = e.ctrlKey || e.metaKey
      // F12 – DevTools
      if (e.key === 'F12') {
        e.preventDefault()
        if (throttled('f12')) sendBrowserViolation('SHORTCUT_BLOCKED', 'HIGH', 'F12 (DevTools) key blocked')
        return
      }
      // Ctrl+Shift+I/J/K/C – DevTools panels
      if (ctrl && e.shiftKey && ['i', 'j', 'k', 'c'].includes(key)) {
        e.preventDefault()
        if (throttled(`csi_${key}`)) sendBrowserViolation('SHORTCUT_BLOCKED', 'HIGH', `Ctrl+Shift+${key.toUpperCase()} (DevTools) blocked`)
        return
      }
      // Ctrl+U – View Source
      if (ctrl && key === 'u') {
        e.preventDefault()
        if (throttled('cu')) sendBrowserViolation('SHORTCUT_BLOCKED', 'MEDIUM', 'Ctrl+U (view source) blocked')
        return
      }
      // Ctrl+S – Save dialog
      if (ctrl && key === 's') { e.preventDefault(); return }
      // Ctrl+P – Print
      if (ctrl && key === 'p') { e.preventDefault(); return }
      // Ctrl+A – Select-all (only when copy/paste block is on)
      if (proctorCfg.copy_paste_block && ctrl && key === 'a') { e.preventDefault(); return }
      // PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault()
        if (throttled('ps')) sendBrowserViolation('SCREENSHOT_ATTEMPT', 'MEDIUM', 'PrintScreen key blocked')
        return
      }
    }
    // Use capture phase so we intercept before any React handler
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [proctoringEnabled, proctorCfg.copy_paste_block, sendBrowserViolation])

  // ── Right-click / context menu blocking ────────────────────────────────────
  useEffect(() => {
    if (!proctoringEnabled) return
    const lastAlert = { t: 0 }
    const handler = (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastAlert.t > 30000) {
        lastAlert.t = now
        sendBrowserViolation('RIGHT_CLICK_ATTEMPT', 'LOW', 'Context menu blocked during exam')
      }
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [proctoringEnabled, sendBrowserViolation])

  // ── Multiple monitor detection ──────────────────────────────────────────────
  useEffect(() => {
    if (!proctoringEnabled) return
    const alerted = { current: false }
    const check = () => {
      const isExtended = 'isExtended' in window.screen ? window.screen.isExtended : false
      // Fallback: screen resolution significantly larger than the available viewport
      const likelyExtended = window.screen.width > window.screen.availWidth + 300
      if ((isExtended || likelyExtended) && !alerted.current) {
        alerted.current = true
        sendBrowserViolation('MULTIPLE_MONITORS', 'MEDIUM',
          `Multiple monitors detected (screen ${window.screen.width}×${window.screen.height})`)
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [proctoringEnabled, sendBrowserViolation])

  // ── Virtual machine / remote desktop detection ─────────────────────────────
  useEffect(() => {
    if (!proctoringEnabled) return
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info')
        if (dbg) {
          const renderer = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase()
          const vendor = (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '').toLowerCase()
          const vmKeywords = ['vmware', 'virtualbox', 'llvm', 'parallels', 'microsoft basic render',
            'swiftshader', 'softpipe', 'llvmpipe', 'citrix', 'rdp display']
          const combined = `${renderer} ${vendor}`
          const hit = vmKeywords.find(kw => combined.includes(kw))
          if (hit) {
            sendBrowserViolation('VIRTUAL_MACHINE', 'HIGH',
              `Virtual machine / remote desktop environment detected (${hit})`)
          }
        }
      }
    } catch (error) {
      emitProctoringNotice('vm_detection', error?.message || 'Unable to inspect the browser graphics environment.', 'LOW')
    }
  }, [emitProctoringNotice, proctoringEnabled, sendBrowserViolation])

  // ── Developer tools open detection ─────────────────────────────────────────
  useEffect(() => {
    if (!proctoringEnabled) return
    const lastAlert = { t: 0 }
    const check = () => {
      const widthDiff = window.outerWidth - window.innerWidth
      const heightDiff = window.outerHeight - window.innerHeight
      if ((widthDiff > 160 || heightDiff > 160)) {
        const now = Date.now()
        if (now - lastAlert.t > 30000) {
          lastAlert.t = now
          sendBrowserViolation('DEV_TOOLS_OPEN', 'HIGH', 'Browser developer tools appear to be open')
        }
      }
    }
    const interval = setInterval(check, 4000)
    return () => clearInterval(interval)
  }, [proctoringEnabled, sendBrowserViolation])

  // ── Answer timing: reset clock when question changes ─────────────────────
  useEffect(() => {
    questionStartTimeRef.current = Date.now()
  }, [currentIdx])

  // ── Keystroke dynamics ────────────────────────────────────────────────────
  useEffect(() => {
    if (!proctoringEnabled) return
    const handler = (e) => {
      // Only track typing in text inputs / textareas (answers)
      const tag = e.target?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return
      const now = Date.now()
      const last = lastKeyTimeRef.current
      if (last > 0) {
        const interval = now - last
        keyIntervalsRef.current.push(interval)
        if (keyIntervalsRef.current.length > KEY_INTERVAL_WINDOW) {
          keyIntervalsRef.current.shift()
        }
        if (keyIntervalsRef.current.length >= KEY_INTERVAL_WINDOW) {
          const avg = keyIntervalsRef.current.reduce((a, b) => a + b, 0) / keyIntervalsRef.current.length
          if (avg < KEY_ANOMALY_THRESHOLD_MS) {
            const alertNow = Date.now()
            if (alertNow - lastKeystrokeAlertRef.current > 60000) {
              lastKeystrokeAlertRef.current = alertNow
              if (wsRawSendRef.current) {
                wsRawSendRef.current({
                  type: 'keystroke_anomaly',
                  avg_interval_ms: Math.round(avg),
                  sample_size: keyIntervalsRef.current.length,
                })
              } else if (sendClientEventRef.current) {
                sendClientEventRef.current('KEYSTROKE_ANOMALY', 'LOW', `Suspiciously fast typing detected (${Math.round(avg)}ms avg interval)`)
              }
            }
          }
        }
      }
      lastKeyTimeRef.current = now
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [proctoringEnabled])

  // ── Mouse inactivity detection ────────────────────────────────────────────
  useEffect(() => {
    if (!proctoringEnabled) return
    const onMove = () => {
      lastMouseMoveRef.current = Date.now()
      mouseInactiveAlertedRef.current = false
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    const interval = setInterval(() => {
      const idle = Date.now() - lastMouseMoveRef.current
      if (idle >= MOUSE_INACTIVE_MS && !mouseInactiveAlertedRef.current) {
        mouseInactiveAlertedRef.current = true
        sendBrowserViolation(
          'MOUSE_INACTIVE',
          'LOW',
          `No mouse movement for ${Math.round(idle / 1000)}s — possible unattended session`,
        )
      }
    }, 15000)
    return () => {
      document.removeEventListener('mousemove', onMove)
      clearInterval(interval)
    }
  }, [proctoringEnabled, sendBrowserViolation])

  // Heartbeat ping
  useEffect(() => {
    if (!attemptId || !proctoringEnabled) return
    const interval = setInterval(() => {
      proctoringPing(attemptId, {
        focus: document.hasFocus(),
        visibility: document.visibilityState,
        blurs: tabBlurs,
        fullscreen: !!document.fullscreenElement,
        camera_dark: cameraDark,
      }).then(applyPingResponse).catch(() => {
        // Suppress HTTP ping error toasts entirely — the ProctorOverlay
        // already shows "Reconnecting..." when the WS is down, and that
        // is sufficient feedback for the learner.
        console.debug('[Proctoring] HTTP ping failed, WS connected:', wsConnectedRef.current)
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [applyPingResponse, attemptId, cameraDark, emitProctoringNotice, proctoringEnabled, tabBlurs])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      try {
        const recorders = [cameraRecordingRef.current, screenRecordingRef.current]
        for (const recording of recorders) {
          if (recording?.recorder && recording.recorder.state !== 'inactive') {
            recording.recorder.stop()
          }
        }
      } catch (error) {
        console.error('Failed to stop proctoring recorder during page unload.', error)
      }
      // Best-effort flush of unsaved answers
      try {
        flush().catch(() => {})
      } catch {
        // ignore — page is closing
      }
      // Always warn during an active exam (not just when submitting)
      if (!submittedRef.current) {
        event.preventDefault()
        event.returnValue = 'You have an exam in progress. Are you sure you want to leave?'
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  // ── Prevent browser back button during exam ─────────────────────────────────
  useEffect(() => {
    if (submittedRef.current) return
    // Push a dummy state so pressing back pops it instead of leaving the page
    window.history.pushState({ examGuard: true }, '')
    const onPopState = () => {
      if (submittedRef.current) return
      // Re-push to keep the guard in place
      window.history.pushState({ examGuard: true }, '')
      setToast({ severity: 'MEDIUM', event_type: 'NAV_BLOCKED', detail: 'Please submit your exam before leaving.' })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <p className={styles.stateMessage}>Loading test...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <div className={styles.errorBanner}>{loadError}</div>
          <button type="button" className={styles.retryBtn} onClick={() => setReloadKey((current) => current + 1)}>
            Retry loading test
          </button>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentIdx]
  const currentQType = currentQ?.question_type || 'TEXT'
  const answeredCount = questions.filter((question) => hasAnswerValue(answers[question.id])).length
  const unansweredCount = questions.length - answeredCount
  const progressPct = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0
  const showProgressBar = exam?.settings?.show_progress_bar !== false
  const questionNavLabel = (question, index) => {
    const state = hasAnswerValue(answers[question.id]) ? 'answered' : 'unanswered'
    const current = index === currentIdx ? ', current question' : ''
    return `Go to question ${index + 1} of ${questions.length}${current}, ${state}`
  }
  const recordingBadgeClass = (status) => {
    if (status === 'saved' || status === 'recording') return styles.badgeConnected
    if (status === 'ready' || status === 'waiting' || status === 'checking' || status === 'saving' || status === 'disabled') return styles.badgePending
    return styles.badgeDisconnected
  }
  const proctorPane = (
    proctoringEnabled ? (
      <aside className={`${styles.proctorPane} glass`} aria-label="Proctoring panel">
        <ProctorOverlay
          attemptId={attemptId}
          token={tokens?.access_token}
          config={proctorCfg}
          initialScreenStream={screenStream}
          onViolation={handleViolation}
          onForcedSubmit={handleForcedSubmit}
          onStreamReady={setCameraStream}
          onScreenStreamReady={setScreenStream}
          onRegisterScreenShareRequest={registerScreenShareRequest}
          onRegisterSendClientEvent={registerSendClientEvent}
          onRegisterWsRawSend={registerWsRawSend}
          onStatusChange={setProctorStatus}
          onCameraStateChange={setCameraDark}
        />
      </aside>
    ) : null
  )
  const toastNode = (
    <AnimatePresence>
      {toast && (
        <ViolationToast event={toast} onClose={() => setToast(null)} />
      )}
    </AnimatePresence>
  )

  // ── Screen share gate: block exam until learner grants screen share ──────
  if (screenShareRequired) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <h2 className={styles.examTitle}>Screen Sharing Required</h2>
          <p className={styles.stateMessage}>
            This test requires you to share your <strong>entire screen</strong> for the duration of the exam.
            Your screen will be recorded and monitored.
          </p>
          {screenShareGateError && <div className={styles.errorBanner}>{screenShareGateError}</div>}
          <button
            type="button"
            className={styles.retryBtn}
            disabled={screenShareGateLoading}
            onClick={handleScreenShareGate}
          >
            {screenShareGateLoading ? 'Requesting screen share...' : 'Share your screen to continue'}
          </button>
        </div>
      </div>
    )
  }

  if (!currentQ) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <div className={styles.stateMessage}>No questions are available for this attempt.</div>
          <button type="button" className={styles.retryBtn} onClick={() => navigate('/attempts')}>
            Back to attempts list
          </button>
        </div>
        {proctorPane}
        {toastNode}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* ---- Test Pane ---- */}
      <div className={styles.examPane}>
        {/* Header */}
        <motion.div
          className={`${styles.examHeader} glass`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h2 className={styles.examTitle}>{exam?.title || 'Test'}</h2>
          <div className={styles.headerMeta}>
            {violations.HIGH > 0 && (
              <span className={styles.badgeHigh}>{violations.HIGH} HIGH</span>
            )}
            {violations.MEDIUM > 0 && (
              <span className={styles.badgeMedium}>{violations.MEDIUM} MED</span>
            )}
            <span className={proctoringEnabled && proctorStatus === 'connected' ? styles.badgeConnected : styles.badgeDisconnected}>
              Proctoring: {proctoringEnabled ? proctorStatus : 'off'}
            </span>
            {proctoringEnabled && (
              <span className={recordingBadgeClass(cameraRecordingStatus)}>
                Camera: {cameraRecordingStatus}
              </span>
            )}
            {proctoringEnabled && proctorCfg.screen_capture && (
              <span className={recordingBadgeClass(screenRecordingStatus)}>
                Screen: {screenRecordingStatus}
              </span>
            )}
            {proctoringEnabled && (
              <span className={styles.recordingHint}>
                Saved recordings appear after submit in Manage Tests - Proctoring - Video
              </span>
            )}
            <span
              className={
                saveState === 'saved'
                  ? styles.badgeSaved
                  : saveState === 'error'
                    ? styles.badgeError
                    : saveState === 'saving'
                      ? styles.badgeSaving
                      : styles.badgePending
              }
            >
              {autosaveLabel()}
            </span>
            <div className={`${styles.timer} glass ${timeLeft !== null && timeLeft <= 300 ? styles.timerDanger : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {formatTime(timeLeft)}
            </div>
          </div>
        </motion.div>

        {restoreWarning && <div className={styles.warningBanner}>{restoreWarning}</div>}
        {saveError && <div className={styles.warningBanner}>{saveError}</div>}

        <div className={styles.progressWrap}>
          <div className={styles.progressHeader}>
            <div>
              <div className={styles.progressTitle}>Completion progress</div>
              <div className={styles.progressMeta}>
                {answeredCount} answered of {questions.length} total
              </div>
            </div>
            <div className={styles.progressStats}>
              <span className={styles.progressChip}>Current {currentIdx + 1} / {questions.length}</span>
              <span className={styles.progressChip}>{unansweredCount} unanswered</span>
            </div>
          </div>
          {showProgressBar && (
            <>
              <div
                className={styles.progressBar}
                role="progressbar"
                aria-label="Answered questions progress"
                aria-valuemin={0}
                aria-valuemax={questions.length}
                aria-valuenow={answeredCount}
              >
                <div className={styles.progressBarFill} style={{ width: `${progressPct}%` }} />
              </div>
              <div className={styles.progressPercent}>{Math.round(progressPct)}% complete</div>
            </>
          )}
        </div>

        {/* Question Nav */}
        <div className={styles.questionNav}>
          {questions.map((q, i) => (
            <motion.button
              key={q.id}
              type="button"
              className={`${styles.qNum} ${i === currentIdx ? styles.qNumActive : ''} ${hasAnswerValue(answers[q.id]) ? styles.qNumAnswered : ''}`}
              onClick={() => {
                setShowSubmitConfirm(false)
                setCurrentIdx(i)
              }}
              aria-label={String(i + 1)}
              title={questionNavLabel(q, i)}
              aria-current={i === currentIdx ? 'step' : undefined}
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
            >
              {i + 1}
            </motion.button>
          ))}
        </div>

        {/* Question Card */}
        {currentQ && (
          <motion.div
            className={`${styles.questionCard} glass`}
            key={currentQ.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <div className={styles.qLabel}>Question {currentIdx + 1} of {questions.length}</div>
            <div className={styles.qText}>{currentQ.text}</div>

            {(currentQType === 'MCQ' || currentQType === 'TRUEFALSE') && (currentQ.options || []).length > 0 ? (
              <div className={styles.options}>
                {(currentQType === 'TRUEFALSE' ? ['True', 'False'] : currentQ.options).map((opt, oi) => {
                  const letter = currentQType === 'TRUEFALSE' ? opt : String.fromCharCode(65 + oi)
                  const selected = answers[currentQ.id] === letter
                  return (
                    <motion.label
                      key={oi}
                      className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                      onClick={() => handleAnswer(currentQ.id, letter)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.985 }}
                    >
                      <input
                        type="radio"
                        name={`q-${currentQ.id}`}
                        checked={selected}
                        readOnly
                      />
                      <span>{letter}. {opt}</span>
                    </motion.label>
                  )
                })}
              </div>
            ) : currentQType === 'MULTI' && currentQ.options ? (
              <div className={styles.options}>
                {currentQ.options.map((opt, oi) => {
                  const letter = String.fromCharCode(65 + oi)
                  const current = new Set(answers[currentQ.id] || [])
                  const selected = current.has(letter)
                  return (
                    <motion.label
                      key={oi}
                      className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.985 }}
                    >
                      <input
                        type="checkbox"
                        name={`q-${currentQ.id}-${oi}`}
                        checked={selected}
                        onChange={(e) => {
                          const next = new Set(current)
                          if (e.target.checked) next.add(letter); else next.delete(letter)
                          handleAnswer(currentQ.id, Array.from(next))
                        }}
                      />
                      <span>{letter}. {opt}</span>
                    </motion.label>
                  )
                })}
              </div>
            ) : (
              <textarea
                className={styles.textAnswer}
                placeholder="Type your answer here..."
                value={answers[currentQ.id] || ''}
                onChange={e => handleAnswer(currentQ.id, e.target.value)}
              />
            )}

            {/* Actions */}
            {submitError && (
              <div className={styles.submitError}>
                {submitError}
              </div>
            )}
            {showSubmitConfirm && (
              <div className={styles.submitConfirm}>
                <div className={styles.submitConfirmTitle}>Ready to submit?</div>
                <div className={styles.submitConfirmBody}>
                  {unansweredCount > 0
                    ? `You still have ${unansweredCount} unanswered ${unansweredCount === 1 ? 'question' : 'questions'}.`
                    : 'All questions have an answer recorded.'}
                  {' '}
                  Once submitted, this attempt will be locked and sent for review.
                </div>
                {submitting && submitPhase && (
                  <div className={styles.submitStatus}>
                    {submitPhase}
                  </div>
                )}
                <div className={styles.submitConfirmActions}>
                  <button type="button" className={styles.btnNav} onClick={() => setShowSubmitConfirm(false)} disabled={submitting}>
                    Keep Reviewing
                  </button>
                  <button type="button" className={styles.btnSubmit} onClick={handleSubmit} disabled={submitting}>
                    {submitting ? (submitPhase.includes('Submitting') ? 'Submitting...' : 'Saving...') : 'Confirm Submit'}
                  </button>
                </div>
              </div>
            )}
            <div className={styles.actions}>
              <motion.button
                type="button"
                className={styles.btnNav}
                disabled={currentIdx === 0}
                onClick={() => {
                  setShowSubmitConfirm(false)
                  setCurrentIdx(i => i - 1)
                }}
                whileTap={{ scale: 0.97 }}
              >
                Previous question
              </motion.button>
              {currentIdx < questions.length - 1 ? (
                <motion.button
                  type="button"
                  className={styles.btnNav}
                  onClick={() => {
                    setShowSubmitConfirm(false)
                    setCurrentIdx(i => i + 1)
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  Next question
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  className={styles.btnSubmit}
                  onClick={handleSubmitRequest}
                  disabled={submitting}
                  aria-label={showSubmitConfirm ? 'Review submission summary' : 'Review and submit test'}
                  whileTap={{ scale: submitting ? 1 : 0.97 }}
                >
                  {submitting ? 'Submitting...' : showSubmitConfirm ? 'Review Submission' : 'Submit Test'}
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {proctorPane}
      {toastNode}
    </div>
  )
}
