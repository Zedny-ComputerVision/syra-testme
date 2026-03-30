import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { fetchAuthenticatedMediaObjectUrl, revokeObjectUrl } from '../../../../utils/authenticatedMedia'
import styles from '../AdminManageTestPage.module.scss'

function IdentityPhotos({ attemptId, selfiePath, idDocPath }) {
  const [urls, setUrls] = useState({ selfie: '', id: '' })
  const [expanded, setExpanded] = useState(false)
  const urlsRef = useRef({ selfie: '', id: '' })

  useEffect(() => {
    urlsRef.current = urls
  }, [urls])

  useEffect(() => {
    return () => {
      revokeObjectUrl(urlsRef.current.selfie)
      revokeObjectUrl(urlsRef.current.id)
    }
  }, [])

  const load = useCallback(async () => {
    if (!attemptId) return
    const next = { selfie: '', id: '' }
    try {
      if (selfiePath) next.selfie = await fetchAuthenticatedMediaObjectUrl(`identity/${attemptId}/selfie`)
    } catch { /* ignore */ }
    try {
      if (idDocPath) next.id = await fetchAuthenticatedMediaObjectUrl(`identity/${attemptId}/id`)
    } catch { /* ignore */ }
    setUrls((prev) => {
      revokeObjectUrl(prev.selfie)
      revokeObjectUrl(prev.id)
      return next
    })
  }, [attemptId, selfiePath, idDocPath])

  const handleToggle = () => {
    if (!expanded && !urls.selfie && !urls.id) {
      void load()
    }
    setExpanded((prev) => !prev)
  }

  if (!selfiePath && !idDocPath) return <span className={styles.identityNone}>-</span>

  return (
    <div className={styles.identityCell}>
      <button type="button" className={styles.identityToggle} onClick={handleToggle}>
        {expanded ? 'Hide' : 'View'}
      </button>
      {expanded && (
        <div className={styles.identityPopover}>
          {urls.selfie ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>Selfie</div>
              <img src={urls.selfie} alt="Selfie" className={styles.identityThumbImg} />
            </div>
          ) : selfiePath ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>Selfie</div>
              <div className={styles.identityThumbPlaceholder}>Loading...</div>
            </div>
          ) : null}
          {urls.id ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>ID</div>
              <img src={urls.id} alt="ID" className={styles.identityThumbImg} />
            </div>
          ) : idDocPath ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>ID</div>
              <div className={styles.identityThumbPlaceholder}>Loading...</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

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
          <thead><tr><th>Attempt</th><th>User</th><th>Status</th><th>Identity</th><th>Started</th><th>Score</th><th>Review</th><th>High</th><th>Medium</th><th>Actions</th></tr></thead>
          <tbody>
            {candidateRows.length === 0 ? (
              <tr><td colSpan={10}>No learners or attempts are assigned to this test yet.</td></tr>
            ) : candidateRows.map((row) => (
              <tr key={row.id}>
                <td>{row.attemptId}</td>
                <td>{row.username}</td>
                <td>
                  <span className={`${styles.statusBadge} ${row.status === 'NOT_STARTED' ? styles.statusNeutral : row.needsManualReview ? styles.statusPending : row.status === 'GRADED' ? styles.statusGraded : styles.statusNeutral}`}>
                    {formatAttemptStatus(row)}
                  </span>
                </td>
                <td>
                  {row.attemptIdFull ? (
                    <IdentityPhotos
                      attemptId={row.attemptIdFull}
                      selfiePath={row.selfiePath}
                      idDocPath={row.idDocPath}
                    />
                  ) : (
                    <span className={styles.identityNone}>-</span>
                  )}
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
