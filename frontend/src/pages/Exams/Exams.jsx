import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listExams } from '../../services/exam.service'
import Loader from '../../components/common/Loader/Loader'
import styles from './Exams.module.scss'

export default function Exams() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    listExams()
      .then(({ data }) => setExams(data))
      .catch(() => setError('Failed to load exams'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loader />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Available Exams</h1>
        <p className={styles.sub}>Select an exam to begin</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {!error && exams.length === 0 && <p className={styles.empty}>No exams available at the moment.</p>}

      <div className={styles.grid}>
        {exams.map((exam) => (
          <div key={exam.id} className={styles.card} tabIndex={0} role="button"
            onClick={() => navigate(`/exams/${exam.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/exams/${exam.id}`)}>
            <div className={styles.cardTop}>
              <h3 className={styles.cardTitle}>{exam.title}</h3>
              <span className={`${styles.badge} ${exam.type === 'MCQ' ? styles.badgeMcq : styles.badgeText}`}>
                {exam.type}
              </span>
            </div>
            {exam.course_title && <p className={styles.course}>{exam.course_title} &bull; {exam.node_title}</p>}
            <div className={styles.cardMeta}>
              <span className={styles.metaItem}>{exam.time_limit ? `${exam.time_limit} min` : 'No limit'}</span>
              <span className={styles.metaItem}>{exam.max_attempts} attempt{exam.max_attempts !== 1 ? 's' : ''}</span>
              {exam.passing_score != null && (
                <span className={styles.metaItem}>Pass: {exam.passing_score}%</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
