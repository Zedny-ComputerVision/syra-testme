import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  finalizeAttemptReview,
  generateAttemptReport,
  getAttempt,
  getAttemptAnswers,
  getAttemptProctoringSummary,
  reviewAttemptAnswer,
} from '../../services/attempt.service'
import { getTestQuestions, getTest } from '../../services/test.service'
import api from '../../services/api'
import useLanguage from '../../hooks/useLanguage'
import { normalizeAttempt, normalizeTest } from '../../utils/assessmentAdapters'
import { readBlobErrorMessage } from '../../utils/httpErrors'
import styles from './AttemptResult.module.scss'

function formatAnswerValue(value) {
  if (value == null || value === '') return '-'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return formatAnswerValue(JSON.parse(trimmed))
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
  return String(value)
}

function getSeverityClass(severity) {
  if (!severity) return ''
  const normalized = `${severity}`.charAt(0).toUpperCase() + `${severity}`.slice(1).toLowerCase()
  return styles[`severity${normalized}`] || ''
}

function hasAnswerValue(value) {
  if (value == null) return false
  if (Array.isArray(value)) return value.some((entry) => hasAnswerValue(entry))
  if (typeof value === 'object') return Object.values(value).some((entry) => hasAnswerValue(entry))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return false
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return hasAnswerValue(JSON.parse(trimmed))
      } catch {
        return Boolean(trimmed)
      }
    }
    return true
  }
  return true
}

