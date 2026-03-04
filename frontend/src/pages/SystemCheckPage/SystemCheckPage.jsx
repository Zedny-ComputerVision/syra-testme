import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { getExam } from '../../services/exam.service'
import styles from './SystemCheckPage.module.scss'

export default function SystemCheckPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)

  const [camera, setCamera] = useState('pending')   // pending | checking | passed | failed
  const [mic, setMic] = useState('pending')
  const [fullscreen, setFullscreen] = useState('pending')
  const [micLevel, setMicLevel] = useState(0)
  const [lighting, setLighting] = useState('pending')
  const [lightingScore, setLightingScore] = useState(0)
  const [proctorCfg, setProctorCfg] = useState({})

  // Camera check
  const checkCamera = useCallback(async () => {
    setCamera('checking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCamera('passed')
    } catch {
      setCamera('failed')
    }
  }, [])

  // Lighting check (simple average brightness)
  useEffect(() => {
    if (!videoRef.current) return
    const canvas = canvasRef.current || document.createElement('canvas')
    canvasRef.current = canvas
    let raf
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
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
          sum += lum
        }
        const avg = sum / (data.length / 4) / 255
        setLightingScore(avg)
        const minScore = (proctorCfg.lighting_min_score || 0.35)
        setLighting(avg >= minScore ? 'passed' : 'failed')
      }
      raf = requestAnimationFrame(sample)
    }
    raf = requestAnimationFrame(sample)
    return () => cancelAnimationFrame(raf)
  }, [proctorCfg.lighting_min_score])

  // Mic check
  const checkMic = useCallback(async () => {
    setMic('checking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const check = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setMicLevel(Math.min(100, avg * 2))
      }
      const interval = setInterval(check, 100)
      setTimeout(() => {
        clearInterval(interval)
        stream.getTracks().forEach(t => t.stop())
        audioCtx.close()
      }, 10000)
      setMic('passed')
    } catch {
      setMic('failed')
    }
  }, [])

  // Fullscreen check
  const checkFullscreen = useCallback(() => {
    setFullscreen('checking')
    if (document.documentElement.requestFullscreen) {
      setFullscreen('passed')
    } else {
      setFullscreen('failed')
    }
  }, [])

  useEffect(() => {
    getExam(examId).then(({ data }) => setProctorCfg(data.proctoring_config || {})).catch(() => {})
    checkCamera()
    checkMic()
    checkFullscreen()
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [checkCamera, checkMic, checkFullscreen])

  const allPassed = camera === 'passed' && mic === 'passed' && fullscreen === 'passed' && lighting === 'passed'

  const renderIcon = (state) => {
    if (state === 'passed') return <span className={styles.iconPass}>&#10003;</span>
    if (state === 'failed') return <span className={styles.iconFail}>&#10007;</span>
    if (state === 'checking') return <span className={styles.iconChecking} />
    return <span className={styles.iconPending}>&#9679;</span>
  }

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
            {camera === 'passed' && (
              <div className={styles.preview}>
                <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
              </div>
            )}
            {camera === 'failed' && <p className={styles.hint}>Please allow camera access and refresh</p>}
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
            {mic === 'passed' && (
              <>
                <div className={styles.levelBar}>
                  <div className={styles.levelFill} style={{ width: `${micLevel}%` }} />
                </div>
                <p className={styles.hint}>Speak to see microphone level</p>
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
              <span>Fullscreen Support</span>
            </div>
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
            <p className={styles.hint}>Brightness: {(lightingScore * 100).toFixed(0)}%</p>
          </motion.div>

          {proctorCfg.screen_capture && (
            <motion.div className={styles.checkRow} whileHover={{ translateY: -2 }} transition={{ duration: 0.15 }}>
              <div className={styles.checkInfo}>
                <span className={styles.iconPending}>&#9679;</span>
                <span>Screen Share Permission</span>
              </div>
              <p className={styles.hint}>You will be asked to share your screen when the exam starts.</p>
            </motion.div>
          )}
        </div>

        <motion.button
          className={styles.btn}
          disabled={!allPassed}
          whileTap={{ scale: allPassed ? 0.98 : 1 }}
          onClick={() => {
            sessionStorage.setItem('precheck_flags', JSON.stringify({
              mic_ok: mic === 'passed',
              cam_ok: camera === 'passed',
              fs_ok: fullscreen === 'passed',
              lighting_score: lightingScore,
            }))
            navigate(`/verify-identity/${examId}`)
          }}
        >
          {allPassed ? 'Continue' : 'Waiting for checks...'}
        </motion.button>
      </motion.div>
    </div>
  )
}
