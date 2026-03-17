import React, { useState } from 'react'
import axios from 'axios'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { jwtDecode } from 'jwt-decode'
import { login as loginApi, setup as setupAdminApi, signupStatus as signupStatusApi } from '../../services/auth.service'
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

function normalizeComparable(value) {
  return String(value || '').trim().toLowerCase()
}

function getErrorMessage(err, fallback) {
  if (typeof err?.userMessage === 'string' && err.userMessage.trim()) {
    return err.userMessage
  }
  if (typeof err?.message === 'string' && err.message.trim() && err.message !== 'Network Error') {
    return err.message
  }
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

  const adminAlreadySetupError = () => {
    const error = new Error('Admin already set up')
    error.response = { status: 409, data: { detail: 'Admin already set up' } }
    return error
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

  const listUsersAsAdmin = async (adminAccessToken, search) => {
    const usersUrl = new URL(resolveApiUrl('users/'))
    usersUrl.searchParams.set('page_size', '100')
    if (search) {
      usersUrl.searchParams.set('search', search)
    }
    const { data } = await axios.get(usersUrl.toString(), {
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
      },
    })
    return Array.isArray(data?.items) ? data.items : []
  }

  const findDevLearnerAsAdmin = async (adminAccessToken) => {
    const exactEmail = normalizeComparable(DEV_USERS.learner.email)
    const exactUserId = normalizeComparable(DEV_USERS.learner.user_id)
    for (const search of [DEV_USERS.learner.email, DEV_USERS.learner.user_id]) {
      const items = await listUsersAsAdmin(adminAccessToken, search)
      const match = items.find((item) =>
        normalizeComparable(item?.email) === exactEmail
        || normalizeComparable(item?.user_id) === exactUserId,
      )
      if (match) {
        return match
      }
    }
    return null
  }

  const patchUserAsAdmin = async (adminAccessToken, userId, payload) => {
    const userUrl = resolveApiUrl(`users/${userId}`)
    return axios.patch(userUrl, payload, {
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
      },
    })
  }

  const resetUserPasswordAsAdmin = async (adminAccessToken, userId, nextPassword) => {
    const resetUrl = resolveApiUrl(`users/${userId}/reset-password`)
    return axios.post(resetUrl, { new_password: nextPassword }, {
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
      },
    })
  }

  const repairDevLearnerAsAdmin = async (adminAccessToken) => {
    try {
      await createUserAsAdmin(adminAccessToken, DEV_USERS.learner)
      return
    } catch (err) {
      if (err.response?.status !== 409) {
        throw err
      }
    }

    const existingUser = await findDevLearnerAsAdmin(adminAccessToken)
    if (!existingUser?.id) {
      throw new Error('Existing dev learner account could not be repaired automatically.')
    }

    await patchUserAsAdmin(adminAccessToken, existingUser.id, {
      email: DEV_USERS.learner.email,
      name: DEV_USERS.learner.name,
      user_id: DEV_USERS.learner.user_id,
      role: DEV_USERS.learner.role,
      is_active: true,
    })
    await resetUserPasswordAsAdmin(adminAccessToken, existingUser.id, DEV_USERS.learner.password)
  }

  const ensureAdminTokens = async () => {
    const { data } = await signupStatusApi()
    const setupAllowed = Boolean(data?.allowed)

    if (setupAllowed) {
      await setupAdminApi(DEV_USERS.admin)
    }

    try {
      return await requestLogin(DEV_USERS.admin.email, DEV_USERS.admin.password)
    } catch (err) {
      if (!setupAllowed && err.response?.status === 401) {
        throw adminAlreadySetupError()
      }
      throw err
    }
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
      const adminTokens = await ensureAdminTokens()
      await repairDevLearnerAsAdmin(adminTokens.access_token)
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
