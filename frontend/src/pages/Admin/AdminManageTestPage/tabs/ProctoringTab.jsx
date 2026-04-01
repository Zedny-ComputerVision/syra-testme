import React, { memo } from 'react'
import useLanguage from '../../../../hooks/useLanguage'
import styles from '../AdminManageTestPage.module.scss'

function ProctoringTab({
  exam,
  sessions,
  selectedSession,
  setSelectedSession,
  monitoringSummaryCards,
  view,
  setView,
  filteredRows,
  attemptRows,
  bulkBusy,
  bulkAction,
  handleBulkPauseResume,
  loadAll,
  loading,
  clearMonitoringFilters,
  monitoringHasFilters,
  navigate,
  examId,
  showFilters,
  setShowFilters,
  search,
  setSearch,
  rowBusy,
  handlePauseResume,
  handleOpenReport,
  handleOpenVideo,
  users,
  editingAccomId,
  editingAccomForm,
  setEditingAccomForm,
  savingAccomId,
  handleSaveAccom,
  setEditingAccomId,
  isArchived,
  startEditAccom,
}) {
  const { t } = useLanguage()
  const flaggedRows = attemptRows.filter((row) => row.highAlerts > 0 || row.mediumAlerts > 0)
  const renderVideoUploadCell = (row) => {
    const uploadPercent = Math.max(0, Math.min(100, Number(row.uploadPercent || 0)))
    const remainingPercent = Math.max(0, 100 - uploadPercent)
    const sourceBreakdown = Array.isArray(row.uploadSources) && row.uploadSources.length > 0
      ? row.uploadSources.map((source) => `${source.label || source.source}: ${Math.max(0, Math.min(100, Number(source.progressPercent || 0)))}%`).join(' | ')
      : ''
    const fillClass = row.uploadStatus === 'error'
      ? styles.videoUploadBarError
      : uploadPercent >= 100
        ? styles.videoUploadBarComplete
        : row.uploading || uploadPercent > 0
          ? styles.videoUploadBarActive
          : styles.videoUploadBarIdle

    return (
      <div className={styles.videoUploadCell}>
        <div className={styles.videoUploadHeader}>
          <span>{uploadPercent}% {t('admin_proctoring_tab_uploaded')}</span>
          <span>{remainingPercent}% {t('admin_proctoring_tab_left')}</span>
        </div>
        <div className={styles.videoUploadBar}>
          <span className={`${styles.videoUploadBarFill} ${fillClass}`} style={{ width: `${uploadPercent}%` }} />
        </div>
        <div className={styles.videoUploadMeta}>
          {row.uploadStatusLabel || (uploadPercent > 0 ? t('admin_proctoring_tab_uploading_background') : t('admin_proctoring_tab_not_started'))}
          {sourceBreakdown ? ` | ${sourceBreakdown}` : ''}
        </div>
      </div>
    )
  }

  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>{t('admin_proctoring_tab_title')}</h3>
      <p className={styles.sectionDescription}>{t('admin_proctoring_tab_description')}</p>
      <div className={styles.row}>
        <label>{t('admin_proctoring_tab_test_label')}<input value={exam.title || ''} readOnly /></label>
        <label>{t('admin_proctoring_tab_testing_session')}
          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            <option value="">{t('admin_proctoring_tab_all_sessions')}</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{`${t('admin_proctoring_tab_session_prefix')} ${String(session.id).slice(0, 6)}`}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.summaryGrid}>
        {monitoringSummaryCards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summarySub}>{card.helper}</div>
          </div>
        ))}
      </div>
      <div className={styles.viewTabs}>
        <button type="button" className={view === 'candidate_monitoring' ? styles.viewActive : ''} onClick={() => setView('candidate_monitoring')}>{t('admin_proctoring_tab_candidate_monitoring')}</button>
        <button type="button" className={view === 'special_accommodations' ? styles.viewActive : ''} onClick={() => setView('special_accommodations')}>{t('admin_proctoring_tab_special_accommodations')}</button>
        <button type="button" className={view === 'special_requests' ? styles.viewActive : ''} onClick={() => setView('special_requests')}>{t('admin_proctoring_tab_special_requests')}</button>
      </div>

      {view === 'candidate_monitoring' && (
        <div className={styles.tableCard}>
          <div className={styles.tableToolbar}>
            <div className={styles.tableMeta}>
              {t('admin_proctoring_tab_showing_attempts')}
            </div>
            <div className={styles.tableActions}>
              <button type="button" onClick={() => handleBulkPauseResume(true)} disabled={bulkBusy || filteredRows.length === 0}>
                {bulkBusy && bulkAction === 'pause' ? t('admin_proctoring_tab_pausing') : t('admin_proctoring_tab_pause_session')}
              </button>
              <button type="button" onClick={() => handleBulkPauseResume(false)} disabled={bulkBusy || filteredRows.length === 0}>
                {bulkBusy && bulkAction === 'resume' ? t('admin_proctoring_tab_resuming') : t('admin_proctoring_tab_resume_session')}
              </button>
              <button type="button" onClick={() => void loadAll(false)} disabled={loading}>
                {loading ? t('admin_proctoring_tab_refreshing') : t('admin_proctoring_tab_refresh')}
              </button>
              <button type="button" onClick={clearMonitoringFilters} disabled={!monitoringHasFilters}>
                {t('admin_proctoring_tab_clear_filters')}
              </button>
              <button type="button" className={styles.blueBtn} onClick={() => navigate(`/admin/videos?exam_id=${examId}`)}>{t('admin_proctoring_tab_open_supervision')}</button>
              <button type="button" onClick={() => setShowFilters((current) => !current)}>{showFilters ? t('admin_proctoring_tab_hide_filters') : t('admin_proctoring_tab_filter')}</button>
            </div>
          </div>
          {filteredRows.length === 0 ? (
            <div className={styles.emptyPanel}>
              <div className={styles.emptyTitle}>
                {monitoringHasFilters ? t('admin_proctoring_tab_no_attempts_match_filters') : t('admin_proctoring_tab_no_attempts_yet')}
              </div>
              <div className={styles.emptyText}>
                {monitoringHasFilters
                  ? t('admin_proctoring_tab_clear_filters_hint')
                  : t('admin_proctoring_tab_attempts_will_appear')}
              </div>
              {monitoringHasFilters && (
                <button type="button" className={styles.ghostBtn} onClick={clearMonitoringFilters}>
                  {t('admin_proctoring_tab_clear_filters')}
                </button>
              )}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>{t('admin_proctoring_tab_th_actions')}</th><th>{t('admin_proctoring_tab_th_attempt_id')}</th><th>{t('admin_proctoring_tab_th_username')}</th><th>{t('admin_proctoring_tab_th_testing_session')}</th><th>{t('admin_proctoring_tab_th_status')}</th><th>{t('admin_proctoring_tab_th_started')}</th><th>{t('admin_proctoring_tab_th_access')}</th><th>{t('admin_proctoring_tab_th_comment')}</th><th>{t('admin_proctoring_tab_th_video_upload')}</th><th>{t('admin_proctoring_tab_th_proctor_rate')}</th></tr>
                {showFilters && (
                  <tr>
                    <th></th>
                    <th><input placeholder={t('admin_proctoring_tab_search')} value={search.attempt} onChange={(e) => setSearch((p) => ({ ...p, attempt: e.target.value }))} /></th>
                    <th><input placeholder={t('admin_proctoring_tab_search')} value={search.user} onChange={(e) => setSearch((p) => ({ ...p, user: e.target.value }))} /></th>
                    <th><input placeholder={t('admin_proctoring_tab_search')} value={search.session} onChange={(e) => setSearch((p) => ({ ...p, session: e.target.value }))} /></th>
                    <th><select value={search.status} onChange={(e) => setSearch((p) => ({ ...p, status: e.target.value }))}><option value="">{t('admin_proctoring_tab_select_one')}</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="PAUSED">PAUSED</option><option value="SUBMITTED">SUBMITTED</option><option value="GRADED">GRADED</option></select></th>
                    <th></th>
                    <th><input placeholder={t('admin_proctoring_tab_search')} value={search.group} onChange={(e) => setSearch((p) => ({ ...p, group: e.target.value }))} /></th>
                    <th><input placeholder={t('admin_proctoring_tab_search')} value={search.comment} onChange={(e) => setSearch((p) => ({ ...p, comment: e.target.value }))} /></th>
                    <th></th>
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.actionsCell}>
                      <button type="button" onClick={() => handlePauseResume(row)} disabled={rowBusy[row.id]}>{row.paused ? t('admin_proctoring_tab_resume') : t('admin_proctoring_tab_pause')}</button>
                      <button type="button" onClick={() => handleOpenReport(row)} disabled={rowBusy[row.id]}>{rowBusy[row.id] ? t('admin_proctoring_tab_opening') : t('admin_proctoring_tab_report')}</button>
                      <button
                        type="button"
                        onClick={() => handleOpenVideo(row)}
                        disabled={rowBusy[row.id]}
                        className={row.hasVideo ? styles.videoBtnGreen : (row.uploadPercent > 0 ? styles.videoBtnAmber : styles.videoBtnRed)}
                      >
                        {t('admin_proctoring_tab_video')}
                      </button>
                    </td>
                    <td>{row.attemptId}</td><td>{row.username}</td><td>{row.sessionName}</td><td>{row.paused ? 'PAUSED' : row.status}</td>
                    <td>{row.startedAt ? new Date(row.startedAt).toLocaleString() : '-'}</td><td>{row.userGroup}</td><td>{row.comment || '-'}</td><td>{renderVideoUploadCell(row)}</td><td>{row.proctorRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'special_accommodations' && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead><tr><th>{t('admin_proctoring_tab_th_session')}</th><th>{t('admin_proctoring_tab_th_user')}</th><th>{t('admin_proctoring_tab_th_access_mode')}</th><th>{t('admin_proctoring_tab_th_notes')}</th><th>{t('admin_proctoring_tab_th_scheduled_at')}</th><th>{t('admin_proctoring_tab_th_actions')}</th></tr></thead>
            <tbody>
              {sessions.length === 0 ? <tr><td colSpan={6}>{t('admin_proctoring_tab_no_accommodations')}</td></tr> : sessions.map((session) => (
                <tr key={session.id}>
                  <td>{String(session.id).slice(0, 8)}</td>
                  <td>{users.find((user) => String(user.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8)}</td>
                  {editingAccomId === session.id ? (
                    <>
                      <td>
                        <select value={editingAccomForm.access_mode} onChange={(e) => setEditingAccomForm((p) => ({ ...p, access_mode: e.target.value }))}>
                          <option value="OPEN">OPEN</option>
                          <option value="RESTRICTED">RESTRICTED</option>
                        </select>
                      </td>
                      <td><input value={editingAccomForm.notes} onChange={(e) => setEditingAccomForm((p) => ({ ...p, notes: e.target.value }))} placeholder={t('admin_proctoring_tab_notes')} /></td>
                      <td><input type="datetime-local" value={editingAccomForm.scheduled_at} onChange={(e) => setEditingAccomForm((p) => ({ ...p, scheduled_at: e.target.value }))} /></td>
                      <td className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.blueBtn}
                          disabled={savingAccomId === session.id || !editingAccomForm.scheduled_at}
                          onClick={() => handleSaveAccom(session.id)}
                        >
                          {savingAccomId === session.id ? t('admin_proctoring_tab_saving') : t('admin_proctoring_tab_save')}
                        </button>
                        <button type="button" disabled={savingAccomId === session.id} onClick={() => setEditingAccomId(null)} aria-label={`Cancel editing accommodation for ${(users.find((u) => String(u.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8))}`}>{t('admin_proctoring_tab_cancel')}</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{session.access_mode}</td>
                      <td>{session.notes || '-'}</td>
                      <td>{new Date(session.scheduled_at).toLocaleString()}</td>
                      <td className={styles.actionsCell}>
                        <button type="button" disabled={isArchived} onClick={() => startEditAccom(session)} aria-label={`Edit accommodation for ${(users.find((u) => String(u.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8))}`} title={`Edit accommodation for ${(users.find((u) => String(u.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8))}`}>{t('admin_proctoring_tab_edit')}</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'special_requests' && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead><tr><th>{t('admin_proctoring_tab_th_attempt')}</th><th>{t('admin_proctoring_tab_th_user')}</th><th>{t('admin_proctoring_tab_th_high_alerts')}</th><th>{t('admin_proctoring_tab_th_medium_alerts')}</th><th>{t('admin_proctoring_tab_th_actions')}</th></tr></thead>
            <tbody>
              {flaggedRows.length === 0 ? <tr><td colSpan={5}>{t('admin_proctoring_tab_no_flagged_requests')}</td></tr> : flaggedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.attemptId}</td><td>{row.username}</td><td>{row.highAlerts}</td><td>{row.mediumAlerts}</td>
                  <td className={styles.actionsCell}>
                    <button type="button" disabled={rowBusy[row.id]} onClick={() => navigate(`/admin/attempt-analysis?id=${row.id}`)} aria-label={`Review attempt analysis for ${row.username} attempt ${row.attemptId}`} title={`Review attempt analysis for ${row.username} attempt ${row.attemptId}`}>{t('admin_proctoring_tab_analyze')}</button>
                    <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenVideo(row)} aria-label={`Inspect video for ${row.username} attempt ${row.attemptId}`} title={`Inspect video for ${row.username} attempt ${row.attemptId}`}>{t('admin_proctoring_tab_inspect_video')}</button>
                    <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenReport(row)} aria-label={`Open report for ${row.username} attempt ${row.attemptId}`} title={`Open report for ${row.username} attempt ${row.attemptId}`}>
                      {rowBusy[row.id] ? t('admin_proctoring_tab_opening') : t('admin_proctoring_tab_open_report')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default memo(ProctoringTab)
