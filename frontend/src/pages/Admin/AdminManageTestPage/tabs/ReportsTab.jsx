import React, { memo } from 'react'
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
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>Reports</h3>
      <div className={styles.sectionCard}>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.blueBtn} disabled={reportsBusy} onClick={downloadExamCsv}>Download Test CSV</button>
          <button type="button" className={styles.blueBtn} disabled={reportsBusy} onClick={downloadExamPdf}>Download Test PDF</button>
        </div>
      </div>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Attempt</th><th>User</th><th>Status</th><th>High</th><th>Medium</th><th>Actions</th></tr></thead>
          <tbody>
            {attemptRows.length === 0 ? <tr><td colSpan={6}>No attempts available for reporting.</td></tr> : attemptRows.map((row) => (
              <tr key={row.id}>
                <td>{row.attemptId}</td><td>{row.username}</td><td>{row.paused ? 'PAUSED' : row.status}</td><td>{row.highAlerts}</td><td>{row.mediumAlerts}</td>
                <td className={styles.actionsCell}>
                  <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenReport(row)}>
                    {rowBusy[row.id] ? 'Opening...' : 'Attempt report'}
                  </button>
                  <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenVideo(row)}>Video</button>
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
