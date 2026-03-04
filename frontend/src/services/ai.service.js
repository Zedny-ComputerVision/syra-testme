import api from './api'

export const generateQuestionsAI = (payload) => api.post('ai/generate-questions', payload)

