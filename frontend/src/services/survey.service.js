import api from './api'

export const listSurveys = () => api.get('surveys/')
export const getSurvey = (id) => api.get(`surveys/${id}`)
export const createSurvey = (data) => api.post('surveys/', data)
export const updateSurvey = (id, data) => api.put(`surveys/${id}`, data)
export const deleteSurvey = (id) => api.delete(`surveys/${id}`)
export const submitResponse = (surveyId, answers) =>
  api.post(`surveys/${surveyId}/respond`, { survey_id: surveyId, answers })
export const listResponses = (surveyId) => api.get(`surveys/${surveyId}/responses`)
