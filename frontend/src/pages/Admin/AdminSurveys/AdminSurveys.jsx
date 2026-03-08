import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { createSurvey, deleteSurvey, listResponses, listSurveys, updateSurvey } from '../../../services/survey.service'
import useAuth from '../../../hooks/useAuth'
import styles from './AdminSurveys.module.scss'

const SURVEY_QUESTION_TYPES = [
  { value: 'TEXT', label: 'Text Response' },
  { value: 'MCQ', label: 'Single Choice' },
  { value: 'MULTI_SELECT', label: 'Multiple Choice' },
  { value: 'RATING', label: 'Rating (1-5)' },
  { value: 'BOOLEAN', label: 'Yes / No' },
]

const CHOICE_TYPES = new Set(['MCQ', 'MULTI_SELECT'])

const blankQuestion = (questionType = 'TEXT') => ({
  text: '',
  question_type: questionType,
  options: CHOICE_TYPES.has(questionType) ? ['', ''] : [],
})

const normalizeQuestion = (question = {}) => {
  const questionType = question.question_type || 'TEXT'
  return {
    text: question.text || '',
    question_type: questionType,
    options: CHOICE_TYPES.has(questionType)
      ? (Array.isArray(question.options) && question.options.length > 0 ? question.options : ['', ''])
      : [],
  }
}

function resolveError(err) {
  return (
    err.response?.data?.detail ||
    err.response?.data?.error?.message ||
    err.response?.data?.error?.detail ||
    err.message ||
    'Action failed.'
  )
}

