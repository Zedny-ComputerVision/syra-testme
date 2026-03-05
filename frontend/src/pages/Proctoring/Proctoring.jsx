import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ProctorOverlay from '../../components/ProctorOverlay/ProctorOverlay'
import ViolationToast from '../../components/ViolationToast/ViolationToast'
import useAuth from '../../hooks/useAuth'
import { getAttempt, submitAnswer, submitAttempt } from '../../services/attempt.service'
import { getExamQuestions, getExam } from '../../services/exam.service'
import { finalizeProctoringVideo, proctoringPing, startProctoringVideo, uploadProctoringVideoChunk } from '../../services/proctoring.service'
import styles from './Proctoring.module.scss'

function useAutoSave(attemptId, delay = 2000) {
  const pending = useRef({})
  const timer = useRef(null)

  const save = useCallback((questionId, answer) => {
    pending.current[questionId] = answer
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const entries = { ...pending.current }
      pending.current = {}
      for (const [qId, ans] of Object.entries(entries)) {
        try {
          await submitAnswer(attemptId, qId, ans)
        } catch (e) {
          console.error('Auto-save failed for', qId, e)
        }
      }
    }, delay)
  }, [attemptId, delay])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const entries = { ...pending.current }
    pending.current = {}
    for (const [qId, ans] of Object.entries(entries)) {
      try {
        await submitAnswer(attemptId, qId, ans)
      } catch (e) {
        console.error('Flush failed for', qId, e)
      }
    }
  }, [attemptId])

  return { save, flush }
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
  const [proctorCfg, setProctorCfg] = useState({})
  const [tabBlurs, setTabBlurs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cameraStream, setCameraStream] = useState(null)
  const [recordingStatus, setRecordingStatus] = useState('idle')

  const { save, flush } = useAutoSave(attemptId)
  const recorderRef = useRef(null)
  const videoSessionIdRef = useRef(null)
  const videoChunkIndexRef = useRef(0)
  const videoMimeRef = useRef('video/webm')
  const finalizingVideoRef = useRef(false)

  // Load attempt, exam, and questions
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const attemptRes = await getAttempt(attemptId)
        const att = attemptRes.data
        const examRes = await getExam(att.exam_id)
        const ex = examRes.data
        const qRes = await getExamQuestions(att.exam_id)
        if (cancelled) return
        setExam(ex)
        setProctorCfg(ex.proctoring_config || {})
        setQuestions(qRes.data || [])
        if (ex.time_limit_minutes) {
          const started = new Date(att.started_at).getTime()
          const limit = ex.time_limit_minutes * 60
          const elapsed = Math.floor((Date.now() - started) / 1000)
          setTimeLeft(Math.max(0, limit - elapsed))
        }
      } catch (e) {
        console.error('Failed to load exam data', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [attemptId])

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
        videoSessionIdRef.current = data?.session_id
        videoChunkIndexRef.current = 0
        const recorder = new MediaRecorder(cameraStream, { mimeType })
        recorder.ondataavailable = async (event) => {
          if (!videoSessionIdRef.current || !event.data || event.data.size === 0) return
          const currentIdx = videoChunkIndexRef.current++
          try {
            await uploadProctoringVideoChunk(attemptId, videoSessionIdRef.current, currentIdx, event.data)
          } catch (e) {
            console.error('Video chunk upload failed', e)
            setRecordingStatus('failed')
          }
        }
        recorder.onerror = () => setRecordingStatus('failed')
        recorder.start(4000)
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
    if (!recorder || !videoSessionIdRef.current) return
    if (finalizingVideoRef.current) return
    finalizingVideoRef.current = true
    setRecordingStatus('saving')
    if (recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000)
        recorder.addEventListener('stop', () => {
          clearTimeout(timeout)
          resolve()
        }, { once: true })
        recorder.stop()
      })
    }
    const extension = videoMimeRef.current.includes('mp4') ? 'mp4' : 'webm'
    try {
      await finalizeProctoringVideo(attemptId, videoSessionIdRef.current, extension)
      setRecordingStatus('saved')
    } catch (e) {
      console.error('Video finalize failed', e)
      setRecordingStatus('failed')
    } finally {
      finalizingVideoRef.current = false
    }
  }, [attemptId])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await flush()
      await stopAndFinalizeRecording()
      await submitAttempt(attemptId)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
      navigate(`/attempts/${attemptId}`)
    } catch (e) {
      console.error('Submit failed', e)
      setSubmitting(false)
    }
  }

  const handleViolation = (event) => {
    if (event.severity === 'HIGH' || event.severity === 'MEDIUM') {
      setViolations(prev => ({
        ...prev,
        [event.severity]: prev[event.severity] + 1
      }))
    }
    setToast(event)
  }

  const formatTime = (secs) => {
    if (secs === null) return '--:--'
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Tab blur / visibility tracking
  useEffect(() => {
    if (!proctorCfg.tab_switch_detect) return
    const onBlur = () => setTabBlurs(c => c + 1)
    const onVisibility = () => {
      if (document.hidden) setTabBlurs(c => c + 1)
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [proctorCfg.tab_switch_detect])

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
      }).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [attemptId, tabBlurs])

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
        <div className={styles.examPane} style={{ justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: 'var(--color-muted)' }}>Loading exam...</p>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentIdx]

  return (
    <div className={styles.page}>
      {/* ---- Exam Pane ---- */}
      <div className={styles.examPane}>
        {/* Header */}
        <motion.div
          className={`${styles.examHeader} glass`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h2 className={styles.examTitle}>{exam?.title || 'Exam'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {violations.HIGH > 0 && (
              <span className={styles.badgeHigh}>{violations.HIGH} HIGH</span>
            )}
            {violations.MEDIUM > 0 && (
              <span className={styles.badgeMedium}>{violations.MEDIUM} MED</span>
            )}
            <div className={`${styles.timer} glass ${timeLeft !== null && timeLeft <= 300 ? styles.timerDanger : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {formatTime(timeLeft)}
            </div>
          </div>
        </motion.div>

        {/* Question Nav */}
        <div className={styles.questionNav}>
          {questions.map((q, i) => (
            <motion.button
              key={q.id}
              className={`${styles.qNum} ${i === currentIdx ? styles.qNumActive : ''} ${answers[q.id] ? styles.qNumAnswered : ''}`}
              onClick={() => setCurrentIdx(i)}
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

            {(currentQ.question_type === 'MCQ' || currentQ.question_type === 'TRUEFALSE') && (currentQ.options || []).length > 0 ? (
              <div className={styles.options}>
                {(currentQ.question_type === 'TRUEFALSE' ? ['True', 'False'] : currentQ.options).map((opt, oi) => {
                  const letter = currentQ.question_type === 'TRUEFALSE' ? opt : String.fromCharCode(65 + oi)
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
            ) : currentQ.question_type === 'MULTI' && currentQ.options ? (
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
            <div className={styles.actions}>
              <motion.button
                className={styles.btnNav}
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(i => i - 1)}
                whileTap={{ scale: 0.97 }}
              >
                Previous
              </motion.button>
              {currentIdx < questions.length - 1 ? (
                <motion.button
                  className={styles.btnNav}
                  onClick={() => setCurrentIdx(i => i + 1)}
                  whileTap={{ scale: 0.97 }}
                >
                  Next
                </motion.button>
              ) : (
                <motion.button
                  className={styles.btnSubmit}
                  onClick={handleSubmit}
                  disabled={submitting}
                  whileTap={{ scale: submitting ? 1 : 0.97 }}
                >
                  {submitting ? 'Submitting...' : 'Submit Exam'}
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* ---- Proctor Pane ---- */}
      <motion.div
        className={`${styles.proctorPane} glass`}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
      >
        <ProctorOverlay attemptId={attemptId} token={tokens?.access_token} config={proctorCfg} onViolation={handleViolation} onForcedSubmit={handleSubmit} onStreamReady={setCameraStream} />
        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
          Recording: {recordingStatus}
        </div>
      </motion.div>

      {/* Violation Toast */}
      <AnimatePresence>
        {toast && (
          <ViolationToast event={toast} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
