import React, { useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import styles from './ExamQuestionPanel.module.scss'

const EMPTY_MCQ = { text: '', question_type: 'MCQ', options: ['', '', '', ''], correct_answer: 'A', points: 1 }
const EMPTY_TEXT = { text: '', question_type: 'TEXT', correct_answer: '', points: 1 }

const MCQ_TYPES = new Set(['MCQ', 'MULTI'])

const DEFAULT_TYPES = [
  { value: 'MCQ', label: 'Multiple Choice' },
  { value: 'TEXT', label: 'Text / Essay' },
]

export default function ExamQuestionPanel({ examId, questions = [], onUpdate, questionTypes }) {
  const types = questionTypes || DEFAULT_TYPES
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_MCQ })
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')

  const makeEmpty = (type) => MCQ_TYPES.has(type)
    ? { text: '', question_type: type, options: ['', '', '', ''], correct_answer: 'A', points: 1 }
    : { text: '', question_type: type, correct_answer: '', points: 1 }

  const openAdd = (type = 'MCQ') => {
    setForm(makeEmpty(type))
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (q) => {
    setForm({
      text: q.text,
      question_type: q.question_type,
      options: q.options || ['', '', '', ''],
      correct_answer: q.correct_answer || '',
      points: q.points || 1,
    })
    setEditId(q.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!examId) {
      setError('Create the test first, then add questions.')
      return
    }
    setError('')
    const questionType = form.question_type || form.questionType || form.type || 'MCQ'
    const normalizedOptions = (() => {
      if (questionType === 'TRUEFALSE') return ['True', 'False']
      if (MCQ_TYPES.has(questionType)) return (form.options || []).map(o => o.trim()).filter(Boolean)
      return null
    })()
    const data = {
      exam_id: examId,
      text: form.text.trim(),
      type: questionType,
      options: normalizedOptions,
      correct_answer: form.correct_answer?.trim() || (questionType === 'TRUEFALSE' ? 'True' : null),
      points: form.points || 1,
      order: (questions?.length || 0) + 1,
    }
    try {
      if (editId) {
        await adminApi.updateQuestion(editId, data)
      } else {
        await adminApi.addQuestion(data)
      }
      const { data: updated } = await adminApi.getQuestions(examId)
      onUpdate?.(updated || [])
      setShowForm(false)
      setEditId(null)
      setForm(makeEmpty('MCQ'))
    } catch (e) {
      console.error('Save question failed', e)
      setError(e.response?.data?.detail || 'Could not save question')
    }
  }

  const handleDelete = async (id) => {
    try {
      await adminApi.deleteQuestion(id)
      const { data: updated } = await adminApi.getQuestions(examId)
      onUpdate?.(updated || [])
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  const updateOption = (idx, val) => {
    setForm(f => ({
      ...f,
      options: f.options.map((o, i) => i === idx ? val : o)
    }))
  }

  return (
    <div className={styles.panel}>
      {error && <div className={styles.error}>{error}</div>}
      {questions.length === 0 && !showForm && (
        <div className={styles.empty}>No questions yet. Add your first question below.</div>
      )}

      {questions.map((q, i) => (
        <div key={q.id} className={styles.question}>
          <span className={styles.qNum}>{i + 1}</span>
          <div className={styles.qContent}>
            <div className={styles.qText}>{q.text}</div>
            <div className={styles.qMeta}>
              {q.question_type} | {q.points || 1} pts | Answer: {q.correct_answer || '-'}
              {q.options && ` | Options: ${q.options.length}`}
            </div>
          </div>
          <div className={styles.qActions}>
            <button className={styles.qBtn} onClick={() => openEdit(q)}>Edit</button>
            <button className={`${styles.qBtn} ${styles.qBtnDanger}`} onClick={() => handleDelete(q.id)}>Del</button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className={styles.addForm}>
          <div className={styles.addFormTitle}>{editId ? 'Edit Question' : 'Add Question'}</div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Type</label>
            <select className={styles.select} value={form.question_type} onChange={e => {
              const t = e.target.value
              setForm(makeEmpty(t))
            }}>
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Question Text</label>
            <input className={styles.input} value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="Enter question..." />
          </div>

          {MCQ_TYPES.has(form.question_type) && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.label}>Options</label>
                <div className={styles.optionsEditor}>
                  {(form.options || []).map((opt, i) => (
                    <div key={i} className={styles.optionRow}>
                      <span className={styles.optionLetter}>{String.fromCharCode(65 + i)}</span>
                      <input className={styles.optionInput} value={opt} onChange={e => updateOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Correct Answer</label>
                <select className={styles.select} value={form.correct_answer} onChange={e => setForm(f => ({ ...f, correct_answer: e.target.value }))}>
                  {(form.options || []).map((_, i) => (
                    <option key={i} value={String.fromCharCode(65 + i)}>{String.fromCharCode(65 + i)}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {!MCQ_TYPES.has(form.question_type) && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Expected Answer (for auto-grading)</label>
              <input className={styles.input} value={form.correct_answer} onChange={e => setForm(f => ({ ...f, correct_answer: e.target.value }))} placeholder="Expected answer..." />
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Points</label>
            <input className={styles.input} type="number" min="1" max="100" value={form.points} onChange={e => setForm(f => ({ ...f, points: Number(e.target.value) }))} />
          </div>

          <div className={styles.formActions}>
            <button className={styles.btnCancel} onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={!form.text.trim()}>
              {editId ? 'Update' : 'Add'} Question
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <button className={styles.addBtn} onClick={() => openAdd('MCQ')} disabled={!examId}>+ Add Question</button>
      )}
    </div>
  )
}
