import React from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import useLanguage from '../../hooks/useLanguage'
import styles from './AccessDenied.module.scss'

export default function AccessDenied() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const homePath = user?.role === 'ADMIN' ? '/admin/dashboard' : '/'

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('access_denied_title')}</h1>
        <p className={styles.body}>{t('access_denied_body')}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} to={homePath}>{t('access_denied_go_dashboard')}</Link>
          <Link className={styles.secondary} to="/profile">{t('access_denied_view_profile')}</Link>
        </div>
      </div>
    </div>
  )
}
