import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { fetchAuthenticatedMediaObjectUrl, revokeObjectUrl } from '../../../../utils/authenticatedMedia'
import useLanguage from '../../../../hooks/useLanguage'
import styles from '../AdminManageTestPage.module.scss'

function IdentityPhotos({ attemptId, selfiePath, idDocPath }) {
  const { t } = useLanguage()
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
        {expanded ? t('admin_candidates_hide') : t('admin_candidates_view')}
      </button>
      {expanded && (
        <div className={styles.identityPopover}>
          {urls.selfie ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>{t('admin_candidates_selfie')}</div>
              <img src={urls.selfie} alt={t('admin_candidates_selfie')} className={styles.identityThumbImg} />
            </div>
          ) : selfiePath ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>{t('admin_candidates_selfie')}</div>
              <div className={styles.identityThumbPlaceholder}>{t('loading')}</div>
            </div>
          ) : null}
          {urls.id ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>{t('admin_candidates_id_doc')}</div>
              <img src={urls.id} alt={t('admin_candidates_id_doc')} className={styles.identityThumbImg} />
            </div>
          ) : idDocPath ? (
            <div className={styles.identityThumb}>
              <div className={styles.identityThumbLabel}>{t('admin_candidates_id_doc')}</div>
              <div className={styles.identityThumbPlaceholder}>{t('loading')}</div>
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
  const { t } = useLanguage()
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>{t('admin_candidates_tab_header')} <span className={styles.countPill}>{candidateRows.length}</span></h3>
      <p className={styles.sectionDescription}>
        {t('admin_candidates_tab_description')}
      </p>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>{t('admin_candidates_th_attempt')}</th><th>{t('admin_candidates_th_user')}</th><th>{t('status')}</th><th>{t('admin_candidates_th_identity')}</th><th>{t('admin_candidates_th_started')}</th><th>{t('score')}</th><th>{t('admin_candidates_th_review')}</th><th>{t('admin_candidates_th_high')}</th><th>{t('admin_candidates_th_medium')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>
            {candidateRows.length === 0 ? (
              <tr><td colSpan={10}>{t('admin_candidates_no_learners')}</td></tr>
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
                    {row.submittedAt && <div className={styles.reviewMeta}>{t('admin_candidates_submitted')} {new Date(row.submittedAt).toLocaleString()}</div>}
                    {row.attemptIdFull && row.status !== 'IN_PROGRESS' ? (
                      <div className={styles.scoreEditor}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={gradeDrafts[row.id] ?? ''}
                          disabled={rowBusy[row.id]}
                          aria-label={`${t('admin_candidates_grade_for')} ${row.username}`}
                          onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        />
                        <button type="button" className={styles.blueBtn} disabled={rowBusy[row.id]} onClick={() => handleSaveGrade(row)}>
                          {rowBusy[row.id] ? t('saving') : row.status === 'GRADED' ? t('admin_candidates_update_grade') : t('admin_candidates_save_grade')}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.reviewMeta}>
                        {row.attemptIdFull ? t('admin_candidates_submit_required') : t('admin_candidates_not_started')}
                      </div>
                    )}
                  </div>
                </td>
                <td>{row.highAlerts}</td>
                <td>{row.mediumAlerts}</td>
                <td className={styles.actionsCell}>
                  <button type="button" disabled={rowBusy[row.id] || !row.attemptIdFull} onClick={() => handleOpenResult(row)} aria-label={`${t('result')} ${row.username} ${row.attemptId}`} title={`${t('result')} ${row.username} ${row.attemptId}`}>{t('result')}</button>
                  <button type="button" disabled={rowBusy[row.id] || !row.attemptIdFull} onClick={() => navigate(`/admin/attempt-analysis?id=${row.attemptIdFull}`)} aria-label={`${t('admin_candidates_analyze')} ${row.username} ${row.attemptId}`} title={`${t('admin_candidates_analyze')} ${row.username} ${row.attemptId}`}>{t('admin_candidates_analyze')}</button>
                  <button type="button" onClick={() => handlePauseResume(row)} disabled={rowBusy[row.id] || !row.attemptIdFull} aria-label={`${row.paused ? t('admin_candidates_resume') : t('admin_candidates_pause')} ${row.username} ${row.attemptId}`}>{row.paused ? t('admin_candidates_resume') : t('admin_candidates_pause')}</button>
                  <button type="button" onClick={() => handleOpenVideo(row)} disabled={rowBusy[row.id] || !row.attemptIdFull} aria-label={`${t('admin_candidates_video')} ${row.username} ${row.attemptId}`} title={`${t('admin_candidates_video')} ${row.username} ${row.attemptId}`}>{t('admin_candidates_video')}</button>
                  <button type="button" onClick={() => handleOpenReport(row)} disabled={rowBusy[row.id] || !row.attemptIdFull} aria-label={`${t('admin_candidates_report')} ${row.username} ${row.attemptId}`} title={`${t('admin_candidates_report')} ${row.username} ${row.attemptId}`}>{rowBusy[row.id] ? t('admin_candidates_opening') : t('admin_candidates_report')}</button>
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
