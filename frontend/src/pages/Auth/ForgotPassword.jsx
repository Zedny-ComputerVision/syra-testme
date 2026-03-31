import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../services/auth.service'
import useLanguage from '../../hooks/useLanguage'
import styles from './AuthPages.module.scss'

export default function ForgotPassword() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSuccess('')
    setError('')
    try {
      await forgotPassword(email)
      setSuccess(t('forgot_success'))
    } catch (e) {
      setError(e.response?.data?.detail || t('forgot_error'))
    } finally { setLoading(false) }
  }

  const requestFormSubmit = (event) => {
    if (loading) return
    const form = event.currentTarget.form
    if (!form) return
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit()
      return
    }
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>{t('forgot_title')}</h1>
        <p className={styles.sub}>{t('forgot_subtitle')}</p>
        {success && <div className={styles.info}>{success}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login_email_placeholder')} required disabled={loading} aria-label={t('forgot_email_aria')} />
        <button className={styles.btn} type="button" disabled={loading} onClick={requestFormSubmit}>{loading ? t('forgot_sending') : t('forgot_send_link')}</button>
        <p className={styles.loginLink}>{t('forgot_back_to')} <Link className={styles.link} to="/login">{t('login')}</Link></p>
      </form>
    </main>
  )
}
