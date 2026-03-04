import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createAttempt, getAttempt } from '../../services/attempt.service'
import { setAttemptId, getAttemptId, clearAttemptId } from '../../utils/attemptSession'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import styles from './RulesPage.module.scss'

const RULES = [
  'Do not use any external resources, books, or notes during the exam.',
  'Do not communicate with others during the exam.',
  'Keep your face visible in the camera at all times.',
  'Do not use a mobile phone or any other electronic device.',
  'Stay in fullscreen mode throughout the exam.',
  'Do not navigate away from the exam window.',
  'Any suspicious behavior will be flagged and recorded.',
  'Violations may result in exam termination or score invalidation.',
]

export default function RulesPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    setLoading(true)
    setError('')
    try {
      let attemptId = getAttemptId()
      if (attemptId) {
        try {
          const { data: existing } = await getAttempt(attemptId)
          if (existing.exam_id !== examId || existing.status !== 'IN_PROGRESS') {
            attemptId = null
            clearAttemptId()
          } else if (!existing.identity_verified) {
            setError('Pre-check not completed. Please restart verification.')
            setLoading(false)
            return
          }
        } catch {
          attemptId = null
          clearAttemptId()
        }
      }

      if (!attemptId) {
        const { data } = await createAttempt(examId)
        attemptId = data.id
        setAttemptId(attemptId)
      }

      // Enter fullscreen
      try { await document.documentElement.requestFullscreen() } catch {}
      navigate(`/exam/${attemptId}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start exam')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={3} />

      <div className={styles.card}>
        <h1 className={styles.title}>Exam Rules</h1>
        <p className={styles.sub}>Please read and accept the following rules before starting</p>

        {error && <div style={{ color: '#fca5a5', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <div className={styles.rulesList}>
          {RULES.map((rule, i) => (
            <div key={i} className={styles.ruleItem}>
              <span className={styles.ruleIcon}>&#10007;</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>

        <div className={styles.agree} onClick={() => setAgreed(!agreed)}>
          <input type="checkbox" checked={agreed} onChange={() => setAgreed(!agreed)} id="agree" />
          <label htmlFor="agree">I have read and agree to all exam rules</label>
        </div>

        <button className={styles.btn} disabled={!agreed || loading} onClick={handleStart}>
          {loading ? 'Starting...' : 'Start Exam'}
        </button>
      </div>
    </div>
  )
}
