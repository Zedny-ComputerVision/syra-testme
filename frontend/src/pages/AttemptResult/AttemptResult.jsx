import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { finalizeAttemptReview, getAttempt, getAttemptAnswers, getAttemptEvents, reviewAttemptAnswer } from '../../services/attempt.service'
import { getTestQuestions, getTest } from '../../services/test.service'
import api from '../../services/api'
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

function formatConfidence(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}% confidence` : 'Confidence unavailable'
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
  const [attempt, setAttempt] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [detailWarning, setDetailWarning] = useState('')
  const [certError, setCertError] = useState('')
  const [exam, setExam] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewBusy, setReviewBusy] = useState({})
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [finalizingReview, setFinalizingReview] = useState(false)

  const loadResult = async () => {
    setLoading(true)
    setLoadError('')
    setDetailWarning('')
    if (!id) {
      setAttempt(null)
      setQuestions([])
      setAnswers([])
      setEvents([])
      setExam(null)
      setLoadError('Invalid attempt link. Return to your attempts list and try again.')
      setLoading(false)
      return
    }
    try {
      const attRes = await getAttempt(id)
      const att = normalizeAttempt(attRes.data)
      setAttempt(att)
      const [qRes, aRes, exRes, eventsRes] = await Promise.allSettled([
        getTestQuestions(att.exam_id),
        getAttemptAnswers(id),
        getTest(att.exam_id),
        getAttemptEvents(id),
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
        setEvents(eventsRes.value.data || [])
      } else {
        setEvents([])
        failed.push('proctoring')
      }

      if (failed.length > 0) {
        setDetailWarning('Some result details could not be loaded. Retry to restore the full review.')
      }
    } catch (e) {
      setAttempt(null)
      setQuestions([])
      setAnswers([])
      setEvents([])
      setExam(null)
      setLoadError(e.response?.data?.detail || 'Failed to load result. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadResult()
  }, [id])

  useEffect(() => {
    setReviewDrafts(
      (answers || []).reduce((acc, answerRow) => {
        acc[answerRow.id] = answerRow.points_earned != null ? String(answerRow.points_earned) : ''
        return acc
      }, {}),
    )
  }, [answers])

  if (loading) return <div className={styles.loading}>Loading result...</div>
  if (loadError) {
    return (
      <div className={styles.errorRow}>
        <div className={styles.errorBanner}>{loadError}</div>
        <button type="button" className={styles.secondaryBtn} onClick={() => void loadResult()}>Retry loading result</button>
      </div>
    )
  }
  if (!attempt) return <div className={styles.loading}>Attempt not found.</div>

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
  const highViolations = events.filter((event) => event.severity === 'HIGH')
  const mediumViolations = events.filter((event) => event.severity === 'MEDIUM')
  const lowViolations = events.filter((event) => event.severity === 'LOW')
  const recentViolations = [...events]
    .sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at))
    .slice(0, 5)
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
      return { label: 'Correct', className: styles.correctBadge }
    }
    if (answerRow.is_correct === false) {
      return { label: 'Wrong', className: styles.wrongBadge }
    }
    if (isManualReviewAnswer(question, answerRow)) {
      return { label: 'Manual review', className: styles.manualBadge }
    }
    return null
  }

  const handleBack = () => {
    if (openedFromManageTest && returnTestId) {
      navigate(`/admin/tests/${returnTestId}/manage?tab=${encodeURIComponent(returnTab)}`)
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
    if (!passed) return 'Fail'
    if (passingScore == null) {
      if (score === 0 && pendingManualReview) return 'Pending Review'
      if (score === 0) return 'Completed'
      if (score >= 90) return 'Excellent'
      if (score >= 80) return 'Very Good'
      if (score >= 70) return 'Good'
      return 'Pass'
    }
    return score >= 90 ? 'Excellent' : score >= 80 ? 'Very Good' : score >= 70 ? 'Good' : 'Pass'
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
      setCertError(await readBlobErrorMessage(e, 'Unable to download certificate.'))
    } finally {
      setDownloading(false)
    }
  }

  const handleSaveManualReview = async (question, answerRow) => {
    const draft = `${reviewDrafts[answerRow.id] ?? ''}`.trim()
    const maxPoints = Number(question.points || 0)
    const nextPoints = Number(draft)
    if (draft === '' || Number.isNaN(nextPoints)) {
      setReviewError('Enter the awarded points before saving this review.')
      setReviewNotice('')
      return
    }
    if (nextPoints < 0 || nextPoints > maxPoints) {
      setReviewError(`Awarded points must be between 0 and ${maxPoints}.`)
      setReviewNotice('')
      return
    }
    setReviewError('')
    setReviewNotice('')
    setReviewBusy((current) => ({ ...current, [answerRow.id]: true }))
    try {
      const { data } = await reviewAttemptAnswer(id, answerRow.id, nextPoints)
      setAnswers((current) => current.map((row) => (row.id === data.id ? { ...row, ...data } : row)))
      setReviewNotice('Manual review points saved. Finalize the review to publish the updated score.')
    } catch (e) {
      setReviewError(e.response?.data?.detail || 'Unable to save manual review points.')
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
      setReviewNotice('Attempt review finalized and score published.')
    } catch (e) {
      setReviewError(e.response?.data?.detail || 'Unable to finalize manual review.')
    } finally {
      setFinalizingReview(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{attempt.test_title || attempt.exam_title || 'Test Result'}</h2>
          <p className={styles.sub}>
            Submitted {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ''}
          </p>
        </div>
        <button type="button" className={styles.printBtn} onClick={() => window.print()}>
          Print or export result
        </button>
      </div>

      {openedFromManageTest && returnTestId && (
        <div className={styles.contextBanner}>
          <div className={styles.contextTitle}>Opened from Manage Test</div>
          <div className={styles.contextText}>This result was opened from the admin test review workflow. Use the back action below to return to the same test tab.</div>
        </div>
      )}

      {detailWarning && (
        <div className={styles.warningRow}>
          <div className={styles.warningBanner}>{detailWarning}</div>
          <button type="button" className={styles.secondaryBtn} onClick={() => void loadResult()}>
            Retry loading details
          </button>
        </div>
      )}
      {reviewError && <div className={styles.errorBanner}>{reviewError}</div>}
      {reviewNotice && <div className={styles.contextBanner}><div className={styles.contextText}>{reviewNotice}</div></div>}

      {pendingManualReview && (
        <div className={styles.pendingReviewCard}>
          <div className={styles.pendingReviewTitle}>Awaiting manual review</div>
          <div className={styles.pendingReviewText}>
            Your attempt was submitted successfully. An instructor or admin still needs to review at least one manually graded answer before the final score is published.
          </div>
          <div className={styles.pendingReviewGrid}>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{answeredCount}</div>
              <div className={styles.pendingReviewLabel}>Saved Answers</div>
            </div>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{totalQ}</div>
              <div className={styles.pendingReviewLabel}>Questions</div>
            </div>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{formatDuration()}</div>
              <div className={styles.pendingReviewLabel}>Duration</div>
            </div>
            <div className={styles.proctoringCard}>
              <div className={styles.pendingReviewValue}>{attempt.status?.replace('_', ' ')}</div>
              <div className={styles.pendingReviewLabel}>Status</div>
            </div>
          </div>
          <div className={styles.pendingReviewText}>
            Detailed answer review and final result reporting will appear after grading is complete.
          </div>
        </div>
      )}

      {certificateConfigured && !canDownloadCert && certificateBlockReason && (
        <div className={styles.contextBanner}>
          <div className={styles.contextTitle}>Certificate status</div>
          <div className={styles.contextText}>{certificateBlockReason}</div>
        </div>
      )}

      {!pendingManualReview && showScoreReport && (
        <>
          <div className={styles.scoreSection}>
            <div className={styles.scoreRing}>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="62" fill="none" stroke="var(--color-border)" strokeWidth="12" />
                <circle
                  cx="80" cy="80" r="62"
                  fill="none"
                  stroke={passed ? 'var(--color-primary)' : 'var(--color-danger)'}
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </svg>
              <div className={styles.scoreLabel}>
                <div className={styles.scoreValue}>{Math.round(score)}</div>
                <div className={styles.scoreUnit}>/ 100</div>
              </div>
            </div>
            <div className={styles.gradeLabel}>
              {gradeLabel}
            </div>
          </div>
          <div className={styles.statsRow}>
            <div className={`${styles.stat} ${styles.statCorrect}`}>
              <div className={styles.statVal}>{correctCount}</div>
              <div className={styles.statLbl}>Correct</div>
            </div>
            <div className={`${styles.stat} ${styles.statIncorrect}`}>
              <div className={styles.statVal}>{incorrectCount}</div>
              <div className={styles.statLbl}>Incorrect</div>
            </div>
            {totalQ > 0 && (
              <div className={`${styles.stat} ${styles.statSkipped}`}>
                <div className={styles.statVal}>{skippedCount}</div>
                <div className={styles.statLbl}>Skipped</div>
              </div>
            )}
            <div className={styles.stat}>
              <div className={styles.statVal}>{formatDuration()}</div>
              <div className={styles.statLbl}>Duration</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{attempt.status?.replace('_', ' ')}</div>
              <div className={styles.statLbl}>Status</div>
            </div>
            {canDownloadCert && (
              <div className={styles.stat}>
                <button type="button" className={styles.certBtn} onClick={downloadCertificate} disabled={downloading}>
                  {downloading ? 'Preparing...' : 'Download Certificate'}
                </button>
                {certError && <div className={styles.certError}>{certError}</div>}
              </div>
            )}
          </div>
        </>
      )}

      {!showScoreReport && canDownloadCert && (
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <button type="button" className={styles.certBtn} onClick={downloadCertificate} disabled={downloading}>
              {downloading ? 'Preparing...' : 'Download Certificate'}
            </button>
            {certError && <div className={styles.certError}>{certError}</div>}
          </div>
        </div>
      )}

      <div className={styles.proctoringSection}>
        <h3 className={styles.sectionTitle}>Proctoring Summary</h3>
        {events.length === 0 ? (
          <div className={styles.emptyReview}>No proctoring violations were recorded for this attempt.</div>
        ) : (
          <>
            <div className={styles.proctoringGrid}>
              <div className={styles.proctoringCard}>
                <div className={styles.proctoringValue}>{events.length}</div>
                <div className={styles.proctoringLabel}>Total Alerts</div>
              </div>
              <div className={styles.proctoringCard}>
                <div className={`${styles.proctoringValue} ${styles.proctoringHigh}`}>{highViolations.length}</div>
                <div className={styles.proctoringLabel}>High Severity</div>
              </div>
              <div className={styles.proctoringCard}>
                <div className={`${styles.proctoringValue} ${styles.proctoringMedium}`}>{mediumViolations.length}</div>
                <div className={styles.proctoringLabel}>Medium Severity</div>
              </div>
              <div className={styles.proctoringCard}>
                <div className={`${styles.proctoringValue} ${styles.proctoringLow}`}>{lowViolations.length}</div>
                <div className={styles.proctoringLabel}>Low Severity</div>
              </div>
            </div>
            <div className={styles.proctoringList}>
              {recentViolations.map((event, index) => (
                <div key={event.id || `${event.event_type}-${index}`} className={styles.proctoringEvent}>
                  <div className={styles.proctoringEventHeader}>
                    <span className={styles.proctoringEventType}>{event.event_type?.replace(/_/g, ' ')}</span>
                    <span className={`${styles.severityBadge} ${getSeverityClass(event.severity)}`}>{event.severity}</span>
                  </div>
                  <div className={styles.proctoringEventDetail}>{event.detail || 'Automatic proctoring alert recorded.'}</div>
                  <div className={styles.proctoringEventMeta}>
                    <span>{formatConfidence(event.ai_confidence)}</span>
                    <span>{event.occurred_at ? new Date(event.occurred_at).toLocaleString() : '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {openedFromManageTest && manualReviewItems.length > 0 && (
        <div className={styles.reviewWorkflowCard}>
          <div className={styles.reviewWorkflowHeader}>
            <div>
              <div className={styles.reviewWorkflowTitle}>Manual review workflow</div>
              <div className={styles.reviewWorkflowText}>
                Review manually graded answers, save awarded points question by question, then finalize to publish the updated score.
              </div>
            </div>
            <button
              type="button"
              className={styles.reviewFinalizeBtn}
              disabled={finalizingReview || reviewedManualCount !== manualReviewItems.length}
              onClick={handleFinalizeReview}
            >
              {finalizingReview ? 'Finalizing...' : attempt.status === 'GRADED' ? 'Republish updated score' : 'Finalize review'}
            </button>
          </div>
          <div className={styles.reviewWorkflowGrid}>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{manualReviewItems.length}</div>
              <div className={styles.reviewWorkflowLabel}>Manual Questions</div>
            </div>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{reviewedManualCount} / {manualReviewItems.length}</div>
              <div className={styles.reviewWorkflowLabel}>Reviewed</div>
            </div>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{projectedScore != null ? `${projectedScore}%` : '-'}</div>
              <div className={styles.reviewWorkflowLabel}>Projected Score</div>
            </div>
            <div className={styles.reviewWorkflowStat}>
              <div className={styles.reviewWorkflowValue}>{Math.max(manualReviewItems.length - reviewedManualCount, 0)}</div>
              <div className={styles.reviewWorkflowLabel}>Still Pending</div>
            </div>
          </div>
        </div>
      )}

      {canShowAnswerReview && (
        <div className={styles.answersSection}>
          <h3 className={styles.sectionTitle}>Answer Review</h3>
          {questions.length === 0 ? (
            <div className={styles.emptyReview}>No answer review is available for this attempt.</div>
          ) : questions.map((q, i) => {
            const ans = answerMap[q.id]
            const badge = answerBadgeFor(q, ans)
            const isManualReview = isManualReviewAnswer(q, ans)
            const maxPoints = Number(q.points || 0)
            return (
              <div key={q.id} className={styles.answerCard}>
                <div className={styles.answerHeader}>
                  <span className={styles.qNumber}>Question {i + 1}</span>
                  {badge && (
                    <span className={badge.className}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <div className={styles.qText}>{q.text}</div>
                {ans && (
                  <div className={styles.answerDetail}>
                    <strong>Your answer:</strong> {formatAnswerValue(ans.answer)}
                    {showCorrectAnswers && q.correct_answer && (
                      <> &nbsp;|&nbsp; <strong>{isManualReview ? 'Reference:' : 'Correct:'}</strong> {formatAnswerValue(q.correct_answer)}</>
                    )}
                  </div>
                )}
                {ans?.points_earned != null && (
                  <div className={styles.reviewPointsText}>
                    Awarded points: <strong>{ans.points_earned}</strong>{maxPoints > 0 ? ` / ${maxPoints}` : ''}
                  </div>
                )}
                {openedFromManageTest && ans && isManualReview && (
                  <div className={styles.manualReviewEditor}>
                    <label className={styles.reviewField}>
                      <span>Awarded points</span>
                      <input
                        type="number"
                        min="0"
                        max={maxPoints}
                        step="0.01"
                        value={reviewDrafts[ans.id] ?? ''}
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
                      {reviewBusy[ans.id] ? 'Saving...' : 'Save review'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button type="button" className={styles.backBtn} onClick={handleBack}>
        {openedFromManageTest && returnTestId ? '\u2190 Back to Manage Test' : '\u2190 Back to Attempts List'}
      </button>
    </div>
  )
}
