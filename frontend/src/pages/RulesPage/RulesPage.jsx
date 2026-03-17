import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAttempt } from '../../services/attempt.service'
import { getTest } from '../../services/test.service'
import { setAttemptId } from '../../utils/attemptSession'
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
  }, [])
  const systemCheckRecorded = Boolean(Object.keys(precheckFlags).length)
  const systemCheckSatisfied = !requirements.systemCheckRequired || systemCheckRecorded
  const prerequisiteCards = useMemo(() => {
    const cards = []
    if (requirements.systemCheckRequired) {
      cards.push({
        label: 'System check',
        value: systemCheckSatisfied ? 'Completed' : 'Pending',
        helper: systemCheckSatisfied
          ? 'This browser session already passed the required device checks.'
          : 'Return to the system check before entering the live attempt.',
      })
    }
    if (requirements.cameraRequired) {
      cards.push({
        label: 'Camera',
        value: 'Required',
        helper: 'Your camera will record you during the test.',
      })
    }
    if (requirements.micRequired) {
      cards.push({
        label: 'Microphone',
        value: 'Required',
        helper: 'Your microphone will be monitored for audio during the test.',
      })
    }
    if (requirements.screenRequired) {
      cards.push({
        label: 'Screen recording',
        value: 'Required',
        helper: 'Your entire screen must be shared before the live attempt starts. If the share stops, you will be prompted again on the test page.',
      })
    }
    if (requirements.fullscreenRequired) {
      cards.push({
        label: 'Fullscreen',
        value: 'Enforced',
        helper: 'The test will run in fullscreen mode. Exiting fullscreen will be flagged.',
      })
    }
    if (requirements.identityRequired) {
      cards.push({
        label: 'Identity',
        value: 'Required',
        helper: 'Identity verification is checked before you enter the attempt.',
      })
    }
    return cards
  }, [requirements, systemCheckSatisfied])
  const startActionLabel = requirements.fullscreenRequired || requirements.cameraRequired || requirements.micRequired || requirements.screenRequired
    ? 'Start test'
    : 'Start test'

  const loadRules = useCallback(async () => {
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
  }, [testId])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

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
      // Resolve or reuse an IN_PROGRESS attempt for this test
      let attemptId
      try {
        attemptId = await resolveAttempt(testId)
      } catch (resolveErr) {
        setError(resolveErr.response?.data?.detail || resolveErr.message || 'Failed to create or find an active attempt for this test.')
        setLoading(false)
        return
      }

      // Check identity verification if required
      if (requirements.identityRequired) {
        try {
          const { data: attemptData } = await getAttempt(attemptId)
          if (!(attemptData?.identity_verified || attemptData?.id_verified)) {
            setAttemptId(attemptId)
            navigate(`/tests/${testId}/verify-identity`)
            return
          }
        } catch {
          // If we can't check identity status, let the proctoring WS handle it
        }
      }

      setAttemptId(attemptId)

      // System check requests the initial screen share. The exam page re-prompts
      // only if that share is missing or gets interrupted.
      // Enter fullscreen (skip when screen capture is required — getDisplayMedia
      // and requestFullscreen conflict in browsers, and the exam page handles it).
      if (requirements.fullscreenRequired && !requirements.screenRequired) {
        try {
          await document.documentElement.requestFullscreen()
        } catch {
          setError('Fullscreen is required before the test can start. Please allow fullscreen and try again.')
          setLoading(false)
          return
        }
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
              {configLoading ? 'Retrying rules...' : 'Retry loading rules'}
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
          <label className={styles.agreeLabel} htmlFor="agree">I have read and agree to all test rules and consent to the monitoring described above</label>
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
            {loading ? 'Starting...' : configLoading ? 'Loading requirements...' : !systemCheckSatisfied ? 'Complete system check first' : startActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
