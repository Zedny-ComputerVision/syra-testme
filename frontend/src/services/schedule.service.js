import api from './api'

export const listSchedules = () => api.get('schedules/')
export const createSchedule = (data) => api.post('schedules/', data)
export const deleteSchedule = (id) => api.delete(`schedules/${id}`)
export const batchCreateSchedules = (schedules) =>
  Promise.all(schedules.map(s => api.post('schedules/', s)))
