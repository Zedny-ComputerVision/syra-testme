import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import styles from './AdminManageTestPage.module.scss'

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'sections', label: 'Test sections' },
  { id: 'sessions', label: 'Testing sessions' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'proctoring', label: 'Proctoring' },
  { id: 'administration', label: 'Test administration' },
  { id: 'reports', label: 'Reports' },
]

const SETTINGS_MENU = [
  'Basic information',
  'Test instructions dialog settings',
  'Duration and layout',
  'Pause, retake and reschedule settings',
  'Security settings',
  'Result validity settings',
  'Grading configuration',
  'Certificates',
  'Personal report settings',
  'Score report settings',
  'Coupons',
  'Language settings',
  'Attachments',
  'External attributes',
  'Test categories',
]

export default function AdminManageTestPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('settings')
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [attemptRows, setAttemptRows] = useState([])
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState('')
  const [view, setView] = useState('candidate_monitoring')
  const [search, setSearch] = useState({ attempt: '', user: '', session: '', status: '', group: '', comment: '' })
  const [rowBusy, setRowBusy] = useState({})

  useEffect(() => {
    const isOnManageTestRoute = location.pathname.startsWith('/admin/tests/')
    if (!id || id === 'undefined' || id === 'null') {
      if (isOnManageTestRoute) navigate('/admin/tests', { replace: true })
      return
    }

    let off = false
    async function load() {
      setLoading(true)
      try {
        const [{ data: ex }, { data: attempts }, { data: scheds }, { data: users }] = await Promise.all([
          adminApi.getExam(id),
          adminApi.attempts(),
          adminApi.schedules(),
          adminApi.users(),
        ])
        if (off) return

        setExam(ex)
        const examScheds = (scheds || []).filter((s) => String(s.exam_id) === String(id))
        setSessions(examScheds)

        const userMap = new Map((users || []).map((u) => [String(u.id), u]))
        const examAttempts = (attempts || []).filter((a) => String(a.exam_id) === String(id))

        const pauseStateByAttempt = new Map()
        const videoStateByAttempt = new Map()
        await Promise.all(
          examAttempts.map(async (a) => {
            try {
              const { data: events } = await adminApi.getAttemptEvents(a.id)
              const stateEvents = (events || []).filter((e) => e.event_type === 'ATTEMPT_PAUSED' || e.event_type === 'ATTEMPT_RESUMED')
              if (stateEvents.length > 0) {
                const latest = stateEvents[stateEvents.length - 1]
                pauseStateByAttempt.set(String(a.id), latest.event_type === 'ATTEMPT_PAUSED')
              }
            } catch (_) {
              pauseStateByAttempt.set(String(a.id), false)
            }

            try {
              const { data: videos } = await adminApi.listAttemptVideos(a.id)
              videoStateByAttempt.set(String(a.id), Array.isArray(videos) && videos.length > 0)
            } catch (_) {
              videoStateByAttempt.set(String(a.id), false)
            }
          }),
        )

        setAttemptRows(
          examAttempts.map((a) => {
            const u = a.user || userMap.get(String(a.user_id))
            const s = examScheds.find((x) => String(x.user_id) === String(a.user_id))
            const paused = pauseStateByAttempt.get(String(a.id)) === true
            return {
              id: String(a.id),
              attemptId: String(a.id).slice(0, 8),
              username: u?.user_id || u?.name || String(a.user_id).slice(0, 8),
              sessionName: s ? `Session ${String(s.id).slice(0, 6)}` : '-',
              status: a.status || '-',
              paused,
              hasVideo: videoStateByAttempt.get(String(a.id)) === true,
              startedAt: a.started_at,
              userGroup: '-',
              comment: paused ? 'Paused by proctor' : (a.status === 'GRADED' ? 'Reviewed' : ''),
              proctorRate: 'Undefined',
              sessionId: s?.id || '',
            }
          }),
        )
      } catch (e) {
        if (!off) {
          setExam(null)
        }
      } finally {
        if (!off) setLoading(false)
      }
    }
    load()
    return () => { off = true }
  }, [id, navigate, location.pathname])

  const filteredRows = useMemo(() => attemptRows.filter((r) => {
    if (selectedSession && String(r.sessionId) !== String(selectedSession)) return false
    if (search.attempt && !r.attemptId.toLowerCase().includes(search.attempt.toLowerCase())) return false
    if (search.user && !r.username.toLowerCase().includes(search.user.toLowerCase())) return false
    if (search.session && !r.sessionName.toLowerCase().includes(search.session.toLowerCase())) return false
    if (search.status && (search.status === 'PAUSED' ? !r.paused : r.status !== search.status)) return false
    if (search.group && !r.userGroup.toLowerCase().includes(search.group.toLowerCase())) return false
    if (search.comment && !r.comment.toLowerCase().includes(search.comment.toLowerCase())) return false
    return true
  }), [attemptRows, selectedSession, search])

  const publish = async () => {
    if (!exam) return
    await adminApi.updateExam(exam.id, { status: 'OPEN' })
    setExam((p) => ({ ...p, status: 'OPEN' }))
  }

  const withRowBusy = async (rowId, fn) => {
    setRowBusy((prev) => ({ ...prev, [rowId]: true }))
    try {
      await fn()
    } finally {
      setRowBusy((prev) => ({ ...prev, [rowId]: false }))
    }
  }

  const handlePauseResume = async (row) => {
    await withRowBusy(row.id, async () => {
      if (row.paused) await adminApi.resumeAttempt(row.id)
      else await adminApi.pauseAttempt(row.id)

      setAttemptRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r
        const paused = !r.paused
        return {
          ...r,
          paused,
          comment: paused ? 'Paused by proctor' : (r.status === 'GRADED' ? 'Reviewed' : ''),
        }
      }))
    })
  }

  const handleOpenReport = async (row) => {
    await withRowBusy(row.id, async () => {
      const { data } = await adminApi.generateReport(row.id)
      const blob = new Blob([data], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    })
  }

  const handleOpenVideo = async (row) => {
    navigate(`/admin/attempts/${row.id}/videos`)
  }

  if (loading) return <div className={styles.page}>Loading...</div>
  if (!exam) return <div className={styles.page}>Test not found.</div>

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <button type="button" onClick={() => navigate('/admin/tests')}>Back</button>
        <span>All tests</span>
        <span>&gt;</span>
        <span>{exam.title}</span>
        <span className={styles.status}>{exam.status === 'OPEN' ? 'Published' : 'Draft'}</span>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? styles.tabActive : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'settings' && (
          <>
            <aside className={styles.leftMenu}>
              {SETTINGS_MENU.map((item, idx) => (
                <button type="button" key={item} className={idx === 0 ? styles.leftActive : ''}>{item}</button>
              ))}
            </aside>
            <section className={styles.main}>
              <div className={styles.headerRow}>
                <h3>Basic information</h3>
                <div className={styles.headerActions}>
                  <button type="button" className={styles.greenBtn}>Preview</button>
                  <button type="button" className={styles.blueBtn} onClick={publish}>Publish test</button>
                  <button type="button" className={styles.ghostBtn}>Options</button>
                </div>
              </div>
              <p>This section contains essential test information and primary actions.</p>
              <div className={styles.formGrid}>
                <label>Test name *<input value={exam.title || ''} readOnly /></label>
                <label>Test status<input value={exam.status || ''} readOnly /></label>
                <label>Test ID<input value={String(exam.id).slice(0, 6)} readOnly /></label>
              </div>
              <label>Test description<textarea value={exam.description || ''} readOnly rows={6} /></label>
            </section>
          </>
        )}

        {tab === 'proctoring' && (
          <section className={styles.full}>
            <h3>Proctoring</h3>
            <div className={styles.row}>
              <label>Test<input value={exam.title || ''} readOnly /></label>
              <label>Testing session
                <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
                  <option value="">All testing sessions</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{`Session ${String(s.id).slice(0, 6)}`}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.viewTabs}>
              <button type="button" className={view === 'candidate_monitoring' ? styles.viewActive : ''} onClick={() => setView('candidate_monitoring')}>Candidate monitoring</button>
              <button type="button" className={view === 'special_accommodations' ? styles.viewActive : ''} onClick={() => setView('special_accommodations')}>Special accommodations</button>
              <button type="button" className={view === 'special_requests' ? styles.viewActive : ''} onClick={() => setView('special_requests')}>Special requests</button>
            </div>
            {view === 'candidate_monitoring' && (
              <div className={styles.tableCard}>
                <div className={styles.tableActions}>
                  <button type="button">Pause session</button>
                  <button type="button">Resume session</button>
                  <button type="button" className={styles.blueBtn}>Open supervision mode</button>
                  <button type="button">Filter</button>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Actions</th><th>Attempt ID</th><th>Username</th><th>Testing session name</th><th>Attempt status</th><th>Test started</th><th>User group</th><th>Comment</th><th>Proctor rate</th>
                    </tr>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr><td colSpan={9}>There are no test attempts</td></tr>
                    ) : filteredRows.map((r) => (
                      <tr key={r.id}>
                        <td className={styles.actionsCell}>
                          <button type="button" onClick={() => handlePauseResume(r)} disabled={rowBusy[r.id]}>{r.paused ? 'Resume' : 'Pause'}</button>
                          <button type="button" onClick={() => handleOpenReport(r)} disabled={rowBusy[r.id]}>Report</button>
                          <button
                            type="button"
                            onClick={() => handleOpenVideo(r)}
                            disabled={rowBusy[r.id]}
                            className={r.hasVideo ? styles.videoBtnGreen : styles.videoBtnRed}
                            title={r.hasVideo ? 'Video recordings available' : 'No recordings for this attempt'}
                          >
                            Video
                          </button>
                        </td>
                        <td>{r.attemptId}</td>
                        <td>{r.username}</td>
                        <td>{r.sessionName}</td>
                        <td>{r.paused ? 'PAUSED' : r.status}</td>
                        <td>{r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
                        <td>{r.userGroup}</td>
                        <td>{r.comment || '0'}</td>
                        <td>{r.proctorRate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!['settings', 'proctoring'].includes(tab) && (
          <section className={styles.full}><h3>{TABS.find((t) => t.id === tab)?.label}</h3><p>Section coming next.</p></section>
        )}
      </div>
    </div>
  )
}
