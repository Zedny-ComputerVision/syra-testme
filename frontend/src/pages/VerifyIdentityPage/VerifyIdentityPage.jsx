import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { resolveAttempt } from '../../utils/journeyAttempt'
import { precheckAttempt } from '../../services/attempt.service'
import { getTest } from '../../services/test.service'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import { setAttemptId } from '../../utils/attemptSession'
import { readTestAccessError } from '../../utils/testAccessError'
import styles from './VerifyIdentityPage.module.scss'

const REASON_MESSAGES = {
  MIC_CHECK_FAILED: 'Microphone access is required. Please allow microphone access and try again.',
  CAMERA_CHECK_FAILED: 'Camera access is required. Please allow camera access and try again.',
  FULLSCREEN_REQUIRED: 'Please switch to fullscreen to continue.',
  LOW_LIGHTING: 'Your photo is too dark. Move to a brighter area and retake.',
  FACE_MATCH_FAILED: 'Your selfie does not match the face on your ID. Make sure both photos are clear and try again.',
  ID_TEXT_MISSING_OR_INVALID: 'We could not read your ID number. Please type it in the field below.',
  OCR_UNAVAILABLE_AND_MANUAL_ID_REQUIRED: 'Please type your ID number in the field below.',
  ID_IMAGE_TOO_SIMILAR_TO_SELFIE: 'The ID photo looks the same as your selfie. Please take a photo of your actual ID card.',
  ID_CAPTURE_LOOKS_LIKE_SELFIE: 'Please take a photo of your ID card, not your face.',
  ID_DOCUMENT_NOT_DETECTED: 'We could not detect your ID card. Make sure the full card is visible and well-lit.',
}

const toReasonText = (reason) => REASON_MESSAGES[reason] || reason
const START_ERROR_STORAGE_PREFIX = 'journey_start_error:'
const precheckTestBypassEnabled = false

function persistJourneyStartError(testId, message) {
  if (!message) return
  try {
    sessionStorage.setItem(`${START_ERROR_STORAGE_PREFIX}${testId}`, message)
  } catch {
    // ignore storage failures and fall back to inline error handling
  }
}

