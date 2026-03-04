import React, { useEffect, useState } from 'react'
import { listSurveys, submitResponse } from '../../services/survey.service'
import styles from './MySurveys.module.scss'

export default function MySurveys() {
  const [surveys, setSurveys] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listSurveys().then(({ data }) => setSurveys(data || []))
  }, [])

  const handleSubmit = async (surveyId) => {
    setSubmitting(true)
    try {
      await submitResponse(surveyId, answers[surveyId] || {})
      alert('Response submitted')
    } catch (e) {
      alert(e.response?.data?.detail || 'Submit failed')
    } finally { setSubmitting(false) }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>My Surveys</h1>
      <div className={styles.list}>
        {surveys.map(s => (
          <div key={s.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>{s.title}</div>
              <div className={styles.cardSub}>{s.description}</div>
            </div>
            <div className={styles.questions}>
              {(s.questions || []).map((q, i) => (
                <div key={i} className={styles.question}>
                  <div className={styles.qText}>{q.text}</div>
                  <input
                    className={styles.input}
                    value={(answers[s.id]?.[q.text]) || ''}
                    onChange={e => setAnswers(prev => ({
                      ...prev,
                      [s.id]: { ...(prev[s.id] || {}), [q.text]: e.target.value }
                    }))}
                    placeholder="Your answer"
                  />
                </div>
              ))}
            </div>
            <button className={styles.btn} disabled={submitting} onClick={() => handleSubmit(s.id)}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
