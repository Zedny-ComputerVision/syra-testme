import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAttempt } from '../../services/attempt.service'
import { getTest } from '../../services/test.service'
import { setAttemptId } from '../../utils/attemptSession'
import { resolveAttempt } from '../../utils/journeyAttempt'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import { getJourneyRequirements } from '../../utils/proctoringRequirements'
import { readTestAccessError } from '../../utils/testAccessError'
import useLanguage from '../../hooks/useLanguage'
import styles from './RulesPage.module.scss'

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
  const { t } = useLanguage()

  const DEFAULT_RULES = useMemo(() => [
    t('rules_no_external_resources'),
    t('rules_no_communication'),
    t('rules_face_visible'),
    t('rules_no_mobile'),
    t('rules_stay_fullscreen'),
    t('rules_no_navigate_away'),
    t('rules_suspicious_flagged'),
    t('rules_violations_termination'),
  ], [t])

  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const [error, setError] = useState('')
  const [rules, setRules] = useState([])
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
        label: t('rules_system_check'),
        value: systemCheckSatisfied ? t('rules_completed') : t('rules_pending'),
        helper: systemCheckSatisfied
          ? t('rules_system_check_passed')
          : t('rules_system_check_pending'),
      })
    }
    if (requirements.cameraRequired) {
      cards.push({
        label: t('rules_camera'),
        value: t('required'),
        helper: t('rules_camera_helper'),
      })
    }
    if (requirements.micRequired) {
      cards.push({
        label: t('rules_microphone'),
        value: t('required'),
        helper: t('rules_mic_helper'),
      })
    }
    if (requirements.screenRequired) {
      cards.push({
        label: t('rules_screen_recording'),
        value: t('required'),
        helper: t('rules_screen_helper'),
      })
    }
    if (requirements.fullscreenRequired) {
      cards.push({
        label: t('rules_fullscreen'),
        value: t('rules_enforced'),
        helper: t('rules_fullscreen_helper'),
      })
    }
    if (requirements.identityRequired) {
      cards.push({
        label: t('rules_identity'),
        value: t('required'),
        helper: t('rules_identity_helper'),
      })
    }
    return cards
  }, [requirements, systemCheckSatisfied, t])
  const startActionLabel = t('rules_start_test')

  const loadRules = useCallback(async () => {
    setConfigLoading(true)
    setConfigError('')
    setError('')
    if (!testId) {
      setRules([])
      setRequirements(getJourneyRequirements({}))
      setConfigError(t('rules_invalid_link'))
      setConfigLoading(false)
      return
    }
    try {
      const { data } = await getTest(testId)
      const configRules = data?.settings?.rules
      setRules(Array.isArray(configRules) && configRules.length > 0 ? configRules : DEFAULT_RULES)
      setRequirements(getJourneyRequirements(data?.proctoring_config || {}))
    } catch (loadError) {
      setRules([])
      setRequirements(getJourneyRequirements({}))
      setConfigError(readTestAccessError(loadError, t('rules_load_error')))
    } finally {
      setConfigLoading(false)
    }
  }, [testId, t, DEFAULT_RULES])

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
      setError(t('rules_complete_system_check'))
      navigate(`/tests/${testId}/system-check`)
      return
    }
    if (configLoading || configError) {
      setError(t('rules_not_ready'))
      return
    }
    if (!agreed) {
      setError(t('rules_must_accept'))
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
        setError(resolveErr.response?.data?.detail || resolveErr.message || t('rules_attempt_error'))
        setLoading(false)
        return
      }

      // Check identity verification if required
      if (requirements.identityRequired) {
        try {
          const { data: attemptData } = await getAttempt(attemptId)
          const identityOk = attemptData?.identity_verified || attemptData?.id_verified
          const precheckDone = Boolean(attemptData?.precheck_passed_at)
          if (!identityOk || !precheckDone) {
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
      // Enter fullscreen here from the learner's click before navigation. This
      // keeps the screen-share journey stable while still giving browsers the
      // user activation they need for requestFullscreen().
      if (requirements.fullscreenRequired && !document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen()
        } catch {
          setError(t('rules_fullscreen_required'))
          setLoading(false)
          return
        }
      }

      navigate(`/attempts/${attemptId}/take`)
    } catch (err) {
      setError(err.response?.data?.detail || t('rules_start_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={3} />

      <div className={styles.card}>
        <h1 className={styles.title}>{t('rules_title')}</h1>
        <p className={styles.sub}>{t('rules_subtitle')}</p>

        {configError && (
          <div className={styles.helperRow}>
            <div className={styles.errorBanner}>{configError}</div>
            <button type="button" className={styles.retryBtn} onClick={() => void loadRules()} disabled={configLoading || loading}>
              {configLoading ? t('rules_retrying_rules') : t('rules_retry_loading')}
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
            {t('rules_system_check_warning')}
          </div>
        )}

        <div className={styles.rulesList}>
          {rules.length > 0 ? (
            rules.map((rule, i) => (
              <div key={i} className={styles.ruleItem}>
                <span className={styles.ruleIcon}>&#10007;</span>
                <span>{rule}</span>
              </div>
            ))
          ) : (
            <div className={styles.prereqWarning}>
              {t('rules_unavailable')}
            </div>
          )}
        </div>

        <div className={styles.agree}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
            id="agree"
            disabled={configLoading || Boolean(configError) || loading}
          />
          <label className={styles.agreeLabel} htmlFor="agree">{t('rules_agree_label')}</label>
        </div>

        <div className={styles.actions}>
          {requirements.systemCheckRequired && !systemCheckSatisfied ? (
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/tests/${testId}/system-check`)}>
              {t('rules_back_to_system_check')}
            </button>
          ) : (
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/tests/${testId}`)}>
              {t('rules_back_to_instructions')}
            </button>
          )}
          <button className={styles.btn} type="button" disabled={!agreed || loading || configLoading || Boolean(configError) || !systemCheckSatisfied} onClick={handleStart}>
            {loading ? t('rules_starting') : configLoading ? t('rules_loading_requirements') : !systemCheckSatisfied ? t('rules_complete_system_check_first') : startActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