export default function VerifyIdentityPage() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const selfieInputRef = useRef(null)
  const idInputRef = useRef(null)
  const pickerExitedFullscreenRef = useRef(false)
  const [selfie, setSelfie] = useState(null)
  const [idPhoto, setIdPhoto] = useState(null)
  const [idNumber, setIdNumber] = useState('')
  const [error, setError] = useState('')
  const [failureReasons, setFailureReasons] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [lightingScore, setLightingScore] = useState(0)
  const [requirements, setRequirements] = useState(getJourneyRequirements({}))
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [configResolved, setConfigResolved] = useState(false)
  const [fullscreenActive, setFullscreenActive] = useState(Boolean(document.fullscreenElement))
  const [fullscreenResumeNeeded, setFullscreenResumeNeeded] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  // When screen capture is required, defer fullscreen to the exam page
  const fullscreenRequiredHere = requirements.fullscreenRequired && !requirements.screenRequired

  const requirementCards = [
    {
      label: 'Identity check',
      value: requirements.identityRequired ? 'Required' : 'Skipped',
      helper: requirements.identityRequired
        ? 'Selfie and ID evidence are required before the learner can continue.'
        : 'This test skips identity verification.',
    },
    {
      label: 'Camera',
      value: requirements.cameraRequired ? 'Required' : 'Optional',
      helper: requirements.cameraRequired ? 'Live camera access is expected for capture and proctoring.' : 'Uploads can be used without a live camera requirement.',
    },
    {
      label: 'Lighting',
      value: requirements.lightingRequired ? `${Math.round(lightingScore * 100)}% live` : 'Not enforced',
      helper: requirements.lightingRequired ? 'Move into brighter light if the score stays too low.' : 'Low-light rejection is disabled for this test.',
    },
    {
      label: 'ID number',
      value: idNumber.trim() ? 'Entered manually' : 'Automatic detection',
      helper: idNumber.trim() ? 'Your typed ID number will be sent with your photos.' : 'If the ID number is not detected automatically, the learner can type it manually.',
    },
  ]

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  const requestFullscreen = useCallback(async () => {
    if (!fullscreenRequiredHere) return true
    if (document.fullscreenElement) {
      setFullscreenActive(true)
      setFullscreenResumeNeeded(false)
      pickerExitedFullscreenRef.current = false
      return true
    }
    const request = document.documentElement.requestFullscreen
    if (!request) return false
    try {
      await request.call(document.documentElement)
      setFullscreenActive(Boolean(document.fullscreenElement))
      setFullscreenResumeNeeded(false)
      pickerExitedFullscreenRef.current = false
      return Boolean(document.fullscreenElement)
    } catch {
      setFullscreenActive(Boolean(document.fullscreenElement))
      return false
    }
  }, [fullscreenRequiredHere])

  const startCamera = useCallback(async () => {
    try {
      stopCamera()
      setCameraReady(false)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        if (videoRef.current.readyState >= 2) {
          setCameraReady(videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0)
        }
      }
    } catch {
      setCameraReady(false)
      setError('Camera is unavailable. You can still upload selfie and ID images below.')
    }
  }, [stopCamera])

  const openUploadPicker = useCallback((inputRef) => {
    pickerExitedFullscreenRef.current = fullscreenRequiredHere && Boolean(document.fullscreenElement)
    if (pickerExitedFullscreenRef.current) {
      setFullscreenResumeNeeded(false)
    }
    inputRef.current?.click()
  }, [fullscreenRequiredHere])

  const loadRequirements = useCallback(async () => {
    setLoadingConfig(true)
    setError('')
    setConfigResolved(false)
    if (!testId) {
      setRequirements(getJourneyRequirements({ identity_required: true, camera_required: true, lighting_required: true }))
      setError('Invalid test link. Return to the available tests list and try again.')
      setLoadingConfig(false)
      return
    }
    try {
      const { data } = await getTest(testId)
      const normalized = normalizeTest(data)
      const nextRequirements = getJourneyRequirements(normalized?.proctoring_config || {})
      setRequirements(nextRequirements)
      setConfigResolved(true)
      if (!nextRequirements.identityRequired) {
        navigate(`/tests/${testId}/rules`, { replace: true })
        return
      }
      await startCamera()
    } catch (error) {
      setRequirements(getJourneyRequirements({ identity_required: true, camera_required: true, lighting_required: true }))
      setError(readTestAccessError(error, 'Failed to load test verification requirements. Please refresh and try again.'))
    } finally {
      setLoadingConfig(false)
    }
  }, [navigate, startCamera, testId])

  useEffect(() => {
    void loadRequirements()
    return () => {
      stopCamera()
    }
  }, [loadRequirements, stopCamera])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement)
      setFullscreenActive(active)
      if (!fullscreenRequiredHere) {
        setFullscreenResumeNeeded(false)
        pickerExitedFullscreenRef.current = false
        return
      }
      if (active) {
        setFullscreenResumeNeeded(false)
        pickerExitedFullscreenRef.current = false
        return
      }
      if (pickerExitedFullscreenRef.current) {
        setFullscreenResumeNeeded(true)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [fullscreenRequiredHere])

  const capture = () => {
    const video = videoRef.current
    if (!video || !streamRef.current || !cameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Live camera capture is not ready. Allow camera access or upload your images instead.')
      return
    }
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
    setError('')
  }

  const captureId = () => {
    const video = videoRef.current
    if (!video || !streamRef.current || !cameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Live camera capture is not ready. Allow camera access or upload your images instead.')
      return
    }
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setIdPhoto(canvas.toDataURL('image/jpeg', 0.9))
    setError('')
  }

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

  const estimateLightingFromDataUrl = (dataUrl) => new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = canvasRef.current
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3
        }
        resolve(sum / (data.length / 4) / 255)
      } catch {
        resolve(0)
      }
    }
    img.onerror = () => resolve(0)
    img.src = dataUrl
  })

  const handleUploadSelfie = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid selfie image file.')
      setFullscreenResumeNeeded(false)
      return
    }
    if (fullscreenRequiredHere && !document.fullscreenElement) {
      setFullscreenResumeNeeded(true)
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setSelfie(dataUrl)
      const score = await estimateLightingFromDataUrl(dataUrl)
      setLightingScore(score)
      setError('')
      setFailureReasons([])
      setResult(null)
    } catch {
      setError('Failed to load selfie image.')
    }
  }

  const handleUploadId = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid ID image file.')
      setFullscreenResumeNeeded(false)
      return
    }
    if (fullscreenRequiredHere && !document.fullscreenElement) {
      setFullscreenResumeNeeded(true)
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setIdPhoto(dataUrl)
      setError('')
      setFailureReasons([])
      setResult(null)
    } catch {
      setError('Failed to load ID image.')
    }
  }

  const retake = () => {
    setSelfie(null)
    setIdPhoto(null)
    setResult(null)
    setFailureReasons([])
    setError('')
    startCamera()
  }

  const confirm = async () => {
    if (submitting) return
    if (!configResolved) {
      setError('Cannot verify identity because test requirements were not loaded.')
      return
    }
    if (!requirements.identityRequired) {
      navigate(`/tests/${testId}/rules`, { replace: true })
      return
    }
    if (!selfie || !idPhoto) {
      setError('Capture or upload both your selfie and your ID photo first.')
      return
    }
    if (fullscreenRequiredHere && !document.fullscreenElement) {
      setFullscreenResumeNeeded(true)
      setError('Return to fullscreen before continuing.')
      return
    }
    setSubmitting(true)
    setError('')
    setFailureReasons([])
    try {
      const attemptId = await resolveAttempt(testId)
      setAttemptId(attemptId)
      const flags = JSON.parse(sessionStorage.getItem('precheck_flags') || '{}')
      const payload = {
        selfie_b64: selfie,
        id_b64: idPhoto,
        lighting_score: flags.lighting_score ?? lightingScore,
        mic_ok: flags.mic_ok ?? !requirements.micRequired,
        cam_ok: flags.cam_ok ?? Boolean(selfie),
        fs_ok: !fullscreenRequiredHere || Boolean(document.fullscreenElement),
        id_text: idNumber || undefined,
        test_pass: false,
      }
      const { data } = await precheckAttempt(attemptId, payload)
      setResult(data)
      if (!data.all_pass) {
        const reasons = Array.isArray(data.failure_reasons) ? data.failure_reasons : []
        setFailureReasons(reasons)
        setError('Verification failed. Please fix the issues below and try again.')
        return
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
      navigate(`/tests/${testId}/rules`)
    } catch (e) {
      const detail = e.response?.data?.detail || ''
      if (
        typeof detail === 'string'
        && (
          detail.startsWith('Retake available in ')
          || detail === 'Retakes are disabled for this test'
          || detail === 'Max attempts reached'
        )
      ) {
        persistJourneyStartError(testId, detail)
        navigate(`/tests/${testId}/rules`, { replace: true })
        return
      }
      setFailureReasons([])
      setError(detail || 'Failed to verify identity. Please retake your photo and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={2} />

      <div className={styles.card}>
        <h1 className={styles.title}>Verify Your Identity</h1>
        <p className={styles.sub}>Capture or upload a clear selfie and a clear ID image</p>

        <div className={styles.requirementGrid}>
          {requirementCards.map((card) => (
            <div key={card.label} className={styles.requirementCard}>
              <div className={styles.requirementLabel}>{card.label}</div>
              <div className={styles.requirementValue}>{card.value}</div>
              <div className={styles.requirementHelper}>{card.helper}</div>
            </div>
          ))}
        </div>

        {loadingConfig && <div className={styles.errorBox}>Loading verification requirements...</div>}
        {error && <div className={styles.errorBox}>{error}</div>}
        {!loadingConfig && fullscreenRequiredHere && (!fullscreenActive || fullscreenResumeNeeded) && (
          <div className={styles.helperRow}>
            <div className={styles.warningBox}>
              Opening the browser file picker can exit fullscreen. Return to fullscreen before continuing.
            </div>
            <button type="button" className={styles.btnSecondary} onClick={() => void requestFullscreen()} disabled={submitting}>
              Return to fullscreen
            </button>
          </div>
        )}
        {!loadingConfig && !configResolved && (
          <div className={styles.helperRow}>
            <button type="button" className={styles.btnSecondary} onClick={() => void loadRequirements()}>
              Reload verification requirements
            </button>
          </div>
        )}
        {failureReasons.length > 0 && (
          <ul className={styles.reasonList}>
            {failureReasons.map((reason) => (
              <li key={reason}>{toReasonText(reason)}</li>
            ))}
          </ul>
        )}

        <div className={styles.cameraArea}>
          <div className={styles.captureLayout}>
            <div className={styles.visualColumn}>
              <div className={styles.videoWrapper}>
                <video
                  ref={videoRef}
                  className={styles.video}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={() => setCameraReady(true)}
                  onEmptied={() => setCameraReady(false)}
                />
                <div className={styles.faceGuide} />
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
            </div>
            <div className={styles.controlColumn}>
              <div className={styles.captureRow}>
                <button
                  type="button"
                  className={styles.captureBtn}
                  onClick={capture}
                  disabled={loadingConfig || submitting || !configResolved || !cameraReady}
                  aria-label="Capture selfie from live camera"
                  title="Capture selfie from live camera"
                >
                  Capture Selfie
                </button>
                <button
                  type="button"
                  className={styles.captureBtn}
                  onClick={() => openUploadPicker(selfieInputRef)}
                  disabled={loadingConfig || submitting || !configResolved}
                  aria-label="Upload selfie image"
                  title="Upload selfie image"
                >
                  Upload Selfie
                </button>
                <button
                  type="button"
                  className={styles.captureBtn}
                  onClick={captureId}
                  disabled={loadingConfig || submitting || !configResolved || !cameraReady}
                  aria-label="Capture ID photo from live camera"
                  title="Capture ID photo from live camera"
                >
                  Capture ID
                </button>
                <button
                  type="button"
                  className={styles.captureBtn}
                  onClick={() => openUploadPicker(idInputRef)}
                  disabled={loadingConfig || submitting || !configResolved}
                  aria-label="Upload ID image"
                  title="Upload ID image"
                >
                  Upload ID
                </button>
              </div>
              {configResolved && !cameraReady && (
                <p className={styles.helper}>
                  Live camera capture is unavailable right now. Allow camera access or continue with the upload buttons.
                </p>
              )}
              <div className={styles.captureChecklist}>
                <div className={`${styles.captureState} ${selfie ? styles.captureStateReady : ''}`}>Selfie {selfie ? 'ready' : 'missing'}</div>
                <div className={`${styles.captureState} ${idPhoto ? styles.captureStateReady : ''}`}>ID image {idPhoto ? 'ready' : 'missing'}</div>
                <div className={`${styles.captureState} ${idNumber.trim() ? styles.captureStateReady : ''}`}>Manual ID {idNumber.trim() ? 'provided' : 'optional'}</div>
              </div>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="identity-id-number">ID number</label>
                <input
                  id="identity-id-number"
                  className={styles.input}
                  placeholder="e.g. passport / national ID"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                />
                <p className={styles.helper}>If the ID number is not detected from the image, you can type it here.</p>
              </div>
              <div className={styles.photoActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => navigate(`/tests/${testId}/system-check`)} disabled={submitting || loadingConfig}>
                  Back to system check
                </button>
                <button type="button" className={styles.btnSecondary} onClick={retake} disabled={submitting || !configResolved}>Retake identity photos</button>
                <button type="button" className={styles.btnPrimary} onClick={confirm} disabled={submitting || loadingConfig || !configResolved || !selfie || !idPhoto || (fullscreenRequiredHere && !fullscreenActive)}>
                  {submitting ? 'Verifying...' : 'Confirm & Continue'}
                </button>
              </div>
            </div>
          </div>
          <input
            ref={selfieInputRef}
            className={styles.fileInput}
            type="file"
            accept="image/*"
            aria-label="Upload selfie image"
            onChange={(e) => {
              handleUploadSelfie(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={idInputRef}
            className={styles.fileInput}
            type="file"
            accept="image/*"
            aria-label="Upload ID image"
            onChange={(e) => {
              handleUploadId(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}
