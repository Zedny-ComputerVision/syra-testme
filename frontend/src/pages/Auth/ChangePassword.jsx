import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { changePassword } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (next.length < 8) {
      setError('Password must be at least 8 characters.')
      setSuccess('')
      return
    }
    if (next !== confirmNext) {
      setError('Passwords do not match.')
      setSuccess('')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await changePassword(current, next)
      setSuccess('Password updated.')
      setCurrent('')
      setNext('')
      setConfirmNext('')
    } catch (e) {
      setError(e.response?.data?.detail || 'Update failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Change Password</h1>
        {success && <div className={styles.info}>{success}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <input className={styles.input} type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Current password" required disabled={loading} />
        <input className={styles.input} type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="New password" required disabled={loading} />
        <input className={styles.input} type="password" value={confirmNext} onChange={e => setConfirmNext(e.target.value)} placeholder="Confirm new password" required disabled={loading} />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Updating...' : 'Update Password'}</button>
        <p className={styles.loginLink}>Back to <Link className={styles.link} to="/profile">profile</Link></p>
      </form>
    </div>
  )
}
