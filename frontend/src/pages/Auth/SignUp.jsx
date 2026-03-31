import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup, signupStatus } from '../../services/auth.service'
import useLanguage from '../../hooks/useLanguage'
import styles from './AuthPages.module.scss'

export default function SignUp() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [form, setForm] = useState({ email: '', name: '', user_id: '', password: '', confirmPassword: '' })
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [signupAllowed, setSignupAllowed] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState('')

  const loadSignupStatus = async () => {
    setStatusLoading(true)
    try {
      const { data } = await signupStatus()
      setSignupAllowed(Boolean(data?.allowed))
      setStatusError('')
    } catch {
      setSignupAllowed(false)
      setStatusError(t('signup_status_error'))
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    void loadSignupStatus()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (statusLoading) return
    if (statusError) {
      setMsg(statusError)
      setIsError(true)
      return
    }
    if (!signupAllowed) {
      setMsg(t('signup_disabled'))
      setIsError(true)
      return
    }
    const payload = {
      email: form.email.trim().toLowerCase(),
      name: form.name.trim(),
      user_id: form.user_id.trim(),
      password: form.password,
    }
    if (!payload.name || !payload.email || !payload.user_id) {
      setMsg(t('validation_all_fields_required'))
      setIsError(true)
      return
    }
    if (form.password.length < 8) {
      setMsg(t('validation_password_min_length'))
      setIsError(true)
      return
    }
    if (form.password !== form.confirmPassword) {
      setMsg(t('validation_passwords_mismatch'))
      setIsError(true)
      return
    }
    setLoading(true)
    setMsg('')
    setIsError(false)
    try {
      const { data } = await signup(payload)
      setMsg(data?.detail || t('signup_success'))
      setForm({ email: '', name: '', user_id: '', password: '', confirmPassword: '' })
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setMsg(err.response?.data?.detail || t('signup_failed'))
      setIsError(true)
    } finally { setLoading(false) }
  }

  const requestFormSubmit = (event) => {
    if (loading || statusLoading || !signupAllowed || statusError) return
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
      <form className={`${styles.card} ${styles.signupCard}`} onSubmit={submit}>
        <div className={styles.authEyebrow}>{t('signup_eyebrow')}</div>
        <div className={styles.signupHero}>
          <div>
            <h1 className={styles.title}>{t('signup_title')}</h1>
            <p className={styles.sub}>{t('signup_sub')}</p>
          </div>
          <div className={styles.signupHighlights}>
            <span className={styles.highlightChip}>{t('signup_chip_fast')}</span>
            <span className={styles.highlightChip}>{t('signup_chip_secure')}</span>
            <span className={styles.highlightChip}>{t('signup_chip_exam')}</span>
          </div>
        </div>
        <div className={styles.heroNote}>
          {t('signup_hero_note')}
        </div>
        {statusLoading && <div className={styles.info}>{t('signup_checking_availability')}</div>}
        {statusError && <div className={styles.error}>{statusError}</div>}
        {!statusLoading && !statusError && !signupAllowed && <div className={styles.error}>{t('signup_disabled')}</div>}
        {msg && <div className={isError ? styles.error : styles.info}>{msg}</div>}
        <div className={styles.formStack}>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>{t('signup_full_name')}</span>
            <input className={styles.input} placeholder={t('signup_full_name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
          </label>
          <div className={styles.gridTwo}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('email')}</span>
              <input className={styles.input} type="email" placeholder={t('email')} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('signup_student_id')}</span>
              <input className={styles.input} placeholder={t('signup_student_id')} value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
            </label>
          </div>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>{t('password')}</span>
            <input className={styles.input} type="password" placeholder={t('password')} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>{t('signup_confirm_password')}</span>
            <input className={styles.input} type="password" placeholder={t('signup_confirm_password')} value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
          </label>
        </div>
        <div className={styles.helperPanel}>
          <div className={styles.helperTitle}>{t('signup_before_continue')}</div>
          <div className={styles.helperText}>{t('signup_helper_text')}</div>
        </div>
        <button className={styles.btn} type="button" disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} onClick={requestFormSubmit}>{loading ? t('signup_creating') : t('signup_button')}</button>
        {(statusError || !signupAllowed) && (
          <button className={styles.secondaryBtn} type="button" onClick={() => void loadSignupStatus()} disabled={statusLoading || loading}>
            {statusLoading ? t('signup_checking') : t('signup_retry_check')}
          </button>
        )}
        <p className={styles.loginLink}>{t('signup_have_account')} <Link to="/login" className={styles.link}>{t('login')}</Link></p>
      </form>
    </main>
  )
}
