import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { getTest } from '../../services/test.service'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import { requestEntireScreenShare } from '../../utils/screenCapture'
import styles from './SystemCheckPage.module.scss'

export default function SystemCheckPage() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const canvasRef = useRef(null)
  const micStreamRef = useRef(null)
  const micAudioCtxRef = useRef(null)
  const micIntervalRef = useRef(null)
  const micTimeoutRef = useRef(null)

  const [camera, setCamera] = useState('pending')
  const [mic, setMic] = useState('pending')
  const [fullscreen, setFullscreen] = useState('pending')
  const [micLevel, setMicLevel] = useState(0)
  const [lighting, setLighting] = useState('pending')
  const [lightingScore, setLightingScore] = useState(0)
  const [screenShare, setScreenShare] = useState('pending')
  const [proctorCfg, setProctorCfg] = useState({})
  const [requirements, setRequirements] = useState(getJourneyRequirements({}))
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const [continueBusy, setContinueBusy] = useState(false)
  const [checksBusy, setChecksBusy] = useState(false)

  const attachCameraStream = useCallback(async () => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    try {
      await video.play()
    } catch {
      // Browsers can reject play() during transient mount states. The
      // stream stays attached and autoplay will resume when allowed.
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause?.()
      videoRef.current.srcObject = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const stopScreenShareCheck = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
      screenStreamRef.current = null
    }
  }, [])

  const stopMicMonitor = useCallback(() => {
    if (micIntervalRef.current) {
      clearInterval(micIntervalRef.current)
      micIntervalRef.current = null
    }
    if (micTimeoutRef.current) {
      clearTimeout(micTimeoutRef.current)
      micTimeoutRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close().catch(() => {
        setConfigError('The microphone monitor could not be released cleanly. Refresh the page if the mic stays unavailable.')
      })
      micAudioCtxRef.current = null
    }
    setMicLevel(0)
  }, [])

  const checkCamera = useCallback(async (required) => {
    stopCamera()
    if (!required) {
      setCamera('passed')
      return
    }
    setCamera('checking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        void attachCameraStream()
      }
      setCamera('passed')
    } catch {
      setCamera('failed')
    }
  }, [attachCameraStream, stopCamera])

  const checkMic = useCallback(async (required) => {
    stopMicMonitor()
    if (!required) {
      setMic('passed')
      return
    }
    setMic('checking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      micAudioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      micIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setMicLevel(Math.min(100, avg * 2))
      }, 100)
      micTimeoutRef.current = setTimeout(() => {
        stopMicMonitor()
      }, 10000)
      setMic('passed')
    } catch {
      setMic('failed')
    }
  }, [stopMicMonitor])

  const checkFullscreen = useCallback((required) => {
    if (!required) {
      setFullscreen('passed')
      return
    }
    setFullscreen('checking')
    const supported = Boolean(document.documentElement.requestFullscreen)
    if (!supported) {
      setFullscreen('failed')
      return
    }
    setFullscreen(document.fullscreenElement ? 'passed' : 'pending')
  }, [])

  const checkScreenShare = useCallback(async (required) => {
    stopScreenShareCheck()
    if (!required) {
      setScreenShare('passed')
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShare('failed')
      return
    }
    setScreenShare('checking')
    try {
      const stream = await requestEntireScreenShare()
      screenStreamRef.current = stream
      setScreenShare('passed')
    } catch {
      setScreenShare('failed')
    } finally {
      stopScreenShareCheck()
    }
  }, [stopScreenShareCheck])

  const requestFullscreen = useCallback(async () => {
    if (!requirements.fullscreenRequired) return
    if (!document.documentElement.requestFullscreen) {
      setFullscreen('failed')
      return
    }
    setFullscreen('checking')
    try {
      await document.documentElement.requestFullscreen()
      setFullscreen(document.fullscreenElement ? 'passed' : 'failed')
    } catch {
      setFullscreen('failed')
    }
  }, [requirements.fullscreenRequired])

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    setConfigError('')
    try {
      const { data } = await getTest(testId)
      const normalized = normalizeTest(data)
      const cfg = normalized?.proctoring_config || {}
      setProctorCfg(cfg)
      setRequirements(getJourneyRequirements(cfg))
    } catch {
      setConfigError('Failed to load test configuration. Please refresh and try again.')
      setProctorCfg({})
      setRequirements(getJourneyRequirements({}))
    } finally {
      setConfigLoading(false)
    }
  }, [testId])

  const rerunChecks = useCallback(async () => {
    if (checksBusy || configLoading || configError) return
    setChecksBusy(true)
    try {
      await checkCamera(requirements.cameraRequired)
      await checkMic(requirements.micRequired)
      checkFullscreen(requirements.fullscreenRequired)
      if (requirements.screenRequired) {
        await checkScreenShare(true)
      } else {
        setScreenShare('passed')
      }
      if (!requirements.lightingRequired) {
        setLighting('passed')
        setLightingScore(1)
      } else {
        setLighting('pending')
      }
    } finally {
      setChecksBusy(false)
    }
  }, [
    checkCamera,
    checkFullscreen,
    checkMic,
    checksBusy,
    configError,
    configLoading,
    requirements.cameraRequired,
    requirements.fullscreenRequired,
    requirements.lightingRequired,
    requirements.micRequired,
    requirements.screenRequired,
    checkScreenShare,
  ])

  useEffect(() => {
    void loadConfig()
    return () => {
      stopCamera()
      stopScreenShareCheck()
      stopMicMonitor()
    }
  }, [loadConfig, stopCamera, stopMicMonitor, stopScreenShareCheck])

  useEffect(() => {
    if (configLoading) return
    checkCamera(requirements.cameraRequired)
    checkMic(requirements.micRequired)
    checkFullscreen(requirements.fullscreenRequired)
    setScreenShare(requirements.screenRequired ? 'pending' : 'passed')
    if (!requirements.lightingRequired) {
      setLighting('passed')
      setLightingScore(1)
    } else {
      setLighting('pending')
    }
  }, [
    configLoading,
    requirements.cameraRequired,
    requirements.micRequired,
    requirements.fullscreenRequired,
    requirements.lightingRequired,
    requirements.screenRequired,
    checkCamera,
    checkMic,
    checkFullscreen,
  ])

  useEffect(() => {
    if (camera !== 'passed') return
    void attachCameraStream()
  }, [attachCameraStream, camera])

  useEffect(() => {
    if (!requirements.lightingRequired) return undefined
    if (camera !== 'passed' || !videoRef.current) {
      setLighting('pending')
      return undefined
    }
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    let raf = 0
    const sample = () => {
      const vid = videoRef.current
      if (vid && vid.videoWidth > 0) {
        canvas.width = vid.videoWidth
        canvas.height = vid.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3
        }
        const avg = sum / (data.length / 4) / 255
        setLightingScore(avg)
        const minScore = proctorCfg.lighting_min_score || 0.35
        setLighting(avg >= minScore ? 'passed' : 'failed')
      }
      raf = requestAnimationFrame(sample)
    }
    raf = requestAnimationFrame(sample)
    return () => cancelAnimationFrame(raf)
  }, [camera, requirements.lightingRequired, proctorCfg.lighting_min_score])

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!requirements.fullscreenRequired) {
        setFullscreen('passed')
        return
      }
      setFullscreen(document.fullscreenElement ? 'passed' : 'pending')
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [requirements.fullscreenRequired])

  useEffect(() => {
    return () => {
      stopCamera()
      stopScreenShareCheck()
      stopMicMonitor()
    }
  }, [stopCamera, stopMicMonitor, stopScreenShareCheck])

  const allPassed = useMemo(() => {
    if (configLoading || configError) return false
    return (
      (!requirements.cameraRequired || camera === 'passed') &&
      (!requirements.micRequired || mic === 'passed') &&
      (!requirements.fullscreenRequired || fullscreen === 'passed') &&
      (!requirements.screenRequired || screenShare === 'passed') &&
      (!requirements.lightingRequired || lighting === 'passed')
    )
  }, [
    camera,
    configError,
    configLoading,
    fullscreen,
    lighting,
    mic,
    screenShare,
    requirements.cameraRequired,
    requirements.micRequired,
    requirements.fullscreenRequired,
    requirements.lightingRequired,
    requirements.screenRequired,
  ])

  const renderIcon = (state) => {
    if (state === 'passed') return <span className={styles.iconPass}>&#10003;</span>
    if (state === 'failed') return <span className={styles.iconFail}>&#10007;</span>
    if (state === 'checking') return <span className={styles.iconChecking} />
    return <span className={styles.iconPending}>&#9679;</span>
  }

  const handleContinue = () => {
    if (!allPassed || continueBusy) return
    setContinueBusy(true)
    const flags = {
      mic_ok: !requirements.micRequired || mic === 'passed',
      cam_ok: !requirements.cameraRequired || camera === 'passed',
      fs_ok: !requirements.fullscreenRequired || fullscreen === 'passed',
      screen_ok: !requirements.screenRequired || screenShare === 'passed',
      lighting_score: lightingScore,
      requirements,
    }
    sessionStorage.setItem('precheck_flags', JSON.stringify(flags))
    const nextRoute = requirements.identityRequired ? `/tests/${testId}/verify-identity` : `/tests/${testId}/rules`
    navigate(nextRoute)
  }

  const continueLabel = requirements.identityRequired ? 'Continue to identity verification' : 'Continue to rules'

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={1} />

      <motion.div
        className={`${styles.card} glass`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <h1 className={styles.title}>System Check</h1>
        <p className={styles.sub}>We need to verify your system meets the requirements</p>
        {configError && (
          <div className={styles.helperRow}>
            <p className={styles.errorBanner}>{configError}</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => void loadConfig()} disabled={configLoading}>
              {configLoading ? 'Retrying requirements...' : 'Retry loading requirements'}
            </button>
          </div>
        )}

        <div className={styles.checksList}>
          <motion.div
            className={`${styles.checkRow} ${camera === 'passed' ? styles.passed : camera === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(camera)}
              <span>Camera Access</span>
            </div>
            {requirements.cameraRequired && camera === 'passed' && (
              <div className={styles.preview}>
                <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
              </div>
            )}
            {!requirements.cameraRequired && <p className={styles.hint}>Not required for this test.</p>}
            {requirements.cameraRequired && camera === 'failed' && <p className={styles.hint}>Please allow camera access and refresh.</p>}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${mic === 'passed' ? styles.passed : mic === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(mic)}
              <span>Microphone Access</span>
            </div>
            {!requirements.micRequired && <p className={styles.hint}>Not required for this test.</p>}
            {requirements.micRequired && mic === 'passed' && (
              <>
                <div className={styles.levelBar}>
                  <div className={styles.levelFill} style={{ width: `${micLevel}%` }} />
                </div>
                <p className={styles.hint}>Speak to confirm microphone level.</p>
              </>
            )}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${fullscreen === 'passed' ? styles.passed : fullscreen === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(fullscreen)}
              <span>Fullscreen Entry</span>
            </div>
            {!requirements.fullscreenRequired ? (
              <div className={styles.statusPill}>Not required</div>
            ) : fullscreen === 'passed' ? (
              <div className={styles.statusPill}>Fullscreen active</div>
            ) : (
              <button
                type="button"
                className={styles.inlineBtn}
                onClick={requestFullscreen}
                disabled={fullscreen === 'checking'}
              >
                {fullscreen === 'checking' ? 'Checking fullscreen...' : 'Enter fullscreen'}
              </button>
            )}
            {requirements.fullscreenRequired && fullscreen === 'pending' && <p className={styles.hint}>Enter fullscreen to continue.</p>}
            {requirements.fullscreenRequired && fullscreen === 'failed' && <p className={styles.hint}>Fullscreen is required for this test.</p>}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${lighting === 'passed' ? styles.passed : lighting === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(lighting)}
              <span>Lighting Quality</span>
            </div>
            {!requirements.lightingRequired && <p className={styles.hint}>Not required for this test.</p>}
            {requirements.lightingRequired && <p className={styles.hint}>Brightness: {(lightingScore * 100).toFixed(0)}%</p>}
          </motion.div>

          {proctorCfg.screen_capture && (
            <motion.div
              className={`${styles.checkRow} ${screenShare === 'passed' ? styles.passed : screenShare === 'failed' ? styles.failed : ''}`}
              whileHover={{ translateY: -2 }}
              transition={{ duration: 0.15 }}
            >
              <div className={styles.checkInfo}>
                {renderIcon(screenShare)}
                <span>Screen Share Permission</span>
              </div>
              {screenShare === 'passed' ? (
                <div className={styles.statusPill}>Screen share ready</div>
              ) : (
                <button
                  type="button"
                  className={styles.inlineBtn}
                  onClick={() => void checkScreenShare(true)}
                  disabled={screenShare === 'checking'}
                >
                  {screenShare === 'checking' ? 'Requesting screen...' : 'Share entire screen'}
                </button>
              )}
              {screenShare !== 'passed' && (
                <p className={styles.hint}>
                  Entire-screen sharing is required. Choose your full desktop in the browser picker before continuing.
                </p>
              )}
            </motion.div>
          )}
        </div>

        {!configError && !configLoading && (
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/tests/${testId}`)} disabled={checksBusy || continueBusy}>
              Back to instructions
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => void rerunChecks()} disabled={checksBusy || continueBusy}>
              {checksBusy ? 'Re-running checks...' : 'Re-run checks'}
            </button>
          </div>
        )}

        <motion.button
          type="button"
          className={styles.btn}
          disabled={!allPassed || continueBusy}
          whileTap={{ scale: allPassed && !continueBusy ? 0.98 : 1 }}
          onClick={handleContinue}
        >
          {configLoading ? 'Loading requirements...' : configError ? 'Cannot continue' : allPassed ? continueLabel : 'Waiting for checks...'}
        </motion.button>
      </motion.div>
    </div>
  )
}
