import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import useAuth from '../../../hooks/useAuth'
import styles from './QuestionPoolDetail.module.scss'

const POOL_QUESTION_TYPES = [
  { value: 'MCQ', label: 'Multiple Choice' },
  { value: 'TRUEFALSE', label: 'True / False' },
  { value: 'TEXT', label: 'Short Answer' },
]

const TYPE_LABELS = Object.fromEntries(POOL_QUESTION_TYPES.map((type) => [type.value, type.label]))

const blankQuestion = (questionType = 'MCQ') => ({
  text: '',
  question_type: questionType,
  options: questionType === 'MCQ' ? ['', '', '', ''] : questionType === 'TRUEFALSE' ? ['True', 'False'] : [],
  correct_answer: questionType === 'TRUEFALSE' ? 'True' : '',
})

const normalizeQuestionType = (questionType) => {
  if (questionType === 'TRUE_FALSE') return 'TRUEFALSE'
  if (questionType === 'SHORT_ANSWER') return 'TEXT'
  return questionType || 'MCQ'
}

const normalizePoolQuestion = (question) => {
  const questionType = normalizeQuestionType(question?.question_type || question?.type)
  return {
    text: question?.text || '',
    question_type: questionType,
    options: questionType === 'MCQ'
      ? (question?.options && question.options.length ? question.options : ['', '', '', ''])
      : questionType === 'TRUEFALSE'
        ? ['True', 'False']
        : [],
    correct_answer: question?.correct_answer || (questionType === 'TRUEFALSE' ? 'True' : ''),
  }
}

function resolveError(err, fallback) {
  return err?.response?.data?.detail || fallback
}

