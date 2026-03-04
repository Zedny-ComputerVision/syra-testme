import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { listSurveys, createSurvey, deleteSurvey, listResponses } from '../../../services/survey.service'
import styles from './AdminSurveys.module.scss'

export default function AdminSurveys() {
  const [surveys, setSurveys] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState([{ text: '' }])
  const [responses, setResponses] = useState([])
  const [selectedSurvey, setSelectedSurvey] = useState(null)

  const load = async () => {
    const { data } = await listSurveys()
    setSurveys(data || [])
  }
  useEffect(() => { load() }, [])

  const addQuestion = () => setQuestions(qs => [...qs, { text: '' }])

  const save = async (e) => {
    e.preventDefault()
    await createSurvey({ title, description, questions })
    setTitle(''); setDescription(''); setQuestions([{ text: '' }])
    load()
  }

  const openResponses = async (id) => {
    setSelectedSurvey(id)
    const { data } = await listResponses(id)
    setResponses(data || [])
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Surveys" subtitle="Create and review surveys" />
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={save}>
          <div className={styles.sectionTitle}>New Survey</div>
          <label className={styles.label}>Title</label>
          <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} required />
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          <div className={styles.sectionTitle}>Questions</div>
          {questions.map((q, i) => (
            <input key={i} className={styles.input} value={q.text} onChange={e => setQuestions(arr => arr.map((qq, idx) => idx === i ? { ...qq, text: e.target.value } : qq))} placeholder={`Question ${i + 1}`} />
          ))}
          <div className={styles.qActions}>
            <button type="button" className={styles.btnSecondary} onClick={addQuestion}>+ Question</button>
            <button className={styles.btnPrimary} type="submit">Save Survey</button>
          </div>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>All Surveys</div>
          {(surveys || []).map(s => (
            <div key={s.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>{s.title}</div>
                <div className={styles.rowSub}>{s.description}</div>
              </div>
              <div className={styles.rowActions}>
                <button className={styles.btnSecondary} type="button" onClick={() => openResponses(s.id)}>Responses</button>
                <button className={styles.deleteBtn} type="button" onClick={() => { deleteSurvey(s.id); load() }}>Delete</button>
              </div>
            </div>
          ))}

          {selectedSurvey && (
            <div className={styles.responses}>
              <div className={styles.sectionTitle}>Responses ({responses.length})</div>
              {responses.map((r, i) => (
                <pre key={i} className={styles.responseItem}>{JSON.stringify(r.answers, null, 2)}</pre>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
