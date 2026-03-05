import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jwtDecode } from 'jwt-decode'
import { login as loginApi } from '../../services/auth.service'
import useAuth from '../../hooks/useAuth'
import styles from './Login.module.scss'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await loginApi(email, password)
      login(data)
      const role = data?.access_token ? jwtDecode(data.access_token)?.role : null
      if (role === 'ADMIN' || role === 'INSTRUCTOR') {
        navigate('/admin/dashboard')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="#10b981" />
              <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle"
                fill="#fff" fontSize="22" fontWeight="800" fontFamily="system-ui">S</text>
            </svg>
          </div>
          <h1 className={styles.title}>SYRA LMS</h1>
          <p className={styles.subtitle}>Sign in to your account</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} disabled={loading} required autoFocus />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" placeholder="Enter password" value={password}
            onChange={(e) => setPassword(e.target.value)} disabled={loading} required />
        </div>

        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? <div className={styles.spinner} /> : 'Sign In'}
        </button>

        <p className={styles.hint}>
          Demo users:&nbsp;
          <code>admin@example.com</code> / <code>Admin1234!</code>&nbsp;|&nbsp;
          <code>student1@example.com</code> / <code>Student1234!</code>&nbsp;|&nbsp;
          <code>instructor@example.com</code> / <code>Instructor1234!</code>
        </p>
      </form>
    </div>
  )
}
