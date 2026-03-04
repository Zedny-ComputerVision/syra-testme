import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const tokenParam = params.get('token') || ''
  const [token, setToken] = useState(tokenParam)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      await resetPassword(token, password)
      setMsg('Password reset successful. You can now log in.')
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Reset failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Reset Password</h1>
        {msg && <div className={styles.info}>{msg}</div>}
        <input className={styles.input} value={token} onChange={e => setToken(e.target.value)} placeholder="Reset token" required />
        <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" required />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
      </form>
    </div>
  )
}
