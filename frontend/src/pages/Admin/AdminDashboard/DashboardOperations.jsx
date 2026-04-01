import React from 'react'
import { formatPercent, formatRelativeTime, formatTime } from './dashboardConfig'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminDashboard.module.scss'

export default function DashboardOperations({
  auditLog,
  flaggedAttempts,
  navigate,
  funnelStats,
}) {
  const { t } = useLanguage()
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
      label: t('admin_dash_ops_learners'),
      sub: t('admin_dash_ops_registered_on_platform'),
      value: totalLearners,
      colorClass: styles.funnelFillBlue,
      dotClass: styles.funnelDotBlue,
    },
    {
      key: 'attempts',
      label: t('admin_dash_ops_attempts_started'),
      sub: t('admin_dash_ops_tests_begun_by_learners'),
      value: totalAttempts,
      colorClass: styles.funnelFillCyan,
      dotClass: styles.funnelDotCyan,
    },
    {
      key: 'completed',
      label: t('admin_dash_ops_completed'),
      sub: t('admin_dash_ops_attempts_fully_submitted'),
      value: completedAttempts,
      colorClass: styles.funnelFillGreen,
      dotClass: styles.funnelDotGreen,
    },
    {
      key: 'passed',
      label: t('admin_dash_ops_passed'),
      sub: t('admin_dash_ops_met_passing_threshold'),
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
            <div className={styles.panelEyebrow}>{t('admin_dash_ops_learner_journey')}</div>
            <h3 className={styles.panelTitle}>{t('admin_dash_ops_conversion_funnel')}</h3>
          </div>
          <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/reports')}>
            {t('admin_dash_ops_view_reports')}
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
                      {conversionRate != null ? `${conversionRate}% ${t('admin_dash_ops_conversion')}` : '—'}
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
            <span className={styles.funnelSummaryLbl}>{t('admin_dash_ops_learner_to_attempt')}</span>
          </div>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{totalAttempts > 0 ? `${Math.round((completedAttempts / totalAttempts) * 100)}%` : '—'}</span>
            <span className={styles.funnelSummaryLbl}>{t('admin_dash_ops_attempt_to_completion')}</span>
          </div>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{formatPercent(passRate, 1)}</span>
            <span className={styles.funnelSummaryLbl}>{t('admin_dash_ops_completion_to_pass')}</span>
          </div>
          <div className={styles.funnelSummaryItem}>
            <span className={styles.funnelSummaryVal}>{awaitingReview}</span>
            <span className={styles.funnelSummaryLbl}>{t('admin_dash_ops_awaiting_review')}</span>
          </div>
        </div>
      </section>

      <div className={styles.tablesGrid}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>{t('admin_dash_ops_needs_attention')}</div>
              <h3 className={styles.panelTitle}>{t('admin_dash_ops_flagged_attempts')}</h3>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/candidates')}>
              {t('admin_dash_ops_review_queue')}
            </button>
          </div>
          {flaggedAttempts.length === 0 ? (
            <div className={styles.empty}>{t('admin_dash_ops_no_flagged_attempts')}</div>
          ) : (
            <div className={styles.flaggedList}>
              {flaggedAttempts.map((attempt) => (
                <div key={attempt.id} className={styles.flaggedCard}>
                  <div className={styles.flaggedMain}>
                    <div className={styles.flaggedTitle}>{attempt.test_title || t('admin_dash_ops_test_attempt')}</div>
                    <div className={styles.flaggedMeta}>
                      <span>{attempt.user_name || attempt.user_student_id || t('admin_dash_ops_learner')}</span>
                      <span>{attempt.status}</span>
                      {attempt.score != null && <span>{formatPercent(attempt.score, 0)}</span>}
                    </div>
                  </div>
                  <div className={styles.flaggedStats}>
                    <span className={`${styles.riskBadge} ${attempt.risk_level === 'HIGH' ? styles.riskBadgeHigh : styles.riskBadgeMedium}`}>
                      {attempt.risk_level} {t('admin_dash_ops_risk')}
                    </span>
                    <span className={styles.flaggedIntegrity}>{attempt.integrity_score}% {t('admin_dash_ops_integrity')}</span>
                    <span className={styles.flaggedViolations}>{attempt.high_violations} {t('admin_dash_ops_high')} / {attempt.med_violations} {t('admin_dash_ops_medium')}</span>
                  </div>
                  <div className={styles.flaggedActions}>
                    <span className={styles.flaggedWhen}>{formatRelativeTime(attempt.submitted_at || attempt.started_at)}</span>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => navigate(`/admin/attempt-analysis?id=${attempt.id}`)}
                    >
                      {t('admin_dash_ops_open_analysis')}
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
              <div className={styles.panelEyebrow}>{t('admin_dash_ops_audit_feed')}</div>
              <h3 className={styles.panelTitle}>{t('admin_dash_ops_recent_activity')}</h3>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/admin/audit-log')}>
              {t('admin_dash_ops_view_all')}
            </button>
          </div>
          {auditLog.length === 0 ? (
            <div className={styles.empty}>{t('admin_dash_ops_no_audit_activity')}</div>
          ) : (
            <div className={styles.activityList}>
              {auditLog.map((log, index) => (
                <div key={`${log.id || log.created_at || index}`} className={styles.activityItem}>
                  <div className={styles.activityDot} />
                  <div className={styles.activityBody}>
                    <div className={styles.activityAction}>{log.action || log.event_type || t('admin_dash_ops_activity')}</div>
                    <div className={styles.activityMeta}>
                      <span>{log.resource_type || log.user_id || t('admin_dash_ops_platform_event')}</span>
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
