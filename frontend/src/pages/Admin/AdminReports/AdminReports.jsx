import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminReports.module.scss'

export default function AdminReports() {
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState({ name: '', report_type: 'attempt-summary', schedule_cron: '0 8 * * *', recipients: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadingSubs, setLoadingSubs] = useState(false)

  const load = () => {
    setLoading(true)
    adminApi.reportSchedules().then(({ data }) => setSchedules(data || [])).catch(() => setError('Failed to load schedules')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await adminApi.createReportSchedule({
        name: form.name,
        report_type: form.report_type,
        schedule_cron: form.schedule_cron,
        recipients: form.recipients.split(',').map(r => r.trim()).filter(Boolean),
        is_active: true,
      })
      setForm({ name: '', report_type: 'attempt-summary', schedule_cron: '0 8 * * *', recipients: '' })
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create schedule')
    }
  }

  const handleDelete = async (id) => {
    await adminApi.deleteReportSchedule(id)
    load()
  }

  const handleRun = async (id) => {
    await adminApi.runReportSchedule(id)
  }

  const loadSubscribers = async () => {
    setLoadingSubs(true)
    try {
      const { data } = await adminApi.getSetting('subscribers')
      const subs = data?.value ? JSON.parse(data.value) : []
      if (subs.length === 0) { setError('No subscribers configured yet.'); return }
      const existing = form.recipients.split(',').map(r => r.trim()).filter(Boolean)
      const merged = [...new Set([...existing, ...subs])]
      setForm(f => ({ ...f, recipients: merged.join(', ') }))
      setError('')
    } catch {
      setError('Could not load subscribers.')
    } finally { setLoadingSubs(false) }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Report Builder" subtitle="Schedule automated proctoring & exam reports" />

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={handleCreate}>
          <div className={styles.sectionTitle}>Create Schedule</div>
          {error && <div className={styles.error}>{error}</div>}
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />

          <label className={styles.label}>Report Type</label>
          <select className={styles.input} value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}>
            <option value="attempt-summary">Attempt Summary</option>
            <option value="risk-alerts">Risk Alerts</option>
            <option value="usage">Usage</option>
          </select>

          <label className={styles.label}>Cron</label>
          <input className={styles.input} value={form.schedule_cron} onChange={e => setForm(f => ({ ...f, schedule_cron: e.target.value }))} />
          <div className={styles.hint}>Example: 0 8 * * * (every day at 08:00)</div>

          <label className={styles.label}>Recipients (comma separated emails)</label>
          <input className={styles.input} value={form.recipients} onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))} />
          <button type="button" className={styles.hintBtn} onClick={loadSubscribers} disabled={loadingSubs}>
            {loadingSubs ? 'Loading...' : 'Load from Subscribers list'}
          </button>
          <div className={styles.hint}>Tip: subscribers (System → Subscribers) are appended automatically on run.</div>

          <button type="submit" className={styles.btnPrimary}>Save Schedule</button>
        </form>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Scheduled Reports</div>
          {loading && <div className={styles.muted}>Loading...</div>}
          {!loading && schedules.length === 0 && <div className={styles.muted}>No schedules yet.</div>}
          <div className={styles.list}>
            {schedules.map(s => (
              <div className={styles.row} key={s.id}>
                <div>
                  <div className={styles.rowTitle}>{s.name}</div>
                  <div className={styles.rowSub}>{s.report_type} • {s.schedule_cron}</div>
                  <div className={styles.rowSub}>Recipients: {(s.recipients || []).join(', ')}</div>
                </div>
                <div className={styles.rowActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => handleRun(s.id)}>Run now</button>
                  <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(s.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
