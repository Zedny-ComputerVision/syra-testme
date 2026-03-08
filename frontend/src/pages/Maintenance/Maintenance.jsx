import React from 'react'
import styles from './Maintenance.module.scss'

export default function Maintenance() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Maintenance in progress</h1>
        <p className={styles.copy}>Please check back soon.</p>
      </div>
    </div>
  )
}
