import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useLanguage from '../../../hooks/useLanguage'
import { adminApi } from '../../../services/admin.service'
import { certificateIssueRuleLabel } from '../../../utils/certificates'
import { fetchAuthenticatedMediaObjectUrl, revokeObjectUrl } from '../../../utils/authenticatedMedia'
import { readPaginatedItems } from '../../../utils/pagination'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminAttemptAnalysis.module.scss'

const TABS = ['Overview', 'Timeline', 'Answers', 'Evidence']

function getSeverityClass(prefix, severity, styles) {
  if (!severity) return ''
  const normalized = `${severity}`.charAt(0).toUpperCase() + `${severity}`.slice(1).toLowerCase()
  return styles[`${prefix}${normalized}`] || ''
}

function formatConfidence(value, t) {
  return typeof value === 'number' ? `${Math.round(value * 100)}% ${t ? t('admin_analysis_confidence') : 'confidence'}` : (t ? t('admin_analysis_confidence_unavailable') : 'Confidence unavailable')
}

function resolveError(err, fallback) {
  return (
    err?.response?.data?.detail ||
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.detail ||
    err?.message ||
    fallback
  )
}

function certificateDecisionLabel(value, t) {
  if (value === 'APPROVED') return t ? t('admin_analysis_approved') : 'Approved'
  if (value === 'REJECTED') return t ? t('admin_analysis_rejected') : 'Rejected'
  if (value === 'PENDING') return t ? t('admin_analysis_pending_review') : 'Pending review'
  return t ? t('admin_analysis_not_required') : 'Not required'
}

function evidenceKeyForEvent(event, index) {
  return String(event?.id || event?.meta?.evidence || index)
}

function isAbortError(err) {
  return err?.name === 'AbortError' || err?.code === 'ERR_CANCELED'
}

