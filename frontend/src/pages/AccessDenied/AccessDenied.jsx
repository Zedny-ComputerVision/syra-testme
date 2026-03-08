import React from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import styles from './AccessDenied.module.scss'

export default function AccessDenied() {
  const { user } = useAuth()
  const homePath = user?.role === 'ADMIN' ? '/admin/dashboard' : '/'

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Access Denied</h1>
        <p className={styles.body}>Your account does not have permission to open this page.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} to={homePath}>Go to dashboard</Link>
          <Link className={styles.secondary} to="/profile">View profile</Link>
        </div>
      </div>
    </div>
  )
}
