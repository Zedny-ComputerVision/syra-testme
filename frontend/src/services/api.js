import axios from 'axios'

const STORAGE_KEY = 'syra_tokens'
const rawBase = import.meta.env.VITE_API_BASE_URL || '/api/'
const baseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
const AUTH_ENDPOINTS = ['auth/login', 'auth/signup', 'auth/setup', 'auth/refresh', 'auth/forgot-password', 'auth/reset-password']
const DEFAULT_TIMEOUT_MS = 30000

const api = axios.create({ baseURL, timeout: DEFAULT_TIMEOUT_MS })
let refreshPromise = null

function assignValidationField(fields, path, message) {
  if (!path) return
  if (!fields[path]) {
    fields[path] = message || 'Invalid value.'
  }
}

function flattenValidationDetail(detail, fields, prefix = '') {
  if (Array.isArray(detail)) {
    detail.forEach((item) => {
      if (item && typeof item === 'object' && (Array.isArray(item.loc) || item.msg || item.detail)) {
        const loc = Array.isArray(item.loc) ? item.loc : []
        const path = loc
          .filter((segment) => !['body', 'query', 'path'].includes(String(segment)))
          .map((segment) => String(segment))
          .join('.') || prefix
        assignValidationField(fields, path, item.msg || item.detail || 'Invalid value.')
        if (item.detail && item.detail !== item.msg) {
          flattenValidationDetail(item.detail, fields, path)
        }
        return
      }
      flattenValidationDetail(item, fields, prefix)
    })
    return
  }

  if (typeof detail === 'string') {
    assignValidationField(fields, prefix || 'form', detail)
    return
  }

  if (!detail || typeof detail !== 'object') return

  Object.entries(detail).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      assignValidationField(fields, path, value)
      return
    }
    flattenValidationDetail(value, fields, path)
  })
}

function normalizeValidationFields(detail) {
  const fields = {}
  flattenValidationDetail(detail, fields)
  return fields
}

function normalizeDetailMessage(detail, fallback = 'Request failed.') {
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          return String(item.msg || item.detail || '').trim()
        }
        return ''
      })
      .filter(Boolean)
    if (messages.length > 0) {
      return messages.join(' ')
    }
  }
  if (detail && typeof detail === 'object') {
    const direct = String(detail.message || detail.detail || detail.msg || '').trim()
    if (direct) return direct
  }
  return fallback
}

function emitApiError(message, extra = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('syra:api-error', {
    detail: {
      message,
      ...extra,
    },
  }))
}

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function writeTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

function clearTokens() {
  localStorage.removeItem(STORAGE_KEY)
}

function isJwtLike(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  return parts.length === 3 && parts.every((part) => part.length > 0)
}

function redirectToLogin() {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

function resolveApiUrl(path) {
  return new URL(path, new URL(baseURL, window.location.origin)).toString()
}

async function refreshAccessToken() {
  const stored = readTokens()
  if (!stored?.refresh_token) {
    throw new Error('Missing refresh token')
  }
  if (!isJwtLike(stored.refresh_token)) {
    throw new Error('Invalid refresh token')
  }
  const refreshUrl = resolveApiUrl('auth/refresh')
  const { data } = await axios.post(
    refreshUrl,
    { refresh_token: stored.refresh_token },
    { timeout: 5000 },
  )
  if (!data?.access_token) {
    throw new Error('Missing refreshed access token')
  }
  const nextTokens = {
    ...stored,
    access_token: data.access_token,
    token_type: data.token_type || stored.token_type || 'bearer',
  }
  writeTokens(nextTokens)
  return nextTokens
}

api.interceptors.request.use((config) => {
  if (config.url?.startsWith('/')) {
    config.url = config.url.slice(1)
  }
  if (!config.timeout) {
    config.timeout = DEFAULT_TIMEOUT_MS
  }
  const tokens = readTokens()
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => {
    const payload = res?.data && typeof res.data === 'object' && Object.prototype.hasOwnProperty.call(res.data, 'data')
      ? res.data.data
      : res?.data
    if (res && typeof res === 'object') {
      res.payload = payload
    }
    return res
  },
  async (err) => {
    const status = err.response?.status
    const original = err.config || {}
    const url = String(original.url || '')
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path))
    const detail = err.response?.data?.detail

    if (!err.response) {
      const timeout = err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message || ''))
      const message = timeout
        ? 'The server took too long to respond. Please try again.'
        : 'Unable to reach the server. Check your connection and try again.'
      err.userMessage = message
      err.message = message
      emitApiError(message, { code: err.code || 'NETWORK_ERROR', url })
      return Promise.reject(err)
    }

    if (status === 422) {
      const fields = normalizeValidationFields(detail)
      const message = normalizeDetailMessage(detail, 'Validation failed.')
      err.validation = {
        fields,
        message,
      }
      err.fields = fields
      err.userMessage = message
      err.message = message
    } else {
      const message = normalizeDetailMessage(detail, err.message || 'Request failed.')
      err.userMessage = message
      err.message = message
    }

    if (status !== 401 || isAuthEndpoint) {
      return Promise.reject(err)
    }

    if (original._retry) {
      clearTokens()
      redirectToLogin()
      return Promise.reject(err)
    }
    original._retry = true

    const stored = readTokens()
    if (!stored?.refresh_token) {
      clearTokens()
      redirectToLogin()
      return Promise.reject(err)
    }

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null
        })
      }
      const nextTokens = await refreshPromise
      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${nextTokens.access_token}`
      return api.request(original)
    } catch (refreshErr) {
      clearTokens()
      redirectToLogin()
      refreshErr.userMessage = normalizeDetailMessage(refreshErr.response?.data?.detail, 'Your session has expired. Please sign in again.')
      refreshErr.message = refreshErr.userMessage
      return Promise.reject(refreshErr)
    }
  }
)

export default api
