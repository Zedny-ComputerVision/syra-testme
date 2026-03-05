import api from './api'

export const adminApi = {
  // Exams
  exams: () => api.get('exams/'),
  getExam: (id) => api.get(`exams/${id}`),
  createExam: (data) => api.post('exams/', data),
  updateExam: (id, data) => api.put(`exams/${id}`, data),
  deleteExam: (id) => api.delete(`exams/${id}`),

  // Categories
  categories: () => api.get('categories/'),
  getCategory: (id) => api.get(`categories/${id}`),
  createCategory: (data) => api.post('categories/', data),
  updateCategory: (id, data) => api.put(`categories/${id}`, data),
  deleteCategory: (id) => api.delete(`categories/${id}`),

  // Grading Scales
  gradingScales: () => api.get('grading-scales/'),
  getGradingScale: (id) => api.get(`grading-scales/${id}`),
  createGradingScale: (data) => api.post('grading-scales/', data),
  updateGradingScale: (id, data) => api.put(`grading-scales/${id}`, data),
  deleteGradingScale: (id) => api.delete(`grading-scales/${id}`),

  // Question Pools
  questionPools: () => api.get('question-pools/'),
  getQuestionPool: (id) => api.get(`question-pools/${id}`),
  createQuestionPool: (data) => api.post('question-pools/', data),
  getPoolQuestions: (poolId) => api.get(`question-pools/${poolId}/questions`),
  seedExamFromPool: (poolId, examId, count = 5) =>
    api.post(`question-pools/${poolId}/seed-exam/${examId}`, null, { params: { count } }),
  deleteQuestionPool: (id) => api.delete(`question-pools/${id}`),

  // Schedules
  schedules: () => api.get('schedules/'),
  createSchedule: (data) => api.post('schedules/', data),
  deleteSchedule: (id) => api.delete(`schedules/${id}`),
  assignSchedule: (data) => api.post('schedules/', data),

  // Questions
  getQuestions: (examId) => api.get(`questions/?exam_id=${examId}`),
  addQuestion: (data) => api.post('questions/', data),
  updateQuestion: (id, data) => api.put(`questions/${id}`, data),
  deleteQuestion: (id) => api.delete(`questions/${id}`),

  // Users
  users: () => api.get('users/'),
  getUser: (id) => api.get(`users/${id}`),
  createUser: (data) => api.post('users/', data),
  updateUser: (id, data) => api.put(`users/${id}`, data),
  deleteUser: (id) => api.delete(`users/${id}`),

  // Courses
  courses: () => api.get('courses/'),
  getCourse: (id) => api.get(`courses/${id}`),
  createCourse: (data) => api.post('courses/', data),
  updateCourse: (id, data) => api.put(`courses/${id}`, data),

  // Nodes
  nodes: (courseId) => api.get(`nodes/${courseId ? `?course_id=${courseId}` : ''}`),
  createNode: (data) => api.post('nodes/', data),

  // Attempts / Analysis
  attempts: () => api.get('attempts/'),
  getAttempt: (id) => api.get(`attempts/${id}`),
  importAttempts: (rows) => api.post('attempts/import', rows),
  getAttemptEvents: (attemptId) => api.get(`proctoring/${attemptId}/events`),
  generateReport: (attemptId) => api.post(`proctoring/${attemptId}/generate-report`, null, { responseType: 'text' }),
  pauseAttempt: (attemptId) => api.post(`proctoring/${attemptId}/pause`),
  resumeAttempt: (attemptId) => api.post(`proctoring/${attemptId}/resume`),
  listAttemptVideos: (attemptId) => api.get(`proctoring/${attemptId}/videos`),
  generateExamReportPdf: (examId) => api.get(`reports/exam/${examId}/pdf`, { responseType: 'blob' }),
  gradeAttempt: (id, score) => api.post(`attempts/${id}/submit`, null, { params: { score } }),

  // Dashboard
  dashboard: () => api.get('dashboard/'),

  // Notifications
  notifications: () => api.get('notifications/'),
  markNotificationRead: (id) => api.post(`notifications/${id}/read`),

  // Audit Log
  auditLog: (params) => api.get('audit-log/', { params }),

  // Surveys
  surveys: () => api.get('surveys/'),
  createSurvey: (data) => api.post('surveys/', data),

  // User Groups
  userGroups: () => api.get('user-groups/'),
  createUserGroup: (data) => api.post('user-groups/', data),
  deleteUserGroup: (id) => api.delete(`user-groups/${id}`),

  // Exam Templates
  examTemplates: () => api.get('exam-templates/'),
  createExamTemplate: (data) => api.post('exam-templates/', data),
  updateExamTemplate: (id, data) => api.put(`exam-templates/${id}`, data),
  deleteExamTemplate: (id) => api.delete(`exam-templates/${id}`),

  // Report Schedules
  reportSchedules: () => api.get('report-schedules/'),
  createReportSchedule: (data) => api.post('report-schedules/', data),
  deleteReportSchedule: (id) => api.delete(`report-schedules/${id}`),
  runReportSchedule: (id) => api.post(`report-schedules/${id}/run`),

  // Integrations
  testIntegrations: (config) => api.post('integrations/test', config),
  generatePredefinedReport: (slug) => api.post(`reports/predefined/${slug}`, null, { responseType: 'blob' }),

  // Admin Settings
  settings: () => api.get('admin-settings/'),
  updateSetting: (key, value) => api.put(`admin-settings/${key}`, { value }),
  getSetting: (key) => api.get(`admin-settings/${key}`),
}