export default function AttemptResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const [attempt, setAttempt] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [proctoringSummary, setProctoringSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [detailWarning, setDetailWarning] = useState('')
  const [proctoringSummaryError, setProctoringSummaryError] = useState('')
  const [certError, setCertError] = useState('')
  const [reportError, setReportError] = useState('')
  const [exam, setExam] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [reportBusy, setReportBusy] = useState('')
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewBusy, setReviewBusy] = useState({})
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [finalizingReview, setFinalizingReview] = useState(false)

  const formatConfidence = (value) => {
    return typeof value === 'number' ? `${Math.round(value * 100)}% ${t('result_confidence')}` : t('result_confidence_unavailable')
  }

  const loadResult = async () => {
    setLoading(true)
    setLoadError('')
    setDetailWarning('')
    setProctoringSummaryError('')
    setReviewError('')
    setReviewNotice('')
    setReportError('')
    setReviewDrafts({})
    setReviewBusy({})
    if (!id) {
      setAttempt(null)
      setQuestions([])
      setAnswers([])
      setProctoringSummary(null)
      setExam(null)
      setLoadError(t('result_invalid_link'))
      setLoading(false)
      return
    }
    try {
      const attRes = await getAttempt(id)
      const att = normalizeAttempt(attRes.data)
      setAttempt(att)
      setQuestions([])
      setAnswers([])
      setProctoringSummary(null)
      setExam(null)
      setLoading(false)
      const [qRes, aRes, exRes, eventsRes] = await Promise.allSettled([
        getTestQuestions(att.exam_id),
        getAttemptAnswers(id),
        getTest(att.exam_id),
        getAttemptProctoringSummary(id),
      ])
      const failed = []

      if (qRes.status === 'fulfilled') {
        setQuestions(qRes.value.data || [])
      } else {
        setQuestions([])
        failed.push('questions')
      }

      if (aRes.status === 'fulfilled') {
        setAnswers(aRes.value.data || [])
      } else {
        setAnswers([])
        failed.push('answers')
      }

      if (exRes.status === 'fulfilled') {
        setExam(normalizeTest(exRes.value.data || null))
      } else {
        setExam(null)
        failed.push('test')
      }

      if (eventsRes?.status === 'fulfilled') {
        setProctoringSummary(eventsRes.value.data || null)
        setProctoringSummaryError('')
      } else {
        setProctoringSummary(null)
        setProctoringSummaryError(t('result_proctoring_load_error'))
        failed.push('proctoring')
      }

      if (failed.length > 0) {
        setDetailWarning(t('result_details_load_error'))
      }
    } catch (e) {
      setAttempt(null)
      setQuestions([])
      setAnswers([])
      setProctoringSummary(null)
      setExam(null)
      setLoadError(e.response?.data?.detail || t('result_failed_to_load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadResult()
  }, [id])

  if (loading) return <div className={styles.loading}>{t('result_loading')}</div>
  if (loadError) {
    return (
      <div className={styles.errorRow}>
        <div className={styles.errorBanner}>{loadError}</div>
        <button type="button" className={styles.secondaryBtn} onClick={() => void loadResult()}>{t('result_retry_loading')}</button>
      </div>
    )
  }
  if (!attempt) return <div className={styles.loading}>{t('result_not_found')}</div>

  const score = attempt.score ?? 0
  const passingScore = exam?.passing_score ?? null
  const passed = passingScore === null || score >= passingScore
  const totalQ = questions.length
  const correctCount = answers.filter(a => a.is_correct).length
  const incorrectCount = answers.filter(a => a.is_correct === false).length
  const skippedCount = totalQ - answers.length
  const circumference = 2 * Math.PI * 62
  const offset = circumference - (score / 100) * circumference
  const examSettings = exam?.settings || {}
  const showScoreReport = examSettings.show_score_report !== false
  const showAnswerReview = Boolean(examSettings.show_answer_review)
  const showCorrectAnswers = Boolean(examSettings.show_correct_answers)
  const pendingManualReview = attempt.pending_manual_review ?? (attempt.status === 'SUBMITTED' && attempt.score == null)
  const certificateConfigured = Boolean(exam?.certificate)
  const canDownloadCert = Boolean(attempt.certificate_eligible)
  const certificateBlockReason = attempt.certificate_block_reason || ''
  const searchParams = new URLSearchParams(location.search)
  const openedFromManageTest = searchParams.get('from') === 'manage-test'
  const returnTestId = searchParams.get('testId')
  const returnTab = searchParams.get('tab') || 'candidates'
  const savedRecordings = Number(proctoringSummary?.saved_recordings || 0)
  const expectedRecordings = Number(proctoringSummary?.expected_recordings || 0)
  const totalAlerts = Number(proctoringSummary?.total_events || 0)
  const seriousAlerts = Number(proctoringSummary?.serious_alerts || 0)
  const riskScore = Number(proctoringSummary?.risk_score || 0)
  const recentViolations = Array.isArray(proctoringSummary?.recent_events) ? proctoringSummary.recent_events : []
  const hasProctoringData = savedRecordings > 0 || totalAlerts > 0
  const answeredCount = answers.filter((answer) => hasAnswerValue(answer.answer)).length

  const formatDuration = () => {
    if (!attempt.started_at || !attempt.submitted_at) return '-'
    const ms = new Date(attempt.submitted_at) - new Date(attempt.started_at)
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const answerMap = {}
  answers.forEach(a => { answerMap[a.question_id] = a })

  const isManualReviewAnswer = (question, answerRow) => {
    if (!question || !answerRow || !hasAnswerValue(answerRow.answer)) return false
    const qType = question.question_type || question.type || 'TEXT'
    if (qType === 'TEXT') return true
    if (answerRow.is_correct != null || answerRow.points_earned != null) return false
    return !`${question.correct_answer || ''}`.trim()
  }

  const answerBadgeFor = (question, answerRow) => {
    if (!answerRow || !hasAnswerValue(answerRow.answer)) return null
    if (answerRow.is_correct === true) {
      return { label: t('result_correct'), className: styles.correctBadge }
    }
    if (answerRow.is_correct === false) {
      return { label: t('result_wrong'), className: styles.wrongBadge }
    }
    if (isManualReviewAnswer(question, answerRow)) {
      return { label: t('result_manual_review'), className: styles.manualBadge }
    }
    return null
  }

  const handleBack = () => {
    if (openedFromManageTest && returnTestId) {
      const params = new URLSearchParams({ tab: returnTab })
      params.set('refreshAttempt', id)
      navigate(`/admin/tests/${returnTestId}/manage?${params.toString()}`)
      return
    }
    navigate('/attempts')
  }

  const manualReviewItems = questions
    .map((question) => ({ question, answer: answerMap[question.id] }))
    .filter(({ question, answer }) => isManualReviewAnswer(question, answer))
  const reviewedManualCount = manualReviewItems.filter(({ answer }) => answer?.points_earned != null).length
  const totalAvailablePoints = questions.reduce((sum, question) => sum + Number(question.points || 0), 0)
  const projectedEarnedPoints = questions.reduce((sum, question) => {
    const answer = answerMap[question.id]
    if (!answer || answer.points_earned == null) return sum
    return sum + Number(answer.points_earned || 0)
  }, 0)
  const projectedScore = totalAvailablePoints > 0
    ? Math.max(0, Math.round(((projectedEarnedPoints / totalAvailablePoints) * 100) * 100) / 100)
    : null
  const canShowAnswerReview = openedFromManageTest || (showAnswerReview && !pendingManualReview)
  const gradeLabel = (() => {
    if (!passed) return t('result_grade_fail')
    if (passingScore == null) {
      if (score === 0 && pendingManualReview) return t('result_grade_pending_review')
      if (score === 0) return t('result_grade_completed')
      if (score >= 90) return t('result_grade_excellent')
      if (score >= 80) return t('result_grade_very_good')
      if (score >= 70) return t('result_grade_good')
      return t('result_grade_pass')
    }
    return score >= 90 ? t('result_grade_excellent') : score >= 80 ? t('result_grade_very_good') : score >= 70 ? t('result_grade_good') : t('result_grade_pass')
  })()

  const downloadCertificate = async () => {
    setDownloading(true)
    setCertError('')
    try {
      const res = await api.get(`attempts/${id}/certificate`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `certificate_${id}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setCertError(await readBlobErrorMessage(e, t('result_cert_download_error')))
    } finally {
      setDownloading(false)
    }
  }

  const normalizeReportHtml = async (payload) => {
    if (typeof payload === 'string') return payload
    if (payload instanceof Blob) return payload.text()
    if (payload == null) return ''
    return String(payload)
  }

  const openReportHtml = (html, reportWindow = null) => {
    const nextWindow = reportWindow || window.open('', '_blank')
    if (!nextWindow || nextWindow.closed) {
      throw new Error(t('result_report_tab_error'))
    }

    const nextDocument = nextWindow.document
    if (
      nextDocument
      && typeof nextDocument.open === 'function'
      && typeof nextDocument.write === 'function'
      && typeof nextDocument.close === 'function'
    ) {
      nextDocument.open()
      nextDocument.write(html)
      nextDocument.close()
      return
    }

    const url = window.URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    if (typeof nextWindow.location?.replace === 'function') {
      nextWindow.location.replace(url)
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60000)
      return
    }

    const fallbackWindow = window.open(url, '_blank')
    if (!fallbackWindow) {
      window.URL.revokeObjectURL(url)
      throw new Error(t('result_report_tab_error'))
    }
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60000)
  }

  const downloadReportBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleOpenExamReport = async () => {
    setReportBusy('html')
    setReportError('')
    const reportWindow = window.open('', '_blank')
    try {
      const res = await generateAttemptReport(id, 'html')
      openReportHtml(await normalizeReportHtml(res.data), reportWindow)
    } catch (e) {
      if (
        reportWindow
        && !reportWindow.closed
        && typeof reportWindow.close === 'function'
      ) {
        reportWindow.close()
      }
      const fallback = e?.message === t('result_report_tab_error')
        ? e.message
        : t('result_open_report_error')
      setReportError(await readBlobErrorMessage(e, fallback))
    } finally {
      setReportBusy('')
    }
  }

  const handleDownloadPdfReport = async () => {
    setReportBusy('pdf')
    setReportError('')
    try {
      const res = await generateAttemptReport(id, 'pdf')
      const pdfBlob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' })
      downloadReportBlob(pdfBlob, `exam-report_${id}.pdf`)
    } catch (e) {
      setReportError(await readBlobErrorMessage(e, t('result_pdf_download_error')))
    } finally {
      setReportBusy('')
    }
  }

  const handleSaveManualReview = async (question, answerRow) => {
    const draft = `${reviewDrafts[answerRow.id] ?? ''}`.trim()
    const maxPoints = Number(question.points || 0)
    const nextPoints = Number(draft)
    if (draft === '' || Number.isNaN(nextPoints)) {
      setReviewError(t('result_enter_points_error'))
      setReviewNotice('')
      return
    }
    if (nextPoints < 0 || nextPoints > maxPoints) {
      setReviewError(`${t('result_points_range_error')} 0 - ${maxPoints}.`)
      setReviewNotice('')
      return
    }
    setReviewError('')
    setReviewNotice('')
    setReviewBusy((current) => ({ ...current, [answerRow.id]: true }))
    try {
      const { data } = await reviewAttemptAnswer(id, answerRow.id, nextPoints)
      setAnswers((current) => current.map((row) => (row.id === data.id ? { ...row, ...data } : row)))
      setReviewDrafts((current) => ({
        ...current,
        [data.id]: data.points_earned != null ? String(data.points_earned) : '',
      }))
      setReviewNotice(t('result_review_saved_notice'))
    } catch (e) {
      setReviewError(e.response?.data?.detail || t('result_save_review_error'))
    } finally {
      setReviewBusy((current) => ({ ...current, [answerRow.id]: false }))
    }
  }

  const handleFinalizeReview = async () => {
    setReviewError('')
    setReviewNotice('')
    setFinalizingReview(true)
    try {
      const { data } = await finalizeAttemptReview(id)
      setAttempt(normalizeAttempt(data))
      setReviewNotice(t('result_review_finalized_notice'))
    } catch (e) {
      setReviewError(e.response?.data?.detail || t('result_finalize_error'))
    } finally {
      setFinalizingReview(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{attempt.test_title || attempt.exam_title || t('result_test_result')}</h2>
          <p className={styles.sub}>
            {t('result_submitted')} {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.reportSecondaryBtn}
            onClick={() => void handleOpenExamReport()}
            disabled={reportBusy !== ''}
          >
            {reportBusy === 'html' ? t('result_opening_report') : t('result_open_exam_report')}
          </button>
          <button
            type="button"
            className={styles.reportPrimaryBtn}
            onClick={() => void handleDownloadPdfReport()}
            disabled={reportBusy !== ''}
          >
            {reportBusy === 'pdf' ? t('result_preparing_pdf') : t('result_download_pdf')}
          </button>
        </div>
      </div>

      {openedFromManageTest && returnTestId && (
        <div className={styles.contextBanner}>
          <div className={styles.contextTitle}>{t('result_opened_from_manage')}</div>
          <div className={styles.contextText}>{t('result_opened_from_manage_text')}</div>
        </div>
      )}

      {detailWarning && (
        <div className={styles.warningRow}>
          <div className={styles.warningBanner}>{detailWarning}</div>
          <button type="button" className={styles.secondaryBtn} onClick={() => void loadResult()}>
            {t('result_retry_details')}
          </button>
        </div>
      )}
      {reportError && <div className={styles.errorBanner}>{reportError}</div>}
      {reviewError && <div className={styles.errorBanner}>{reviewError}</div>}
      {reviewNotice && <div className={styles.contextBanner}><div className={styles.contextText}>{reviewNotice}</div></div>}

      {pendingManualReview && (
        <div className={styles.pendingReviewCard}>
          <div className={styles.pendingReviewTitle}>{t('result_awaiting_review')}</div>
          <div className={styles.pendingReviewText}>
            {t('result_awaiting_review_text')}
          </div>
          <div className={styles.pendingReviewGrid}>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{answeredCount}</div>
              <div className={styles.pendingReviewLabel}>{t('result_saved_answers')}</div>
            </div>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{totalQ}</div>
              <div className={styles.pendingReviewLabel}>{t('questions')}</div>
            </div>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{formatDuration()}</div>
              <div className={styles.pendingReviewLabel}>{t('duration')}</div>
            </div>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{attempt.status?.replace('_', ' ')}</div>
              <div className={styles.pendingReviewLabel}>{t('status')}</div>
            </div>
          </div>
          <div className={styles.pendingReviewText}>
            {t('result_after_grading_text')}
          </div>
        </div>
      )}

      {certificateConfigured && !canDownloadCert && certificateBlockReason && (
        <div className={styles.contextBanner}>
          <div className={styles.contextTitle}>{t('result_certificate_status')}</div>
          <div className={styles.contextText}>{certificateBlockReason}</div>
        </div>
      )}

      {!pendingManualReview && showScoreReport && (
        <div className={`${styles.scoreHero} ${passed ? styles.scoreHeroPass : styles.scoreHeroFail}`}>
          <div className={styles.scoreSection}>
            <span className={`${styles.passFailBadge} ${passed ? styles.passFailBadgePass : styles.passFailBadgeFail}`}>
              {passed ? `✓ ${t('passed')}` : `✗ ${t('failed')}`}
            </span>
            <div className={`${styles.scoreRing} ${passed ? styles.scoreRingPass : styles.scoreRingFail}`}>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="62" fill="none" stroke="var(--color-border)" strokeWidth="12" />
                <circle
                  cx="80" cy="80" r="62"
                  fill="none"
                  stroke={passed ? 'var(--color-success)' : 'var(--color-danger)'}
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </svg>
              <div className={styles.scoreLabel}>
                <div className={styles.scoreValue}>{Math.round(score)}<span className={styles.scorePercent}>%</span></div>
              </div>
            </div>
            <div className={styles.gradeLabel}>{gradeLabel}</div>
            {passingScore !== null && (
              <div className={styles.passingHint}>{t('result_passing_threshold')}: {passingScore}%</div>
            )}
          </div>
          <div className={styles.statsRow}>
            <div className={`${styles.stat} ${styles.statCorrect}`}>
              <span className={styles.statIconEl}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
              <div className={styles.statVal}>{correctCount}</div>
              <div className={styles.statLbl}>{t('result_correct')}</div>
            </div>
            <div className={`${styles.stat} ${styles.statIncorrect}`}>
              <span className={styles.statIconEl}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
              <div className={styles.statVal}>{incorrectCount}</div>
              <div className={styles.statLbl}>{t('result_incorrect')}</div>
            </div>
            {totalQ > 0 && (
              <div className={`${styles.stat} ${styles.statSkipped}`}>
                <span className={styles.statIconEl}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
                <div className={styles.statVal}>{skippedCount}</div>
                <div className={styles.statLbl}>{t('result_skipped')}</div>
              </div>
            )}
            <div className={styles.stat}>
              <span className={styles.statIconEl}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
              <div className={styles.statVal}>{formatDuration()}</div>
              <div className={styles.statLbl}>{t('duration')}</div>
            </div>
            <div className={styles.stat}>
              <span className={styles.statIconEl}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>
              <div className={styles.statVal}>{attempt.status?.replace('_', ' ')}</div>
              <div className={styles.statLbl}>{t('status')}</div>
            </div>
            {canDownloadCert && (
              <div className={styles.stat}>
                <button type="button" className={styles.certBtn} onClick={downloadCertificate} disabled={downloading}>
                  {downloading ? t('result_preparing') : t('result_download_certificate')}
                </button>
                {certError && <div className={styles.certError}>{certError}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {!showScoreReport && canDownloadCert && (
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <button type="button" className={styles.certBtn} onClick={downloadCertificate} disabled={downloading}>
              {downloading ? t('result_preparing') : t('result_download_certificate')}
            </button>
            {certError && <div className={styles.certError}>{certError}</div>}
          </div>
        </div>
      )}

      <div className={styles.proctoringSection}>
        <h3 className={styles.sectionTitle}>{t('result_proctoring_summary')}</h3>
        {proctoringSummaryError ? (
          <div className={styles.errorRow}>
            <div className={styles.errorBanner}>{proctoringSummaryError}</div>
            <button type="button" className={styles.secondaryBtn} onClick={() => void loadResult()}>
              {t('result_retry_proctoring')}
            </button>
          </div>
        ) : !hasProctoringData ? (
          <div className={styles.emptyReview}>{t('result_no_proctoring_data')}</div>
        ) : (
          <>
            <div className={styles.proctoringGrid}>
              <div className={styles.proctoringCard}>
                <div className={styles.proctoringValue}>
                  {expectedRecordings > 0 ? `${savedRecordings}/${expectedRecordings}` : savedRecordings}
                </div>
                <div className={styles.proctoringLabel}>{t('result_saved_recordings')}</div>
              </div>
              <div className={styles.proctoringCard}>
                <div className={styles.proctoringValue}>{totalAlerts}</div>
                <div className={styles.proctoringLabel}>{t('result_total_alerts')}</div>
              </div>
              <div className={styles.proctoringCard}>
                <div className={`${styles.proctoringValue} ${styles.proctoringMedium}`}>{seriousAlerts}</div>
                <div className={styles.proctoringLabel}>{t('result_serious_alerts')}</div>
              </div>
              <div className={styles.proctoringCard}>
                <div className={`${styles.proctoringValue} ${styles.proctoringHigh}`}>{riskScore}</div>
                <div className={styles.proctoringLabel}>{t('result_risk_score')}</div>
              </div>
            </div>
            {recentViolations.length > 0 ? (
              <div className={styles.proctoringList}>
                {recentViolations.map((event, index) => (
                  <div key={event.id || `${event.event_type}-${index}`} className={styles.proctoringEvent}>
                    <div className={styles.proctoringEventHeader}>
                      <span className={styles.proctoringEventType}>{event.event_type?.replace(/_/g, ' ')}</span>
                      <span className={`${styles.severityBadge} ${getSeverityClass(event.severity)}`}>{event.severity}</span>
                    </div>
                    <div className={styles.proctoringEventDetail}>{event.detail || t('result_auto_proctoring_alert')}</div>
                    <div className={styles.proctoringEventMeta}>
                      <span>{formatConfidence(event.ai_confidence)}</span>
                      <span>{event.occurred_at ? new Date(event.occurred_at).toLocaleString() : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyReview}>{t('result_no_alert_events')}</div>
            )}
          </>
        )}
      </div>

      {openedFromManageTest && manualReviewItems.length > 0 && (
        <div className={styles.reviewWorkflowCard}>
          <div className={styles.reviewWorkflowHeader}>
            <div>
              <div className={styles.reviewWorkflowTitle}>{t('result_manual_review_workflow')}</div>
              <div className={styles.reviewWorkflowText}>
                {t('result_manual_review_workflow_text')}
              </div>
            </div>
            <button
              type="button"
              className={styles.reviewFinalizeBtn}
              disabled={finalizingReview || reviewedManualCount !== manualReviewItems.length}
              onClick={handleFinalizeReview}
            >
              {finalizingReview ? t('result_finalizing') : attempt.status === 'GRADED' ? t('result_republish_score') : t('result_finalize_review')}
            </button>
          </div>
          <div className={styles.reviewWorkflowGrid}>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{manualReviewItems.length}</div>
              <div className={styles.reviewWorkflowLabel}>{t('result_manual_questions')}</div>
            </div>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{reviewedManualCount} / {manualReviewItems.length}</div>
              <div className={styles.reviewWorkflowLabel}>{t('result_reviewed')}</div>
            </div>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{projectedScore != null ? `${projectedScore}%` : '-'}</div>
              <div className={styles.reviewWorkflowLabel}>{t('result_projected_score')}</div>
            </div>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{Math.max(manualReviewItems.length - reviewedManualCount, 0)}</div>
              <div className={styles.reviewWorkflowLabel}>{t('result_still_pending')}</div>
            </div>
          </div>
        </div>
      )}

      {canShowAnswerReview && (
        <div className={styles.answersSection}>
          <h3 className={styles.sectionTitle}>{t('result_answer_review')}</h3>
          {questions.length === 0 ? (
            <div className={styles.emptyReview}>{t('result_no_answer_review')}</div>
          ) : questions.map((q, i) => {
            const ans = answerMap[q.id]
            const badge = answerBadgeFor(q, ans)
            const isManualReview = isManualReviewAnswer(q, ans)
            const maxPoints = Number(q.points || 0)
            return (
              <div key={q.id} className={styles.answerCard}>
                <div className={styles.answerHeader}>
                  <span className={styles.qNumber}>{t('question')} {i + 1}</span>
                  {badge && (
                    <span className={badge.className}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <div className={styles.qText}>{q.text}</div>
                {ans && (
                  <div className={styles.answerDetail}>
                    <strong>{t('result_your_answer')}:</strong> {formatAnswerValue(ans.answer)}
                    {showCorrectAnswers && q.correct_answer && (
                      <> &nbsp;|&nbsp; <strong>{isManualReview ? `${t('result_reference')}:` : `${t('result_correct_answer')}:`}</strong> {formatAnswerValue(q.correct_answer)}</>
                    )}
                  </div>
                )}
                {ans?.points_earned != null && (
                  <div className={styles.reviewPointsText}>
                    {t('result_awarded_points')}: <strong>{ans.points_earned}</strong>{maxPoints > 0 ? ` / ${maxPoints}` : ''}
                  </div>
                )}
                {openedFromManageTest && ans && isManualReview && (
                  <div className={styles.manualReviewEditor}>
                    <label className={styles.reviewField}>
                      <span>{t('result_awarded_points')}</span>
                      <input
                        type="number"
                        min="0"
                        max={maxPoints}
                        step="0.01"
                        value={reviewDrafts[ans.id] ?? (ans.points_earned != null ? String(ans.points_earned) : '')}
                        onChange={(event) => setReviewDrafts((current) => ({ ...current, [ans.id]: event.target.value }))}
                        disabled={reviewBusy[ans.id] || finalizingReview}
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.reviewSaveBtn}
                      disabled={reviewBusy[ans.id] || finalizingReview}
                      onClick={() => void handleSaveManualReview(q, ans)}
                    >
                      {reviewBusy[ans.id] ? t('result_saving_review') : t('result_save_review')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button type="button" className={styles.backBtn} onClick={handleBack}>
        {openedFromManageTest && returnTestId ? `\u2190 ${t('result_back_to_manage')}` : `\u2190 ${t('result_back_to_attempts')}`}
      </button>
    </div>
  )
}
