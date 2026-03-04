import api from './api'

export const searchAll = (q) => api.get('search/', { params: { q } })
