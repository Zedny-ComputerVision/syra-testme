import React, { memo } from 'react'
import styles from '../AdminManageTestPage.module.scss'

function QuestionsTab({
  questions,
  questionSearch,
  setQuestionSearch,
  questionForm,
  lockedExamFields,
  handleQuestionTypeChange,
  setQuestionForm,
  questionTypes,
  questionBusy,
  editingQuestionId,
  resetQuestionForm,
  handleQuestionSubmit,
  filteredQuestions,
  questionTypeOf,
  deletingQuestionBusyId,
  deleteQuestionId,
  setDeleteQuestionId,
  startEditQuestion,
  handleDeleteQuestion,
}) {
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>Test Sections - Questions <span className={styles.countPill}>{questions.length}</span></h3>
      <div className={styles.row}>
        <label>Search questions<input placeholder="Search text or type" value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} /></label>
        <label>Total questions<input readOnly value={String(questions.length)} /></label>
      </div>
      <form className={styles.sectionCard} onSubmit={handleQuestionSubmit}>
        <div className={styles.sectionHeader}>{editingQuestionId ? 'Edit question' : 'Add question'}</div>
        <div className={styles.row}>
          <label>Type
            <select value={questionForm.question_type} disabled={lockedExamFields} onChange={(e) => handleQuestionTypeChange(e.target.value)}>
              {questionTypes.map((qt) => <option key={qt} value={qt}>{qt}</option>)}
            </select>
          </label>
        </div>
        <label>Question text<textarea rows={3} value={questionForm.text} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, text: e.target.value }))} /></label>
        {questionForm.question_type === 'ORDERING' && (
          <div className={styles.typeHint}>Enter items in order, one per line. The correct order is top-to-bottom. Leave <em>correct_answer</em> blank (auto-derived).</div>
        )}
        {questionForm.question_type === 'FILLINBLANK' && (
          <div className={styles.typeHint}>Use <code>[blank]</code> in the question text as a placeholder. Enter each acceptable answer on its own line in the options field.</div>
        )}
        {questionForm.question_type === 'MATCHING' && (
          <div className={styles.typeHint}>Enter pairs as <code>Left | Right</code>, one pair per line. Set correct_answer to the matched pair indices.</div>
        )}
        {questionForm.question_type === 'TEXT' && (
          <div className={styles.typeHint}>Open-ended text question. No options required. Enter a model or expected answer in correct_answer for reference grading.</div>
        )}
        {['MCQ', 'MULTI', 'TRUEFALSE', 'ORDERING', 'FILLINBLANK', 'MATCHING'].includes(questionForm.question_type) && (
          <label>
            {questionForm.question_type === 'MATCHING' ? 'Pairs (Left | Right, one per line)' : questionForm.question_type === 'FILLINBLANK' ? 'Acceptable answers (one per line)' : 'Options (one per line)'}
            <textarea rows={4} value={questionForm.options_text} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, options_text: e.target.value }))} />
          </label>
        )}
        <label>
          {questionForm.question_type === 'ORDERING' ? 'Correct order (comma-separated indices, e.g. 1,3,2)' : questionForm.question_type === 'MATCHING' ? 'Correct matching (e.g. A-1,B-2)' : 'Correct answer'}
          <input value={questionForm.correct_answer} disabled={lockedExamFields || questionForm.question_type === 'ORDERING'} onChange={(e) => setQuestionForm((p) => ({ ...p, correct_answer: e.target.value }))} />
        </label>
        <div className={styles.row}>
          <label>Points<input type="number" step="0.5" min="0.5" value={questionForm.points} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, points: e.target.value }))} /></label>
          <label>Order<input type="number" min="0" value={questionForm.order} disabled={lockedExamFields} onChange={(e) => setQuestionForm((p) => ({ ...p, order: e.target.value }))} /></label>
        </div>
        <div className={styles.inlineActions}>
          <button type="submit" className={styles.blueBtn} disabled={questionBusy || lockedExamFields}>{questionBusy ? 'Saving...' : editingQuestionId ? 'Update question' : 'Add question'}</button>
          <button type="button" className={styles.ghostBtn} onClick={resetQuestionForm}>Reset</button>
        </div>
      </form>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Order</th><th>Type</th><th>Question</th><th>Points</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredQuestions.length === 0 ? (
              <tr><td colSpan={5}>No questions found.</td></tr>
            ) : filteredQuestions.map((q) => (
              <tr key={q.id}>
                <td>{q.order ?? 0}</td>
                <td>{questionTypeOf(q)}</td>
                <td>{q.text}</td>
                <td>{q.points ?? 1}</td>
                <td className={styles.actionsCell}>
                  <button type="button" disabled={lockedExamFields || deletingQuestionBusyId === q.id} onClick={() => startEditQuestion(q)}>Edit</button>
                  {deleteQuestionId === q.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.dangerInlineBtn}
                        disabled={lockedExamFields || deletingQuestionBusyId === q.id}
                        onClick={() => handleDeleteQuestion(q.id)}
                      >
                        {deletingQuestionBusyId === q.id ? 'Deleting...' : 'Confirm delete'}
                      </button>
                      <button type="button" disabled={deletingQuestionBusyId === q.id} onClick={() => setDeleteQuestionId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" disabled={lockedExamFields || deletingQuestionBusyId === q.id} onClick={() => handleDeleteQuestion(q.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(QuestionsTab)
