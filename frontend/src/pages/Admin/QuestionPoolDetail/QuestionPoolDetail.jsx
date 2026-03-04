import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './QuestionPoolDetail.module.scss'

export default function QuestionPoolDetail() {
  const { id } = useParams()
  const [pool, setPool] = useState(null)
  const [questions, setQuestions] = useState([])

  useEffect(() => {
    adminApi.getQuestionPool(id).then(({ data }) => setPool(data)).catch(() => setPool(null))
    adminApi.getPoolQuestions(id).then(({ data }) => setQuestions(data || [])).catch(() => setQuestions([]))
  }, [id])

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Question Pool" subtitle={pool?.name || ''} />
      <div className={styles.card}>
        <div className={styles.meta}>
          <div><strong>Description:</strong> {pool?.description || '—'}</div>
          <div><strong>Questions:</strong> {questions.length}</div>
        </div>
        <div className={styles.list}>
          {questions.map((q, i) => (
            <div key={q.id} className={styles.qCard}>
              <div className={styles.qHeader}>Q{i + 1}</div>
              <div className={styles.qText}>{q.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
