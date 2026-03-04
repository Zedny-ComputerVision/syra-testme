import React, { useState } from 'react'
import { forgotPassword } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      await forgotPassword(email)
      setMessage('If the email exists, a reset link was sent.')
    } catch (e) {
      setMessage(e.response?.data?.detail || 'Error sending reset email')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Forgot Password</h1>
        <p className={styles.sub}>Enter your email to receive a reset link.</p>
        {message && <div className={styles.info}>{message}</div>}
        <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
      </form>
    </div>
  )
}
