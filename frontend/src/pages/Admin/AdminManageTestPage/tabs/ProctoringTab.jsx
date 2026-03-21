import React, { memo } from 'react'
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
          <span>{uploadPercent}% uploaded</span>
          <span>{remainingPercent}% left</span>
        </div>
        <div className={styles.videoUploadBar}>
          <span className={`${styles.videoUploadBarFill} ${fillClass}`} style={{ width: `${uploadPercent}%` }} />
        </div>
        <div className={styles.videoUploadMeta}>
          {row.uploadStatusLabel || (uploadPercent > 0 ? 'Uploading in background' : 'Not started')}
          {sourceBreakdown ? ` | ${sourceBreakdown}` : ''}
        </div>
      </div>
    )
  }

  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>Proctoring</h3>
      <p className={styles.sectionDescription}>Review monitored attempts, special accommodations, and flagged activity for this test.</p>
      <div className={styles.row}>
        <label>Test<input value={exam.title || ''} readOnly /></label>
        <label>Testing session
          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            <option value="">All testing sessions</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{`Session ${String(session.id).slice(0, 6)}`}</option>)}
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
        <button type="button" className={view === 'candidate_monitoring' ? styles.viewActive : ''} onClick={() => setView('candidate_monitoring')}>Candidate monitoring</button>
        <button type="button" className={view === 'special_accommodations' ? styles.viewActive : ''} onClick={() => setView('special_accommodations')}>Special accommodations</button>
        <button type="button" className={view === 'special_requests' ? styles.viewActive : ''} onClick={() => setView('special_requests')}>Special requests</button>
      </div>

      {view === 'candidate_monitoring' && (
        <div className={styles.tableCard}>
          <div className={styles.tableToolbar}>
            <div className={styles.tableMeta}>
              Showing {filteredRows.length} attempt{filteredRows.length !== 1 ? 's' : ''} across {attemptRows.length} loaded.
            </div>
            <div className={styles.tableActions}>
              <button type="button" onClick={() => handleBulkPauseResume(true)} disabled={bulkBusy || filteredRows.length === 0}>
                {bulkBusy && bulkAction === 'pause' ? 'Pausing...' : 'Pause session'}
              </button>
              <button type="button" onClick={() => handleBulkPauseResume(false)} disabled={bulkBusy || filteredRows.length === 0}>
                {bulkBusy && bulkAction === 'resume' ? 'Resuming...' : 'Resume session'}
              </button>
              <button type="button" onClick={() => void loadAll(false)} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" onClick={clearMonitoringFilters} disabled={!monitoringHasFilters}>
                Clear filters
              </button>
              <button type="button" className={styles.blueBtn} onClick={() => navigate(`/admin/videos?exam_id=${examId}`)}>Open supervision mode</button>
              <button type="button" onClick={() => setShowFilters((current) => !current)}>{showFilters ? 'Hide filters' : 'Filter'}</button>
            </div>
          </div>
          {filteredRows.length === 0 ? (
            <div className={styles.emptyPanel}>
              <div className={styles.emptyTitle}>
                {monitoringHasFilters ? 'No attempts match the current monitoring filters.' : 'No test attempts yet.'}
              </div>
              <div className={styles.emptyText}>
                {monitoringHasFilters
                  ? 'Clear the current session or column filters to restore the full monitoring list.'
                  : 'Attempts will appear here once learners begin this test.'}
              </div>
              {monitoringHasFilters && (
                <button type="button" className={styles.ghostBtn} onClick={clearMonitoringFilters}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Actions</th><th>Attempt ID</th><th>Username</th><th>Testing session</th><th>Status</th><th>Started</th><th>Access</th><th>Comment</th><th>Video upload</th><th>Proctor rate</th></tr>
                {showFilters && (
                  <tr>
                    <th></th>
                    <th><input placeholder="Search" value={search.attempt} onChange={(e) => setSearch((p) => ({ ...p, attempt: e.target.value }))} /></th>
                    <th><input placeholder="Search" value={search.user} onChange={(e) => setSearch((p) => ({ ...p, user: e.target.value }))} /></th>
                    <th><input placeholder="Search" value={search.session} onChange={(e) => setSearch((p) => ({ ...p, session: e.target.value }))} /></th>
                    <th><select value={search.status} onChange={(e) => setSearch((p) => ({ ...p, status: e.target.value }))}><option value="">Select one</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="PAUSED">PAUSED</option><option value="SUBMITTED">SUBMITTED</option><option value="GRADED">GRADED</option></select></th>
                    <th></th>
                    <th><input placeholder="Search" value={search.group} onChange={(e) => setSearch((p) => ({ ...p, group: e.target.value }))} /></th>
                    <th><input placeholder="Search" value={search.comment} onChange={(e) => setSearch((p) => ({ ...p, comment: e.target.value }))} /></th>
                    <th></th>
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.actionsCell}>
                      <button type="button" onClick={() => handlePauseResume(row)} disabled={rowBusy[row.id]}>{row.paused ? 'Resume' : 'Pause'}</button>
                      <button type="button" onClick={() => handleOpenReport(row)} disabled={rowBusy[row.id]}>{rowBusy[row.id] ? 'Opening...' : 'Report'}</button>
                      <button
                        type="button"
                        onClick={() => handleOpenVideo(row)}
                        disabled={rowBusy[row.id]}
                        className={row.hasVideo ? styles.videoBtnGreen : (row.uploadPercent > 0 ? styles.videoBtnAmber : styles.videoBtnRed)}
                      >
                        Video
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
            <thead><tr><th>Session</th><th>User</th><th>Access mode</th><th>Notes</th><th>Scheduled at</th><th>Actions</th></tr></thead>
            <tbody>
              {sessions.length === 0 ? <tr><td colSpan={6}>No session accommodations configured.</td></tr> : sessions.map((session) => (
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
                      <td><input value={editingAccomForm.notes} onChange={(e) => setEditingAccomForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" /></td>
                      <td><input type="datetime-local" value={editingAccomForm.scheduled_at} onChange={(e) => setEditingAccomForm((p) => ({ ...p, scheduled_at: e.target.value }))} /></td>
                      <td className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.blueBtn}
                          disabled={savingAccomId === session.id || !editingAccomForm.scheduled_at}
                          onClick={() => handleSaveAccom(session.id)}
                        >
                          {savingAccomId === session.id ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" disabled={savingAccomId === session.id} onClick={() => setEditingAccomId(null)} aria-label={`Cancel editing accommodation for ${(users.find((u) => String(u.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8))}`}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{session.access_mode}</td>
                      <td>{session.notes || '-'}</td>
                      <td>{new Date(session.scheduled_at).toLocaleString()}</td>
                      <td className={styles.actionsCell}>
                        <button type="button" disabled={isArchived} onClick={() => startEditAccom(session)} aria-label={`Edit accommodation for ${(users.find((u) => String(u.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8))}`} title={`Edit accommodation for ${(users.find((u) => String(u.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8))}`}>Edit</button>
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
            <thead><tr><th>Attempt</th><th>User</th><th>High alerts</th><th>Medium alerts</th><th>Actions</th></tr></thead>
            <tbody>
              {flaggedRows.length === 0 ? <tr><td colSpan={5}>No flagged requests available.</td></tr> : flaggedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.attemptId}</td><td>{row.username}</td><td>{row.highAlerts}</td><td>{row.mediumAlerts}</td>
                  <td className={styles.actionsCell}>
                    <button type="button" disabled={rowBusy[row.id]} onClick={() => navigate(`/admin/attempt-analysis?id=${row.id}`)} aria-label={`Review attempt analysis for ${row.username} attempt ${row.attemptId}`} title={`Review attempt analysis for ${row.username} attempt ${row.attemptId}`}>Analyze</button>
                    <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenVideo(row)} aria-label={`Inspect video for ${row.username} attempt ${row.attemptId}`} title={`Inspect video for ${row.username} attempt ${row.attemptId}`}>Inspect video</button>
                    <button type="button" disabled={rowBusy[row.id]} onClick={() => handleOpenReport(row)} aria-label={`Open report for ${row.username} attempt ${row.attemptId}`} title={`Open report for ${row.username} attempt ${row.attemptId}`}>
                      {rowBusy[row.id] ? 'Opening...' : 'Open report'}
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
