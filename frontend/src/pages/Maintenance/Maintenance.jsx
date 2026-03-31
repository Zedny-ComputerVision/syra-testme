import React from 'react'
import useLanguage from '../../hooks/useLanguage'
import styles from './Maintenance.module.scss'

export default function Maintenance() {
  const { t } = useLanguage()
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('maintenance_title')}</h1>
        <p className={styles.copy}>{t('maintenance_check_back')}</p>
      </div>
    </div>
  )
}
