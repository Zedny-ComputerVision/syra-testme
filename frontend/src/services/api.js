import axios from 'axios'

const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/'
const baseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`

const api = axios.create({ baseURL })

api.interceptors.request.use((config) => {
  // Normalize paths so we don't double up slashes and we hit canonical trailing-slash endpoints.
  if (config.url?.startsWith('/')) {
    config.url = config.url.slice(1)
  }
  const tokens = JSON.parse(localStorage.getItem('syra_tokens') || 'null')
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const url = err.config?.url || ''

    // Don't force-redirect on expected auth failures (login/signup/setup) so forms can show inline errors.
    const isAuthEndpoint = url.includes('auth/login') || url.includes('auth/signup') || url.includes('auth/setup')

    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('syra_tokens')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
