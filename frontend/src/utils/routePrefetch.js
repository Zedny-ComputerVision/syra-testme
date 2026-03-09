const ROUTE_LOADERS = [
  { match: /^\/login\/?$/i, load: () => import('../pages/Login/Login') },
  { match: /^\/signup\/?$/i, load: () => import('../pages/Auth/SignUp') },
  { match: /^\/forgot-password\/?$/i, load: () => import('../pages/Auth/ForgotPassword') },
  { match: /^\/reset-password\/?$/i, load: () => import('../pages/Auth/ResetPassword') },
  { match: /^\/change-password\/?$/i, load: () => import('../pages/Auth/ChangePassword') },
  { match: /^\/$/i, load: () => import('../pages/Home/Home') },
  { match: /^\/tests\/?$/i, load: () => import('../pages/Exams/Exams') },
  { match: /^\/tests\/[^/]+\/?$/i, load: () => import('../pages/ExamInstructions/ExamInstructions') },
  { match: /^\/tests\/[^/]+\/system-check\/?$/i, load: () => import('../pages/SystemCheckPage/SystemCheckPage') },
  { match: /^\/tests\/[^/]+\/verify-identity\/?$/i, load: () => import('../pages/VerifyIdentityPage/VerifyIdentityPage') },
  { match: /^\/tests\/[^/]+\/rules\/?$/i, load: () => import('../pages/RulesPage/RulesPage') },
  { match: /^\/attempts\/?$/i, load: () => import('../pages/Attempts/Attempts') },
  { match: /^\/attempts\/[^/]+\/take\/?$/i, load: () => import('../pages/Proctoring/Proctoring') },
  { match: /^\/attempts\/[^/]+\/?$/i, load: () => import('../pages/AttemptResult/AttemptResult') },
  { match: /^\/schedule\/?$/i, load: () => import('../pages/Schedule/Schedule') },
  { match: /^\/profile\/?$/i, load: () => import('../pages/Profile/Profile') },
  { match: /^\/training\/?$/i, load: () => import('../pages/TrainingCourses/TrainingCourses') },
  { match: /^\/surveys\/?$/i, load: () => import('../pages/MySurveys/MySurveys') },
  { match: /^\/admin\/?$/i, load: () => import('../pages/Admin/AdminDashboard/AdminDashboard') },
  { match: /^\/admin\/dashboard\/?$/i, load: () => import('../pages/Admin/AdminDashboard/AdminDashboard') },
  { match: /^\/admin\/tests\/?$/i, load: () => import('../pages/Admin/AdminExams/AdminExams') },
  { match: /^\/admin\/tests\/new\/?$/i, load: () => import('../pages/Admin/AdminNewTestWizard/AdminNewTestWizard') },
  { match: /^\/admin\/tests\/[^/]+\/edit\/?$/i, load: () => import('../pages/Admin/AdminNewTestWizard/AdminNewTestWizard') },
  { match: /^\/admin\/tests\/[^/]+\/manage\/?$/i, load: () => import('../pages/Admin/AdminManageTestPage/AdminManageTestPage') },
  { match: /^\/admin\/categories\/?$/i, load: () => import('../pages/Admin/AdminCategories/AdminCategories') },
  { match: /^\/admin\/grading-scales\/?$/i, load: () => import('../pages/Admin/AdminGradingScales/AdminGradingScales') },
  { match: /^\/admin\/question-pools\/?$/i, load: () => import('../pages/Admin/AdminQuestionPools/AdminQuestionPools') },
  { match: /^\/admin\/question-pools\/[^/]+\/?$/i, load: () => import('../pages/Admin/QuestionPoolDetail/QuestionPoolDetail') },
  { match: /^\/admin\/sessions\/?$/i, load: () => import('../pages/Admin/AdminTestingSessions/AdminTestingSessions') },
  { match: /^\/admin\/candidates\/?$/i, load: () => import('../pages/Admin/AdminCandidates/AdminCandidates') },
  { match: /^\/admin\/attempt-analysis\/?$/i, load: () => import('../pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis') },
  { match: /^\/admin\/attempts\/[^/]+\/videos\/?$/i, load: () => import('../pages/Admin/AdminAttemptVideos/AdminAttemptVideos') },
  { match: /^\/admin\/videos(?:\/[^/]+)?\/?$/i, load: () => import('../pages/Admin/AdminAttemptVideos/AdminAttemptVideos') },
  { match: /^\/admin\/users\/?$/i, load: () => import('../pages/Admin/AdminUsers/AdminUsers') },
  { match: /^\/admin\/roles\/?$/i, load: () => import('../pages/Admin/AdminRolesPermissions/AdminRolesPermissions') },
  { match: /^\/admin\/templates\/?$/i, load: () => import('../pages/Admin/AdminTemplates/AdminTemplates') },
  { match: /^\/admin\/certificates\/?$/i, load: () => import('../pages/Admin/AdminCertificates/AdminCertificates') },
  { match: /^\/admin\/reports\/?$/i, load: () => import('../pages/Admin/AdminReports/AdminReports') },
  { match: /^\/admin\/courses\/?$/i, load: () => import('../pages/Admin/AdminCourses/AdminCourses') },
  { match: /^\/admin\/user-groups\/?$/i, load: () => import('../pages/Admin/AdminUserGroups/AdminUserGroups') },
  { match: /^\/admin\/settings\/?$/i, load: () => import('../pages/Admin/AdminSettings/AdminSettings') },
  { match: /^\/admin\/surveys\/?$/i, load: () => import('../pages/Admin/AdminSurveys/AdminSurveys') },
  { match: /^\/admin\/predefined-reports\/?$/i, load: () => import('../pages/Admin/AdminPredefinedReports/AdminPredefinedReports') },
  { match: /^\/admin\/favorite-reports\/?$/i, load: () => import('../pages/Admin/AdminFavoriteReports/AdminFavoriteReports') },
  { match: /^\/admin\/report-builder\/?$/i, load: () => import('../pages/Admin/AdminCustomReports/AdminCustomReports') },
  { match: /^\/admin\/integrations\/?$/i, load: () => import('../pages/Admin/AdminIntegrations/AdminIntegrations') },
  { match: /^\/admin\/maintenance\/?$/i, load: () => import('../pages/Admin/AdminMaintenance/AdminMaintenance') },
  { match: /^\/admin\/subscribers\/?$/i, load: () => import('../pages/Admin/AdminSubscribers/AdminSubscribers') },
  { match: /^\/admin\/audit-log\/?$/i, load: () => import('../pages/Admin/AdminAuditLog/AdminAuditLog') },
]

const preloadedRoutes = new Set()

function normalizePath(path) {
  if (!path) return ''
  const value = typeof path === 'string' ? path : path.pathname
  if (!value) return ''
  return value.split(/[?#]/, 1)[0]
}

export function preloadRoute(path) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath || preloadedRoutes.has(normalizedPath)) {
    return
  }

  const match = ROUTE_LOADERS.find((entry) => entry.match.test(normalizedPath))
  if (!match) {
    return
  }

  preloadedRoutes.add(normalizedPath)
  void match.load().catch(() => {
    preloadedRoutes.delete(normalizedPath)
  })
}

export function preloadRoutes(paths = []) {
  paths.forEach(preloadRoute)
}
