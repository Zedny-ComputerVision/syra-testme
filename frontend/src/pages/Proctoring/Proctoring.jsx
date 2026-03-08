import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ProctorOverlay from '../../components/ProctorOverlay/ProctorOverlay'
import ViolationToast from '../../components/ViolationToast/ViolationToast'
import useAuth from '../../hooks/useAuth'
import { getAttempt, getAttemptAnswers, submitAnswer, submitAttempt } from '../../services/attempt.service'
import { getTestQuestions, getTest } from '../../services/test.service'
import { finalizeProctoringVideo, proctoringPing, startProctoringVideo, uploadProctoringVideoChunk } from '../../services/proctoring.service'
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
        } catch (e) {
          failedEntries[qId] = ans
          hadFailure = true
          console.error('Auto-save failed for', qId, e)
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
      } catch (e) {
        failedEntries[qId] = ans
        hadFailure = true
        console.error('Flush failed for', qId, e)
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
  const [recordingStatus, setRecordingStatus] = useState('idle')
  const [proctorStatus, setProctorStatus] = useState('connecting')
  const [cameraDark, setCameraDark] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const wsConnectedRef = useRef(false)

  const { save, flush, saveState, lastSavedAt, saveError } = useAutoSave(attemptId)
  const recorderRef = useRef(null)
  const videoSessionIdRef = useRef(null)
  const videoChunkIndexRef = useRef(0)
  const videoMimeRef = useRef('video/webm')
  const finalizingVideoRef = useRef(false)
  const videoFinalizedRef = useRef(false)
  const uploadTasksRef = useRef(new Set())
  const uploadedChunksRef = useRef(0)
  const wsWarnedRef = useRef(false)
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

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timeLeft !== null])

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

  useEffect(() => {
    if (!attemptId || !cameraStream || !window.MediaRecorder) return
    if (recorderRef.current) return
    let cancelled = false

    const startRecorder = async () => {
      try {
        const mimeType = pickRecorderMimeType()
        videoMimeRef.current = mimeType
        const { data } = await startProctoringVideo(attemptId, mimeType)
        if (cancelled) return
        videoFinalizedRef.current = false
        videoSessionIdRef.current = data?.session_id
        videoChunkIndexRef.current = 0
        uploadedChunksRef.current = 0
        uploadTasksRef.current.clear()
        const recorder = new MediaRecorder(cameraStream, { mimeType })
        recorder.ondataavailable = async (event) => {
          if (!videoSessionIdRef.current || !event.data || event.data.size === 0) return
          const currentIdx = videoChunkIndexRef.current++
          try {
            let task = null
            task = uploadProctoringVideoChunk(attemptId, videoSessionIdRef.current, currentIdx, event.data)
              .then(() => {
                uploadedChunksRef.current += 1
              })
              .catch((e) => {
                console.error('Video chunk upload failed', e)
                setRecordingStatus('failed')
              })
              .finally(() => {
                uploadTasksRef.current.delete(task)
              })
            uploadTasksRef.current.add(task)
            await task
          } catch (e) {
            console.error('Video chunk upload failed', e)
            setRecordingStatus('failed')
          }
        }
        recorder.onerror = () => setRecordingStatus('failed')
        recorder.start(2000)
        recorderRef.current = recorder
        setRecordingStatus('recording')
      } catch (e) {
        console.error('Recorder start failed', e)
        setRecordingStatus('failed')
      }
    }

    startRecorder()
    return () => {
      cancelled = true
    }
  }, [attemptId, cameraStream])

  const handleAnswer = (questionId, answer) => {
    setShowSubmitConfirm(false)
    setAnswers(prev => ({ ...prev, [questionId]: answer }))
    save(questionId, answer)
  }

  const pickRecorderMimeType = () => {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    const supported = candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m))
    return supported || 'video/webm'
  }

  const stopAndFinalizeRecording = useCallback(async () => {
    const recorder = recorderRef.current
    const sessionId = videoSessionIdRef.current
    if (!recorder || !sessionId) return
    if (finalizingVideoRef.current) return
    if (videoFinalizedRef.current) return
    finalizingVideoRef.current = true
    setRecordingStatus('saving')
    if (recorder.state !== 'inactive') {
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
    for (let i = 0; i < 8 && uploadTasksRef.current.size === 0 && uploadedChunksRef.current < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    const pending = Array.from(uploadTasksRef.current)
    if (pending.length > 0) {
      await Promise.allSettled(pending)
    }
    if (uploadedChunksRef.current < 1) {
      setRecordingStatus('failed')
      finalizingVideoRef.current = false
      return
    }

    const extension = videoMimeRef.current.includes('mp4') ? 'mp4' : 'webm'
    try {
      let lastError = null
      for (let i = 0; i < 3; i += 1) {
        try {
          await finalizeProctoringVideo(attemptId, sessionId, extension)
          lastError = null
          break
        } catch (e) {
          lastError = e
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
      if (lastError) throw lastError
      setRecordingStatus('saved')
      videoFinalizedRef.current = true
      videoSessionIdRef.current = null
      recorderRef.current = null
      uploadedChunksRef.current = 0
      uploadTasksRef.current.clear()
    } catch (e) {
      console.error('Video finalize failed', e)
      setRecordingStatus('failed')
    } finally {
      finalizingVideoRef.current = false
    }
  }, [attemptId])

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
      await stopAndFinalizeRecording()
      await submitAttempt(attemptId)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
      navigate(`/attempts/${attemptId}`)
    } catch (e) {
      setSubmitError(e.response?.data?.detail || 'Submission failed. Please try again.')
      setSubmitting(false)
    }
  }, [attemptId, flush, navigate, stopAndFinalizeRecording, submitting])

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
      handleSubmit()
    } else if (tabBlurs > 0 && proctorCfg.tab_switch_detect) {
      setToast({ severity: 'MEDIUM', event_type: 'TAB_SWITCH', detail: `Tab switches: ${tabBlurs}` })
    }
  }, [tabBlurs, proctorCfg.max_tab_blurs, proctorCfg.tab_switch_detect])

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
        const recorder = recorderRef.current
        if (recorder && recorder.state !== 'inactive') recorder.stop()
      } catch (_) {}
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      stopAndFinalizeRecording().catch(() => {})
    }
  }, [stopAndFinalizeRecording])

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

  if (!currentQ) {
    return (
      <div className={styles.page}>
        <div className={`${styles.examPane} ${styles.centerState}`}>
          <div className={styles.stateMessage}>No questions are available for this attempt.</div>
          <button type="button" className={styles.retryBtn} onClick={() => navigate('/attempts')}>
            Back to Attempts
          </button>
        </div>
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
            <span className={recordingStatus === 'saved' ? styles.badgeConnected : styles.badgeDisconnected}>
              Recording: {recordingStatus}
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
            <span className={styles.recordingHint}>
              Video appears after submit in Manage Tests - Proctoring - Video
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

      {/* Right proctoring sidebar */}
      <aside className={`${styles.proctorPane} glass`} aria-label="Proctoring panel">
        <ProctorOverlay
          attemptId={attemptId}
          token={tokens?.access_token}
          config={proctorCfg}
          onViolation={handleViolation}
          onForcedSubmit={handleSubmit}
          onStreamReady={setCameraStream}
          onStatusChange={setProctorStatus}
          onCameraStateChange={setCameraDark}
        />
      </aside>

      {/* Violation Toast */}
      <AnimatePresence>
        {toast && (
          <ViolationToast event={toast} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
