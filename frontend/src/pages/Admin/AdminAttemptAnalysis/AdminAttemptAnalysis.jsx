import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../../../services/admin.service'
import AdminPageHeader from '../AdminPageHeader/AdminPageHeader'
import styles from './AdminAttemptAnalysis.module.scss'

const TABS = ['Overview', 'Timeline', 'Answers', 'Evidence']

export default function AdminAttemptAnalysis() {
  const [searchParams] = useSearchParams()
  const [attempts, setAttempts] = useState([])
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '')
  const [attempt, setAttempt] = useState(null)
  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('Overview')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    adminApi.attempts().then(({ data }) => setAttempts(data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    Promise.all([
      adminApi.getAttempt(selectedId),
      adminApi.getAttemptEvents(selectedId),
    ]).then(([aRes, eRes]) => {
      setAttempt(aRes.data)
      setEvents(eRes.data || [])
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedId])

  const highCount = events.filter(e => e.severity === 'HIGH').length
  const medCount = events.filter(e => e.severity === 'MEDIUM').length
  const lowCount = events.filter(e => e.severity === 'LOW').length
  const integrity = Math.max(0, 100 - highCount * 18 - medCount * 9 - lowCount * 3)

  const integrityColor = integrity >= 70 ? '#10b981' : integrity >= 40 ? '#fbbf24' : '#ef4444'

  // Heatmap: 15 buckets
  const buildHeatmap = () => {
    if (!attempt?.started_at || events.length === 0) return Array(15).fill(0)
    const start = new Date(attempt.started_at).getTime()
    const end = attempt.submitted_at ? new Date(attempt.submitted_at).getTime() : Date.now()
    const duration = end - start || 1
    const buckets = Array(15).fill(0)
    events.forEach(ev => {
      const t = new Date(ev.created_at || ev.timestamp).getTime()
      const idx = Math.min(14, Math.floor(((t - start) / duration) * 15))
      buckets[idx]++
    })
    return buckets
  }

  const heatmap = buildHeatmap()
  const maxBucket = Math.max(1, ...heatmap)

  // Group violations by type
  const violationCounts = {}
  events.forEach(ev => {
    const key = ev.event_type || 'unknown'
    if (!violationCounts[key]) violationCounts[key] = { type: key, severity: ev.severity, count: 0 }
    violationCounts[key].count++
  })

  const evidenceEvents = events.filter(e => e.meta?.evidence)

  const initials = (attempt?.user_name || attempt?.user_id || '??').slice(0, 2).toUpperCase()

  const formatTime = (iso) => {
    if (!iso || !attempt?.started_at) return '-'
    const diff = (new Date(iso) - new Date(attempt.started_at)) / 1000
    const m = Math.floor(diff / 60)
    const s = Math.floor(diff % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader title="Attempt Analysis" subtitle="Deep proctoring report" />

      <div className={styles.selector}>
        <select className={styles.select} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">Select an attempt...</option>
          {attempts.map(a => (
            <option key={a.id} value={a.id}>
              {a.exam_title || 'Exam'} - {a.user_name || a.user_id || 'User'} ({a.status})
            </option>
          ))}
        </select>
      </div>

      {loading && <div className={styles.loading}>Loading analysis...</div>}

      {!loading && attempt && (
        <>
          {/* Candidate Card */}
          <div className={styles.candidateCard}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.candidateInfo}>
              <div className={styles.candidateName}>{attempt.user_name || attempt.user_id}</div>
              <div className={styles.candidateMeta}>
                Started: {attempt.started_at ? new Date(attempt.started_at).toLocaleString() : '-'}
                {attempt.submitted_at && <> | Duration: {formatTime(attempt.submitted_at)}</>}
              </div>
            </div>
            <div className={styles.gaugeWrap}>
              <div className={styles.gaugeLabel}>Integrity</div>
              <div className={styles.gaugeValue} style={{ color: integrityColor }}>{integrity}%</div>
            </div>
          </div>

          {/* Metrics */}
          <div className={styles.metricsGrid}>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{attempt.score ?? '-'}</div>
              <div className={styles.metricLabel}>Score</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{events.length}</div>
              <div className={styles.metricLabel}>Violations</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue} style={{ color: '#ef4444' }}>{highCount}</div>
              <div className={styles.metricLabel}>High</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue} style={{ color: '#fbbf24' }}>{medCount}</div>
              <div className={styles.metricLabel}>Medium</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue} style={{ color: '#3b82f6' }}>{lowCount}</div>
              <div className={styles.metricLabel}>Low</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue} style={{ color: integrityColor }}>{integrity}%</div>
              <div className={styles.metricLabel}>Integrity</div>
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            {TABS.map(t => (
              <button
                key={t}
                className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === 'Overview' && (
            <>
              {/* Heatmap */}
              <div className={styles.heatmapWrap}>
                <div className={styles.heatmapTitle}>Activity Heatmap</div>
                <div className={styles.heatmap}>
                  {heatmap.map((val, i) => {
                    const pct = val / maxBucket
                    const color = pct > 0.7 ? '#ef4444' : pct > 0.4 ? '#fbbf24' : pct > 0 ? '#3b82f6' : 'var(--color-border)'
                    return (
                      <div
                        key={i}
                        className={styles.heatmapBar}
                        style={{ height: `${Math.max(5, pct * 100)}%`, background: color }}
                        title={`Bucket ${i + 1}: ${val} events`}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Violation Breakdown */}
              {Object.keys(violationCounts).length > 0 && (
                <table className={styles.violationsTable}>
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Severity</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(violationCounts).map(v => (
                      <tr key={v.type}>
                        <td>{v.type.replace(/_/g, ' ')}</td>
                        <td>
                          <span className={`${styles.severityBadge} ${styles['severity' + v.severity]}`}>
                            {v.severity}
                          </span>
                        </td>
                        <td>{v.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === 'Timeline' && (
            <div className={styles.timeline}>
              {events.length === 0 ? (
                <div className={styles.empty}>No events recorded.</div>
              ) : (
                events.map((ev, i) => (
                  <div key={i} className={`${styles.timelineEvent} ${styles['event' + ev.severity]}`}>
                    <div className={styles.eventTime}>{formatTime(ev.created_at || ev.timestamp)}</div>
                    <div className={styles.eventContent}>
                      <div className={styles.eventType}>
                        {ev.event_type?.replace(/_/g, ' ')}{' '}
                        <span className={`${styles.severityBadge} ${styles['severity' + ev.severity]}`}>{ev.severity}</span>
                      </div>
                      <div className={styles.eventDetail}>
                        {ev.detail || `Confidence: ${ev.confidence ?? '-'}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'Answers' && (
            <div className={styles.empty}>
              Answer review is available on the attempt result page.
            </div>
          )}

          {tab === 'Evidence' && (
            <div className={styles.evidenceGrid}>
              {evidenceEvents.length === 0 ? (
                <div className={styles.empty}>No evidence screenshots captured.</div>
              ) : (
                evidenceEvents.map((ev, i) => (
                  <div key={i} className={styles.evidenceCard}>
                    <img className={styles.evidenceImg} src={ev.meta.evidence} alt={`Evidence ${i + 1}`} />
                    <div className={styles.evidenceMeta}>
                      {ev.event_type?.replace(/_/g, ' ')} at {formatTime(ev.created_at || ev.timestamp)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {!loading && !attempt && selectedId && (
        <div className={styles.empty}>Attempt not found.</div>
      )}
    </div>
  )
}
