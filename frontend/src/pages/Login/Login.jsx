import React, { useState } from 'react'
import axios from 'axios'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { jwtDecode } from 'jwt-decode'
import { login as loginApi, setup as setupAdminApi } from '../../services/auth.service'
import useAuth from '../../hooks/useAuth'
import { resolvePostLoginPath } from '../../utils/postLoginRedirect'
import styles from './Login.module.scss'

const apiBaseURL = (import.meta.env.VITE_API_BASE_URL || '/api/').replace(/\/?$/, '/')

function resolveApiUrl(path) {
  return new URL(path, new URL(apiBaseURL, window.location.origin)).toString()
}

const DEV_USERS = {
  admin: {
    email: 'admin@example.com',
    password: 'Password123!',
    name: 'Local Dev Admin',
    user_id: 'ADM001',
    role: 'ADMIN',
  },
  learner: {
    email: 'learner1@example.com',
    password: 'Password123!',
    name: 'Local Dev Learner',
    user_id: 'LRN001',
    role: 'LEARNER',
  },
}

function isLocalDevHost() {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function getErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((item) => item?.msg || 'Request validation failed').join(' ')
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || fallback
  }
  return fallback
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const showDevTools = isLocalDevHost()
  const returnTo = typeof location.state?.from === 'string' && location.state.from.startsWith('/')
    ? location.state.from
    : ''

  const clearStoredSession = () => {
    try {
      localStorage.removeItem('syra_tokens')
    } catch {
      // ignore storage failures
    }
  }

  const requestLogin = async (nextEmail, nextPassword) => {
    const { data } = await loginApi(nextEmail, nextPassword)
    return data
  }

  const finalizeLogin = (data) => {
    login(data)
    const role = data?.access_token ? jwtDecode(data.access_token)?.role : null
    navigate(resolvePostLoginPath(role, returnTo), { replace: true })
  }

  const completeLogin = async (nextEmail, nextPassword) => {
    const data = await requestLogin(nextEmail, nextPassword)
    finalizeLogin(data)
    return data
  }

  const createUserAsAdmin = async (adminAccessToken, payload) => {
    const usersUrl = resolveApiUrl('users/')
    return axios.post(usersUrl, payload, {
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
      },
    })
  }

  const ensureAdminTokens = async () => {
    try {
      return await requestLogin(DEV_USERS.admin.email, DEV_USERS.admin.password)
    } catch (err) {
      if (err.response?.status !== 401) {
        throw err
      }
    }

    try {
      await setupAdminApi(DEV_USERS.admin)
    } catch (err) {
      if (err.response?.status !== 409) {
        throw err
      }
    }

    return requestLogin(DEV_USERS.admin.email, DEV_USERS.admin.password)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextEmail = email.trim()
    const nextPassword = password
    setError('')
    if (!nextEmail) {
      setError('Email is required.')
      return
    }
    if (!nextPassword) {
      setError('Password is required.')
      return
    }
    setLoading(true)
    clearStoredSession()
    try {
      await completeLogin(nextEmail, nextPassword)
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleAdminLogin = async () => {
    setError('')
    setEmail(DEV_USERS.admin.email)
    setPassword(DEV_USERS.admin.password)
    setLoading(true)
    clearStoredSession()

    try {
      const adminTokens = await ensureAdminTokens()
      finalizeLogin(adminTokens)
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail === 'Admin already set up') {
        setError('Dev admin could not be created because this database already has users.')
      } else {
        setError(getErrorMessage(err, 'Admin login failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLearnerLogin = async () => {
    setError('')
    setEmail(DEV_USERS.learner.email)
    setPassword(DEV_USERS.learner.password)
    setLoading(true)
    clearStoredSession()

    try {
      try {
        await completeLogin(DEV_USERS.learner.email, DEV_USERS.learner.password)
        return
      } catch (err) {
        if (err.response?.status !== 401) {
          throw err
        }
      }

      const adminTokens = await ensureAdminTokens()
      try {
        await createUserAsAdmin(adminTokens.access_token, DEV_USERS.learner)
      } catch (err) {
        if (err.response?.status !== 409) {
          throw err
        }
      }

      await completeLogin(DEV_USERS.learner.email, DEV_USERS.learner.password)
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail === 'Admin already set up') {
        setError('Learner bootstrap failed because this database uses a different admin account.')
      } else {
        setError(getErrorMessage(err, 'Learner login failed'))
      }
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
          {loading ? 'Logging in...' : 'Sign In'}
        </button>

        {showDevTools && (
          <div className={styles.devTools}>
            <div className={styles.devToolsHeader}>
              <strong>Dev Tools</strong>
              <span>localhost only</span>
            </div>
            <p className={styles.devHint}>
              Quick role login for local development.
            </p>
            <p className={styles.devHint}>
              Admin: <strong>{DEV_USERS.admin.email}</strong> / <strong>{DEV_USERS.admin.password}</strong>
            </p>
            <div className={styles.devButtonRow}>
              <button type="button" className={styles.devBtn} disabled={loading} onClick={handleAdminLogin}>
                {loading ? 'Working...' : 'Admin'}
              </button>
              <button type="button" className={styles.devBtn} disabled={loading} onClick={handleLearnerLogin}>
                {loading ? 'Working...' : 'Learner'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.actionsRow}>
          <Link className={styles.secondaryLink} to="/forgot-password">Forgot password?</Link>
          <Link className={styles.secondaryLink} to="/signup">Create account</Link>
        </div>
      </form>
    </div>
  )
}