export default function AdminSurveys() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const currentUserId = String(user?.id || '')
  const [surveys, setSurveys] = useState([])
  const [editingId, setEditingId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState([blankQuestion()])
  const [isActive, setIsActive] = useState(true)
  const [responses, setResponses] = useState([])
  const [selectedSurvey, setSelectedSurvey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [responsesLoading, setResponsesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusBusyId, setStatusBusyId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await listSurveys()
      setSurveys(data || [])
      setError('')
    } catch (err) {
      setError(resolveError(err) || 'Failed to load surveys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const canManageSurvey = (survey) => isAdmin || String(survey?.created_by_id || '') === currentUserId

  const addQuestion = () => setQuestions((current) => [...current, blankQuestion()])
  const removeQuestion = (idx) => setQuestions((current) => current.filter((_, index) => index !== idx))
  const updateQuestion = (idx, patch) => setQuestions((current) => current.map((question, index) => (index === idx ? { ...question, ...patch } : question)))
  const addOption = (idx) => setQuestions((current) => current.map((question, index) => (
    index === idx ? { ...question, options: [...(question.options || []), ''] } : question
  )))
  const updateOption = (idx, optionIdx, value) => setQuestions((current) => current.map((question, index) => (
    index === idx
      ? {
          ...question,
          options: (question.options || []).map((option, currentIdx) => (currentIdx === optionIdx ? value : option)),
        }
      : question
  )))
  const removeOption = (idx, optionIdx) => setQuestions((current) => current.map((question, index) => (
    index === idx
      ? { ...question, options: (question.options || []).filter((_, currentIdx) => currentIdx !== optionIdx) }
      : question
  )))

  const resetForm = () => {
    setEditingId('')
    setTitle('')
    setDescription('')
    setQuestions([blankQuestion()])
    setIsActive(true)
  }

  const startEdit = (survey) => {
    setEditingId(survey.id)
    setTitle(survey.title || '')
    setDescription(survey.description || '')
    const nextQuestions = Array.isArray(survey.questions) && survey.questions.length > 0 ? survey.questions : [blankQuestion()]
    setQuestions(nextQuestions.map((question) => normalizeQuestion(question)))
    setIsActive(survey.is_active !== false)
    setError('')
    setNotice('')
  }

  const save = async (event) => {
    event.preventDefault()
    const cleanedQuestions = questions
      .map((question) => ({
        text: String(question.text || '').trim(),
        question_type: question.question_type || 'TEXT',
        options: CHOICE_TYPES.has(question.question_type)
          ? (question.options || []).map((option) => option.trim()).filter(Boolean)
          : undefined,
      }))
      .filter((question) => question.text)

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!cleanedQuestions.length) {
      setError('Add at least one question')
      return
    }
    const invalidChoice = cleanedQuestions.find((question) => CHOICE_TYPES.has(question.question_type) && (question.options?.length || 0) < 2)
    if (invalidChoice) {
      setError('Single and multiple choice questions need at least two options.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        questions: cleanedQuestions,
        is_active: isActive,
      }
      if (editingId) {
        await updateSurvey(editingId, payload)
        setNotice('Survey updated.')
      } else {
        await createSurvey(payload)
        setNotice('Survey created.')
      }
      resetForm()
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to save survey')
    } finally {
      setSaving(false)
    }
  }

  const openResponses = async (id) => {
    setSelectedSurvey(id)
    setResponsesLoading(true)
    setError('')
    try {
      const { data } = await listResponses(id)
      setResponses(data || [])
    } catch (err) {
      setResponses([])
      setError(resolveError(err) || 'Failed to load responses')
    } finally {
      setResponsesLoading(false)
    }
  }

  const toggleActive = async (survey) => {
    setStatusBusyId(survey.id)
    setError('')
    setNotice('')
    try {
      await updateSurvey(survey.id, { is_active: !(survey.is_active !== false) })
      setNotice(survey.is_active ? 'Survey deactivated.' : 'Survey activated.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Failed to update survey status')
    } finally {
      setStatusBusyId(null)
    }
  }

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    setDeleteBusyId(id)
    setDeleteConfirmId(null)
    setError('')
    setNotice('')
    try {
      await deleteSurvey(id)
      if (selectedSurvey === id) {
        setSelectedSurvey(null)
        setResponses([])
      }
      setNotice('Survey deleted.')
      await load()
    } catch (err) {
      setError(resolveError(err) || 'Delete failed')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const exportResponsesCSV = () => {
    const survey = surveys.find((s) => s.id === selectedSurvey)
    if (!responses.length) return
    const questionKeys = Object.keys(responses[0]?.answers || {})
    const rows = [
      ['#', 'Date', ...questionKeys],
      ...responses.map((r, i) => [
        i + 1,
        r.created_at ? new Date(r.created_at).toLocaleString() : '',
        ...questionKeys.map((q) => {
          const a = r.answers?.[q]
          return Array.isArray(a) ? a.join('; ') : String(a ?? '')
        }),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `survey-responses-${survey?.title || selectedSurvey}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const filteredSurveys = surveys
    .filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0
      const db = b.created_at ? new Date(b.created_at).getTime() : 0
      return sortDir === 'desc' ? db - da : da - db
    })
  const totalPages = Math.ceil(filteredSurveys.length / PAGE_SIZE)
  const paginatedSurveys = filteredSurveys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Surveys" subtitle="Create and review surveys" />
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button className={styles.btnSecondary} type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={save}>
          <div className={styles.sectionTitle}>{editingId ? 'Edit Survey' : 'New Survey'}</div>
          <label className={styles.label}>Title</label>
          <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} required />
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          <label className={`${styles.label} ${styles.checkboxLabel}`}>
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            Active (visible to learners)
          </label>
          <div className={styles.sectionTitle}>Questions</div>
          {questions.map((question, index) => (
            <div key={index} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <input
                  className={styles.input}
                  value={question.text}
                  onChange={(event) => updateQuestion(index, { text: event.target.value })}
                  placeholder={`Question ${index + 1}`}
                />
                <select
                  className={`${styles.input} ${styles.typeSelect}`}
                  value={question.question_type}
                  onChange={(event) => updateQuestion(index, normalizeQuestion({ text: question.text, question_type: event.target.value }))}
                >
                  {SURVEY_QUESTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                {questions.length > 1 && (
                  <button type="button" className={styles.deleteBtn} onClick={() => removeQuestion(index)}>Remove</button>
                )}
              </div>

              {CHOICE_TYPES.has(question.question_type) && (
                <div className={styles.choiceGrid}>
                  {(question.options || []).map((option, optionIdx) => (
                    <div key={optionIdx} className={styles.optionRow}>
                      <input
                        className={styles.input}
                        value={option}
                        onChange={(event) => updateOption(index, optionIdx, event.target.value)}
                        placeholder={`Option ${optionIdx + 1}`}
                      />
                      {(question.options || []).length > 2 && (
                        <button type="button" className={styles.deleteBtn} onClick={() => removeOption(index, optionIdx)}>Remove</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className={styles.btnSecondary} onClick={() => addOption(index)}>+ Option</button>
                </div>
              )}

              {question.question_type === 'RATING' && (
                <div className={styles.rowSub}>Learners will see a 1 to 5 rating scale.</div>
              )}

              {question.question_type === 'BOOLEAN' && (
                <div className={styles.rowSub}>Learners will answer Yes or No.</div>
              )}
            </div>
          ))}
          <div className={styles.qActions}>
            <button type="button" className={styles.btnSecondary} onClick={addQuestion}>+ Question</button>
            {editingId && <button type="button" className={styles.btnSecondary} onClick={resetForm}>Cancel Edit</button>}
            <button className={styles.btnPrimary} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Survey'}</button>
          </div>
        </form>

        <div className={styles.card}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>All Surveys <span className={styles.countChip}>{filteredSurveys.length}</span></div>
            <div className={styles.listControls}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search surveys..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
              <button type="button" className={styles.sortBtn}
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              >
                {sortDir === 'desc' ? 'Newest first ↓' : 'Oldest first ↑'}
              </button>
            </div>
          </div>
          {loading && <div className={styles.loadingText}>Loading...</div>}
          {paginatedSurveys.map((survey) => (
            <div key={survey.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>
                  {survey.title}
                  {survey.is_active
                    ? <span className={styles.activeBadge}>Active</span>
                    : <span className={styles.inactiveBadge}>Inactive</span>}
                </div>
                <div className={styles.rowSub}>
                  {(survey.questions || []).length} question(s)
                  {survey.response_count != null && (
                    <span className={styles.responseChip}>{survey.response_count} response{survey.response_count !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {survey.description && <div className={styles.rowSub}>{survey.description}</div>}
                {!canManageSurvey(survey) && <div className={styles.rowSub}>Read-only — only the owner or an admin can edit.</div>}
              </div>
              <div className={styles.rowActions}>
                {canManageSurvey(survey) && (
                  <>
                    <button className={styles.btnSecondary} type="button" onClick={() => startEdit(survey)}>Edit</button>
                    <button className={styles.btnSecondary} type="button" onClick={() => void toggleActive(survey)} disabled={statusBusyId === survey.id}>
                      {statusBusyId === survey.id ? 'Saving...' : survey.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className={styles.btnSecondary} type="button" onClick={() => void openResponses(survey.id)} disabled={responsesLoading && selectedSurvey === survey.id}>
                      {responsesLoading && selectedSurvey === survey.id ? 'Loading...' : 'Responses'}
                    </button>
                  </>
                )}
                {isAdmin && (deleteConfirmId === survey.id ? (
                  <>
                    <button className={styles.dangerBtn} type="button" onClick={() => void handleDelete(survey.id)} disabled={deleteBusyId === survey.id}>
                      {deleteBusyId === survey.id ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button className={styles.btnSecondary} type="button" onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === survey.id}>Cancel</button>
                  </>
                ) : (
                  <button className={styles.deleteBtn} type="button" onClick={() => void handleDelete(survey.id)} disabled={deleteBusyId === survey.id}>Delete</button>
                ))}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>{filteredSurveys.length} surveys · Page {page} of {totalPages}</span>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}

          {selectedSurvey && (
            <div className={styles.responses}>
              <div className={styles.responsesHeader}>
                <div className={styles.sectionTitle}>Responses ({responses.length})</div>
                {responses.length > 0 && (
                  <button type="button" className={styles.exportBtn} onClick={exportResponsesCSV}>Export CSV</button>
                )}
              </div>
              {responsesLoading && <div className={styles.loadingText}>Loading responses...</div>}
              {!responsesLoading && responses.length === 0 && <div className={styles.rowSub}>No responses yet.</div>}
              {!responsesLoading && responses.map((response, index) => {
                const answers = response.answers || {}
                return (
                  <div key={index} className={styles.responseCard}>
                    <div className={styles.responseHeader}>
                      Response #{index + 1}
                      {response.created_at && <span className={styles.responseTime}>{new Date(response.created_at).toLocaleString()}</span>}
                    </div>
                    {Object.entries(answers).map(([question, answer]) => (
                      <div key={question} className={styles.responseRow}>
                        <div className={styles.responseQ}>{question}</div>
                        <div className={styles.responseA}>{Array.isArray(answer) ? answer.join(', ') : String(answer)}</div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
