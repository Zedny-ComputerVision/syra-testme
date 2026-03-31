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
import useLanguage from '../../hooks/useLanguage'
import styles from './VerifyIdentityPage.module.scss'

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
  const { t } = useLanguage()

  const REASON_MESSAGES = {
    MIC_CHECK_FAILED: t('verify_reason_mic_failed'),
    CAMERA_CHECK_FAILED: t('verify_reason_camera_failed'),
    FULLSCREEN_REQUIRED: t('verify_reason_fullscreen'),
    LOW_LIGHTING: t('verify_reason_low_lighting'),
    FACE_MATCH_FAILED: t('verify_reason_face_mismatch'),
    ID_TEXT_MISSING_OR_INVALID: t('verify_reason_id_text_missing'),
    OCR_UNAVAILABLE_AND_MANUAL_ID_REQUIRED: t('verify_reason_ocr_unavailable'),
    ID_IMAGE_TOO_SIMILAR_TO_SELFIE: t('verify_reason_id_too_similar'),
    ID_CAPTURE_LOOKS_LIKE_SELFIE: t('verify_reason_id_looks_selfie'),
    ID_DOCUMENT_NOT_DETECTED: t('verify_reason_id_not_detected'),
  }

  const toReasonText = (reason) => REASON_MESSAGES[reason] || reason

  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
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
      label: t('verify_identity_check'),
      value: requirements.identityRequired ? t('required') : t('verify_skipped'),
      helper: requirements.identityRequired
        ? t('verify_identity_required_helper')
        : t('verify_identity_skipped_helper'),
    },
    {
      label: t('verify_camera_label'),
      value: requirements.cameraRequired ? t('required') : t('optional'),
      helper: requirements.cameraRequired ? t('verify_camera_required_helper') : t('verify_camera_optional_helper'),
    },
    {
      label: t('verify_lighting_label'),
      value: requirements.lightingRequired ? `${Math.round(lightingScore * 100)}% ${t('verify_live')}` : t('verify_not_enforced'),
      helper: requirements.lightingRequired ? t('verify_lighting_required_helper') : t('verify_lighting_disabled_helper'),
    },
    {
      label: t('verify_id_number_label'),
      value: idNumber.trim() ? t('verify_entered_manually') : t('verify_auto_detection'),
      helper: idNumber.trim() ? t('verify_id_typed_helper') : t('verify_id_auto_helper'),
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
      setError(t('verify_camera_access_error'))
    }
  }, [stopCamera, t])

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
      setError(t('verify_invalid_link'))
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
      setError(readTestAccessError(error, t('verify_load_requirements_error')))
    } finally {
      setLoadingConfig(false)
    }
  }, [navigate, startCamera, testId, t])

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
      setError(t('verify_camera_not_ready'))
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
      setError(t('verify_camera_not_ready'))
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
    reader.onerror = () => reject(new Error(t('verify_file_read_error')))
    reader.readAsDataURL(file)
  })

  const handleUploadId = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t('verify_invalid_image'))
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
      setError(t('verify_load_id_error'))
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
      setError(t('verify_config_not_loaded'))
      return
    }
    if (!requirements.identityRequired) {
      navigate(`/tests/${testId}/rules`, { replace: true })
      return
    }
    if (!selfie || !idPhoto) {
      setError(t('verify_selfie_id_required'))
      return
    }
    if (fullscreenRequiredHere && !document.fullscreenElement) {
      setFullscreenResumeNeeded(true)
      setError(t('verify_return_fullscreen'))
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
        setError(t('verify_verification_failed'))
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
      setError(detail || t('verify_identity_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={2} />

      <div className={styles.card}>
        <h1 className={styles.title}>{t('verify_title')}</h1>
        <p className={styles.sub}>{t('verify_subtitle')}</p>

        <div className={styles.requirementGrid}>
          {requirementCards.map((card) => (
            <div key={card.label} className={styles.requirementCard}>
              <div className={styles.requirementLabel}>{card.label}</div>
              <div className={styles.requirementValue}>{card.value}</div>
              <div className={styles.requirementHelper}>{card.helper}</div>
            </div>
          ))}
        </div>

        {loadingConfig && <div className={styles.errorBox}>{t('verify_loading_requirements')}</div>}
        {error && <div className={styles.errorBox}>{error}</div>}
        {!loadingConfig && fullscreenRequiredHere && (!fullscreenActive || fullscreenResumeNeeded) && (
          <div className={styles.helperRow}>
            <div className={styles.warningBox}>
              {t('verify_fullscreen_picker_warning')}
            </div>
            <button type="button" className={styles.btnSecondary} onClick={() => void requestFullscreen()} disabled={submitting}>
              {t('verify_return_to_fullscreen')}
            </button>
          </div>
        )}
        {!loadingConfig && !configResolved && (
          <div className={styles.helperRow}>
            <button type="button" className={styles.btnSecondary} onClick={() => void loadRequirements()}>
              {t('verify_reload_requirements')}
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
                    <span className={styles.tag}>{t('verify_selfie_tag')}</span>
                    <img src={selfie} alt={t('verify_selfie_tag')} className={styles.capturedImg} />
                  </div>
                )}
                {idPhoto && (
                  <div className={styles.photoPreview}>
                    <span className={styles.tag}>{t('verify_id_tag')}</span>
                    <img src={idPhoto} alt={t('verify_id_tag')} className={styles.capturedImg} />
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
                  aria-label={t('verify_capture_selfie_aria')}
                  title={t('verify_capture_selfie_aria')}
                >
                  {t('verify_capture_selfie')}
                </button>
                <button
                  type="button"
                  className={styles.captureBtn}
                  onClick={captureId}
                  disabled={loadingConfig || submitting || !configResolved || !cameraReady}
                  aria-label={t('verify_capture_id_aria')}
                  title={t('verify_capture_id_aria')}
                >
                  {t('verify_capture_id')}
                </button>
                <button
                  type="button"
                  className={styles.captureBtn}
                  onClick={() => openUploadPicker(idInputRef)}
                  disabled={loadingConfig || submitting || !configResolved}
                  aria-label={t('verify_upload_id_aria')}
                  title={t('verify_upload_id_aria')}
                >
                  {t('verify_upload_id')}
                </button>
              </div>
              {configResolved && !cameraReady && (
                <p className={styles.helper}>
                  {t('verify_camera_helper')}
                </p>
              )}
              <div className={styles.captureChecklist}>
                <div className={`${styles.captureState} ${selfie ? styles.captureStateReady : ''}`}>{t('verify_selfie_label')} {selfie ? t('verify_ready') : t('verify_missing')}</div>
                <div className={`${styles.captureState} ${idPhoto ? styles.captureStateReady : ''}`}>{t('verify_id_image_label')} {idPhoto ? t('verify_ready') : t('verify_missing')}</div>
                <div className={`${styles.captureState} ${idNumber.trim() ? styles.captureStateReady : ''}`}>{t('verify_manual_id_label')} {idNumber.trim() ? t('verify_provided') : t('verify_optional_label')}</div>
              </div>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="identity-id-number">{t('verify_id_number_label')}</label>
                <input
                  id="identity-id-number"
                  className={styles.input}
                  placeholder={t('verify_id_placeholder')}
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                />
                <p className={styles.helper}>{t('verify_id_manual_hint')}</p>
              </div>
              <div className={styles.photoActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => navigate(`/tests/${testId}/system-check`)} disabled={submitting || loadingConfig}>
                  {t('verify_back_to_system_check')}
                </button>
                <button type="button" className={styles.btnSecondary} onClick={retake} disabled={submitting || !configResolved}>{t('verify_retake_photos')}</button>
                <button type="button" className={styles.btnPrimary} onClick={confirm} disabled={submitting || loadingConfig || !configResolved || !selfie || !idPhoto || (fullscreenRequiredHere && !fullscreenActive)}>
                  {submitting ? t('verify_verifying') : t('verify_confirm_continue')}
                </button>
              </div>
            </div>
          </div>
          <input
            ref={idInputRef}
            className={styles.fileInput}
            type="file"
            accept="image/*"
            aria-label={t('verify_upload_id_aria')}
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
