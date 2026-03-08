import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function ResetPassword() {
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
      setError('Reset token is required.')
      setSuccess('')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setSuccess('')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setSuccess('')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await resetPassword(token, password)
      setSuccess('Password reset successful. You can now log in.')
      setPassword('')
      setConfirmPassword('')
    } catch (e) {
      setError(e.response?.data?.detail || 'Reset failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Reset Password</h1>
        {success && <div className={styles.info}>{success}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <input className={styles.input} value={token} onChange={e => setToken(e.target.value)} placeholder="Reset token" required disabled={loading} />
        <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" required disabled={loading} />
        <input className={styles.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required disabled={loading} />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
        <p className={styles.loginLink}>Back to <Link className={styles.link} to="/login">login</Link></p>
      </form>
    </div>
  )
}
