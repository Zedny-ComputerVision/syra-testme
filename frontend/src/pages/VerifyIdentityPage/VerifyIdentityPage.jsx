import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { resolveAttempt } from '../../utils/journeyAttempt'
import { precheckAttempt } from '../../services/attempt.service'
import { setAttemptId } from '../../utils/attemptSession'
import styles from './VerifyIdentityPage.module.scss'

export default function VerifyIdentityPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const [selfie, setSelfie] = useState(null)
  const [idPhoto, setIdPhoto] = useState(null)
  const [idNumber, setIdNumber] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [lightingScore, setLightingScore] = useState(0)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setError('Unable to access camera. Please allow camera permissions.')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [startCamera])

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3
    }
    setLightingScore(sum / (data.length / 4) / 255)
    setSelfie(dataUrl)
  }

  const captureId = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setIdPhoto(canvas.toDataURL('image/jpeg', 0.9))
  }

  const retake = () => {
    setSelfie(null)
    setIdPhoto(null)
    setResult(null)
    startCamera()
  }

  const confirm = async () => {
    if (!selfie || !idPhoto) {
      setError('Capture both your selfie and your ID photo first.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const attemptId = await resolveAttempt(examId)
      setAttemptId(attemptId)
      const flags = JSON.parse(sessionStorage.getItem('precheck_flags') || '{}')
      const payload = {
        selfie_b64: selfie,
        id_b64: idPhoto,
        lighting_score: flags.lighting_score ?? lightingScore,
        mic_ok: flags.mic_ok ?? true,
        cam_ok: flags.cam_ok ?? true,
        fs_ok: document.fullscreenElement != null || (flags.fs_ok ?? true),
        id_text: idNumber || undefined,
      }
      const { data } = await precheckAttempt(attemptId, payload)
      setResult(data)
      if (!data.all_pass) {
        setError('Precheck failed. Please retake photos or improve lighting.')
        return
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      navigate(`/rules/${examId}`)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to verify identity. Please retake your photo and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={2} />

      <div className={styles.card}>
        <h1 className={styles.title}>Verify Your Identity</h1>
        <p className={styles.sub}>Take a clear photo of yourself for verification</p>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.cameraArea}>
          <div className={styles.videoWrapper}>
            <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
            <div className={styles.faceGuide} />
          </div>
          <div className={styles.captureRow}>
            <button className={styles.captureBtn} onClick={capture}>
              Capture Selfie
            </button>
            <button className={styles.captureBtn} onClick={captureId}>
              Capture ID
            </button>
          </div>
          <div className={styles.previewRow}>
            {selfie && (
              <div className={styles.photoPreview}>
                <span className={styles.tag}>Selfie</span>
                <img src={selfie} alt="Selfie" className={styles.capturedImg} />
              </div>
            )}
            {idPhoto && (
              <div className={styles.photoPreview}>
                <span className={styles.tag}>ID</span>
                <img src={idPhoto} alt="ID" className={styles.capturedImg} />
              </div>
            )}
          </div>
          <div className={styles.photoActions}>
            <button className={styles.btnSecondary} onClick={retake}>Retake</button>
            <button className={styles.btnPrimary} onClick={confirm} disabled={submitting}>
              {submitting ? 'Verifying...' : 'Confirm & Continue'}
            </button>
          </div>
          <div className={styles.formRow}>
            <label className={styles.label}>ID number (optional)</label>
            <input
              className={styles.input}
              placeholder="e.g. passport / national ID"
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
            />
            <p className={styles.helper}>If OCR misses your ID text, you can type it here.</p>
          </div>
          {result && (
            <div className={styles.resultBox}>
              <div>Face match score: {result.face_match_score?.toFixed(3)}</div>
              <div>Lighting ok: {result.lighting_ok ? 'Yes' : 'No'}</div>
              <div>ID verified: {result.id_verified ? 'Yes' : 'No'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
