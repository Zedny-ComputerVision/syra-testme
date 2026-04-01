import React, { memo } from 'react'
import useLanguage from '../../../../hooks/useLanguage'
import styles from '../AdminManageTestPage.module.scss'

function ReportsTab({
  reportsBusy,
  downloadExamCsv,
  downloadExamPdf,
  attemptRows,
  rowBusy,
  handleOpenReport,
  handleOpenVideo,
}) {
  const { t } = useLanguage()
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>{t('reports_tab_title')}</h3>
      <div className={styles.sectionCard}>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.blueBtn} disabled={reportsBusy} onClick={downloadExamCsv}>{t('reports_tab_csv')}</button>
          <button type="button" className={styles.blueBtn} disabled={reportsBusy} onClick={downloadExamPdf}>{t('reports_tab_pdf')}</button>
        </div>
      </div>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>{t('reports_tab_col_attempt')}</th><th>{t('reports_tab_col_user')}</th><th>{t('reports_tab_col_status')}</th><th>{t('reports_tab_col_high')}</th><th>{t('reports_tab_col_medium')}</th><th>{t('reports_tab_col_actions')}</th></tr></thead>
          <tbody>
            {attemptRows.length === 0 ? <tr><td colSpan={6}>{t('reports_tab_no_attempts')}</td></tr> : attemptRows.map((row) => (
              <tr key={row.id}>
                <td>{row.attemptId}</td><td>{row.username}</td><td>{row.paused ? t('reports_tab_paused') : row.status}</td><td>{row.highAlerts}</td><td>{row.mediumAlerts}</td>
                <td className={styles.actionsCell}>
                  <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenReport(row)}>
                    {rowBusy[row.id] ? t('reports_tab_opening') : t('reports_tab_attempt_report')}
                  </button>
                  <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenVideo(row)}>{t('reports_tab_video')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(ReportsTab)
