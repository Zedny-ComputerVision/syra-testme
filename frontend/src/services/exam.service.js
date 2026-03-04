import api from './api'

export const listExams = () => api.get('exams/')
export const getExam = (id) => api.get(`exams/${id}`)
export const createExam = (data) => api.post('exams/', data)
export const updateExam = (id, data) => api.put(`exams/${id}`, data)
export const deleteExam = (id) => api.delete(`exams/${id}`)
export const getExamQuestions = (examId) => api.get(`questions/?exam_id=${examId}`)
