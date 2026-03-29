import React from 'react'
import useAuth from '../../hooks/useAuth'
import styles from './Footer.module.scss'

export default function Footer() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isInstructor = user?.role === 'INSTRUCTOR'
  const workspaceLabel = isAdmin ? 'Admin workspace' : isInstructor ? 'Instructor workspace' : 'Learner workspace'

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
            {isAdmin || isInstructor ? 'Manage delivery, reports, and learner progress from one workspace.' : 'Keep your schedule, attempts, and upcoming tests in one place.'}
          </span>
        </div>
      </div>
    </footer>
  )
}
