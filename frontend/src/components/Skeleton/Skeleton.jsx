import React from 'react'
import styles from './Skeleton.module.scss'

function TextSkeleton({ lines = 1 }) {
  return (
    <div className={styles.stack}>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={`${styles.block} ${styles.text}`}
          style={{ width: index === lines - 1 && lines > 1 ? '72%' : '100%' }}
        />
      ))}
    </div>
  )
}

function TableSkeleton({ rows = 5 }) {
  return (
    <div className={styles.table}>
      <div className={styles.tableHeader}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={`${styles.block} ${styles.tableCell} ${styles.tableHeaderCell}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className={styles.tableRow}>
          {Array.from({ length: 5 }, (_, cellIndex) => (
            <span key={cellIndex} className={`${styles.block} ${styles.tableCell}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Skeleton({ variant = 'text', lines = 1, rows = 5, className = '' }) {
  if (variant === 'card') {
    return <div className={`${styles.block} ${styles.card} ${className}`.trim()} aria-hidden="true" />
  }

  if (variant === 'table') {
    return (
      <div className={className} aria-hidden="true">
        <TableSkeleton rows={rows} />
      </div>
    )
  }

  return (
    <div className={className} aria-hidden="true">
      <TextSkeleton lines={lines} />
    </div>
  )
}
