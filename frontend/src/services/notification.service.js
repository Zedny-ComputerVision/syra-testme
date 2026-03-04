import api from './api'

export const listNotifications = () => api.get('notifications/')
export const markRead = (id) => api.post(`notifications/${id}/read`)
export const markAllRead = () => api.post('notifications/read-all')
export const getUnreadCount = () => api.get('notifications/unread-count')
