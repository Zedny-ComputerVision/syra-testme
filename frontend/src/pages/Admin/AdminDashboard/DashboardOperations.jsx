import React from 'react'
import { formatPercent, formatRelativeTime, formatTime } from './dashboardConfig'
import styles from './AdminDashboard.module.scss'

export default function DashboardOperations({
  auditLog,
  flaggedAttempts,
  navigate,
  funnelStats,
}) {
  const {
    totalLearners = 0,
    totalAttempts = 0,
    completedAttempts = 0,
    passRate = 0,
    awaitingReview = 0,
  } = funnelStats || {}

  const passed = Math.round(completedAttempts * (passRate / 100))
  const maxVal = Math.max(totalLearners, totalAttempts, completedAttempts, passed, 1)

  const stages = [
    {
      key: 'learners',
      label: 'Learners',
      sub: 'Registered on platform',
      value: totalLearners,
      colorClass: styles.funnelFillBlue,
      dotClass: styles.funnelDotBlue,
    },
    {
      key: 'attempts',
      label: 'Attempts started',
      sub: 'Tests begun by learners',
      value: totalAttempts,
      colorClass: styles.funnelFillCyan,
      dotClass: styles.funnelDotCyan,
    },
    {
      key: 'completed',
      label: 'Completed',
      sub: 'Attempts fully submitted',
      value: completedAttempts,
      colorClass: styles.funnelFillGreen,
      dotClass: styles.funnelDotGreen,
    },
    {
      key: 'passed',
      label: 'Passed',
      sub: 'Met the passing threshold',
      value: passed,
      colorClass: styles.funnelFillAmber,
      dotClass: styles.funnelDotAmber,
    },
  ]

  return (
    <>
      <section className={`${styles.panelCard} ${styles.funnelPanel}`}>
        <div className={styles.panelHeader}>
          <div>
            <div className={styles.panelEyebrow}>Learner journey</div>
            <h3 className={styles.panelTitle}>Conversion Funnel</h3>
          </div>
          <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/reports')}>
            View reports
          </button>
        </div>

        <div className={styles.funnelBody}>
          {stages.map((stage, i) => {
            const prev = stages[i - 1]
            const conversionRate = prev && prev.value > 0
              ? Math.round((stage.value / prev.value) * 100)
              : null
            const barWidth = Math.round((stage.value / maxVal) * 100)

            return (
              <div key={stage.key} className={styles.funnelStage}>
                {i > 0 && (
                  <div className={styles.funnelConnector}>
                    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
                      <path d="M5 0v10M1 7l4 5 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className={conversionRate != null && conversionRate < 30 ? styles.funnelRateLow : styles.funnelRateOk}>
                      {conversionRate != null ? `${conversionRate}% conversion` : '—'}
                    </span>
                  </div>
                )}
                <div className={styles.funnelRow}>
                  <div className={styles.funnelMeta}>
                    <span className={`${styles.funnelDot} ${stage.dotClass}`} />
                    <div>
                      <div className={styles.funnelLabel}>{stage.label}</div>
                      <div className={styles.funnelSub}>{stage.sub}</div>
                    </div>
                  </div>
                  <div className={styles.funnelBarWrap}>
                    <div className={styles.funnelBarTrack}>
                      <div
                        className={`${styles.funnelBarFill} ${stage.colorClass}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <div className={styles.funnelCount}>{stage.value.toLocaleString()}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.funnelSummary}>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{totalLearners > 0 ? `${Math.round((totalAttempts / totalLearners) * 100)}%` : '—'}</span>
            <span className={styles.funnelSummaryLbl}>Learner → Attempt</span>
          </div>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{totalAttempts > 0 ? `${Math.round((completedAttempts / totalAttempts) * 100)}%` : '—'}</span>
            <span className={styles.funnelSummaryLbl}>Attempt → Completion</span>
          </div>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{formatPercent(passRate, 1)}</span>
            <span className={styles.funnelSummaryLbl}>Completion → Pass</span>
          </div>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{awaitingReview}</span>
            <span className={styles.funnelSummaryLbl}>Awaiting review</span>
          </div>
        </div>
      </section>

      <div className={styles.tablesGrid}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>Needs attention</div>
              <h3 className={styles.panelTitle}>Flagged attempts</h3>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/candidates')}>
              Review queue
            </button>
          </div>
          {flaggedAttempts.length === 0 ? (
            <div className={styles.empty}>No flagged attempts are waiting right now.</div>
          ) : (
            <div className={styles.flaggedList}>
              {flaggedAttempts.map((attempt) => (
                <div key={attempt.id} className={styles.flaggedCard}>
                  <div className={styles.flaggedMain}>
                    <div className={styles.flaggedTitle}>{attempt.test_title || 'Test attempt'}</div>
                    <div className={styles.flaggedMeta}>
                      <span>{attempt.user_name || attempt.user_student_id || 'Learner'}</span>
                      <span>{attempt.status}</span>
                      {attempt.score != null && <span>{formatPercent(attempt.score, 0)}</span>}
                    </div>
                  </div>
                  <div className={styles.flaggedStats}>
                    <span className={`${styles.riskBadge} ${attempt.risk_level === 'HIGH' ? styles.riskBadgeHigh : styles.riskBadgeMedium}`}>
                      {attempt.risk_level} RISK
                    </span>
                    <span className={styles.flaggedIntegrity}>{attempt.integrity_score}% integrity</span>
                    <span className={styles.flaggedViolations}>{attempt.high_violations} high / {attempt.med_violations} medium</span>
                  </div>
                  <div className={styles.flaggedActions}>
                    <span className={styles.flaggedWhen}>{formatRelativeTime(attempt.submitted_at || attempt.started_at)}</span>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}
                    >
                      Open analysis
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>Audit feed</div>
              <h3 className={styles.panelTitle}>Recent activity</h3>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/audit-log')}>
              View all
            </button>
          </div>
          {auditLog.length === 0 ? (
            <div className={styles.empty}>No recent audit activity has been recorded yet.</div>
          ) : (
            <div className={styles.activityList}>
              {auditLog.map((log, index) => (
                <div key={`${log.id || log.created_at || index}`} className={styles.activityItem}>
                  <div className={styles.activityDot} />
                  <div className={styles.activityBody}>
                    <div className={styles.activityAction}>{log.action || log.event_type || 'Activity'}</div>
                    <div className={styles.activityMeta}>
                      <span>{log.resource_type || log.user_id || 'Platform event'}</span>
                      <span>{formatTime(log.created_at)}</span>
                    </div>
                    {log.detail && <div className={styles.activityDetail}>{log.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
