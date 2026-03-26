import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTest } from '../../services/test.service'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import Loader from '../../components/common/Loader/Loader'
import { normalizeTest } from '../../utils/assessmentAdapters'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import { readTestAccessError } from '../../utils/testAccessError'
import styles from './ExamInstructions.module.scss'

export default function ExamInstructions() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const [test, setTest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTest = () => {
    setLoading(true)
    setError('')
    if (!testId) {
      setError('Invalid test link. Return to the available tests list and try again.')
      setLoading(false)
      return
    }
    getTest(testId)
      .then(({ data }) => {
        try {
          setTest(normalizeTest(data))
        } catch (parseErr) {
          setError('Failed to parse test data. The test may be misconfigured.')
        }
      })
      .catch((err) => setError(readTestAccessError(err, 'Failed to load test details.')))
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
          <div className={styles.errorTitle}>Could not prepare this test</div>
          <div className={styles.error}>{error}</div>
          <div className={styles.errorActions}>
            <button type="button" className={styles.secondaryBtn} onClick={loadTest}>
              Retry
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/tests')}>
              Back to available tests
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!test) return null

  const requirements = getJourneyRequirements(test.proctoring_config || {})
  const testSettings = test.settings || {}
  const instructionsHeading = testSettings.instructions_heading || 'Before you begin:'
  const instructionsBody = testSettings.instructions_body || testSettings.instructions || 'Review the guidance below before you start so the attempt can continue without interruptions.'
  const instructionItems = Array.isArray(testSettings.instructions_list)
    ? testSettings.instructions_list
    : [
        'Ensure a stable internet connection',
        'Close all other browser tabs and applications',
        'Have your ID ready for identity verification',
        ...((requirements.systemCheckRequired || requirements.identityRequired)
          ? [
              requirements.screenRequired
                ? 'Allow camera, microphone, and entire-screen sharing when prompted'
                : 'Allow camera and microphone access when prompted',
            ]
          : []),
        'Do not navigate away from the test page',
      ]

  const hasProctoring = requirements.systemCheckRequired || requirements.identityRequired
  const startRoute = requirements.systemCheckRequired
    ? `/tests/${testId}/system-check`
    : requirements.identityRequired
      ? `/tests/${testId}/verify-identity`
      : `/tests/${testId}/rules`
  const journeyCards = [
    {
      label: 'Next step',
      value: requirements.systemCheckRequired ? 'System check' : requirements.identityRequired ? 'Identity check' : 'Rules',
      helper: requirements.systemCheckRequired
        ? 'Camera, microphone, and device checks run before you can continue.'
        : requirements.identityRequired
          ? 'Identity capture is required before entering the rules screen.'
          : 'You can continue straight to the rules acknowledgement.',
    },
    {
      label: 'Monitoring',
      value: hasProctoring ? 'Proctored' : 'Standard',
      helper: hasProctoring
        ? requirements.screenRequired
          ? 'Camera, microphone, and entire-screen sharing will be requested.'
          : 'Camera and microphone permissions will be requested.'
        : 'No proctoring checks are enabled for this test.',
    },
    {
      label: 'Attempt policy',
      value: `${test.max_attempts} allowed`,
      helper: test.passing_score != null ? `Passing score: ${test.passing_score}%` : 'No passing threshold is configured.',
    },
  ]
  const requirementItems = [
    requirements.systemCheckRequired ? 'System check before entry' : null,
    requirements.identityRequired ? 'Identity verification before rules' : null,
    'Rules acknowledgement before starting',
    test.time_limit_minutes ? `Countdown timer for ${test.time_limit_minutes} minutes` : 'Untimed attempt',
  ].filter(Boolean)
  const primaryActionLabel = requirements.systemCheckRequired
    ? 'Continue to system check'
    : requirements.identityRequired
      ? 'Continue to identity check'
      : 'Continue to rules'

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
            <span className={styles.detailLabel}>Type</span>
            <span className={styles.detailValue}>{test.exam_type}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Time Limit</span>
            <span className={styles.detailValue}>{test.time_limit_minutes ? `${test.time_limit_minutes} min` : 'Unlimited'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Max Attempts</span>
            <span className={styles.detailValue}>{test.max_attempts}</span>
          </div>
          {test.passing_score != null && (
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Passing Score</span>
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
              <strong>This test is proctored.</strong> Your camera and microphone will be monitored.
              {requirements.screenRequired ? ' Entire-screen sharing is also required.' : ''}
              Make sure you are in a quiet, well-lit environment.
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
            <div className={styles.readinessTitle}>Journey checklist</div>
            <ul className={styles.readinessList}>
              {requirementItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/tests')}>
            Back to available tests
          </button>
          <button className={styles.btn} type="button" onClick={() => navigate(startRoute)}>
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
