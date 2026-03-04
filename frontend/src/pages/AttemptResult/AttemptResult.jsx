import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAttempt, getAttemptAnswers } from '../../services/attempt.service'
import { getExamQuestions, getExam } from '../../services/exam.service'
import api from '../../services/api'
import styles from './AttemptResult.module.scss'

export default function AttemptResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(true)
  const [exam, setExam] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const attRes = await getAttempt(id)
        const att = attRes.data
        setAttempt(att)
        const [qRes, aRes, exRes] = await Promise.all([
          getExamQuestions(att.exam_id),
          getAttemptAnswers(id),
          getExam(att.exam_id),
        ])
        setQuestions(qRes.data || [])
        setAnswers(aRes.data || [])
        setExam(exRes.data || null)
      } catch (e) {
        console.error('Failed to load result', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className={styles.loading}>Loading result...</div>
  if (!attempt) return <div className={styles.loading}>Attempt not found.</div>

  const score = attempt.score ?? 0
  const totalQ = questions.length
  const correctCount = answers.filter(a => a.is_correct).length
  const circumference = 2 * Math.PI * 62
  const offset = circumference - (score / 100) * circumference

  const formatDuration = () => {
    if (!attempt.started_at || !attempt.submitted_at) return '-'
    const ms = new Date(attempt.submitted_at) - new Date(attempt.started_at)
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const answerMap = {}
  answers.forEach(a => { answerMap[a.question_id] = a })

  const canDownloadCert = exam?.certificate && attempt.status !== 'IN_PROGRESS' &&
    (exam.passing_score == null || attempt.score == null || attempt.score >= exam.passing_score)

  const downloadCertificate = async () => {
    setDownloading(true)
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
      alert('Unable to download certificate: ' + (e.response?.data?.detail || ''))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>{attempt.exam_title || 'Exam Result'}</h2>
        <p className={styles.sub}>
          Submitted {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ''}
        </p>
      </div>

      {/* Score Ring */}
      <div className={styles.scoreSection}>
        <div className={styles.scoreRing}>
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="62" fill="none" stroke="var(--color-border)" strokeWidth="12" />
            <circle
              cx="80" cy="80" r="62"
              fill="none"
              stroke={score >= 60 ? 'var(--color-primary)' : '#ef4444'}
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
          {score >= 90 ? 'Excellent' : score >= 80 ? 'Very Good' : score >= 70 ? 'Good' : score >= 60 ? 'Pass' : 'Fail'}
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statVal}>{correctCount}/{totalQ}</div>
          <div className={styles.statLbl}>Correct</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{formatDuration()}</div>
          <div className={styles.statLbl}>Duration</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{attempt.status}</div>
          <div className={styles.statLbl}>Status</div>
        </div>
        {canDownloadCert && (
          <div className={styles.stat}>
            <button className={styles.certBtn} onClick={downloadCertificate} disabled={downloading}>
              {downloading ? 'Preparing...' : 'Download Certificate'}
            </button>
          </div>
        )}
      </div>

      {/* Per-Question Review */}
      <div className={styles.answersSection}>
        <h3 className={styles.sectionTitle}>Answer Review</h3>
        {questions.map((q, i) => {
          const ans = answerMap[q.id]
          const isCorrect = ans?.is_correct
          return (
            <div key={q.id} className={styles.answerCard}>
              <div className={styles.answerHeader}>
                <span className={styles.qNumber}>Question {i + 1}</span>
                {ans && (
                  <span className={isCorrect ? styles.correctBadge : styles.wrongBadge}>
                    {isCorrect ? 'Correct' : 'Wrong'}
                  </span>
                )}
              </div>
              <div className={styles.qText}>{q.text}</div>
              {ans && (
                <div className={styles.answerDetail}>
                  <strong>Your answer:</strong> {ans.answer || '-'}
                  {q.correct_answer && (
                    <> &nbsp;|&nbsp; <strong>Correct:</strong> {q.correct_answer}</>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button className={styles.backBtn} onClick={() => navigate('/attempts')}>
        &larr; Back to Attempts
      </button>
    </div>
  )
}
