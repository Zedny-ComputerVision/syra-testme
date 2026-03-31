import React from 'react'
import { useNavigate } from 'react-router-dom'
import useLanguage from '../../hooks/useLanguage'
import styles from './NotFound.module.scss'

export default function NotFound() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  return (
    <div className={styles.page}>
      <div className={styles.code}>404</div>
      <p className={styles.copy}>
        {t('not_found_message')}
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className={styles.btn}
      >
        {t('not_found_go_home')}
      </button>
    </div>
  )
}
