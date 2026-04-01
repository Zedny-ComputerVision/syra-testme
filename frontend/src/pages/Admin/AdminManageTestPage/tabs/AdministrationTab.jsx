import React, { memo } from 'react'
import useLanguage from '../../../../hooks/useLanguage'
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
  const { t } = useLanguage()
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>{t('admin_tab_test_admin')}</h3>
      <div className={styles.sectionCard}>
        <div className={styles.row}>
          <label>{t('admin_tab_current_status')}<input value={exam.status || ''} readOnly /></label>
          <label>{t('admin_tab_total_attempts')}<input value={String(attemptRows.length)} readOnly /></label>
        </div>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.blueBtn} disabled={isArchived || deletingExamBusy} onClick={handleSettingsSave}>{t('admin_tab_save_settings')}</button>
          {!isPublished && !isArchived ? <button type="button" className={styles.greenBtn} disabled={deletingExamBusy} onClick={handlePublish}>{t('admin_tab_open_publish')}</button> : null}
          <button type="button" className={styles.ghostBtn} disabled={deletingExamBusy} onClick={handleClose}>{isArchived ? t('admin_tab_unarchive') : t('admin_tab_archive')}</button>
          <button type="button" className={styles.ghostBtn} disabled={lockedExamFields || deletingExamBusy} onClick={() => navigate(`/admin/tests/${exam.id}/edit`)}>{t('admin_tab_full_editor')}</button>
          {deleteExamConfirm ? (
            <>
              <button type="button" className={styles.dangerBtn} disabled={deletingExamBusy} onClick={handleDeleteExam}>
                {deletingExamBusy ? t('settings_deleting') : t('admin_tab_confirm_delete')}
              </button>
              <button type="button" className={styles.ghostBtn} disabled={deletingExamBusy} onClick={() => setDeleteExamConfirm(false)}>{t('cancel')}</button>
            </>
          ) : (
            <button type="button" className={styles.dangerBtn} disabled={deletingExamBusy} onClick={handleDeleteExam}>{t('admin_tab_delete_test')}</button>
          )}
        </div>
      </div>
    </section>
  )
}

export default memo(AdministrationTab)
