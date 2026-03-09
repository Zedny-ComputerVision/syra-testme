import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAttempt } from '../../services/attempt.service'
import { getTest } from '../../services/test.service'
import { getAttemptId, setAttemptId, clearAttemptId } from '../../utils/attemptSession'
import { resolveAttempt } from '../../utils/journeyAttempt'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import styles from './RulesPage.module.scss'

const FALLBACK_RULES = [
  'Do not use any external resources, books, or notes during the test.',
  'Do not communicate with others during the test.',
  'Keep your face visible in the camera at all times.',
  'Do not use a mobile phone or any other electronic device.',
  'Stay in fullscreen mode throughout the test.',
  'Do not navigate away from the test window.',
  'Any suspicious behavior will be flagged and recorded.',
  'Violations may result in test termination or score invalidation.',
]
const START_ERROR_STORAGE_PREFIX = 'journey_start_error:'

function consumeJourneyStartError(testId) {
  try {
    const key = `${START_ERROR_STORAGE_PREFIX}${testId}`
    const message = sessionStorage.getItem(key) || ''
    if (message) sessionStorage.removeItem(key)
    return message
  } catch {
    return ''
  }
}

export default function RulesPage() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const [error, setError] = useState('')
  const [rules, setRules] = useState(FALLBACK_RULES)
  const [requirements, setRequirements] = useState(getJourneyRequirements({}))
  const precheckFlags = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('precheck_flags') || '{}') || {}
    } catch {
      return {}
    }
  }, [testId])
  const systemCheckRecorded = Boolean(Object.keys(precheckFlags).length)
  const systemCheckSatisfied = !requirements.systemCheckRequired || systemCheckRecorded
  const prerequisiteCards = [
    {
      label: 'System check',
      value: requirements.systemCheckRequired ? (systemCheckSatisfied ? 'Completed' : 'Pending') : 'Skipped',
      helper: requirements.systemCheckRequired
        ? systemCheckSatisfied
          ? 'This browser session already passed the required device checks.'
          : 'Return to the system check before entering the live attempt.'
        : 'This test does not require device precheck.',
    },
    {
      label: 'Identity',
      value: requirements.identityRequired ? 'Required' : 'Skipped',
      helper: requirements.identityRequired
        ? 'Identity verification is checked again when you start the attempt.'
        : 'Identity verification is not required for this test.',
    },
    {
      label: 'Monitoring',
      value: requirements.fullscreenRequired ? 'Fullscreen enforced' : 'Standard',
      helper: requirements.fullscreenRequired
        ? 'The live attempt will request fullscreen before entry.'
        : 'The attempt can continue without fullscreen enforcement.',
    },
  ]

  const loadRules = async () => {
    setConfigLoading(true)
    setConfigError('')
    setError('')
    try {
      const { data } = await getTest(testId)
      const configRules = data?.settings?.rules
      setRules(Array.isArray(configRules) && configRules.length > 0 ? configRules : FALLBACK_RULES)
      setRequirements(getJourneyRequirements(data?.proctoring_config || {}))
    } catch {
      setRules(FALLBACK_RULES)
      setRequirements(getJourneyRequirements({}))
      setConfigError('Failed to load the test rules and requirements. Retry before starting.')
    } finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => {
    void loadRules()
  }, [testId])

  useEffect(() => {
    if (configLoading) return
    const pendingStartError = consumeJourneyStartError(testId)
    if (pendingStartError) {
      setError(pendingStartError)
    }
  }, [configLoading, testId])

  const handleStart = async () => {
    if (!systemCheckSatisfied) {
      setError('Complete the system check in this browser session before starting the test.')
      navigate(`/tests/${testId}/system-check`)
      return
    }
    if (configLoading || configError) {
      setError('Test rules are not ready yet. Retry loading the rules before starting.')
      return
    }
    if (!agreed) {
      setError('You must accept the rules before starting.')
      return
    }

    setLoading(true)
    setError('')
    try {
      let attemptId = getAttemptId()
      let currentAttempt = null

      if (attemptId) {
        try {
          const existingAttempt = await getAttempt(attemptId)
          if (
            String(existingAttempt.data?.exam_id) === String(testId)
            && existingAttempt.data?.status === 'IN_PROGRESS'
          ) {
            currentAttempt = existingAttempt.data
          } else {
            clearAttemptId()
            attemptId = null
          }
        } catch {
          clearAttemptId()
          attemptId = null
        }
      }

      if (requirements.identityRequired && !(currentAttempt?.identity_verified || currentAttempt?.id_verified)) {
        navigate(`/tests/${testId}/verify-identity`)
        return
      }

      if (!currentAttempt) {
        attemptId = await resolveAttempt(testId)
        let { data } = await getAttempt(attemptId)
        if (String(data.exam_id) !== String(testId) || data.status !== 'IN_PROGRESS') {
          clearAttemptId()
          attemptId = await resolveAttempt(testId)
          const refreshed = await getAttempt(attemptId)
          data = refreshed.data
        }
        currentAttempt = data
      }
      setAttemptId(attemptId)

      if (requirements.fullscreenRequired) {
        try { await document.documentElement.requestFullscreen() } catch {}
      }
      navigate(`/attempts/${attemptId}/take`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start test')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={3} />

      <div className={styles.card}>
        <h1 className={styles.title}>Test Rules</h1>
        <p className={styles.sub}>Please read and accept the following rules before starting</p>

        {configError && (
          <div className={styles.helperRow}>
            <div className={styles.errorBanner}>{configError}</div>
            <button type="button" className={styles.retryBtn} onClick={() => void loadRules()} disabled={configLoading || loading}>
              {configLoading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}
        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.summaryGrid}>
          {prerequisiteCards.map((card) => (
            <div key={card.label} className={styles.summaryCard}>
              <div className={styles.summaryLabel}>{card.label}</div>
              <div className={styles.summaryValue}>{card.value}</div>
              <div className={styles.summaryHelper}>{card.helper}</div>
            </div>
          ))}
        </div>

        {requirements.systemCheckRequired && !systemCheckSatisfied && (
          <div className={styles.prereqWarning}>
            System check has not been completed in this browser session yet. Return to the checks screen before starting the live attempt.
          </div>
        )}

        <div className={styles.rulesList}>
          {rules.map((rule, i) => (
            <div key={i} className={styles.ruleItem}>
              <span className={styles.ruleIcon}>&#10007;</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>

        <div className={styles.agree}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
            id="agree"
            disabled={configLoading || Boolean(configError) || loading}
          />
          <label className={styles.agreeLabel} htmlFor="agree">I have read and agree to all test rules</label>
        </div>

        <div className={styles.actions}>
          {requirements.systemCheckRequired && !systemCheckSatisfied ? (
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/tests/${testId}/system-check`)}>
              Back to system check
            </button>
          ) : (
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/tests/${testId}`)}>
              Back to instructions
            </button>
          )}
          <button className={styles.btn} type="button" disabled={!agreed || loading || configLoading || Boolean(configError) || !systemCheckSatisfied} onClick={handleStart}>
            {loading ? 'Starting...' : configLoading ? 'Loading requirements...' : !systemCheckSatisfied ? 'Complete system check first' : 'Start Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
