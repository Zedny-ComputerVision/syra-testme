import React from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './NotFound.module.scss'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className={styles.page}>
      <div className={styles.code}>404</div>
      <p className={styles.copy}>
        The page you're looking for doesn't exist.
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className={styles.btn}
      >
        Go Home
      </button>
    </div>
  )
}
