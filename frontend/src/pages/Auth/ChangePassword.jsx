import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { changePassword } from '../../services/auth.service'
import useLanguage from '../../hooks/useLanguage'
import styles from './AuthPages.module.scss'

export default function ChangePassword() {
  const { t } = useLanguage()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (next.length < 8) {
      setError(t('validation_password_min_length'))
      setSuccess('')
      return
    }
    if (next !== confirmNext) {
      setError(t('validation_passwords_mismatch'))
      setSuccess('')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await changePassword(current, next)
      setSuccess(t('change_pwd_success'))
      setCurrent('')
      setNext('')
      setConfirmNext('')
    } catch (e) {
      setError(e.response?.data?.detail || t('change_pwd_failed'))
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>{t('change_pwd_title')}</h1>
        {success && <div className={styles.info}>{success}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <input className={styles.input} type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder={t('change_pwd_current')} required disabled={loading} aria-label={t('change_pwd_current')} />
        <input className={styles.input} type="password" value={next} onChange={e => setNext(e.target.value)} placeholder={t('change_pwd_new')} required disabled={loading} aria-label={t('change_pwd_new')} />
        <input className={styles.input} type="password" value={confirmNext} onChange={e => setConfirmNext(e.target.value)} placeholder={t('change_pwd_confirm_new')} required disabled={loading} aria-label={t('change_pwd_confirm_new')} />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? t('change_pwd_updating') : t('change_pwd_button')}</button>
        <p className={styles.loginLink}>{t('change_pwd_back_to')} <Link className={styles.link} to="/profile">{t('profile')}</Link></p>
      </form>
    </div>
  )
}
