import api from './api'

export const login = (email, password) => api.post('auth/login', { email, password })
export const setup = (data) => api.post('auth/setup', data)
export const refresh = (refresh_token) => api.post('auth/refresh', { refresh_token })
export const me = () => api.get('auth/me')
export const changePassword = (current_password, new_password) =>
  api.post('auth/change-password', { current_password, new_password })
export const forgotPassword = (email) => api.post('auth/forgot-password', { email })
export const resetPassword = (token, new_password) =>
  api.post('auth/reset-password', { token, new_password })
export const signup = (payload) => api.post('auth/signup', payload)
