import React, { memo } from 'react'
import styles from '../AdminManageTestPage.module.scss'

function SessionsTab({
  sessions,
  sessionForm,
  setSessionForm,
  learners,
  isArchived,
  sessionFormReady,
  sessionBusy,
  handleCreateSession,
  users,
  deleteSessionId,
  deletingSessionBusyId,
  setDeleteSessionId,
  handleDeleteSession,
}) {
  return (
    <section className={styles.full}>
      <h3 className={styles.tabPanelHeader}>Testing Sessions <span className={styles.countPill}>{sessions.length}</span></h3>
      <form className={styles.sectionCard} onSubmit={handleCreateSession}>
        <div className={styles.row}>
          <label>Learner
            <select value={sessionForm.user_id} disabled={isArchived} onChange={(e) => setSessionForm((p) => ({ ...p, user_id: e.target.value }))}>
              <option value="">Select learner</option>
              {learners.map((u) => <option key={u.id} value={u.id}>{u.user_id} - {u.name}</option>)}
            </select>
          </label>
          <label>Schedule date/time<input type="datetime-local" disabled={isArchived} value={sessionForm.scheduled_at} onChange={(e) => setSessionForm((p) => ({ ...p, scheduled_at: e.target.value }))} /></label>
        </div>
        <div className={styles.row}>
          <label>Access mode
            <select value={sessionForm.access_mode} disabled={isArchived} onChange={(e) => setSessionForm((p) => ({ ...p, access_mode: e.target.value }))}>
              <option value="OPEN">OPEN</option>
              <option value="RESTRICTED">RESTRICTED</option>
            </select>
          </label>
          <label>Notes<input value={sessionForm.notes} disabled={isArchived} onChange={(e) => setSessionForm((p) => ({ ...p, notes: e.target.value }))} /></label>
        </div>
        <p className={styles.muted}>Every testing session requires both a learner and a scheduled date/time.</p>
        <div className={styles.inlineActions}>
          <button type="submit" className={styles.blueBtn} disabled={sessionBusy || isArchived || !sessionFormReady}>
            {sessionBusy ? 'Saving...' : 'Assign / Update session'}
          </button>
        </div>
      </form>
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead><tr><th>Session ID</th><th>User</th><th>Scheduled at</th><th>Access mode</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={6}>No sessions assigned yet.</td></tr>
            ) : sessions.map((session) => (
              <tr key={session.id}>
                <td>{String(session.id).slice(0, 8)}</td>
                <td>{users.find((user) => String(user.id) === String(session.user_id))?.user_id || String(session.user_id).slice(0, 8)}</td>
                <td>{new Date(session.scheduled_at).toLocaleString()}</td>
                <td>{session.access_mode}</td>
                <td>{session.notes || '-'}</td>
                <td className={styles.actionsCell}>
                  {deleteSessionId === session.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.dangerInlineBtn}
                        disabled={isArchived || deletingSessionBusyId === session.id}
                        onClick={() => handleDeleteSession(session.id)}
                      >
                        {deletingSessionBusyId === session.id ? 'Deleting...' : 'Confirm delete'}
                      </button>
                      <button type="button" disabled={deletingSessionBusyId === session.id} onClick={() => setDeleteSessionId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" disabled={isArchived || deletingSessionBusyId === session.id} onClick={() => handleDeleteSession(session.id)}>Delete</button>
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

export default memo(SessionsTab)
