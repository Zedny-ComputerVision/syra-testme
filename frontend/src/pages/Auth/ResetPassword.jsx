import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../services/auth.service'
import useLanguage from '../../hooks/useLanguage'
import styles from './AuthPages.module.scss'

export default function ResetPassword() {
  const { t } = useLanguage()
  const [params] = useSearchParams()
  const tokenParam = params.get('token') || ''
  const [token, setToken] = useState(tokenParam)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!token.trim()) {
      setError(t('reset_pwd_token_required'))
      setSuccess('')
      return
    }
    if (password.length < 8) {
      setError(t('validation_password_min_length'))
      setSuccess('')
      return
    }
    if (password !== confirmPassword) {
      setError(t('validation_passwords_mismatch'))
      setSuccess('')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await resetPassword(token, password)
      setSuccess(t('reset_pwd_success'))
      setPassword('')
      setConfirmPassword('')
    } catch (e) {
      setError(e.response?.data?.detail || t('reset_pwd_failed'))
    } finally { setLoading(false) }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>{t('reset_pwd_title')}</h1>
        {success && <div className={styles.info}>{success}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <input className={styles.input} value={token} onChange={e => setToken(e.target.value)} placeholder={t('reset_pwd_token_placeholder')} required disabled={loading} aria-label={t('reset_pwd_token_placeholder')} />
        <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('change_pwd_new')} required disabled={loading} aria-label={t('change_pwd_new')} />
        <input className={styles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('change_pwd_confirm_new')} required disabled={loading} aria-label={t('change_pwd_confirm_new')} />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? t('reset_pwd_resetting') : t('reset_pwd_button')}</button>
        <p className={styles.loginLink}>{t('forgot_back_to')} <Link className={styles.link} to="/login">{t('login')}</Link></p>
      </form>
    </main>
  )
}
