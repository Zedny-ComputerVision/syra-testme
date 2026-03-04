import React, { useState } from 'react'
import { signup } from '../../services/auth.service'
import styles from './AuthPages.module.scss'

export default function SignUp() {
  const [form, setForm] = useState({ email: '', name: '', user_id: '', password: '' })
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      const { data } = await signup(form)
      setMsg(data?.detail || 'Signup successful. Please log in.')
      setForm({ email: '', name: '', user_id: '', password: '' })
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Signup failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Create Account</h1>
        <p className={styles.sub}>Self-registration (Learner)</p>
        {msg && <div className={styles.info}>{msg}</div>}
        <input className={styles.input} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <input className={styles.input} type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <input className={styles.input} placeholder="Student ID / Username" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} required />
        <input className={styles.input} type="password" placeholder="Password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
        <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Creating...' : 'Sign Up'}</button>
      </form>
    </div>
  )
}
