import React, { memo } from 'react'
import styles from '../AdminManageTestPage.module.scss'

function AdministrationTab({
  exam,
  attemptRows,
  isArchived,
  deletingExamBusy,
  handleSettingsSave,
  isPublished,
  handlePublish,
  handleClose,
  lockedExamFields,
  navigate,
  deleteExamConfirm,
  setDeleteExamConfirm,
  handleDeleteExam,
}) {
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>Test Administration</h3>
      <div className={styles.sectionCard}>
        <div className={styles.row}>
          <label>Current status<input value={exam.status || ''} readOnly /></label>
          <label>Total attempts<input value={String(attemptRows.length)} readOnly /></label>
        </div>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.blueBtn} disabled={isArchived || deletingExamBusy} onClick={handleSettingsSave}>Save settings</button>
          {!isPublished && !isArchived ? <button type="button" className={styles.greenBtn} disabled={deletingExamBusy} onClick={handlePublish}>Open / Publish</button> : null}
          <button type="button" className={styles.ghostBtn} disabled={deletingExamBusy} onClick={handleClose}>{isArchived ? 'Unarchive' : 'Archive'}</button>
          <button type="button" className={styles.ghostBtn} disabled={lockedExamFields || deletingExamBusy} onClick={() => navigate(`/admin/tests/${exam.id}/edit`)}>Open full editor</button>
          {deleteExamConfirm ? (
            <>
              <button type="button" className={styles.dangerBtn} disabled={deletingExamBusy} onClick={handleDeleteExam}>
                {deletingExamBusy ? 'Deleting...' : 'Confirm delete'}
              </button>
              <button type="button" className={styles.ghostBtn} disabled={deletingExamBusy} onClick={() => setDeleteExamConfirm(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className={styles.dangerBtn} disabled={deletingExamBusy} onClick={handleDeleteExam}>Delete test</button>
          )}
        </div>
      </div>
    </section>
  )
}

export default memo(AdministrationTab)
