import React from 'react'
import useLanguage from '../../../hooks/useLanguage'
import styles from './AdminDashboard.module.scss'

export function ChartTooltip({ active, payload, label, formatter = (value) => value }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.chartTooltip}>
      {label && <div className={styles.chartTooltipLabel}>{label}</div>}
      {payload.map((entry) => (
        <div key={`${entry.name}-${entry.dataKey}`} className={styles.chartTooltipRow}>
          <span className={styles.chartTooltipDot} style={{ backgroundColor: entry.color }} />
          <span>{entry.name}</span>
          <strong>{formatter(entry.value, entry.name)}</strong>
        </div>
      ))}
    </div>
  )
}

export function ChartEmpty({ title }) {
  const { t } = useLanguage()
  return (
    <div className={styles.chartEmpty}>
      <div className={styles.chartEmptyTitle}>{title}</div>
      <div className={styles.chartEmptyText}>{t('admin_dash_charts_empty_analytics_message')}</div>
    </div>
  )
}
