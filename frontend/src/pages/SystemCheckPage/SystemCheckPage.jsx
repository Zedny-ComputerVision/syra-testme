import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { getTest } from '../../services/test.service'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import { readTestAccessError } from '../../utils/testAccessError'
import { ENTIRE_SCREEN_REQUIRED, requestEntireScreenShare } from '../../utils/screenCapture'
import { clearScreenStream, peekScreenStream, storeScreenStream } from '../../utils/screenShareState'
import useLanguage from '../../hooks/useLanguage'

import styles from './SystemCheckPage.module.scss'

export default function SystemCheckPage() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const canvasRef = useRef(null)
  const micStreamRef = useRef(null)
  const micAudioCtxRef = useRef(null)
  const micIntervalRef = useRef(null)
  const micTimeoutRef = useRef(null)

  const [camera, setCamera] = useState('pending')
  const [mic, setMic] = useState('pending')
  const [screen, setScreen] = useState('pending')
  const [fullscreen, setFullscreen] = useState('pending')
  const [micLevel, setMicLevel] = useState(0)
  const [lighting, setLighting] = useState('pending')
  const [lightingScore, setLightingScore] = useState(0)
  const [screenError, setScreenError] = useState('')

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
        setConfigError(t('syscheck_mic_release_error'))
      })
      micAudioCtxRef.current = null
    }
    setMicLevel(0)
  }, [t])

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

  const hasActiveScreenShare = useCallback(() => {
    const stream = peekScreenStream()
    return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'))
  }, [])

  const checkScreenShare = useCallback((required) => {
    if (!required) {
      clearScreenStream()
      setScreen('passed')
      setScreenError('')
      return
    }
    if (hasActiveScreenShare()) {
      setScreen('passed')
      setScreenError('')
      return
    }
    setScreen('pending')
    setScreenError('')
  }, [hasActiveScreenShare])

  const requestScreenShare = useCallback(async () => {
    if (!requirements.screenRequired) return
    setScreen('checking')
    setScreenError('')
    try {
      const stream = await requestEntireScreenShare()
      storeScreenStream(stream)
      setScreen('passed')
    } catch (error) {
      clearScreenStream()
      setScreen('failed')
      if (error?.code === ENTIRE_SCREEN_REQUIRED) {
        setScreenError(t('syscheck_entire_screen_error'))
        return
      }
      if (error?.name === 'NotAllowedError') {
        setScreenError(t('syscheck_screen_denied'))
        return
      }
      setScreenError(error?.message || t('syscheck_screen_start_error'))
    }
  }, [requirements.screenRequired, t])

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    setConfigError('')
    if (!testId) {
      setConfigError(t('syscheck_invalid_link'))
      setProctorCfg({})
      setRequirements(getJourneyRequirements({}))
      setConfigLoading(false)
      return
    }
    try {
      const { data } = await getTest(testId)
      const normalized = normalizeTest(data)
      const cfg = normalized?.proctoring_config || {}
      setProctorCfg(cfg)
      setRequirements(getJourneyRequirements(cfg))
    } catch (error) {
      setConfigError(readTestAccessError(error, t('syscheck_load_config_error')))
      setProctorCfg({})
      setRequirements(getJourneyRequirements({}))
    } finally {
      setConfigLoading(false)
    }
  }, [testId, t])

  const rerunChecks = useCallback(async () => {
    if (checksBusy || configLoading || configError) return
    setChecksBusy(true)
    try {
      await checkCamera(requirements.cameraRequired)
      await checkMic(requirements.micRequired)
      checkScreenShare(requirements.screenRequired)
      checkFullscreen(requirements.screenRequired ? false : requirements.fullscreenRequired)
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
    checkScreenShare,
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
  ])

  useEffect(() => {
    void loadConfig()
    return () => {
      stopCamera()
      stopMicMonitor()
    }
  }, [loadConfig, stopCamera, stopMicMonitor])

  useEffect(() => {
    if (configLoading) return
    checkCamera(requirements.cameraRequired)
    checkMic(requirements.micRequired)
    checkScreenShare(requirements.screenRequired)
    // When screen capture is required, skip fullscreen here -- the exam page
    // enters fullscreen after the screen share gate (the picker exits fullscreen).
    checkFullscreen(requirements.screenRequired ? false : requirements.fullscreenRequired)
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
    requirements.screenRequired,
    requirements.fullscreenRequired,
    requirements.lightingRequired,
    checkCamera,
    checkScreenShare,
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
      stopMicMonitor()
    }
  }, [stopCamera, stopMicMonitor])

  // When screen capture is required, fullscreen is deferred to the exam page
  const fullscreenRequiredHere = requirements.fullscreenRequired && !requirements.screenRequired

  const allPassed = useMemo(() => {
    if (configLoading || configError) return false
    return (
      (!requirements.cameraRequired || camera === 'passed') &&
      (!requirements.micRequired || mic === 'passed') &&
      (!requirements.screenRequired || screen === 'passed') &&
      (!fullscreenRequiredHere || fullscreen === 'passed') &&
      (!requirements.lightingRequired || lighting === 'passed')
    )
  }, [
    camera,
    configError,
    configLoading,
    fullscreen,
    fullscreenRequiredHere,
    lighting,
    mic,
    screen,
    requirements.cameraRequired,
    requirements.micRequired,
    requirements.screenRequired,
    requirements.lightingRequired,
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
      screen_ok: !requirements.screenRequired || screen === 'passed',
      fs_ok: !requirements.fullscreenRequired || fullscreen === 'passed',
      lighting_score: lightingScore,
      requirements,
    }
    sessionStorage.setItem('precheck_flags', JSON.stringify(flags))
    const nextRoute = requirements.identityRequired ? `/tests/${testId}/verify-identity` : `/tests/${testId}/rules`
    navigate(nextRoute)
  }

  const continueLabel = requirements.identityRequired ? t('syscheck_continue_identity') : t('syscheck_continue_rules')

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={1} />

      <motion.div
        className={`${styles.card} glass`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <h1 className={styles.title}>{t('syscheck_title')}</h1>
        <p className={styles.sub}>{t('syscheck_subtitle')}</p>
        {configError && (
          <div className={styles.helperRow}>
            <p className={styles.errorBanner}>{configError}</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => void loadConfig()} disabled={configLoading}>
              {configLoading ? t('syscheck_retrying_requirements') : t('syscheck_retry_loading')}
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
              <span>{t('syscheck_camera_access')}</span>
            </div>
            {requirements.cameraRequired && camera === 'passed' && (
              <div className={styles.preview}>
                <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
              </div>
            )}
            {!requirements.cameraRequired && <p className={styles.hint}>{t('syscheck_not_required')}</p>}
            {requirements.cameraRequired && camera === 'failed' && <p className={styles.hint}>{t('syscheck_allow_camera')}</p>}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${mic === 'passed' ? styles.passed : mic === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(mic)}
              <span>{t('syscheck_mic_access')}</span>
            </div>
            {!requirements.micRequired && <p className={styles.hint}>{t('syscheck_not_required')}</p>}
            {requirements.micRequired && mic === 'passed' && (
              <>
                <div className={styles.levelBar}>
                  <div className={styles.levelFill} style={{ width: `${micLevel}%` }} />
                </div>
                <p className={styles.hint}>{t('syscheck_speak_confirm')}</p>
              </>
            )}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${screen === 'passed' ? styles.passed : screen === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(screen)}
              <span>{t('syscheck_screen_share')}</span>
            </div>
            {!requirements.screenRequired ? (
              <p className={styles.hint}>{t('syscheck_not_required')}</p>
            ) : screen === 'passed' ? (
              <div className={styles.statusPill}>{t('syscheck_screen_shared')}</div>
            ) : (
              <button
                type="button"
                className={styles.inlineBtn}
                onClick={() => void requestScreenShare()}
                disabled={screen === 'checking' || checksBusy || continueBusy}
              >
                {screen === 'checking' ? t('syscheck_requesting_screen') : t('syscheck_share_screen')}
              </button>
            )}
            {requirements.screenRequired && screen === 'pending' && (
              <p className={styles.hint}>{t('syscheck_share_screen_hint')}</p>
            )}
            {requirements.screenRequired && screenError && <p className={styles.hint}>{screenError}</p>}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${fullscreen === 'passed' ? styles.passed : fullscreen === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(fullscreenRequiredHere ? fullscreen : 'passed')}
              <span>{t('syscheck_fullscreen_entry')}</span>
            </div>
            {!fullscreenRequiredHere ? (
              <div className={styles.statusPill}>{requirements.screenRequired ? t('syscheck_handled_exam_page') : t('syscheck_not_required_short')}</div>
            ) : fullscreen === 'passed' ? (
              <div className={styles.statusPill}>{t('syscheck_fullscreen_active')}</div>
            ) : (
              <button
                type="button"
                className={styles.inlineBtn}
                onClick={requestFullscreen}
                disabled={fullscreen === 'checking'}
              >
                {fullscreen === 'checking' ? t('syscheck_checking_fullscreen') : t('syscheck_enter_fullscreen')}
              </button>
            )}
            {fullscreenRequiredHere && fullscreen === 'pending' && <p className={styles.hint}>{t('syscheck_enter_fullscreen_hint')}</p>}
            {fullscreenRequiredHere && fullscreen === 'failed' && <p className={styles.hint}>{t('syscheck_fullscreen_required')}</p>}
          </motion.div>

          <motion.div
            className={`${styles.checkRow} ${lighting === 'passed' ? styles.passed : lighting === 'failed' ? styles.failed : ''}`}
            whileHover={{ translateY: -2 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.checkInfo}>
              {renderIcon(lighting)}
              <span>{t('syscheck_lighting_quality')}</span>
            </div>
            {!requirements.lightingRequired && <p className={styles.hint}>{t('syscheck_not_required')}</p>}
            {requirements.lightingRequired && <p className={styles.hint}>{t('syscheck_brightness')}: {(lightingScore * 100).toFixed(0)}%</p>}
          </motion.div>

        </div>

        {!configError && !configLoading && (
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/tests/${testId}`)} disabled={checksBusy || continueBusy}>
              {t('syscheck_back_to_instructions')}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => void rerunChecks()} disabled={checksBusy || continueBusy}>
              {checksBusy ? t('syscheck_rerunning') : t('syscheck_rerun_checks')}
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
          {configLoading ? t('syscheck_loading_requirements') : configError ? t('syscheck_cannot_continue') : allPassed ? continueLabel : t('syscheck_waiting_checks')}
        </motion.button>
      </motion.div>
    </div>
  )
}
