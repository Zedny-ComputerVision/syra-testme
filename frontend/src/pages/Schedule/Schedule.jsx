import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSchedules } from '../../services/schedule.service'
import { normalizeSchedule } from '../../utils/assessmentAdapters'
import styles from './Schedule.module.scss'

function getCountdown(scheduledAt) {
  const diff = new Date(scheduledAt) - new Date()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${mins}m`
  return `in ${mins}m`
}

export default function Schedule() {
  const navigate = useNavigate()
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tick, setTick] = useState(0)
  const intervalRef = useRef(null)

  const loadSchedules = async () => {
    setLoading(true)
    try {
      const { data } = await listSchedules()
      setSchedules((data || []).map(normalizeSchedule))
      setError('')
    } catch {
      setError('Failed to load schedule.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSchedules()
    intervalRef.current = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const now = new Date()
  const filtered = schedules.filter(s => {
    const q = search.toLowerCase()
    return !q || (s.test_title || s.exam_title || '').toLowerCase().includes(q)
  })
  const upcoming = filtered
    .filter(s => new Date(s.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
  const past = filtered
    .filter(s => new Date(s.scheduled_at) < now)
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))

  const formatDate = (iso) => {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h2 className={styles.title}>Test Schedule</h2>
        </div>
        <div className={styles.loading}>Loading schedules...</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.title}>Test Schedule</h2>
        {schedules.length > 0 && (
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search tests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {error && (
        <div className={styles.errorRow}>
          <div className={styles.error}>{error}</div>
          <button type="button" className={styles.secondaryBtn} onClick={() => void loadSchedules()} disabled={loading}>
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {!error && schedules.length === 0 && (
        <div className={styles.empty}>No scheduled tests.</div>
      )}
      {!error && schedules.length > 0 && filtered.length === 0 && search && (
        <div className={styles.empty}>No tests match your search.</div>
      )}
      {!error && schedules.length > 0 && (
        <>
          {upcoming.length > 0 && (
            <>
              <div className={styles.sectionLabel}>
                Upcoming
                <span className={styles.sectionCount}>{upcoming.length}</span>
              </div>
              <div className={styles.list}>
                {upcoming.map(s => {
                  const startsAt = new Date(s.scheduled_at)
                  const canStart = Boolean(s.exam_id) && startsAt <= now
                  const countdown = getCountdown(s.scheduled_at)
                  return (
                    <div key={s.id} className={styles.card}>
                      <div className={styles.cardLeft}>
                        <span className={styles.examTitle}>{s.test_title || s.exam_title || 'Test'}</span>
                        <div className={styles.cardMeta}>
                          <span className={styles.dateText}>{formatDate(s.scheduled_at)}</span>
                          {countdown && <span className={styles.countdownChip}>{countdown}</span>}
                        </div>
                        {s.notes && <span className={styles.notesText}>{s.notes}</span>}
                      </div>
                      <div className={styles.cardRight}>
                        <span className={`${styles.modeBadge} ${s.access_mode === 'OPEN' ? styles.modeOpen : styles.modeScheduled}`}>
                          {s.access_mode || 'Scheduled'}
                        </span>
                        {canStart ? (
                          <button
                            type="button"
                            className={styles.takeBtn}
                            onClick={() => navigate(`/tests/${s.exam_id}`)}
                          >
                            Take Test
                          </button>
                        ) : s.exam_id ? (
                          <button className={`${styles.takeBtn} ${styles.takeBtnDisabled}`} type="button" disabled>
                            Starts at scheduled time
                          </button>
                        ) : (
                          <span className={styles.helperText}>Not linked</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <div className={styles.sectionLabel}>
                Past
                <span className={styles.sectionCount}>{past.length}</span>
              </div>
              <div className={styles.list}>
                {past.map(s => (
                  <div key={s.id} className={`${styles.card} ${styles.pastCard}`}>
                    <div className={styles.cardLeft}>
                      <span className={styles.examTitle}>{s.test_title || s.exam_title || 'Test'}</span>
                      <span className={styles.dateText}>{formatDate(s.scheduled_at)}</span>
                    </div>
                    <span className={`${styles.modeBadge} ${styles.modePast}`}>
                      Past
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
