import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ProctorOverlay from '../../components/ProctorOverlay/ProctorOverlay'
import ViolationToast from '../../components/ViolationToast/ViolationToast'
import useAuth from '../../hooks/useAuth'
import { getAttempt, getAttemptAnswers, submitAnswer, submitAttempt } from '../../services/attempt.service'
import { getTestQuestions, getTest } from '../../services/test.service'
import { proctoringPing, uploadProctoringVideo } from '../../services/proctoring.service'
import { normalizeQuestion, normalizeTest } from '../../utils/assessmentAdapters'
import { normalizeProctoringConfig } from '../../utils/proctoringRequirements'
import styles from './Proctoring.module.scss'

const DEFAULT_PROCTORING = {
  tab_switch_detect: true,
  fullscreen_enforce: true,
  face_detection: true,
  multi_face: true,
  eye_tracking: true,
  head_pose_detection: true,
  audio_detection: true,
  object_detection: true,
  mouth_detection: false,
  copy_paste_block: true,
  screen_capture: false,
  object_confidence_threshold: 0.5,
  frame_interval_ms: 3000,
  audio_chunk_ms: 3000,
  audio_consecutive_chunks: 2,
  audio_window: 5,
  screenshot_interval_sec: 60,
  max_tab_blurs: 3,
}