export default function AdminAttemptAnalysis() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [attempts, setAttempts] = useState([])
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '')
  const [attempt, setAttempt] = useState(null)
  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('Overview')
  const [listLoading, setListLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState([])
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailWarning, setDetailWarning] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState(null)
  const [evidenceUrls, setEvidenceUrls] = useState({})
  const [identityPhotoUrls, setIdentityPhotoUrls] = useState({ selfie: '', id: '' })
  const identityPhotoUrlsRef = useRef({ selfie: '', id: '' })
  const evidenceUrlsRef = useRef({})
  const listAbortRef = useRef(null)
  const detailAbortRef = useRef(null)
  const evidenceAbortRef = useRef(null)
  const [listReloadKey, setListReloadKey] = useState(0)
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  useEffect(() => {
    if (listAbortRef.current) listAbortRef.current.abort()
    const controller = new AbortController()
    listAbortRef.current = controller

    async function loadAttempts() {
      setListLoading(true)
      setListError('')

      try {
        const { data } = await adminApi.attempts({ skip: 0, limit: 200 }, { signal: controller.signal })
        if (controller.signal.aborted) return

        const rows = readPaginatedItems(data)
        setAttempts(rows)

        if (!searchParams.get('id') && rows.length > 0) {
          setSelectedId(rows[0].id)
          setSearchParams({ id: rows[0].id }, { replace: true })
        }
      } catch (err) {
        if (isAbortError(err)) return
        setAttempts([])
        setListError(resolveError(err, t('admin_analysis_load_attempts_error')))
      } finally {
        if (!controller.signal.aborted) setListLoading(false)
      }
    }

    void loadAttempts()

    return () => {
      controller.abort()
    }
  }, [listReloadKey, setSearchParams])

  useEffect(() => {
    setSelectedId(searchParams.get('id') || '')
  }, [searchParams])

  useEffect(() => {
    if (detailAbortRef.current) detailAbortRef.current.abort()
    const controller = new AbortController()
    detailAbortRef.current = controller

    async function loadAttemptDetails() {
      if (!selectedId) {
        setAttempt(null)
        setEvents([])
        setAnswers([])
        setDetailError('')
        setDetailWarning('')
        setReviewError('')
        setReviewNotice('')
        setSelectedEvidence(null)
        return
      }

      setLoading(true)
      setDetailError('')
      setDetailWarning('')
      setReviewError('')
      setReviewNotice('')
      setSelectedEvidence(null)
      setAttempt(null)
      setEvents([])
      setAnswers([])

      const [attemptResponse, eventsResponse, answersResponse] = await Promise.allSettled([
        adminApi.getAttempt(selectedId, { signal: controller.signal }),
        adminApi.getAttemptEvents(selectedId, { signal: controller.signal }),
        adminApi.getAttemptAnswers(selectedId, { signal: controller.signal }),
      ])

      if (controller.signal.aborted) return

      if (attemptResponse.status !== 'fulfilled') {
        setDetailError(resolveError(attemptResponse.reason, t('admin_analysis_load_details_error')))
        setLoading(false)
        return
      }

      setAttempt(attemptResponse.value.data || null)
      setEvents(eventsResponse.status === 'fulfilled' ? eventsResponse.value.data || [] : [])
      setAnswers(answersResponse.status === 'fulfilled' ? answersResponse.value.data || [] : [])

      const missingSections = []
      if (eventsResponse.status !== 'fulfilled') missingSections.push(t('admin_analysis_timeline_and_evidence'))
      if (answersResponse.status !== 'fulfilled') missingSections.push(t('admin_analysis_answers_section'))
      if (missingSections.length > 0) {
        setDetailWarning(`${t('admin_analysis_partial_load_warning')} (${missingSections.join(', ')})`)
      }

      setLoading(false)
    }

    void loadAttemptDetails()

    return () => {
      controller.abort()
    }
  }, [selectedId, detailReloadKey])

  useEffect(() => {
    evidenceUrlsRef.current = evidenceUrls
  }, [evidenceUrls])

  useEffect(() => {
    identityPhotoUrlsRef.current = identityPhotoUrls
  }, [identityPhotoUrls])

  useEffect(() => {
    return () => {
      Object.values(evidenceUrlsRef.current).forEach(revokeObjectUrl)
      revokeObjectUrl(identityPhotoUrlsRef.current.selfie)
      revokeObjectUrl(identityPhotoUrlsRef.current.id)
    }
  }, [])

  useEffect(() => {
    if (!attempt?.id) {
      setIdentityPhotoUrls((prev) => {
        revokeObjectUrl(prev.selfie)
        revokeObjectUrl(prev.id)
        return { selfie: '', id: '' }
      })
      return
    }
    const hasSelfie = Boolean(attempt.selfie_path)
    const hasId = Boolean(attempt.id_doc_path)
    if (!hasSelfie && !hasId) {
      setIdentityPhotoUrls((prev) => {
        revokeObjectUrl(prev.selfie)
        revokeObjectUrl(prev.id)
        return { selfie: '', id: '' }
      })
      return
    }

    let cancelled = false
    async function loadIdentityPhotos() {
      const next = { selfie: '', id: '' }
      try {
        if (hasSelfie) {
          next.selfie = await fetchAuthenticatedMediaObjectUrl(`identity/${attempt.id}/selfie`)
        }
      } catch { /* photo may not exist */ }
      try {
        if (hasId) {
          next.id = await fetchAuthenticatedMediaObjectUrl(`identity/${attempt.id}/id`)
        }
      } catch { /* photo may not exist */ }
      if (!cancelled) {
        setIdentityPhotoUrls((prev) => {
          revokeObjectUrl(prev.selfie)
          revokeObjectUrl(prev.id)
          return next
        })
      } else {
        revokeObjectUrl(next.selfie)
        revokeObjectUrl(next.id)
      }
    }
    void loadIdentityPhotos()
    return () => { cancelled = true }
  }, [attempt?.id, attempt?.selfie_path, attempt?.id_doc_path])

  useEffect(() => {
    if (evidenceAbortRef.current) evidenceAbortRef.current.abort()
    const controller = new AbortController()
    evidenceAbortRef.current = controller
    const evidenceEvents = events.filter((event) => event?.meta?.evidence)
    const shouldLoadEvidence = tab === 'Evidence' || Boolean(selectedEvidence)

    if (!shouldLoadEvidence) {
      setEvidenceUrls((current) => {
        Object.values(current).forEach(revokeObjectUrl)
        return {}
      })
      return () => {
        controller.abort()
      }
    }

    if (evidenceEvents.length === 0) {
      setEvidenceUrls((current) => {
        Object.values(current).forEach(revokeObjectUrl)
        return {}
      })
      return () => {
        controller.abort()
      }
    }

    async function loadEvidenceUrls() {
      const nextEntries = []
      const batchSize = 4
      for (let index = 0; index < evidenceEvents.length; index += batchSize) {
        const batchEntries = await Promise.all(
          evidenceEvents.slice(index, index + batchSize).map(async (event, batchIndex) => {
            const key = evidenceKeyForEvent(event, index + batchIndex)
            try {
              const url = await fetchAuthenticatedMediaObjectUrl(event.meta.evidence, { signal: controller.signal })
              return [key, url]
            } catch (err) {
              if (isAbortError(err)) throw err
              return [key, '']
            }
          }),
        )
        nextEntries.push(...batchEntries)
        if (controller.signal.aborted) {
          nextEntries.forEach(([, url]) => revokeObjectUrl(url))
          return
        }
      }

      setEvidenceUrls((current) => {
        Object.values(current).forEach(revokeObjectUrl)
        return Object.fromEntries(nextEntries)
      })
    }

    void loadEvidenceUrls().catch((err) => {
      if (!isAbortError(err)) {
        setDetailWarning((current) => current || t('admin_analysis_evidence_load_warning'))
      }
    })

    return () => {
      controller.abort()
    }
  }, [events, selectedEvidence, tab])

  useEffect(() => {
    if (!selectedEvidence) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') setSelectedEvidence(null)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedEvidence])

  const highCount = events.filter((event) => event.severity === 'HIGH').length
  const medCount = events.filter((event) => event.severity === 'MEDIUM').length
  const lowCount = events.filter((event) => event.severity === 'LOW').length
  const integrity = Math.max(0, 100 - highCount * 18 - medCount * 9 - lowCount * 3)
  const integrityToneClass = integrity >= 70 ? styles.toneGood : integrity >= 40 ? styles.toneWarn : styles.toneBad

  const buildHeatmap = () => {
    if (!attempt?.started_at || events.length === 0) return Array(15).fill(0)
    const start = new Date(attempt.started_at).getTime()
    const end = attempt.submitted_at ? new Date(attempt.submitted_at).getTime() : Date.now()
    const duration = end - start || 1
    const buckets = Array(15).fill(0)

    events.forEach((event) => {
      const timestamp = new Date(event.occurred_at).getTime()
      if (!Number.isFinite(timestamp)) return
      const index = Math.min(14, Math.floor(((timestamp - start) / duration) * 15))
      buckets[index] += 1
    })

    return buckets
  }

  const heatmap = buildHeatmap()
  const maxBucket = Math.max(1, ...heatmap)
  const violationCounts = {}
  events.forEach((event) => {
    const key = event.event_type || 'unknown'
    if (!violationCounts[key]) violationCounts[key] = { type: key, severity: event.severity, count: 0 }
    violationCounts[key].count += 1
  })
  const evidenceEvents = events.filter((event) => event.meta?.evidence)
  const initials = (attempt?.user_name || attempt?.user_id || '??').slice(0, 2).toUpperCase()
  const requiresCertificateReview = attempt?.certificate_issue_rule === 'AFTER_PROCTORING_REVIEW'
  const certificateStatus = attempt?.certificate_review_status || (requiresCertificateReview ? 'PENDING' : null)
  const certificateDecisionToneClass = certificateStatus === 'APPROVED'
    ? styles.certificateDecisionApproved
    : certificateStatus === 'REJECTED'
      ? styles.certificateDecisionRejected
      : styles.certificateDecisionPending

  const formatTime = (iso) => {
    if (!iso || !attempt?.started_at) return '-'
    const diff = (new Date(iso) - new Date(attempt.started_at)) / 1000
    const minutes = Math.floor(diff / 60)
    const seconds = Math.floor(diff % 60)
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  const handleCertificateDecision = async (decision) => {
    if (!selectedId) return
    setReviewBusy(true)
    setReviewError('')
    setReviewNotice('')
    try {
      const { data } = await adminApi.reviewAttemptCertificate(selectedId, decision)
      setAttempt(data || null)
      setReviewNotice(
        decision === 'APPROVED'
          ? t('admin_analysis_certificate_approved_notice')
          : t('admin_analysis_certificate_rejected_notice'),
      )
    } catch (err) {
      setReviewError(resolveError(err, t('admin_analysis_save_review_error')))
    } finally {
      setReviewBusy(false)
    }
  }

  const showNoAttempts = !listLoading && !listError && attempts.length === 0
  const showSelectionHint = !listLoading && !listError && attempts.length > 0 && !selectedId

  return (
    <div className={styles.page}>
      <AdminPageHeader title={t('admin_analysis_title')} subtitle={t('admin_analysis_subtitle')} />

      <div className={styles.selector}>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(event) => {
            const nextId = event.target.value
            setSelectedId(nextId)
            setDetailReloadKey(0)
            if (nextId) setSearchParams({ id: nextId })
            else setSearchParams({})
          }}
          disabled={listLoading || attempts.length === 0}
        >
          <option value="">
            {listLoading
              ? t('admin_analysis_loading_attempts')
              : attempts.length === 0
                ? t('admin_analysis_no_attempts')
                : t('admin_analysis_select_attempt')}
          </option>
          {attempts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.test_title || entry.exam_title || t('admin_analysis_test')} - {entry.user_name || entry.user_id || t('admin_analysis_user')} ({entry.status})
            </option>
          ))}
        </select>
      </div>

      {listError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{listError}</div>
          <button type="button" className={styles.retryBtn} onClick={() => setListReloadKey((current) => current + 1)} disabled={listLoading}>
            {listLoading ? t('admin_analysis_retrying') : t('retry')}
          </button>
        </div>
      )}
      {detailError && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{detailError}</div>
          <button type="button" className={styles.retryBtn} onClick={() => setDetailReloadKey((current) => current + 1)} disabled={loading}>
            {loading ? t('admin_analysis_retrying') : t('retry')}
          </button>
        </div>
      )}
      {detailWarning && <div className={styles.warningBanner}>{detailWarning}</div>}
      {reviewError && <div className={styles.errorBanner}>{reviewError}</div>}
      {reviewNotice && <div className={styles.warningBanner}>{reviewNotice}</div>}
      {listLoading && <div className={styles.loading}>{t('admin_analysis_loading_attempts')}</div>}
      {showNoAttempts && <div className={styles.empty}>{t('admin_analysis_no_attempts_yet')}</div>}
      {showSelectionHint && <div className={styles.empty}>{t('admin_analysis_select_attempt_hint')}</div>}
      {loading && <div className={styles.loading}>{t('admin_analysis_loading_analysis')}</div>}

      {!loading && attempt && (
        <>
          <div className={styles.candidateCard}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.candidateInfo}>
              <div className={styles.candidateName}>{attempt.user_name || attempt.user_id}</div>
              <div className={styles.candidateMeta}>
                {t('admin_analysis_started')}: {attempt.started_at ? new Date(attempt.started_at).toLocaleString() : '-'}
                {attempt.submitted_at && <> | {t('admin_analysis_duration')}: {formatTime(attempt.submitted_at)}</>}
              </div>
            </div>
            <div className={styles.gaugeWrap}>
              <div className={styles.gaugeLabel}>{t('admin_analysis_integrity')}</div>
              <div className={`${styles.gaugeValue} ${integrityToneClass}`}>{integrity}%</div>
            </div>
          </div>

          {attempt.certificate_issue_rule && (
            <div className={styles.certificateReviewCard}>
              <div className={styles.certificateReviewHeader}>
                <div>
                  <div className={styles.certificateReviewTitle}>{t('admin_analysis_certificate_release')}</div>
                  <div className={styles.certificateReviewMeta}>
                    {certificateIssueRuleLabel(attempt.certificate_issue_rule)}
                  </div>
                </div>
                <div className={`${styles.certificateDecisionBadge} ${certificateDecisionToneClass}`}>
                  {certificateDecisionLabel(certificateStatus, t)}
                </div>
              </div>
              <div className={styles.certificateReviewCopy}>
                {attempt.certificate_eligible
                  ? t('admin_analysis_certificate_available')
                  : (attempt.certificate_block_reason || t('admin_analysis_certificate_unavailable'))}
              </div>
              {requiresCertificateReview && (
                <div className={styles.certificateReviewActions}>
                  <button
                    type="button"
                    className={styles.reviewApproveBtn}
                    disabled={reviewBusy}
                    onClick={() => void handleCertificateDecision('APPROVED')}
                  >
                    {reviewBusy ? t('admin_analysis_saving') : t('admin_analysis_approve_certificate')}
                  </button>
                  <button
                    type="button"
                    className={styles.reviewRejectBtn}
                    disabled={reviewBusy}
                    onClick={() => void handleCertificateDecision('REJECTED')}
                  >
                    {reviewBusy ? t('admin_analysis_saving') : t('admin_analysis_reject_certificate')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={styles.metricsGrid}>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{attempt.score ?? '-'}</div>
              <div className={styles.metricLabel}>{t('admin_analysis_score')}</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{events.length}</div>
              <div className={styles.metricLabel}>{t('admin_analysis_violations')}</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${styles.toneBad}`}>{highCount}</div>
              <div className={styles.metricLabel}>{t('admin_analysis_high')}</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${styles.toneWarn}`}>{medCount}</div>
              <div className={styles.metricLabel}>{t('admin_analysis_medium')}</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${styles.toneInfo}`}>{lowCount}</div>
              <div className={styles.metricLabel}>{t('admin_analysis_low')}</div>
            </div>
            <div className={styles.metric}>
              <div className={`${styles.metricValue} ${integrityToneClass}`}>{integrity}%</div>
              <div className={styles.metricLabel}>{t('admin_analysis_integrity')}</div>
            </div>
          </div>

          <div className={styles.tabs}>
            {TABS.map((tabName) => {
              const tabLabels = {
                Overview: t('admin_analysis_tab_overview'),
                Timeline: t('admin_analysis_tab_timeline'),
                Answers: t('admin_analysis_tab_answers'),
                Evidence: t('admin_analysis_tab_evidence'),
              }
              return (
                <button
                  key={tabName}
                  type="button"
                  className={`${styles.tab} ${tab === tabName ? styles.tabActive : ''}`}
                  onClick={() => setTab(tabName)}
                >
                  {tabLabels[tabName] || tabName}
                </button>
              )
            })}
          </div>

          {tab === 'Overview' && (
            <>
              <div className={styles.heatmapWrap}>
                <div className={styles.heatmapTitle}>{t('admin_analysis_activity_heatmap')}</div>
                <div className={styles.heatmap}>
                  {heatmap.map((value, index) => {
                    const pct = value / maxBucket
                    const toneClass = pct > 0.7 ? styles.heatmapHot : pct > 0.4 ? styles.heatmapWarm : pct > 0 ? styles.heatmapCool : styles.heatmapEmpty
                    const heightClass = pct > 0 ? styles[`heatmapHeight${Math.max(1, Math.min(10, Math.ceil(pct * 10)))}`] : styles.heatmapHeight1

                    return (
                      <div
                        key={index}
                        className={`${styles.heatmapBar} ${toneClass} ${heightClass}`}
                        title={`${t('admin_analysis_bucket')} ${index + 1}: ${value} ${t('admin_analysis_events')}`}
                      />
                    )
                  })}
                </div>
              </div>

              {Object.keys(violationCounts).length > 0 && (
                <table className={styles.violationsTable}>
                  <thead>
                    <tr>
                      <th>{t('admin_analysis_event_type')}</th>
                      <th>{t('admin_analysis_severity')}</th>
                      <th>{t('admin_analysis_count')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(violationCounts).map((violation) => (
                      <tr key={violation.type}>
                        <td>{violation.type.replace(/_/g, ' ')}</td>
                        <td>
                          <span className={`${styles.severityBadge} ${getSeverityClass('severity', violation.severity, styles)}`}>
                            {violation.severity}
                          </span>
                        </td>
                        <td>{violation.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === 'Timeline' && (
            <div className={styles.timeline}>
              {events.length === 0 ? (
                <div className={styles.empty}>{t('admin_analysis_no_events')}</div>
              ) : (
                events.map((event, index) => (
                  <div key={`${event.id || event.occurred_at || index}`} className={`${styles.timelineEvent} ${getSeverityClass('event', event.severity, styles)}`}>
                    <div className={styles.eventTime}>{formatTime(event.occurred_at)}</div>
                    <div className={styles.eventContent}>
                      <div className={styles.eventType}>
                        {event.event_type?.replace(/_/g, ' ')}{' '}
                        <span className={`${styles.severityBadge} ${getSeverityClass('severity', event.severity, styles)}`}>{event.severity}</span>
                      </div>
                      <div className={styles.eventDetail}>
                        {event.detail || formatConfidence(event.ai_confidence, t)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'Answers' && (
            <div>
              {answers.length === 0 ? (
                <div className={styles.empty}>{t('admin_analysis_no_answers')}</div>
              ) : (
                <table className={styles.violationsTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('admin_analysis_question')}</th>
                      <th>{t('admin_analysis_answer_given')}</th>
                      <th>{t('admin_analysis_result')}</th>
                      <th>{t('admin_analysis_points')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answers.map((answer, index) => {
                      const resultClass = answer.is_correct === true
                        ? styles.answerCorrect
                        : answer.is_correct === false
                          ? styles.answerWrong
                          : styles.answerUnknown
                      const resultText = answer.is_correct === true
                        ? t('admin_analysis_correct')
                        : answer.is_correct === false
                          ? t('admin_analysis_wrong')
                          : '-'

                      return (
                        <tr key={answer.id || index}>
                          <td className={styles.answerIndex}>{index + 1}</td>
                          <td className={styles.questionCell}>{answer.question_text || answer.question_id}</td>
                          <td className={styles.answerCell}>
                            {answer.answer ?? '-'}
                          </td>
                          <td>
                            <span className={resultClass}>{resultText}</span>
                          </td>
                          <td>{answer.points_earned != null ? answer.points_earned : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'Evidence' && (
            <>
              {(identityPhotoUrls.selfie || identityPhotoUrls.id) && (
                <div className={styles.identitySection}>
                  <div className={styles.identitySectionTitle}>{t('admin_analysis_identity_photos')}</div>
                  <div className={styles.identityPhotoRow}>
                    {identityPhotoUrls.selfie && (
                      <div className={styles.identityPhotoCard}>
                        <div className={styles.identityPhotoLabel}>{t('admin_analysis_selfie')}</div>
                        <img
                          className={styles.identityPhotoImg}
                          src={identityPhotoUrls.selfie}
                          alt={t('admin_analysis_candidate_selfie')}
                          onClick={() => setSelectedEvidence({ _identityType: 'selfie' })}
                        />
                      </div>
                    )}
                    {identityPhotoUrls.id && (
                      <div className={styles.identityPhotoCard}>
                        <div className={styles.identityPhotoLabel}>{t('admin_analysis_id_document')}</div>
                        <img
                          className={styles.identityPhotoImg}
                          src={identityPhotoUrls.id}
                          alt={t('admin_analysis_id_document')}
                          onClick={() => setSelectedEvidence({ _identityType: 'id' })}
                        />
                      </div>
                    )}
                  </div>
                  <div className={styles.identityStatus}>
                    {t('admin_analysis_identity_verified')}: {attempt.identity_verified ? t('admin_analysis_yes') : t('admin_analysis_no')}
                  </div>
                </div>
              )}
              {!identityPhotoUrls.selfie && !identityPhotoUrls.id && attempt.identity_verified != null && (
                <div className={styles.identitySection}>
                  <div className={styles.identitySectionTitle}>{t('admin_analysis_identity_verification')}</div>
                  <div className={styles.identityStatus}>
                    {attempt.identity_verified ? t('admin_analysis_identity_verified_no_photos') : t('admin_analysis_identity_not_verified')}
                  </div>
                </div>
              )}
            <div className={styles.evidenceGrid}>
              {evidenceEvents.length === 0 && !identityPhotoUrls.selfie && !identityPhotoUrls.id ? (
                <div className={styles.empty}>{t('admin_analysis_no_evidence')}</div>
              ) : evidenceEvents.length === 0 ? null : (
                evidenceEvents.map((event, index) => (
                  <button
                    key={`${event.id || event.occurred_at || index}`}
                    type="button"
                    className={styles.evidenceCard}
                    aria-label={`${t('admin_analysis_evidence')} ${index + 1}`}
                    onClick={() => setSelectedEvidence(event)}
                  >
                    {evidenceUrls[evidenceKeyForEvent(event, index)] ? (
                      <img className={styles.evidenceImg} src={evidenceUrls[evidenceKeyForEvent(event, index)]} alt={`${t('admin_analysis_evidence')} ${index + 1}`} />
                    ) : (
                      <div className={styles.evidenceImg} />
                    )}
                    <div className={styles.evidenceMeta}>
                      <div className={styles.evidenceMetaTop}>
                        <span className={`${styles.severityBadge} ${getSeverityClass('severity', event.severity, styles)}`}>{event.severity}</span>
                        <span>{formatConfidence(event.ai_confidence, t)}</span>
                      </div>
                      <div className={styles.evidenceLabel}>{event.event_type?.replace(/_/g, ' ')}</div>
                      <div>{event.detail || t('admin_analysis_evidence_captured')}</div>
                      <div className={styles.evidenceTimestamp}>{t('admin_analysis_captured_at')} {formatTime(event.occurred_at)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
          )}
        </>
      )}

      {selectedEvidence && (
        <div className={styles.lightboxBackdrop} role="dialog" aria-modal="true" aria-label={t('admin_analysis_evidence_preview')} onClick={() => setSelectedEvidence(null)}>
          <div className={styles.lightboxCard} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.lightboxClose} onClick={() => setSelectedEvidence(null)}>
              {t('admin_analysis_close')}
            </button>
            {selectedEvidence._identityType ? (
              <>
                <img
                  className={styles.lightboxImg}
                  src={identityPhotoUrls[selectedEvidence._identityType === 'selfie' ? 'selfie' : 'id']}
                  alt={selectedEvidence._identityType === 'selfie' ? t('admin_analysis_candidate_selfie') : t('admin_analysis_id_document')}
                />
                <div className={styles.lightboxMeta}>
                  <div className={styles.lightboxHeader}>
                    <span className={styles.lightboxTitle}>
                      {selectedEvidence._identityType === 'selfie' ? t('admin_analysis_candidate_selfie') : t('admin_analysis_id_document')}
                    </span>
                  </div>
                  <div>{t('admin_analysis_identity_photo_precheck')}</div>
                  <div>{t('admin_analysis_identity_verified')}: {attempt?.identity_verified ? t('admin_analysis_yes') : t('admin_analysis_no')}</div>
                </div>
              </>
            ) : (
              <>
                {evidenceUrls[evidenceKeyForEvent(selectedEvidence, 0)] ? (
                  <img
                    className={styles.lightboxImg}
                    src={evidenceUrls[evidenceKeyForEvent(selectedEvidence, 0)]}
                    alt={`${selectedEvidence.event_type?.replace(/_/g, ' ')} ${t('admin_analysis_evidence').toLowerCase()}`}
                  />
                ) : (
                  <div className={styles.lightboxImg} />
                )}
                <div className={styles.lightboxMeta}>
                  <div className={styles.lightboxHeader}>
                    <span className={styles.lightboxTitle}>{selectedEvidence.event_type?.replace(/_/g, ' ')}</span>
                    <span className={`${styles.severityBadge} ${getSeverityClass('severity', selectedEvidence.severity, styles)}`}>
                      {selectedEvidence.severity}
                    </span>
                  </div>
                  <div>{selectedEvidence.detail || t('admin_analysis_evidence_captured')}</div>
                  <div>{formatConfidence(selectedEvidence.ai_confidence, t)}</div>
                  <div>{t('admin_analysis_captured_at')} {formatTime(selectedEvidence.occurred_at)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && !attempt && selectedId && !detailError && (
        <div className={styles.empty}>{t('admin_analysis_not_found')}</div>
      )}
    </div>
  )
}
