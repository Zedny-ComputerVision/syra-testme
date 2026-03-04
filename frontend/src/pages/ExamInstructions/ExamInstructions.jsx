import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getExam } from '../../services/exam.service'
import ExamJourneyStepper from '../../components/ExamJourneyStepper/ExamJourneyStepper'
import Loader from '../../components/common/Loader/Loader'
import styles from './ExamInstructions.module.scss'

export default function ExamInstructions() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getExam(examId)
      .then(({ data }) => setExam(data))
      .catch(() => setError('Failed to load exam details'))
      .finally(() => setLoading(false))
  }, [examId])

  if (loading) return <Loader />
  if (error) return <div className={styles.error}>{error}</div>
  if (!exam) return null

  const hasProctoring = exam.proctoring_config &&
    Object.values(exam.proctoring_config).some(v => v === true)

  return (
    <div className={styles.page}>
      <ExamJourneyStepper currentStep={0} />

      <div className={styles.card}>
        <h1 className={styles.title}>{exam.title}</h1>
        <p className={styles.description}>
          {exam.course_title && `${exam.course_title} — ${exam.node_title}`}
        </p>

        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Type</span>
            <span className={styles.detailValue}>{exam.type}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Time Limit</span>
            <span className={styles.detailValue}>{exam.time_limit ? `${exam.time_limit} min` : 'Unlimited'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Max Attempts</span>
            <span className={styles.detailValue}>{exam.max_attempts}</span>
          </div>
          {exam.passing_score != null && (
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Passing Score</span>
              <span className={styles.detailValue}>{exam.passing_score}%</span>
            </div>
          )}
        </div>

        {hasProctoring && (
          <div className={styles.proctoringNote}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>This exam is proctored.</strong> Your camera and microphone will be monitored.
              Make sure you are in a quiet, well-lit environment.
            </div>
          </div>
        )}

        <div className={styles.instructions}>
          <h3>Before you begin:</h3>
          <ul>
            <li>Ensure a stable internet connection</li>
            <li>Close all other browser tabs and applications</li>
            <li>Have your ID ready for identity verification</li>
            {hasProctoring && <li>Allow camera and microphone access when prompted</li>}
            <li>You will not be able to pause once the exam starts</li>
            <li>Do not navigate away from the exam page</li>
          </ul>
        </div>

        <button className={styles.btn} onClick={() => navigate(`/system-check/${examId}`)}>
          Begin Exam
        </button>
      </div>
    </div>
  )
}
