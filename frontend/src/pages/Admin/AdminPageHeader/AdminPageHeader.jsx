import React from 'react'
import styles from './AdminPageHeader.module.scss'

export default function AdminPageHeader({ title, subtitle, children }) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  )
}
