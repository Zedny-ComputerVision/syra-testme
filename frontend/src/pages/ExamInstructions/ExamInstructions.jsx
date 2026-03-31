import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTest } from '../../services/test.service'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import Loader from '../../components/common/Loader/Loader'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import { readTestAccessError } from '../../utils/testAccessError'
import useLanguage from '../../hooks/useLanguage'
import styles from './ExamInstructions.module.scss'

export default function ExamInstructions() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [test, setTest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTest = () => {
    setLoading(true)
    setError('')
    if (!testId) {
      setError(t('instructions_invalid_link'))
      setLoading(false)
      return
    }
    getTest(testId)
      .then(({ data }) => {
        try {
          setTest(normalizeTest(data))
        } catch (parseErr) {
          setError(t('instructions_parse_error'))
        }
      })
      .catch((err) => setError(readTestAccessError(err, t('instructions_load_error'))))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTest()
  }, [testId])

  if (loading) return <Loader />
  if (error) {
    return (
      <div className={styles.page}>
        <ExamJourneyStepper currentStep={0} />
        <div className={styles.errorCard}>
          <div className={styles.errorTitle}>{t('instructions_could_not_prepare')}</div>
          <div className={styles.error}>{error}</div>
          <div className={styles.errorActions}>
            <button type="button" className={styles.secondaryBtn} onClick={loadTest}>
              {t('retry')}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/tests')}>
              {t('instructions_back_to_tests')}
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!test) return null

  const requirements = getJourneyRequirements(test.proctoring_config || {})
  const testSettings = test.settings || {}
  const instructionsHeading = testSettings.instructions_heading || t('instructions_before_begin')
  const instructionsBody = testSettings.instructions_body || testSettings.instructions || t('instructions_review_guidance')
  const instructionItems = Array.isArray(testSettings.instructions_list)
    ? testSettings.instructions_list
    : [
        t('instructions_stable_connection'),
        t('instructions_close_tabs'),
        t('instructions_id_ready'),
        ...((requirements.systemCheckRequired || requirements.identityRequired)
          ? [
              requirements.screenRequired
                ? t('instructions_allow_cam_mic_screen')
                : t('instructions_allow_cam_mic'),
            ]
          : []),
        t('instructions_no_navigate_away'),
      ]

  const hasProctoring = requirements.systemCheckRequired || requirements.identityRequired
  const startRoute = requirements.systemCheckRequired
    ? `/tests/${testId}/system-check`
    : requirements.identityRequired
      ? `/tests/${testId}/verify-identity`
      : `/tests/${testId}/rules`
  const journeyCards = [
    {
      label: t('instructions_next_step'),
      value: requirements.systemCheckRequired ? t('instructions_system_check') : requirements.identityRequired ? t('instructions_identity_check') : t('instructions_rules'),
      helper: requirements.systemCheckRequired
        ? t('instructions_system_check_helper')
        : requirements.identityRequired
          ? t('instructions_identity_check_helper')
          : t('instructions_rules_helper'),
    },
    {
      label: t('instructions_monitoring'),
      value: hasProctoring ? t('instructions_proctored') : t('instructions_standard'),
      helper: hasProctoring
        ? requirements.screenRequired
          ? t('instructions_cam_mic_screen_requested')
          : t('instructions_cam_mic_requested')
        : t('instructions_no_proctoring'),
    },
    {
      label: t('instructions_attempt_policy'),
      value: `${test.max_attempts} ${t('instructions_allowed')}`,
      helper: test.passing_score != null ? `${t('instructions_passing_score')}: ${test.passing_score}%` : t('instructions_no_passing_threshold'),
    },
  ]
  const requirementItems = [
    requirements.systemCheckRequired ? t('instructions_req_system_check') : null,
    requirements.identityRequired ? t('instructions_req_identity') : null,
    t('instructions_req_rules'),
    test.time_limit_minutes ? `${t('instructions_countdown_timer')} ${test.time_limit_minutes} ${t('instructions_minutes')}` : t('instructions_untimed'),
  ].filter(Boolean)
  const primaryActionLabel = requirements.systemCheckRequired
    ? t('instructions_continue_system_check')
    : requirements.identityRequired
      ? t('instructions_continue_identity')
      : t('instructions_continue_rules')

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={0} />

      <div className={styles.card}>
        <h1 className={styles.title}>{test.title}</h1>
        <p className={styles.description}>
          {test.course_title && `${test.course_title} - ${test.node_title}`}
        </p>

        <section className={styles.summaryGrid}>
          {journeyCards.map((card) => (
            <article key={card.label} className={styles.summaryCard}>
              <div className={styles.summaryLabel}>{card.label}</div>
              <div className={styles.summaryValue}>{card.value}</div>
              <div className={styles.summarySub}>{card.helper}</div>
            </article>
          ))}
        </section>

        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('type')}</span>
            <span className={styles.detailValue}>{test.exam_type}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('instructions_time_limit')}</span>
            <span className={styles.detailValue}>{test.time_limit_minutes ? `${test.time_limit_minutes} ${t('time_min')}` : t('instructions_unlimited')}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('instructions_max_attempts')}</span>
            <span className={styles.detailValue}>{test.max_attempts}</span>
          </div>
          {test.passing_score != null && (
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>{t('instructions_passing_score_label')}</span>
              <span className={styles.detailValue}>{test.passing_score}%</span>
            </div>
          )}
        </div>

        {hasProctoring && (
          <div className={styles.proctoringNote}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          <div>
              <strong>{t('instructions_proctored_notice')}</strong> {t('instructions_cam_mic_monitored')}
              {requirements.screenRequired ? ` ${t('instructions_screen_required')}` : ''}
              {' '}{t('instructions_quiet_environment')}
          </div>
        </div>
        )}

        <div className={styles.lowerContent}>
          <div className={styles.instructions}>
            <h3>{instructionsHeading}</h3>
            <p>{instructionsBody}</p>
            <ul>
              {instructionItems.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>

          <div className={styles.readinessCard}>
            <div className={styles.readinessTitle}>{t('instructions_journey_checklist')}</div>
            <ul className={styles.readinessList}>
              {requirementItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/tests')}>
            {t('instructions_back_to_tests')}
          </button>
          <button className={styles.btn} type="button" onClick={() => navigate(startRoute)}>
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
