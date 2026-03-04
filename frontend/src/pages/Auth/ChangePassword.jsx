import React, { useState } from 'react'
import { changePassword } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      await changePassword(current, next)
      setMsg('Password updated')
      setCurrent(''); setNext('')
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Update failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Change Password</h1>
        {msg && <div className={styles.info}>{msg}</div>}
        <input className={styles.input} type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Current password" required />
        <input className={styles.input} type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="New password" required />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Updating...' : 'Update Password'}</button>
      </form>
    </div>
  )
}
