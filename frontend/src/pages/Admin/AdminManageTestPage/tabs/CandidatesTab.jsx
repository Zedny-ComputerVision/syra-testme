import React, { memo } from 'react'
import styles from '../AdminManageTestPage.module.scss'

function CandidatesTab({
  candidateRows,
  formatAttemptStatus,
  formatScore,
  gradeDrafts,
  setGradeDrafts,
  rowBusy,
  handleSaveGrade,
  handleOpenResult,
  navigate,
  handlePauseResume,
  handleOpenVideo,
  handleOpenReport,
}) {
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>Candidates <span className={styles.countPill}>{candidateRows.length}</span></h3>
      <p className={styles.sectionDescription}>
        Assigned learners stay visible here even before they start the test, so the roster and attempt activity are tracked in one place.
      </p>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Attempt</th><th>User</th><th>Status</th><th>Started</th><th>Score</th><th>Review</th><th>High</th><th>Medium</th><th>Actions</th></tr></thead>
          <tbody>
            {candidateRows.length === 0 ? (
              <tr><td colSpan={9}>No learners or attempts are assigned to this test yet.</td></tr>
            ) : candidateRows.map((row) => (
              <tr key={row.id}>
                <td>{row.attemptId}</td>
                <td>{row.username}</td>
                <td>
                  <span className={`${styles.statusBadge} ${row.status === 'NOT_STARTED' ? styles.statusNeutral : row.needsManualReview ? styles.statusPending : row.status === 'GRADED' ? styles.statusGraded : styles.statusNeutral}`}>
                    {formatAttemptStatus(row)}
                  </span>
                </td>
                <td>{row.startedAt ? new Date(row.startedAt).toLocaleString() : '-'}</td>
                <td>{formatScore(row.score)}</td>
                <td>
                  <div className={styles.reviewCell}>
                    <div className={styles.reviewState}>{row.reviewState}</div>
                    {row.submittedAt && <div className={styles.reviewMeta}>Submitted {new Date(row.submittedAt).toLocaleString()}</div>}
                    {row.attemptIdFull && row.status !== 'IN_PROGRESS' ? (
                      <div className={styles.scoreEditor}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={gradeDrafts[row.id] ?? ''}
                          disabled={rowBusy[row.id]}
                          aria-label={`Grade for ${row.username}`}
                          onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        />
                        <button type="button" className={styles.blueBtn} disabled={rowBusy[row.id]} onClick={() => handleSaveGrade(row)}>
                          {rowBusy[row.id] ? 'Saving...' : row.status === 'GRADED' ? 'Update grade' : 'Save grade'}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.reviewMeta}>
                        {row.attemptIdFull ? 'Submit required before grading' : 'Learner has not started this test yet'}
                      </div>
                    )}
                  </div>
                </td>
                <td>{row.highAlerts}</td>
                <td>{row.mediumAlerts}</td>
                <td className={styles.actionsCell}>
                  <button type="button" disabled={rowBusy[row.id] || !row.attemptIdFull} onClick={() => handleOpenResult(row)} aria-label={`Open result for ${row.username} attempt ${row.attemptId}`} title={`Open result for ${row.username} attempt ${row.attemptId}`}>Result</button>
                  <button type="button" disabled={rowBusy[row.id] || !row.attemptIdFull} onClick={() => navigate(`/admin/attempt-analysis?id=${row.attemptIdFull}`)} aria-label={`Review attempt analysis for ${row.username} attempt ${row.attemptId}`} title={`Review attempt analysis for ${row.username} attempt ${row.attemptId}`}>Analyze</button>
                  <button type="button" onClick={() => handlePauseResume(row)} disabled={rowBusy[row.id] || !row.attemptIdFull} aria-label={`${row.paused ? 'Resume' : 'Pause'} monitoring for ${row.username} attempt ${row.attemptId}`}>{row.paused ? 'Resume' : 'Pause'}</button>
                  <button type="button" onClick={() => handleOpenVideo(row)} disabled={rowBusy[row.id] || !row.attemptIdFull} aria-label={`Open video for ${row.username} attempt ${row.attemptId}`} title={`Open video for ${row.username} attempt ${row.attemptId}`}>Video</button>
                  <button type="button" onClick={() => handleOpenReport(row)} disabled={rowBusy[row.id] || !row.attemptIdFull} aria-label={`Open report for ${row.username} attempt ${row.attemptId}`} title={`Open report for ${row.username} attempt ${row.attemptId}`}>{rowBusy[row.id] ? 'Opening...' : 'Report'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(CandidatesTab)