export default function QuestionPoolDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const currentUserId = String(user?.id || '')
  const [pool, setPool] = useState(null)
  const [poolForm, setPoolForm] = useState({ name: '', description: '' })
  const [editingPool, setEditingPool] = useState(false)
  const [questions, setQuestions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blankQuestion())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingPool, setSavingPool] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [poolResult, questionsResult] = await Promise.allSettled([
        adminApi.getQuestionPool(id),
        adminApi.getPoolQuestions(id),
      ])

      if (poolResult.status === 'fulfilled') {
        setPool(poolResult.value.data)
        setPoolForm({
          name: poolResult.value.data?.name || '',
          description: poolResult.value.data?.description || '',
        })
      } else {
        setPool(null)
        throw poolResult.reason
      }

      if (questionsResult.status === 'fulfilled') {
        setQuestions(questionsResult.value.data || [])
      } else {
        setQuestions([])
        setError(resolveError(questionsResult.reason, 'Failed to load questions for this pool.'))
      }
    } catch (err) {
      setPool(null)
      setQuestions([])
      setError(resolveError(err, 'Failed to load question pool.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const canManagePool = isAdmin || String(pool?.created_by_id || '') === currentUserId

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const payload = {
        text: form.text,
        question_type: form.question_type,
        correct_answer: form.correct_answer || null,
        options: form.question_type === 'MCQ'
          ? (form.options || []).map((option) => option.trim()).filter(Boolean)
          : form.question_type === 'TRUEFALSE'
            ? ['True', 'False']
            : null,
      }
      if (editingId) {
        await adminApi.updatePoolQuestion(id, editingId, payload)
        setNotice('Question updated.')
      } else {
        await adminApi.createPoolQuestion(id, payload)
        setNotice('Question added.')
      }
      setShowForm(false)
      setEditingId(null)
      setForm(blankQuestion())
      await load()
    } catch (err) {
      setError(resolveError(err, 'Failed to save question'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (question) => {
    setForm(normalizePoolQuestion(question))
    setEditingId(question.id)
    setShowForm(true)
    setError('')
    setNotice('')
  }

  const handleDelete = async (questionId) => {
    if (deleteConfirmId !== questionId) {
      setDeleteConfirmId(questionId)
      return
    }
    setDeleteBusyId(questionId)
    setDeleteConfirmId(null)
    setError('')
    setNotice('')
    try {
      await adminApi.deletePoolQuestion(id, questionId)
      setNotice('Question deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err, 'Failed to delete question'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  const savePool = async () => {
    if (!poolForm.name.trim()) return
    setSavingPool(true)
    setError('')
    setNotice('')
    try {
      await adminApi.updateQuestionPool(id, {
        name: poolForm.name.trim(),
        description: poolForm.description.trim(),
      })
      setEditingPool(false)
      setNotice('Pool details saved.')
      await load()
    } catch (err) {
      setError(resolveError(err, 'Failed to save pool details'))
    } finally {
      setSavingPool(false)
    }
  }

  const setOption = (index, value) => setForm((current) => {
    const options = [...(current.options || [])]
    options[index] = value
    return { ...current, options }
  })

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Question Pool" subtitle={pool?.name || ''}>
        <div className={styles.qActions}>
          {canManagePool && (
            <>
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setEditingPool((current) => !current)
                  setPoolForm({ name: pool?.name || '', description: pool?.description || '' })
                }}
                disabled={!pool}
              >
                {editingPool ? 'Cancel Pool Edit' : 'Edit Pool'}
              </button>
              <button className={styles.btnPrimary} onClick={() => { setShowForm(true); setEditingId(null); setForm(blankQuestion()) }} disabled={!pool}>
                + Add Question
              </button>
            </>
          )}
        </div>
      </AdminPageHeader>

      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorMsg}>{error}</div>
          <button className={styles.btnSecondary} onClick={() => void load()}>Retry</button>
        </div>
      )}
      {notice && <div className={styles.noticeMsg}>{notice}</div>}
      {loading && <div className={styles.empty}>Loading question pool...</div>}
      {!loading && !pool && <div className={styles.empty}>Question pool not available.</div>}
      {!loading && !canManagePool && pool && <div className={styles.meta}>Read-only pool. Only the owner or an admin can edit this question bank.</div>}

      {!loading && editingPool && pool && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Pool Details</div>
          <label className={styles.label} htmlFor="pool-detail-name">Name</label>
          <input
            id="pool-detail-name"
            className={styles.input}
            value={poolForm.name}
            onChange={(event) => setPoolForm((current) => ({ ...current, name: event.target.value }))}
          />
          <label className={styles.label} htmlFor="pool-detail-description">Description</label>
          <textarea
            id="pool-detail-description"
            className={styles.textarea}
            rows={3}
            value={poolForm.description}
            onChange={(event) => setPoolForm((current) => ({ ...current, description: event.target.value }))}
          />
          <div className={styles.formActions}>
            <button className={styles.btnPrimary} type="button" onClick={savePool} disabled={savingPool || !poolForm.name.trim()}>
              {savingPool ? 'Saving...' : 'Save Pool'}
            </button>
            <button className={styles.btnSecondary} type="button" onClick={() => setEditingPool(false)} disabled={savingPool}>Cancel</button>
          </div>
        </div>
      )}

      {!loading && showForm && pool && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>{editingId ? 'Edit Question' : 'New Question'}</div>
          <form onSubmit={handleSubmit}>
            <label className={styles.label} htmlFor="pool-question-text">Question Text</label>
            <textarea id="pool-question-text" className={styles.textarea} rows={3} value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} required />

            <label className={styles.label} htmlFor="pool-question-type">Type</label>
            <select
              id="pool-question-type"
              className={styles.select}
              value={form.question_type}
              onChange={(event) => setForm((current) => ({
                ...blankQuestion(event.target.value),
                text: current.text,
              }))}
            >
              {POOL_QUESTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            {form.question_type === 'MCQ' && (
              <>
                <label className={styles.label} htmlFor="pool-question-option-0">Options</label>
                {(form.options || []).map((option, index) => (
                  <input key={index} id={`pool-question-option-${index}`} className={styles.input} placeholder={`Option ${index + 1}`} value={option} onChange={(event) => setOption(index, event.target.value)} />
                ))}
                <label className={styles.label} htmlFor="pool-question-correct-answer">Correct Answer</label>
                <input id="pool-question-correct-answer" className={styles.input} value={form.correct_answer} onChange={(event) => setForm((current) => ({ ...current, correct_answer: event.target.value }))} placeholder="Must match one option exactly" />
              </>
            )}

            {form.question_type === 'TRUEFALSE' && (
              <>
                <label className={styles.label} htmlFor="pool-question-boolean-answer">Correct Answer</label>
                <select id="pool-question-boolean-answer" className={styles.select} value={form.correct_answer} onChange={(event) => setForm((current) => ({ ...current, correct_answer: event.target.value }))}>
                  <option value="">Select...</option>
                  <option value="True">True</option>
                  <option value="False">False</option>
                </select>
              </>
            )}

            {form.question_type === 'TEXT' && (
              <>
                <label className={styles.label} htmlFor="pool-question-expected-answer">Expected Answer</label>
                <input id="pool-question-expected-answer" className={styles.input} value={form.correct_answer} onChange={(event) => setForm((current) => ({ ...current, correct_answer: event.target.value }))} />
              </>
            )}

            <div className={styles.formActions}>
              <button className={styles.btnPrimary} type="submit" disabled={saving}>{saving ? 'Saving...' : (editingId ? 'Update' : 'Add Question')}</button>
              <button className={styles.btnSecondary} type="button" onClick={() => { setShowForm(false); setEditingId(null) }} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {!loading && pool && (
        <div className={styles.card}>
          <div className={styles.meta}>
            <span><strong>Description:</strong> {pool?.description || '-'}</span>
            <span><strong>{questions.length}</strong> question(s)</span>
          </div>
          <div className={styles.list}>
            {questions.length === 0 && <div className={styles.empty}>No questions yet. Add one above.</div>}
            {questions.map((question, index) => (
              <div key={question.id} className={styles.qCard}>
                <div className={styles.qHeader}>
                  <span>Q{index + 1} <span className={styles.typeBadge}>{TYPE_LABELS[normalizeQuestionType(question.question_type)] || normalizeQuestionType(question.question_type)}</span></span>
                  {canManagePool && (
                    <div className={styles.qActions}>
                      <button className={styles.btnSecondary} onClick={() => startEdit(question)} disabled={deleteBusyId === question.id} aria-label={`Edit ${question.text || `question ${index + 1}`}`} title={`Edit ${question.text || `question ${index + 1}`}`}>Edit</button>
                      {deleteConfirmId === question.id ? (
                        <>
                          <button className={styles.dangerBtn} onClick={() => void handleDelete(question.id)} disabled={deleteBusyId === question.id} aria-label={`Confirm delete for ${question.text || `question ${index + 1}`}`}>
                            {deleteBusyId === question.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button className={styles.btnSecondary} onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === question.id} aria-label={`Keep ${question.text || `question ${index + 1}`}`}>Cancel</button>
                        </>
                      ) : (
                        <button className={styles.deleteBtn} onClick={() => void handleDelete(question.id)} disabled={deleteBusyId === question.id} aria-label={`Delete ${question.text || `question ${index + 1}`}`} title={`Delete ${question.text || `question ${index + 1}`}`}>Delete</button>
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.qText}>{question.text}</div>
                {question.correct_answer && <div className={styles.qAnswer}>Correct answer: {question.correct_answer}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
