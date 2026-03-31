import React from 'react'
import useAuth from '../../hooks/useAuth'
import useLanguage from '../../hooks/useLanguage'
import styles from './Footer.module.scss'

export default function Footer() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const isAdmin = user?.role === 'ADMIN'
  const isInstructor = user?.role === 'INSTRUCTOR'
  const workspaceLabel = isAdmin ? t('footer_admin_workspace') : isInstructor ? t('footer_instructor_workspace') : t('footer_learner_workspace')

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <div className={styles.metaRow}>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden="true" />
              {workspaceLabel}
            </span>
          </div>
          <span className={styles.copyright}>syra &copy; {new Date().getFullYear()}</span>
          <span className={styles.caption}>
            {isAdmin || isInstructor ? t('footer_admin_desc') : t('footer_learner_desc')}
          </span>
        </div>
      </div>
    </footer>
  )
}
