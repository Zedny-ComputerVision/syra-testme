import React from 'react'
import { formatPercent, formatRelativeTime, formatTime } from './dashboardConfig'
import styles from './AdminDashboard.module.scss'

export default function DashboardOperations({
  auditLog,
  flaggedAttempts,
  navigate,
  topTests,
  upcomingSchedules,
}) {
  return (
    <>
      <div className={styles.insightsGrid}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>Test performance</div>
              <h3 className={styles.panelTitle}>Most active tests</h3>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/tests')}>
              Manage tests
            </button>
          </div>
          {topTests.length === 0 ? (
            <div className={styles.empty}>Attempts will surface top tests once learners start submitting work.</div>
          ) : (
            <div className={styles.topTestsList}>
              {topTests.map((test) => {
                const riskRate = test.attempts ? Math.round((test.flagged_attempts / test.attempts) * 100) : 0
                return (
                  <button
                    key={test.exam_id}
                    type="button"
                    className={styles.topTestCard}
                    onClick={() => navigate(`/admin/tests/${test.exam_id}/manage`)}
                  >
                    <div className={styles.topTestHeader}>
                      <div>
                        <div className={styles.topTestTitle}>{test.title}</div>
                        <div className={styles.topTestMeta}>{test.attempts} attempts | {test.scored_attempts} scored</div>
                      </div>
                      <div className={styles.topTestScore}>{formatPercent(test.average_score, 1)}</div>
                    </div>
                    <div className={styles.topTestBars}>
                      <div className={styles.metricBarBlock}>
                        <div className={styles.metricBarLabel}>
                          <span>Pass rate</span>
                          <strong>{formatPercent(test.pass_rate, 0)}</strong>
                        </div>
                        <div className={styles.metricBarTrack}>
                          <span className={styles.metricBarFillPass} style={{ width: `${Math.min(test.pass_rate || 0, 100)}%` }} />
                        </div>
                      </div>
                      <div className={styles.metricBarBlock}>
                        <div className={styles.metricBarLabel}>
                          <span>Flagged attempts</span>
                          <strong>{riskRate}%</strong>
                        </div>
                        <div className={styles.metricBarTrack}>
                          <span className={styles.metricBarFillRisk} style={{ width: `${Math.min(riskRate, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className={styles.topTestFooter}>
                      <span>{test.high_risk_attempts} high-risk attempts</span>
                      <span>Open test details</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>Scheduling</div>
              <h3 className={styles.panelTitle}>Upcoming sessions</h3>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/sessions')}>
              Open sessions
            </button>
          </div>
          {upcomingSchedules.length === 0 ? (
            <div className={styles.empty}>No upcoming scheduled sessions are waiting in the queue.</div>
          ) : (
            <div className={styles.scheduleList}>
              {upcomingSchedules.map((schedule) => (
                <button
                  key={schedule.id}
                  type="button"
                  className={styles.scheduleCard}
                  onClick={() => navigate('/admin/sessions')}
                >
                  <div className={styles.scheduleTime}>
                    <strong>{formatTime(schedule.scheduled_at)}</strong>
                    <span>{formatRelativeTime(schedule.scheduled_at)}</span>
                  </div>
                  <div className={styles.scheduleBody}>
                    <div className={styles.scheduleTitle}>{schedule.test_title || schedule.exam_title || 'Test session'}</div>
                    <div className={styles.scheduleMeta}>
                      <span>{schedule.user_name || schedule.user_student_id || 'Assigned learner'}</span>
                      <span>{schedule.access_mode}</span>
                    </div>
                    {schedule.notes && <div className={styles.scheduleNotes}>{schedule.notes}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

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
