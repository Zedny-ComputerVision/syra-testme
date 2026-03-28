import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function ForgotPassword() {
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
      setSuccess('If the email exists, a reset link was sent.')
    } catch (e) {
      setError(e.response?.data?.detail || 'Error sending reset email')
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
        <h1 className={styles.title}>Forgot Password</h1>
        <p className={styles.sub}>Enter your email to receive a reset link.</p>
        {success && <div className={styles.info}>{success}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required disabled={loading} />
        <button className={styles.btn} type="button" disabled={loading} onClick={requestFormSubmit}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
        <p className={styles.loginLink}>Back to <Link className={styles.link} to="/login">login</Link></p>
      </form>
    </main>
  )
}
