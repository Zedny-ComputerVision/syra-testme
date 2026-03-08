import React, { useMemo, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import styles from './ExamQuestionPanel.module.scss'

const EMPTY_MCQ = { text: '', question_type: 'MCQ', options: ['', '', '', ''], correct_answer: 'A', points: 1 }
const EMPTY_TEXT = { text: '', question_type: 'TEXT', correct_answer: '', points: 1 }

const MCQ_TYPES = new Set(['MCQ', 'MULTI'])
const DEFAULT_TYPES = [
  { value: 'MCQ', label: 'Multiple Choice' },
  { value: 'TEXT', label: 'Text / Essay' },
]

function createEmptyQuestion(type) {
  if (type === 'TRUEFALSE') {
    return { text: '', question_type: type, options: ['True', 'False'], correct_answer: 'A', points: 1 }
  }
  if (MCQ_TYPES.has(type)) {
    return { text: '', question_type: type, options: ['', '', '', ''], correct_answer: 'A', points: 1 }
  }
  return { text: '', question_type: type, correct_answer: '', points: 1 }
}

function normalizeOptions(questionType, options) {
  if (questionType === 'TRUEFALSE') return ['True', 'False']
  if (!MCQ_TYPES.has(questionType)) return null
  return (options || []).map((entry) => entry.trim()).filter(Boolean)
}

function labelForType(types, value) {
  return types.find((type) => type.value === value)?.label || value
}

export default function ExamQuestionPanel({ examId, questions = [], onUpdate, questionTypes }) {
  const types = questionTypes || DEFAULT_TYPES
  const defaultType = types[0]?.value || 'MCQ'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...createEmptyQuestion(defaultType) })
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const totalPoints = useMemo(
    () => questions.reduce((sum, question) => sum + Number(question.points || 0), 0),
    [questions],
  )

  const activeTypeLabel = labelForType(types, form.question_type)
  const currentOptions = form.options || []
  const trimmedOptions = normalizeOptions(form.question_type, currentOptions)

  const validationMessage = (() => {
    if (!form.text.trim()) return 'Question text is required.'
    if (!Number(form.points) || Number(form.points) <= 0) return 'Points must be greater than zero.'
    if (MCQ_TYPES.has(form.question_type) && (!trimmedOptions || trimmedOptions.length < 2)) {
      return 'Add at least two answer options.'
    }
    if ((MCQ_TYPES.has(form.question_type) || form.question_type === 'TRUEFALSE') && !form.correct_answer) {
      return 'Choose a valid correct answer.'
    }
    return ''
  })()

  const canMutate = Boolean(examId) && !saving && !refreshing

  const resetDraft = (type = defaultType) => {
    setForm(createEmptyQuestion(type))
    setEditId(null)
    setError('')
    setNotice('')
  }

  const closeEditor = () => {
    setShowForm(false)
    resetDraft(defaultType)
  }

  const refreshQuestions = async (successMessage) => {
    if (!examId) return
    setRefreshing(true)
    try {
      const { data } = await adminApi.getQuestions(examId)
      onUpdate?.(data || [])
      if (successMessage) setNotice(successMessage)
    } catch (e) {
      setError(e.response?.data?.detail || 'Question saved, but the list could not be refreshed.')
    } finally {
      setRefreshing(false)
    }
  }

  const openAdd = (type = defaultType) => {
    resetDraft(type)
    setShowForm(true)
  }

  const openEdit = (question) => {
    const nextType = question.question_type
    setForm({
      text: question.text,
      question_type: nextType,
      options: question.options || createEmptyQuestion(nextType).options || [],
      correct_answer: question.correct_answer || '',
      points: question.points || 1,
    })
    setEditId(question.id)
    setError('')
    setNotice('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!examId) {
      setError('Create the test first, then add questions.')
      return
    }
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    const questionType = form.question_type || 'MCQ'
    const normalizedOptions = normalizeOptions(questionType, form.options)
    const payload = {
      exam_id: examId,
      text: form.text.trim(),
      type: questionType,
      options: normalizedOptions,
      correct_answer: questionType === 'TRUEFALSE'
        ? (form.correct_answer || 'A')
        : form.correct_answer?.trim() || null,
      points: Number(form.points),
      order: editId
        ? (questions.find((question) => question.id === editId)?.order || 0)
        : (questions?.length || 0) + 1,
    }

    try {
      if (editId) {
        await adminApi.updateQuestion(editId, payload)
        await refreshQuestions('Question updated.')
      } else {
        await adminApi.addQuestion(payload)
        await refreshQuestions('Question added.')
      }
      setShowForm(false)
      resetDraft(defaultType)
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not save question.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }

    setDeletingId(id)
    setError('')
    setNotice('')

    try {
      await adminApi.deleteQuestion(id)
      setDeleteConfirmId(null)
      await refreshQuestions('Question deleted.')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to delete question.')
    } finally {
      setDeletingId(null)
    }
  }

  const updateOption = (index, value) => {
    setForm((current) => ({
      ...current,
      options: (current.options || []).map((entry, optionIndex) => (optionIndex === index ? value : entry)),
    }))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryChip}>Questions: {questions.length}</span>
        <span className={styles.summaryChip}>Total points: {totalPoints}</span>
        <span className={styles.summaryChip}>{examId ? 'Ready to add questions' : 'Save the test first to unlock the editor'}</span>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {!showForm && (
        <div className={styles.quickAddSection}>
          <div className={styles.quickAddHeader}>
            <div>
              <div className={styles.sectionTitle}>Quick Add</div>
              <div className={styles.sectionSub}>Start a question draft with the exact type you need instead of always defaulting to MCQ.</div>
            </div>
            {refreshing && <span className={styles.loadingPill}>Refreshing list...</span>}
          </div>
          <div className={styles.quickAddGrid}>
            {types.map((type) => (
              <button
                key={type.value}
                type="button"
                className={styles.quickAddBtn}
                onClick={() => openAdd(type.value)}
                disabled={!examId || refreshing || deletingId != null}
              >
                Add {type.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {questions.length === 0 && !showForm && (
        <div className={styles.empty}>
          {examId ? 'No questions yet. Use the quick add buttons above to build the test.' : 'Save the test first, then return here to add questions.'}
        </div>
      )}

      {questions.map((question, index) => (
        <div key={question.id} className={styles.question}>
          <span className={styles.qNum}>{index + 1}</span>
          <div className={styles.qContent}>
            <div className={styles.qTopRow}>
              <div className={styles.qText}>{question.text}</div>
              <div className={styles.qChips}>
                <span className={styles.qChip}>{labelForType(types, question.question_type)}</span>
                <span className={styles.qChip}>{Number(question.points || 1)} pts</span>
              </div>
            </div>
            <div className={styles.qMeta}>
              Correct answer: {question.correct_answer || '-'}
              {question.options?.length ? ` | ${question.options.length} option(s)` : ''}
            </div>
            {question.options?.length ? (
              <div className={styles.optionList}>
                {question.options.map((option, optionIndex) => (
                  <span key={`${question.id}-option-${optionIndex}`} className={styles.optionChip}>
                    {String.fromCharCode(65 + optionIndex)}. {option}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.qActions}>
            <button type="button" className={styles.qBtn} onClick={() => openEdit(question)} disabled={saving || deletingId != null}>Edit</button>
            {deleteConfirmId === question.id ? (
              <>
                <button
                  type="button"
                  className={`${styles.qBtn} ${styles.qBtnDanger}`}
                  onClick={() => handleDelete(question.id)}
                  disabled={deletingId === question.id}
                >
                  {deletingId === question.id ? 'Deleting...' : 'Confirm delete'}
                </button>
                <button type="button" className={styles.qBtn} onClick={() => setDeleteConfirmId(null)} disabled={deletingId === question.id}>Cancel</button>
              </>
            ) : (
              <button type="button" className={`${styles.qBtn} ${styles.qBtnDanger}`} onClick={() => handleDelete(question.id)} disabled={saving || deletingId != null}>Delete</button>
            )}
          </div>
        </div>
      ))}

      {showForm && (
        <div className={styles.addForm}>
          <div className={styles.addFormHeader}>
            <div>
              <div className={styles.addFormTitle}>{editId ? 'Edit Question' : `Add ${activeTypeLabel}`}</div>
              <div className={styles.addFormSub}>Complete the content, answer logic, and points before saving this question to the test.</div>
            </div>
            <span className={styles.formStatus}>{editId ? 'Editing existing question' : 'New question draft'}</span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Type</label>
            <select
              className={styles.select}
              value={form.question_type}
              onChange={(e) => {
                const nextType = e.target.value
                setForm(createEmptyQuestion(nextType))
                setError('')
              }}
              disabled={saving}
            >
              {types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Question Text</label>
            <input
              className={styles.input}
              value={form.text}
              onChange={(e) => setForm((current) => ({ ...current, text: e.target.value }))}
              placeholder="Enter question..."
              disabled={saving}
            />
          </div>

          {MCQ_TYPES.has(form.question_type) && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.label}>Options</label>
                <div className={styles.optionsEditor}>
                  {currentOptions.map((option, index) => (
                    <div key={index} className={styles.optionRow}>
                      <span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span>
                      <input
                        className={styles.optionInput}
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        disabled={saving}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.helper}>Only filled options are saved. Add at least two answer options before saving.</div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Correct Answer</label>
                <select
                  className={styles.select}
                  value={form.correct_answer}
                  onChange={(e) => setForm((current) => ({ ...current, correct_answer: e.target.value }))}
                  disabled={saving}
                >
                  {currentOptions.map((_, index) => (
                    <option key={index} value={String.fromCharCode(65 + index)}>{String.fromCharCode(65 + index)}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {form.question_type === 'TRUEFALSE' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Correct Answer</label>
              <select
                className={styles.select}
                value={form.correct_answer}
                onChange={(e) => setForm((current) => ({ ...current, correct_answer: e.target.value }))}
                disabled={saving}
              >
                <option value="A">True</option>
                <option value="B">False</option>
              </select>
            </div>
          )}

          {!MCQ_TYPES.has(form.question_type) && form.question_type !== 'TRUEFALSE' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Expected Answer (optional)</label>
              <input
                className={styles.input}
                value={form.correct_answer}
                onChange={(e) => setForm((current) => ({ ...current, correct_answer: e.target.value }))}
                placeholder="Expected answer..."
                disabled={saving}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Points</label>
            <input
              className={styles.input}
              type="number"
              min="1"
              max="100"
              value={form.points}
              onChange={(e) => setForm((current) => ({ ...current, points: Number(e.target.value) }))}
              disabled={saving}
            />
          </div>

          {validationMessage && <div className={styles.validationHint}>{validationMessage}</div>}

          <div className={styles.formActions}>
            <button type="button" className={styles.btnCancel} onClick={closeEditor} disabled={saving}>Cancel</button>
            <button type="button" className={styles.btnSecondary} onClick={() => resetDraft(form.question_type)} disabled={saving}>Reset</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={!canMutate || Boolean(validationMessage)}>
              {saving ? (editId ? 'Updating...' : 'Adding...') : `${editId ? 'Update' : 'Add'} Question`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
