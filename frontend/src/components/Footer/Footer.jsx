import React from 'react'
import useAuth from '../../hooks/useAuth'
import PrefetchLink from '../common/PrefetchLink/PrefetchLink'
import styles from './Footer.module.scss'

export default function Footer() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isInstructor = user?.role === 'INSTRUCTOR'
  const workspaceLabel = isAdmin ? 'Admin workspace' : isInstructor ? 'Instructor workspace' : 'Learner workspace'
  const links = isAdmin || isInstructor
    ? [
        { to: isAdmin ? '/admin/dashboard' : '/', label: 'Dashboard' },
        { to: '/admin/tests', label: 'Tests' },
        { to: '/admin/candidates', label: 'Candidates' },
        { to: '/profile', label: 'Profile' },
      ]
    : [
        { to: '/', label: 'Dashboard' },
        { to: '/tests', label: 'Tests' },
        { to: '/attempts', label: 'Attempts' },
        { to: '/schedule', label: 'Schedule' },
      ]

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
          <span className={styles.copyright}>SYRA LMS &copy; {new Date().getFullYear()}</span>
          <span className={styles.caption}>
            {isAdmin || isInstructor ? 'Manage delivery, reports, and learner progress from one workspace.' : 'Keep your schedule, attempts, and upcoming tests in one place.'}
          </span>
        </div>
        <nav className={styles.linkRow} aria-label="Footer links">
          {links.map((link) => (
            <PrefetchLink key={link.to} to={link.to} className={styles.footerLink}>
              {link.label}
            </PrefetchLink>
          ))}
        </nav>
      </div>
    </footer>
  )
}
