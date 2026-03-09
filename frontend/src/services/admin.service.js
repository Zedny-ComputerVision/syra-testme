import api from './api'

const listTestRuntime = (params) => api.get('exams/', { params })
const getTestRuntime = (id) => api.get(`exams/${id}`)
const createTestRuntime = (data) => api.post('exams/', data)
const updateTestRuntime = (id, data) => api.put(`exams/${id}`, data)
const deleteTestRuntime = (id) => api.delete(`exams/${id}`)

export const adminApi = {
  // Canonical admin tests
  tests: (params) => api.get('admin/tests', { params }),
  allTests: (params = {}) => api.get('admin/tests', {
    params: {
      page_size: 100,
      status: 'DRAFT,PUBLISHED,ARCHIVED',
      ...params,
    },
  }),
  getTest: (id) => api.get(`admin/tests/${id}`),
  createTest: (data) => api.post('admin/tests', data),
  updateTest: (id, data) => api.patch(`admin/tests/${id}`, data),
  publishTest: (id) => api.post(`admin/tests/${id}/publish`),
  archiveTest: (id) => api.post(`admin/tests/${id}/archive`),
  unarchiveTest: (id) => api.post(`admin/tests/${id}/unarchive`),
  duplicateTest: (id) => api.post(`admin/tests/${id}/duplicate`),
  deleteTest: (id) => api.delete(`admin/tests/${id}`),
  downloadTestReport: (id) => api.get(`admin/tests/${id}/report`, { responseType: 'text' }),

  // Canonical runtime-test compatibility endpoints
  listTestRuntime,
  getTestRuntime,
  createTestRuntime,
  updateTestRuntime,
  deleteTestRuntime,
  exams: listTestRuntime,
  getExam: getTestRuntime,
  createExam: createTestRuntime,
  updateExam: updateTestRuntime,
  deleteExam: deleteTestRuntime,

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
  updateQuestionPool: (id, data) => api.put(`question-pools/${id}`, data),
  getPoolQuestions: (poolId) => api.get(`question-pools/${poolId}/questions`),
  createPoolQuestion: (poolId, data) => api.post(`question-pools/${poolId}/questions`, data),
  updatePoolQuestion: (poolId, questionId, data) => api.put(`question-pools/${poolId}/questions/${questionId}`, data),
  deletePoolQuestion: (poolId, questionId) => api.delete(`question-pools/${poolId}/questions/${questionId}`),
  seedExamFromPool: (poolId, examId, count = 5) =>
    api.post(`question-pools/${poolId}/seed-exam/${examId}`, null, { params: { count } }),
  deleteQuestionPool: (id) => api.delete(`question-pools/${id}`),

  // Schedules
  schedulableTests: () => api.get('schedules/tests'),
  schedules: () => api.get('schedules/'),
  createSchedule: (data) => api.post('schedules/', data),
  updateSchedule: (id, data) => api.put(`schedules/${id}`, data),
  deleteSchedule: (id) => api.delete(`schedules/${id}`),
  assignSchedule: (data) => api.post('schedules/', data),

  // Questions
  getQuestions: (examId) => api.get('questions/', { params: { exam_id: examId } }),
  addQuestion: (data) => api.post('questions/', data),
  updateQuestion: (id, data) => api.put(`questions/${id}`, data),
  deleteQuestion: (id) => api.delete(`questions/${id}`),

  // Users
  users: (params) => api.get('users/', { params }),
  learnersForScheduling: (params) => api.get('users/learners', { params }),
  getUser: (id) => api.get(`users/${id}`),
  createUser: (data) => api.post('users/', data),
  updateUser: (id, data) => api.patch(`users/${id}`, data),
  deleteUser: (id) => api.delete(`users/${id}`),
  resetUserPassword: (id, new_password) => api.post(`users/${id}/reset-password`, { new_password }),
  getMyPreference: (key) => api.get(`users/me/preferences/${key}`),
  updateMyPreference: (key, value) => api.put(`users/me/preferences/${key}`, { value }),

  // Courses
  courses: () => api.get('courses/'),
  getCourse: (id) => api.get(`courses/${id}`),
  createCourse: (data) => api.post('courses/', data),
  updateCourse: (id, data) => api.put(`courses/${id}`, data),
  deleteCourse: (id) => api.delete(`courses/${id}`),

  // Nodes
  nodes: (courseId) => api.get('nodes/', { params: courseId ? { course_id: courseId } : {} }),
  createNode: (data) => api.post('nodes/', data),
  updateNode: (id, data) => api.put(`nodes/${id}`, data),
  deleteNode: (id) => api.delete(`nodes/${id}`),

  // Attempts / Analysis
  attempts: (params) => api.get('attempts/', { params }),
  getAttempt: (id) => api.get(`attempts/${id}`),
  importAttempts: (rows) => api.post('attempts/import', rows),
  getAttemptEvents: (attemptId) => api.get(`proctoring/${attemptId}/events`),
  generateReport: (attemptId) => api.post(`proctoring/${attemptId}/generate-report`, null, { responseType: 'text' }),
  pauseAttempt: (attemptId) => api.post(`proctoring/${attemptId}/pause`),
  resumeAttempt: (attemptId) => api.post(`proctoring/${attemptId}/resume`),
  listAttemptVideos: (attemptId) => api.get(`proctoring/${attemptId}/videos`),
  getAttemptAnswers: (attemptId) => api.get(`attempts/${attemptId}/answers`),
  testReportCsv: (testId) => api.get(`reports/test/${testId}`, { responseType: 'blob' }),
  generateTestReportPdf: (testId) => api.get(`reports/test/${testId}/pdf`, { responseType: 'blob' }),
  gradeAttempt: (id, score) => api.post(`attempts/${id}/grade`, null, { params: { score } }),

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
  getUserGroupMembers: (id) => api.get(`user-groups/${id}/members`),
  addUserGroupMember: (groupId, userId) => api.post(`user-groups/${groupId}/members`, { user_id: userId }),
  removeUserGroupMember: (groupId, userId) => api.delete(`user-groups/${groupId}/members/${userId}`),

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
  previewCustomReport: (payload) => api.post('reports/export/preview', payload),
  exportCustomReport: (payload) => api.post('reports/export', payload, { responseType: 'blob' }),

  // Admin Settings
  settings: () => api.get('admin-settings/'),
  updateSetting: (key, value) => api.put(`admin-settings/${key}`, { value }),
  getSetting: (key) => api.get(`admin-settings/${key}`),
}
