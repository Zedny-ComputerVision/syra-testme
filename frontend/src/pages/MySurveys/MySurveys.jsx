import React, { useEffect, useState } from 'react'
import { listSurveys, submitResponse } from '../../services/survey.service'
import styles from './MySurveys.module.scss'

export default function MySurveys() {
  const [surveys, setSurveys] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submittingId, setSubmittingId] = useState(null)

  const loadSurveys = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await listSurveys()
      setSurveys(data || [])
    } catch {
      setSurveys([])
      setError('Failed to load surveys.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSurveys()
  }, [])

  const handleSubmit = async (surveyId) => {
    if (submitted[surveyId]) return
    setSubmittingId(surveyId)
    setError('')
    setNotice('')
    try {
      await submitResponse(surveyId, answers[surveyId] || {})
      setSubmitted((prev) => ({ ...prev, [surveyId]: true }))
      setNotice('Response submitted successfully.')
    } catch (e) {
      const detail = e.response?.data?.detail || 'Submit failed'
      if (detail === 'Already responded') {
        setSubmitted((prev) => ({ ...prev, [surveyId]: true }))
        setNotice('You already submitted this survey.')
      } else {
        setError(detail)
      }
    } finally { setSubmittingId(null) }
  }

  const normalizeQuestionType = (questionType) => {
    if (questionType === 'MULTI') return 'MULTI_SELECT'
    if (questionType === 'TRUEFALSE') return 'BOOLEAN'
    return questionType || 'TEXT'
  }

  const submittedCount = Object.values(submitted).filter(Boolean).length
  const answeredCount = (survey) => Object.keys(answers[survey.id] || {}).filter((key) => {
    const value = answers[survey.id]?.[key]
    return Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== ''
  }).length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>My Surveys</h1>
          {!loading && surveys.length > 0 && (
            <span className={styles.surveyCount} aria-label={`${surveys.length} available surveys`}>
              {surveys.length}
            </span>
          )}
        </div>
        {!loading && submittedCount > 0 && (
          <span className={`${styles.noticeBanner} ${styles.compactBanner}`}>
            {submittedCount}/{surveys.length} completed
          </span>
        )}
      </div>
      {loading && <div className={styles.loadingText}>Loading surveys...</div>}
      {!loading && error && <div className={styles.errorBanner}>{error}</div>}
      {!loading && error && (
        <button type="button" className={styles.retryBtn} onClick={() => void loadSurveys()}>
          Retry
        </button>
      )}
      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      {!loading && !error && surveys.length === 0 && <div className={styles.emptyState}>No surveys available right now.</div>}
      <div className={styles.list}>
        {surveys.map(s => (
          <div key={s.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <div className={styles.cardTitle}>{s.title}</div>
                <span className={styles.progressBadge}>{answeredCount(s)}/{(s.questions || []).length} answered</span>
              </div>
              {s.description && <div className={styles.cardSub}>{s.description}</div>}
            </div>
            <div className={styles.questions}>
              {(s.questions || []).length === 0 && (
                <div className={styles.questionEmpty}>This survey has no questions yet.</div>
              )}
              {(s.questions || []).map((q, i) => {
                const val = answers[s.id]?.[q.text] ?? ''
                const set = (v) => setAnswers(prev => ({
                  ...prev,
                  [s.id]: { ...(prev[s.id] || {}), [q.text]: v }
                }))
                const qType = normalizeQuestionType(q.question_type)
                return (
                  <div key={i} className={styles.question}>
                    <div className={styles.qText}>{q.text}</div>
                    {qType === 'MCQ' && Array.isArray(q.options) && q.options.length > 0 ? (
                      <div className={styles.optionList}>
                        {q.options.map((opt, oi) => (
                          <label key={oi} className={styles.optionLabel}>
                            <input type="radio" name={`${s.id}-${i}`} value={opt} checked={val === opt} onChange={() => set(opt)} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : qType === 'MULTI_SELECT' && Array.isArray(q.options) ? (
                      <div className={styles.optionList}>
                        {q.options.map((opt, oi) => {
                          const checked = Array.isArray(val) ? val.includes(opt) : false
                          const toggle = () => set(checked ? (Array.isArray(val) ? val.filter(v => v !== opt) : []) : [...(Array.isArray(val) ? val : []), opt])
                          return (
                            <label key={oi} className={styles.optionLabel}>
                              <input type="checkbox" checked={checked} onChange={toggle} />
                              {opt}
                            </label>
                          )
                        })}
                      </div>
                    ) : qType === 'RATING' ? (
                      <div className={styles.ratingRow}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} type="button" className={`${styles.ratingBtn} ${val === n ? styles.ratingActive : ''}`} onClick={() => set(n)}>{n}</button>
                        ))}
                      </div>
                    ) : qType === 'BOOLEAN' ? (
                      <div className={styles.optionList}>
                        {['Yes', 'No'].map(opt => (
                          <label key={opt} className={styles.optionLabel}>
                            <input type="radio" name={`${s.id}-${i}`} value={opt} checked={val === opt} onChange={() => set(opt)} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        className={styles.input}
                        value={val}
                        onChange={e => set(e.target.value)}
                        placeholder="Your answer"
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {submitted[s.id] ? (
              <div className={styles.submittedBanner}>Response submitted</div>
            ) : (
              <button type="button" className={styles.btn} disabled={submittingId === s.id || (s.questions || []).length === 0} onClick={() => handleSubmit(s.id)}>
                {submittingId === s.id ? 'Submitting...' : 'Submit Response'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
