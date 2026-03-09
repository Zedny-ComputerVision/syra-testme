import axios from 'axios'

const STORAGE_KEY = 'syra_tokens'
const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/'
const baseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
const AUTH_ENDPOINTS = ['auth/login', 'auth/signup', 'auth/setup', 'auth/refresh', 'auth/forgot-password', 'auth/reset-password']

const api = axios.create({ baseURL })
let refreshPromise = null

function normalizeValidationFields(detail) {
  if (!Array.isArray(detail)) return {}

  return detail.reduce((fields, item) => {
    const loc = Array.isArray(item?.loc) ? item.loc : []
    const path = loc
      .filter((segment) => segment !== 'body' && segment !== 'query' && segment !== 'path')
      .map((segment) => String(segment))
      .join('.')

    if (path && !fields[path]) {
      fields[path] = item?.msg || 'Invalid value.'
    }

    return fields
  }, {})
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

function redirectToLogin() {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

async function refreshAccessToken() {
  const stored = readTokens()
  if (!stored?.refresh_token) {
    throw new Error('Missing refresh token')
  }
  const refreshUrl = new URL('auth/refresh', baseURL).toString()
  const { data } = await axios.post(refreshUrl, { refresh_token: stored.refresh_token })
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
  const tokens = readTokens()
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status
    const original = err.config || {}
    const url = String(original.url || '')
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path))

    if (status === 422) {
      const fields = normalizeValidationFields(err.response?.data?.detail)
      err.validation = {
        fields,
        message: 'Validation failed',
      }
      err.fields = fields
      err.message = 'Validation failed'
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
      return Promise.reject(refreshErr)
    }
  }
)

export default api
