import React, { useEffect, useState } from 'react'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import { createSurvey, deleteSurvey, listResponses, listSurveys, updateSurvey } from '../../../services/survey.service'
import useAuth from '../../../hooks/useAuth'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminSurveys.module.scss'

const useSurveyQuestionTypes = (t) => [
  { value: 'TEXT', label: t('survey_question_type_text') },
  { value: 'MCQ', label: t('survey_question_type_mcq') },
  { value: 'MULTI_SELECT', label: t('survey_question_type_multi_select') },
  { value: 'RATING', label: t('survey_question_type_rating') },
  { value: 'BOOLEAN', label: t('survey_question_type_boolean') },
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
    null
  )
}

export default function AdminSurveys() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const SURVEY_QUESTION_TYPES = useSurveyQuestionTypes(t)
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
      setError(resolveError(err) || t('admin_surveys_load_failed'))
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
      setError(t('admin_surveys_title_required'))
      return
    }
    if (!cleanedQuestions.length) {
      setError(t('admin_surveys_add_question'))
      return
    }
    const invalidChoice = cleanedQuestions.find((question) => CHOICE_TYPES.has(question.question_type) && (question.options?.length || 0) < 2)
    if (invalidChoice) {
      setError(t('admin_surveys_choice_min_options'))
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
        setNotice(t('admin_surveys_updated'))
      } else {
        await createSurvey(payload)
        setNotice(t('admin_surveys_created'))
      }
      resetForm()
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_surveys_save_failed'))
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
      setError(resolveError(err) || t('admin_surveys_responses_load_failed'))
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
      setNotice(survey.is_active ? t('admin_surveys_deactivated') : t('admin_surveys_activated'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_surveys_status_update_failed'))
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
      setNotice(t('admin_surveys_deleted'))
      await load()
    } catch (err) {
      setError(resolveError(err) || t('admin_surveys_delete_failed'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  const exportResponsesCSV = () => {
    const survey = surveys.find((s) => s.id === selectedSurvey)
    if (!responses.length) return
    const questionKeys = Object.keys(responses[0]?.answers || {})
    const rows = [
      ['#', t('admin_surveys_date'), ...questionKeys],
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
      <AdminPageHeader title={t('admin_surveys_title')} subtitle={t('admin_surveys_subtitle')} />
      {error && (
        <div className={styles.helperRow}>
          <div className={styles.errorBanner}>{error}</div>
          <button className={styles.btnSecondary} type="button" onClick={() => void load()}>{t('retry')}</button>
        </div>
      )}
      {notice && <div className={styles.noticeBanner}>{notice}</div>}
      <div className={styles.grid}>
        <form className={styles.card} onSubmit={save}>
          <div className={styles.sectionTitle}>{editingId ? t('admin_surveys_edit_survey') : t('admin_surveys_new_survey')}</div>
          <label className={styles.label} htmlFor="survey-title">{t('admin_surveys_field_title')}</label>
          <input id="survey-title" className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} required />
          <label className={styles.label} htmlFor="survey-description">{t('admin_surveys_field_description')}</label>
          <textarea id="survey-description" className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          <label className={`${styles.label} ${styles.checkboxLabel}`}>
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            {t('admin_surveys_active_label')}
          </label>
          <div className={styles.sectionTitle}>{t('admin_surveys_questions')}</div>
          {questions.map((question, index) => (
            <div key={index} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <input
                  className={styles.input}
                  value={question.text}
                  onChange={(event) => updateQuestion(index, { text: event.target.value })}
                  placeholder={`${t('admin_surveys_question_label')} ${index + 1}`}
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
                  <button type="button" className={styles.deleteBtn} onClick={() => removeQuestion(index)}>{t('remove')}</button>
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
                        placeholder={`${t('admin_surveys_option_label')} ${optionIdx + 1}`}
                      />
                      {(question.options || []).length > 2 && (
                        <button type="button" className={styles.deleteBtn} onClick={() => removeOption(index, optionIdx)}>{t('remove')}</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className={styles.btnSecondary} onClick={() => addOption(index)}>{t('admin_surveys_add_option')}</button>
                </div>
              )}

              {question.question_type === 'RATING' && (
                <div className={styles.rowSub}>{t('admin_surveys_rating_hint')}</div>
              )}

              {question.question_type === 'BOOLEAN' && (
                <div className={styles.rowSub}>{t('admin_surveys_boolean_hint')}</div>
              )}
            </div>
          ))}
          <div className={styles.qActions}>
            <button type="button" className={styles.btnSecondary} onClick={addQuestion}>{t('admin_surveys_add_question_btn')}</button>
            {editingId && <button type="button" className={styles.btnSecondary} onClick={resetForm}>{t('admin_surveys_cancel_edit')}</button>}
            <button className={styles.btnPrimary} type="submit" disabled={saving}>{saving ? t('saving') : t('admin_surveys_save_survey')}</button>
          </div>
        </form>

        <div className={styles.card}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>{t('admin_surveys_all_surveys')} <span className={styles.countChip}>{filteredSurveys.length}</span></div>
            <div className={styles.listControls}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder={t('admin_surveys_search_placeholder')}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
              <button type="button" className={styles.sortBtn}
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              >
                {sortDir === 'desc' ? t('admin_surveys_newest_first') : t('admin_surveys_oldest_first')}
              </button>
            </div>
          </div>
          {loading && <div className={styles.loadingText}>{t('loading')}</div>}
          {paginatedSurveys.map((survey) => (
            <div key={survey.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>
                  {survey.title}
                  {survey.is_active
                    ? <span className={styles.activeBadge}>{t('admin_surveys_active')}</span>
                    : <span className={styles.inactiveBadge}>{t('admin_surveys_inactive')}</span>}
                </div>
                <div className={styles.rowSub}>
                  {(survey.questions || []).length} {t('admin_surveys_questions_count')}
                  {survey.response_count != null && (
                    <span className={styles.responseChip}>{survey.response_count} {t('admin_surveys_response_count')}</span>
                  )}
                </div>
                {survey.description && <div className={styles.rowSub}>{survey.description}</div>}
                {!canManageSurvey(survey) && <div className={styles.rowSub}>{t('admin_surveys_read_only')}</div>}
              </div>
              <div className={styles.rowActions}>
                {canManageSurvey(survey) && (
                  <>
                    <button className={styles.btnSecondary} type="button" onClick={() => startEdit(survey)} aria-label={`${t('edit')} ${survey.title || ''}`} title={`${t('edit')} ${survey.title || ''}`}>{t('edit')}</button>
                    <button className={styles.btnSecondary} type="button" onClick={() => void toggleActive(survey)} disabled={statusBusyId === survey.id} aria-label={`${survey.is_active ? t('admin_surveys_deactivate') : t('admin_surveys_activate')} ${survey.title || ''}`}>
                      {statusBusyId === survey.id ? t('saving') : survey.is_active ? t('admin_surveys_deactivate') : t('admin_surveys_activate')}
                    </button>
                    <button className={styles.btnSecondary} type="button" onClick={() => void openResponses(survey.id)} disabled={responsesLoading && selectedSurvey === survey.id} aria-label={`${t('admin_surveys_responses')} ${survey.title || ''}`}>
                      {responsesLoading && selectedSurvey === survey.id ? t('admin_surveys_loading') : t('admin_surveys_responses')}
                    </button>
                  </>
                )}
                {isAdmin && (deleteConfirmId === survey.id ? (
                  <>
                    <button className={styles.dangerBtn} type="button" onClick={() => void handleDelete(survey.id)} disabled={deleteBusyId === survey.id} aria-label={`${t('confirm')} ${t('delete').toLowerCase()} ${survey.title || ''}`}>
                      {deleteBusyId === survey.id ? t('admin_surveys_deleting') : t('confirm')}
                    </button>
                    <button className={styles.btnSecondary} type="button" onClick={() => setDeleteConfirmId(null)} disabled={deleteBusyId === survey.id} aria-label={`${t('cancel')} ${survey.title || ''}`}>{t('cancel')}</button>
                  </>
                ) : (
                  <button className={styles.deleteBtn} type="button" onClick={() => void handleDelete(survey.id)} disabled={deleteBusyId === survey.id} aria-label={`${t('delete')} ${survey.title || ''}`} title={`${t('delete')} ${survey.title || ''}`}>{t('delete')}</button>
                ))}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>{filteredSurveys.length} {t('admin_surveys_surveys_label')} · {t('admin_surveys_page')} {page} {t('admin_surveys_of')} {totalPages}</span>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t('admin_surveys_prev')}</button>
              <button type="button" className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t('admin_surveys_next')}</button>
            </div>
          )}

          {selectedSurvey && (
            <div className={styles.responses}>
              <div className={styles.responsesHeader}>
                <div className={styles.sectionTitle}>{t('admin_surveys_responses')} ({responses.length})</div>
                {responses.length > 0 && (
                  <button type="button" className={styles.exportBtn} onClick={exportResponsesCSV}>{t('admin_surveys_export_csv')}</button>
                )}
              </div>
              {responsesLoading && <div className={styles.loadingText}>{t('admin_surveys_loading_responses')}</div>}
              {!responsesLoading && responses.length === 0 && <div className={styles.rowSub}>{t('admin_surveys_no_responses')}</div>}
              {!responsesLoading && responses.map((response, index) => {
                const answers = response.answers || {}
                return (
                  <div key={index} className={styles.responseCard}>
                    <div className={styles.responseHeader}>
                      {t('admin_surveys_response_number')} #{index + 1}
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