function createRecordingController(source) {
  return {
    source,
    recorder: null,
    sessionId: null,
    mimeType: 'video/webm',
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

  const { save, flush, saveState, lastSavedAt, saveError } = useAutoSave(attemptId)
  const cameraRecordingRef = useRef(createRecordingController('camera'))
  const screenRecordingRef = useRef(createRecordingController('screen'))
  const wsWarnedRef = useRef(false)
  const lastToastBlursRef = useRef(0)
  const timerExpiredRef = useRef(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Load attempt, exam, and questions
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      setRestoreWarning('')
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
        setProctorCfg({ ...DEFAULT_PROCTORING, ...normalizeProctoringConfig(ex.proctoring_config || {}) })
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
    if ((proctorStatus === 'closed' || proctorStatus === 'disconnected') && wsConnectedRef.current && !wsWarnedRef.current) {
      wsWarnedRef.current = true
      setToast({ severity: 'HIGH', event_type: 'PROCTORING_CONNECTION', detail: 'Proctoring connection lost' })
    }
  }, [proctorStatus])

  // Fullscreen enforcement
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {})
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const handleAnswer = (questionId, answer) => {
    setShowSubmitConfirm(false)
    setAnswers(prev => ({ ...prev, [questionId]: answer }))
    save(questionId, answer)
  }

  const setRecordingStatusForSource = useCallback((source, value) => {
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
    try {
      await requestFn()
    } catch {
      setScreenRecordingStatus('failed')
    } finally {
      setScreenShareBusy(false)
    }
  }, [screenShareBusy])

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
      recording.chunks = []
      recording.bytesRecorded = 0
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (event) => {
        if (!recording.sessionId || !event.data || event.data.size === 0) return
        recording.chunks.push(event.data)
        recording.bytesRecorded += event.data.size
      }
      recorder.onerror = () => setRecordingStatusForSource(source, 'failed')
      recorder.start(2000)
      recording.recorder = recorder
      setRecordingStatusForSource(source, 'recording')
    } catch {
      setRecordingStatusForSource(source, 'failed')
    }
  }, [attemptId, setRecordingStatusForSource])

  const stopAndFinalizeSingleRecording = useCallback(async (source) => {
    const recording = source === 'screen' ? screenRecordingRef.current : cameraRecordingRef.current
    const recorder = recording.recorder
    const sessionId = recording.sessionId
    if (!recorder && !sessionId) return
    if (recording.finalizing || recording.finalized) return
    recording.finalizing = true
    setRecordingStatusForSource(source, 'saving')
    if (recorder && recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000)
        recorder.addEventListener('stop', () => {
          clearTimeout(timeout)
          resolve()
        }, { once: true })
        try { recorder.requestData?.() } catch (_) {}
        recorder.stop()
      })
    }
    if (!recording.chunks.length || !sessionId) {
      setRecordingStatusForSource(source, 'failed')
      recording.finalizing = false
      return
    }

    const extension = recording.mimeType.includes('mp4') ? 'mp4' : 'webm'
    const filename = `${attemptId}_${source}_${sessionId}.${extension}`
    const blob = new Blob(recording.chunks, { type: recording.mimeType || `video/${extension}` })
    try {
      let lastError = null
      for (let i = 0; i < 3; i += 1) {
        try {
          await uploadProctoringVideo(attemptId, sessionId, source, filename, blob)
          lastError = null
          break
        } catch (e) {
          lastError = e
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
      if (lastError) throw lastError
      setRecordingStatusForSource(source, 'saved')
      recording.finalized = true
      recording.sessionId = null
      recording.recorder = null
      recording.chunks = []
      recording.bytesRecorded = 0
    } catch {
      setRecordingStatusForSource(source, 'failed')
    } finally {
      recording.finalizing = false
    }
  }, [attemptId, setRecordingStatusForSource])

  const stopAndFinalizeRecordings = useCallback(async () => {
    await stopAndFinalizeSingleRecording('camera')
    if (proctorCfg.screen_capture) {
      await stopAndFinalizeSingleRecording('screen')
    }
  }, [proctorCfg.screen_capture, stopAndFinalizeSingleRecording])

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
    void startRecordingSession(screenStream, 'screen')
  }, [attemptId, proctorCfg.screen_capture, screenStream, startRecordingSession])

  const handleSubmitRequest = () => {
    setShowSubmitConfirm(true)
  }

  const handleSubmit = useCallback(async () => {
    setShowSubmitConfirm(false)
    if (submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await flush()
      await stopAndFinalizeRecordings()
      await submitAttempt(attemptId)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
      navigate(`/attempts/${attemptId}`)
    } catch (e) {
      setSubmitError(e.response?.data?.detail || 'Submission failed. Please try again.')
      setSubmitting(false)
    }
  }, [attemptId, flush, navigate, stopAndFinalizeRecordings, submitting])

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
    screenShareLossHandledRef.current = true
    setToast({
      severity: 'HIGH',
      event_type: 'SCREEN_SHARE_LOST',
      detail: 'Screen sharing stopped. The attempt will be submitted.',
    })
    void handleSubmit()
  }, [handleSubmit, loading, proctorCfg.screen_capture, screenStream, submitting])

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
  }, [timeLeft !== null, handleSubmit])

  useEffect(() => {
    if (timeLeft !== 0 || !timerExpiredRef.current) return
    timerExpiredRef.current = false
    void handleSubmit()
  }, [timeLeft, handleSubmit])

  const handleViolation = useCallback((event) => {
    if (event.severity === 'HIGH' || event.severity === 'MEDIUM') {
      setViolations(prev => ({
        ...prev,
        [event.severity]: prev[event.severity] + 1
      }))
    }
    setToast(event)
  }, [])

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
    const onBlur = () => {
      setTabBlurs((count) => {
        const next = count + 1
        if (attemptId) {
          proctoringPing(attemptId, {
            focus: false,
            visibility: document.visibilityState,
            blurs: next,
            fullscreen: !!document.fullscreenElement,
            camera_dark: cameraDark,
          }).catch(() => {})
        }
        return next
      })
    }
    const onVisibility = () => {
      if (document.hidden) {
        setTabBlurs((count) => {
          const next = count + 1
          if (attemptId) {
            proctoringPing(attemptId, {
              focus: false,
              visibility: 'hidden',
              blurs: next,
              fullscreen: !!document.fullscreenElement,
              camera_dark: cameraDark,
            }).catch(() => {})
          }
          return next
        })
      }
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [attemptId, cameraDark, proctorCfg.tab_switch_detect])

  useEffect(() => {
    const max = proctorCfg.max_tab_blurs
    if (max && tabBlurs > max) {
      setToast({ severity: 'HIGH', event_type: 'TAB_SWITCH', detail: 'Too many tab switches' })
      lastToastBlursRef.current = tabBlurs
      void handleSubmit()
    } else if (tabBlurs > 0 && tabBlurs !== lastToastBlursRef.current && proctorCfg.tab_switch_detect) {
      lastToastBlursRef.current = tabBlurs
      setToast({ severity: 'MEDIUM', event_type: 'TAB_SWITCH', detail: `Tab switches: ${tabBlurs}` })
    }
  }, [handleSubmit, tabBlurs, proctorCfg.max_tab_blurs, proctorCfg.tab_switch_detect])

  // Copy/paste block
  useEffect(() => {
    if (!proctorCfg.copy_paste_block) return
    const handler = (e) => {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'v')) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [proctorCfg.copy_paste_block])

  // Heartbeat ping
  useEffect(() => {
    if (!attemptId) return
    const interval = setInterval(() => {
      proctoringPing(attemptId, {
        focus: document.hasFocus(),
        visibility: document.visibilityState,
        blurs: tabBlurs,
        fullscreen: !!document.fullscreenElement,
        camera_dark: cameraDark,
      }).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [attemptId, tabBlurs, cameraDark])

  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const recorders = [cameraRecordingRef.current, screenRecordingRef.current]
        for (const recording of recorders) {
          if (recording?.recorder && recording.recorder.state !== 'inactive') {
            recording.recorder.stop()
          }
        }
      } catch (_) {}
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      stopAndFinalizeRecordings().catch(() => {})
    }
  }, [stopAndFinalizeRecordings])

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
            Retry
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
  const recordingBadgeClass = (status) => {
    if (status === 'saved' || status === 'recording') return styles.badgeConnected
    if (status === 'ready' || status === 'waiting' || status === 'checking' || status === 'saving' || status === 'disabled') return styles.badgePending
    return styles.badgeDisconnected
  }
  const proctorPane = (
    <aside className={`${styles.proctorPane} glass`} aria-label="Proctoring panel">
      <ProctorOverlay
        attemptId={attemptId}
        token={tokens?.access_token}
        config={proctorCfg}
        onViolation={handleViolation}
        onForcedSubmit={handleSubmit}
        onStreamReady={setCameraStream}
        onScreenStreamReady={setScreenStream}
        onRegisterScreenShareRequest={registerScreenShareRequest}
        onStatusChange={setProctorStatus}
        onCameraStateChange={setCameraDark}
      />
    </aside>
  )
  const toastNode = (
    <AnimatePresence>
      {toast && (
        <ViolationToast event={toast} onClose={() => setToast(null)} />
      )}
    </AnimatePresence>
  )

  if (!currentQ) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <div className={styles.stateMessage}>No questions are available for this attempt.</div>
          <button type="button" className={styles.retryBtn} onClick={() => navigate('/attempts')}>
            Back to Attempts
          </button>
        </div>
        {proctorPane}
        {toastNode}
      </div>
    )
  }

  if (proctorCfg.screen_capture && !screenStream) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <div className={styles.warningBanner}>
            Screen sharing is required for this test. Choose your entire screen in the browser picker before the attempt can continue.
          </div>
          <p className={styles.stateMessage}>
            The test stays blocked until desktop sharing is active. If screen sharing stops after the test starts, the attempt is submitted automatically.
          </p>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => void requestRequiredScreenShare()}
            disabled={!screenShareRequestReady || screenShareBusy}
          >
            {screenShareBusy ? 'Requesting Screen Share...' : screenRecordingStatus === 'failed' ? 'Retry Screen Share' : 'Share Entire Screen'}
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
            <span className={proctorStatus === 'connected' ? styles.badgeConnected : styles.badgeDisconnected}>
              Proctoring: {proctorStatus}
            </span>
            <span className={recordingBadgeClass(cameraRecordingStatus)}>
              Camera: {cameraRecordingStatus}
            </span>
            {proctorCfg.screen_capture && (
              <span className={recordingBadgeClass(screenRecordingStatus)}>
                Screen: {screenRecordingStatus}
              </span>
            )}
            <span className={styles.recordingHint}>
              Saved recordings appear after submit in Manage Tests - Proctoring - Video
            </span>
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
                <div className={styles.submitConfirmActions}>
                  <button type="button" className={styles.btnNav} onClick={() => setShowSubmitConfirm(false)} disabled={submitting}>
                    Keep Reviewing
                  </button>
                  <button type="button" className={styles.btnSubmit} onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Confirm Submit'}
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
                Previous
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
                  Next
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  className={styles.btnSubmit}
                  onClick={handleSubmitRequest}
                  disabled={submitting}
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
