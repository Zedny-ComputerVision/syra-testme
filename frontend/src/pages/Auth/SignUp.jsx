import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup, signupStatus } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function SignUp() {
  const navigate = useNavigate()
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
      setStatusError('Unable to verify self-registration availability right now. Please try again later.')
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
      setMsg('Self-registration is currently disabled.')
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
      setMsg('All fields are required.')
      setIsError(true)
      return
    }
    if (form.password.length < 8) {
      setMsg('Password must be at least 8 characters.')
      setIsError(true)
      return
    }
    if (form.password !== form.confirmPassword) {
      setMsg('Passwords do not match.')
      setIsError(true)
      return
    }
    setLoading(true)
    setMsg('')
    setIsError(false)
    try {
      const { data } = await signup(payload)
      setMsg(data?.detail || 'Account created! You can now log in.')
      setForm({ email: '', name: '', user_id: '', password: '', confirmPassword: '' })
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Signup failed')
      setIsError(true)
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Create Account</h1>
        <p className={styles.sub}>Self-registration (Learner)</p>
        {statusLoading && <div className={styles.info}>Checking self-registration availability...</div>}
        {statusError && <div className={styles.error}>{statusError}</div>}
        {!statusLoading && !statusError && !signupAllowed && <div className={styles.error}>Self-registration is currently disabled.</div>}
        {msg && <div className={isError ? styles.error : styles.info}>{msg}</div>}
        <input className={styles.input} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
        <input className={styles.input} type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
        <input className={styles.input} placeholder="Student ID / Username" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
        <input className={styles.input} type="password" placeholder="Password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
        <input className={styles.input} type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} required disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)} />
        <button className={styles.btn} type="submit" disabled={loading || !signupAllowed || statusLoading || Boolean(statusError)}>{loading ? 'Creating...' : 'Sign Up'}</button>
        {(statusError || !signupAllowed) && (
          <button className={styles.secondaryBtn} type="button" onClick={() => void loadSignupStatus()} disabled={statusLoading || loading}>
            {statusLoading ? 'Checking...' : 'Retry availability check'}
          </button>
        )}
        <p className={styles.loginLink}>Already have an account? <Link to="/login" className={styles.link}>Log in</Link></p>
      </form>
    </div>
  )
}
