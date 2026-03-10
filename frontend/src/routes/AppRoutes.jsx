import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary/ErrorBoundary'
import Navbar from '../components/Navbar/Navbar'
import ScrollProgress from '../components/ScrollProgress/ScrollProgress'
import ScrollRestoration from '../components/ScrollRestoration/ScrollRestoration'
import ScrollTopButton from '../components/ScrollTopButton/ScrollTopButton'
import Sidebar from '../components/Sidebar/Sidebar'
import Loader from '../components/common/Loader/Loader'
import useAuth from '../hooks/useAuth'
import api from '../services/api'
import { preloadRoutes } from '../utils/routePrefetch'

function lazyPage(importer, options = {}) {
  const LazyComponent = lazy(importer)
  const { fullPage = false, label = 'Loading page...' } = options

  return function LazyPage(props) {
    return (
      <Suspense fallback={<Loader fullPage={fullPage} label={label} />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}

const Login = lazyPage(() => import('../pages/Login/Login'), { fullPage: true, label: 'Loading sign-in...' })
const Home = lazyPage(() => import('../pages/Home/Home'), { label: 'Loading dashboard...' })
const Exams = lazyPage(() => import('../pages/Exams/Exams'), { label: 'Loading tests...' })
const ExamInstructions = lazyPage(() => import('../pages/ExamInstructions/ExamInstructions'), { label: 'Loading instructions...' })
const ForgotPassword = lazyPage(() => import('../pages/Auth/ForgotPassword'), { fullPage: true, label: 'Loading recovery...' })
const ResetPassword = lazyPage(() => import('../pages/Auth/ResetPassword'), { fullPage: true, label: 'Loading reset form...' })
const ChangePassword = lazyPage(() => import('../pages/Auth/ChangePassword'), { label: 'Loading password settings...' })
const SignUp = lazyPage(() => import('../pages/Auth/SignUp'), { fullPage: true, label: 'Loading signup...' })
const SystemCheckPage = lazyPage(() => import('../pages/SystemCheckPage/SystemCheckPage'), { label: 'Loading system check...' })
const VerifyIdentityPage = lazyPage(() => import('../pages/VerifyIdentityPage/VerifyIdentityPage'), { label: 'Loading identity check...' })
const RulesPage = lazyPage(() => import('../pages/RulesPage/RulesPage'), { label: 'Loading rules...' })
const Proctoring = lazyPage(() => import('../pages/Proctoring/Proctoring'), { label: 'Loading test session...' })
const Attempts = lazyPage(() => import('../pages/Attempts/Attempts'), { label: 'Loading attempts...' })
const AttemptResult = lazyPage(() => import('../pages/AttemptResult/AttemptResult'), { label: 'Loading results...' })
const Schedule = lazyPage(() => import('../pages/Schedule/Schedule'), { label: 'Loading schedule...' })
const Profile = lazyPage(() => import('../pages/Profile/Profile'), { label: 'Loading profile...' })
const NotFound = lazyPage(() => import('../pages/NotFound/NotFound'), { fullPage: true, label: 'Loading page...' })
const AccessDenied = lazyPage(() => import('../pages/AccessDenied/AccessDenied'), { label: 'Checking access...' })
const AdminDashboard = lazyPage(() => import('../pages/Admin/AdminDashboard/AdminDashboard'), { label: 'Loading admin dashboard...' })
const AdminExams = lazyPage(() => import('../pages/Admin/AdminExams/AdminExams'), { label: 'Loading tests...' })
const AdminNewTestWizard = lazyPage(() => import('../pages/Admin/AdminNewTestWizard/AdminNewTestWizard'), { label: 'Loading test editor...' })
const AdminCategories = lazyPage(() => import('../pages/Admin/AdminCategories/AdminCategories'), { label: 'Loading categories...' })
const AdminGradingScales = lazyPage(() => import('../pages/Admin/AdminGradingScales/AdminGradingScales'), { label: 'Loading grading scales...' })
const AdminQuestionPools = lazyPage(() => import('../pages/Admin/AdminQuestionPools/AdminQuestionPools'), { label: 'Loading question pools...' })
const AdminTestingSessions = lazyPage(() => import('../pages/Admin/AdminTestingSessions/AdminTestingSessions'), { label: 'Loading sessions...' })
const AdminCandidates = lazyPage(() => import('../pages/Admin/AdminCandidates/AdminCandidates'), { label: 'Loading candidates...' })
const AdminAttemptAnalysis = lazyPage(() => import('../pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis'), { label: 'Loading attempt analysis...' })
const AdminRolesPermissions = lazyPage(() => import('../pages/Admin/AdminRolesPermissions/AdminRolesPermissions'), { label: 'Loading role permissions...' })
const AdminUsers = lazyPage(() => import('../pages/Admin/AdminUsers/AdminUsers'), { label: 'Loading users...' })
const AdminTemplates = lazyPage(() => import('../pages/Admin/AdminTemplates/AdminTemplates'), { label: 'Loading templates...' })
const AdminCertificates = lazyPage(() => import('../pages/Admin/AdminCertificates/AdminCertificates'), { label: 'Loading certificates...' })
const AdminReports = lazyPage(() => import('../pages/Admin/AdminReports/AdminReports'), { label: 'Loading reports...' })
const AdminCourses = lazyPage(() => import('../pages/Admin/AdminCourses/AdminCourses'), { label: 'Loading courses...' })
const AdminUserGroups = lazyPage(() => import('../pages/Admin/AdminUserGroups/AdminUserGroups'), { label: 'Loading groups...' })
const AdminSettings = lazyPage(() => import('../pages/Admin/AdminSettings/AdminSettings'), { label: 'Loading settings...' })
const AdminSurveys = lazyPage(() => import('../pages/Admin/AdminSurveys/AdminSurveys'), { label: 'Loading surveys...' })
const AdminAttemptVideos = lazyPage(() => import('../pages/Admin/AdminAttemptVideos/AdminAttemptVideos'), { label: 'Loading recordings...' })
const AdminManageTestPage = lazyPage(() => import('../pages/Admin/AdminManageTestPage/AdminManageTestPage'), { label: 'Loading manage test...' })
const QuestionPoolDetail = lazyPage(() => import('../pages/Admin/QuestionPoolDetail/QuestionPoolDetail'), { label: 'Loading pool details...' })
const TrainingCourses = lazyPage(() => import('../pages/TrainingCourses/TrainingCourses'), { label: 'Loading training...' })
const MySurveys = lazyPage(() => import('../pages/MySurveys/MySurveys'), { label: 'Loading surveys...' })
const AdminPredefinedReports = lazyPage(() => import('../pages/Admin/AdminPredefinedReports/AdminPredefinedReports'), { label: 'Loading predefined reports...' })
const AdminFavoriteReports = lazyPage(() => import('../pages/Admin/AdminFavoriteReports/AdminFavoriteReports'), { label: 'Loading favorites...' })
const AdminIntegrations = lazyPage(() => import('../pages/Admin/AdminIntegrations/AdminIntegrations'), { label: 'Loading integrations...' })
const AdminMaintenance = lazyPage(() => import('../pages/Admin/AdminMaintenance/AdminMaintenance'), { label: 'Loading maintenance...' })
const AdminSubscribers = lazyPage(() => import('../pages/Admin/AdminSubscribers/AdminSubscribers'), { label: 'Loading subscribers...' })
const AdminCustomReports = lazyPage(() => import('../pages/Admin/AdminCustomReports/AdminCustomReports'), { label: 'Loading custom reports...' })
const AdminAuditLog = lazyPage(() => import('../pages/Admin/AdminAuditLog/AdminAuditLog'), { label: 'Loading audit log...' })
const Maintenance = lazyPage(() => import('../pages/Maintenance/Maintenance'), { fullPage: true, label: 'Loading maintenance notice...' })

function ProtectedRoute({ children, roles, permission }) {
  const { user, loading, hasPermission } = useAuth()

  if (loading) return <Loader fullPage label="Authenticating..." />
  if (!user) return <Navigate to="/login" replace />
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/access-denied" replace />
  }
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/access-denied" replace />
  }
  return children
}

function Shell({ children }) {
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [maintenance, setMaintenance] = useState({ mode: 'off', banner: '' })
  const location = useLocation()
  const isAttemptTakeMode = /^\/attempts\/[^/]+\/take$/.test(location.pathname)
  const isLegacyExamMode = ['/exam/', '/system-check/', '/verify-identity/', '/rules/']
    .some((prefix) => location.pathname.startsWith(prefix))
  const isTestJourneyMode = /^\/tests\/[^/]+(\/(system-check|verify-identity|rules))?$/.test(location.pathname)
  const isVideoReviewMode = /^\/admin\/(videos|attempts\/[^/]+\/videos)/.test(location.pathname)
  const isExamMode = isAttemptTakeMode || isLegacyExamMode || isTestJourneyMode || isVideoReviewMode
  const warmRoutes = useMemo(() => {
    if (!user) return []
    if (user.role === 'ADMIN') {
      return ['/admin/tests', '/admin/users', '/admin/candidates', '/admin/reports']
    }
    if (user.role === 'INSTRUCTOR') {
      return ['/admin/tests', '/admin/candidates', '/admin/users']
    }
    return ['/tests', '/attempts', '/schedule', '/profile']
  }, [user])

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await api.get('admin-settings/maintenance/public')
        setMaintenance({ mode: data.mode, banner: data.banner })
      } catch {
        // ignore
      }
    }

    loadSettings()
    const id = setInterval(loadSettings, 120000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user || isExamMode || warmRoutes.length === 0) {
      return undefined
    }

    const warm = () => preloadRoutes(warmRoutes)
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 1500 })
      return () => window.cancelIdleCallback(handle)
    }

    const timeoutId = window.setTimeout(warm, 600)
    return () => window.clearTimeout(timeoutId)
  }, [isExamMode, user, warmRoutes])

  if (!user) return children

  if (maintenance.mode === 'down' && user.role !== 'ADMIN') {
    return (
      <div className="maintenance-page">
        {maintenance.banner && <div className="maintenance-banner">{maintenance.banner}</div>}
        <h2>Maintenance in progress</h2>
        <p>Please try again later.</p>
      </div>
    )
  }

  return (
    <>
      <a href="#app-main-content" className="skip-link">Skip to content</a>
      <ScrollRestoration />
      {!isExamMode && <ScrollProgress />}
      <div className={`app-shell ${isExamMode ? 'app-shell--exam' : ''}`}>
        {maintenance.mode !== 'off' && (
          <div className="maintenance-banner">
            {maintenance.banner || 'Maintenance in progress'}
          </div>
        )}
        {!isExamMode && <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />}
        <div className="app-shell__main">
          {!isExamMode && <Navbar onMenuToggle={() => setMobileOpen((prev) => !prev)} />}
          <AnimatePresence mode="wait">
            <motion.main
              key={location.pathname}
              id="app-main-content"
              className={`app-shell__content ${isExamMode ? 'app-shell__content--exam' : 'glass'}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <ErrorBoundary>{children}</ErrorBoundary>
            </motion.main>
          </AnimatePresence>
        </div>
      </div>
      {!isExamMode && <ScrollTopButton />}
    </>
  )
}

function AuthPage({ children, roles, permission }) {
  return (
    <ProtectedRoute roles={roles} permission={permission}>
      <Shell>{children}</Shell>
    </ProtectedRoute>
  )
}

const ADMIN_ROLES = ['ADMIN']
const SUPER_ADMIN = ['ADMIN']
const ANALYSIS_ROLES = ['ADMIN', 'INSTRUCTOR']
const ADMIN_OR_INSTRUCTOR_ROLES = ['ADMIN', 'INSTRUCTOR']
const withAuth = (element, roles, permission) => <AuthPage roles={roles} permission={permission}>{element}</AuthPage>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function LegacyTestDetailRedirect() {
  const { id } = useParams()
  if (!id || !UUID_PATTERN.test(id)) {
    return <Navigate to="/admin/tests" replace />
  }
  return <Navigate to={`/admin/tests/${id}/manage`} replace />
}

function LegacyTestEditRedirect() {
  const { id } = useParams()
  if (!id || !UUID_PATTERN.test(id)) {
    return <Navigate to="/admin/tests" replace />
  }
  return <Navigate to={`/admin/tests/${id}/edit`} replace />
}

function LegacyLearnerTestsRedirect() {
  return <Navigate to="/tests" replace />
}

function LegacyLearnerTestDetailRedirect() {
  const { examId } = useParams()
  if (!examId) {
    return <Navigate to="/tests" replace />
  }
  return <Navigate to={`/tests/${examId}`} replace />
}

function LegacyLearnerSystemCheckRedirect() {
  const { examId } = useParams()
  if (!examId) {
    return <Navigate to="/tests" replace />
  }
  return <Navigate to={`/tests/${examId}/system-check`} replace />
}

function LegacyLearnerVerifyIdentityRedirect() {
  const { examId } = useParams()
  if (!examId) {
    return <Navigate to="/tests" replace />
  }
  return <Navigate to={`/tests/${examId}/verify-identity`} replace />
}

function LegacyLearnerRulesRedirect() {
  const { examId } = useParams()
  if (!examId) {
    return <Navigate to="/tests" replace />
  }
  return <Navigate to={`/tests/${examId}/rules`} replace />
}

function LegacyAttemptTakeRedirect() {
  const { attemptId } = useParams()
  if (!attemptId) {
    return <Navigate to="/attempts" replace />
  }
  return <Navigate to={`/attempts/${attemptId}/take`} replace />
}

function HomeRoute() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin/dashboard" replace />
  }
  return <Home />
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    { path: '/signup', element: <SignUp /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/change-password', element: withAuth(<ChangePassword />) },
    { path: '/access-denied', element: withAuth(<AccessDenied />) },
    { path: '/maintenance', element: <Maintenance /> },

    { path: '/', element: withAuth(<HomeRoute />, undefined, 'View Dashboard') },
    { path: '/tests', element: withAuth(<Exams />, undefined, 'Take Tests') },
    { path: '/tests/:testId', element: withAuth(<ExamInstructions />) },
    { path: '/training', element: withAuth(<TrainingCourses />) },
    { path: '/surveys', element: withAuth(<MySurveys />) },
    { path: '/tests/:testId/system-check', element: withAuth(<SystemCheckPage />) },
    { path: '/tests/:testId/verify-identity', element: withAuth(<VerifyIdentityPage />) },
    { path: '/tests/:testId/rules', element: withAuth(<RulesPage />) },
    { path: '/attempts/:attemptId/take', element: withAuth(<Proctoring />) },
    { path: '/exams', element: <LegacyLearnerTestsRedirect /> },
    { path: '/exams/:examId', element: <LegacyLearnerTestDetailRedirect /> },
    { path: '/system-check/:examId', element: <LegacyLearnerSystemCheckRedirect /> },
    { path: '/verify-identity/:examId', element: <LegacyLearnerVerifyIdentityRedirect /> },
    { path: '/rules/:examId', element: <LegacyLearnerRulesRedirect /> },
    { path: '/exam/:attemptId', element: <LegacyAttemptTakeRedirect /> },
    { path: '/attempts', element: withAuth(<Attempts />, undefined, 'View Own Attempts') },
    { path: '/attempts/:id', element: withAuth(<AttemptResult />) },
    { path: '/attempt-result/:id', element: withAuth(<AttemptResult />) },
    { path: '/schedule', element: withAuth(<Schedule />, undefined, 'View Own Schedule') },
    { path: '/profile', element: withAuth(<Profile />) },

    { path: '/admin', element: withAuth(<AdminDashboard />, ADMIN_ROLES, 'View Dashboard') },
    { path: '/admin/dashboard', element: withAuth(<AdminDashboard />, ADMIN_ROLES, 'View Dashboard') },

    { path: '/admin/tests', element: withAuth(<AdminExams />, ADMIN_ROLES, 'Edit Tests') },
    { path: '/admin/tests/:id', element: <LegacyTestDetailRedirect /> },
    { path: '/admin/tests/:id/manage', element: withAuth(<AdminManageTestPage />, ADMIN_ROLES, 'Edit Tests') },
    { path: '/admin/tests/new', element: withAuth(<AdminNewTestWizard />, ADMIN_ROLES, 'Create Tests') },
    { path: '/admin/tests/:id/edit', element: withAuth(<AdminNewTestWizard />, ADMIN_ROLES, 'Edit Tests') },
    { path: '/admin/attempts/:attemptId/videos', element: withAuth(<AdminAttemptVideos />, ANALYSIS_ROLES, 'View Attempt Analysis') },
    { path: '/admin/videos/:attemptId', element: withAuth(<AdminAttemptVideos />, ANALYSIS_ROLES, 'View Attempt Analysis') },
    { path: '/admin/videos', element: withAuth(<AdminAttemptVideos />, ANALYSIS_ROLES, 'View Attempt Analysis') },
    { path: '/admin/exams', element: <Navigate to="/admin/tests" replace /> },
    { path: '/admin/exams/:id', element: <LegacyTestDetailRedirect /> },
    { path: '/admin/exams/:id/manage', element: <LegacyTestDetailRedirect /> },
    { path: '/admin/exams/new', element: <Navigate to="/admin/tests/new" replace /> },
    { path: '/admin/exams/:id/edit', element: <LegacyTestEditRedirect /> },
    { path: '/admin/new', element: <Navigate to="/admin/tests/new" replace /> },
    { path: '/admin/categories', element: withAuth(<AdminCategories />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Categories') },
    { path: '/admin/grading-scales', element: withAuth(<AdminGradingScales />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Grading Scales') },
    { path: '/admin/question-pools', element: withAuth(<AdminQuestionPools />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Question Pools') },
    { path: '/admin/question-pools/:id', element: withAuth(<QuestionPoolDetail />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Question Pools') },

    { path: '/admin/sessions', element: withAuth(<AdminTestingSessions />, ADMIN_OR_INSTRUCTOR_ROLES, 'Assign Schedules') },
    { path: '/admin/schedules', element: <Navigate to="/admin/sessions" replace /> },
    { path: '/admin/candidates', element: withAuth(<AdminCandidates />, ANALYSIS_ROLES, 'View Attempt Analysis') },
    { path: '/admin/attempt-analysis', element: withAuth(<AdminAttemptAnalysis />, ANALYSIS_ROLES, 'View Attempt Analysis') },

    { path: '/admin/users', element: withAuth(<AdminUsers />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Users') },
    { path: '/admin/roles', element: withAuth(<AdminRolesPermissions />, SUPER_ADMIN, 'Manage Roles') },

    { path: '/admin/templates', element: withAuth(<AdminTemplates />, ADMIN_OR_INSTRUCTOR_ROLES, 'Edit Tests') },
    { path: '/admin/certificates', element: withAuth(<AdminCertificates />, ADMIN_ROLES, 'Edit Tests') },
    { path: '/admin/reports', element: withAuth(<AdminReports />, ADMIN_ROLES, 'Generate Reports') },
    { path: '/admin/courses', element: withAuth(<AdminCourses />, ADMIN_OR_INSTRUCTOR_ROLES, 'Edit Tests') },
    { path: '/admin/user-groups', element: withAuth(<AdminUserGroups />, ADMIN_ROLES, 'Manage Users') },
    { path: '/admin/settings', element: withAuth(<AdminSettings />, ADMIN_ROLES, 'System Settings') },
    { path: '/admin/surveys', element: withAuth(<AdminSurveys />, ADMIN_OR_INSTRUCTOR_ROLES, 'Edit Tests') },
    { path: '/admin/predefined-reports', element: withAuth(<AdminPredefinedReports />, ADMIN_ROLES, 'Generate Reports') },
    { path: '/admin/favorite-reports', element: withAuth(<AdminFavoriteReports />, ADMIN_ROLES, 'Generate Reports') },
    { path: '/admin/report-builder', element: withAuth(<AdminCustomReports />, ADMIN_ROLES, 'Generate Reports') },
    { path: '/admin/integrations', element: withAuth(<AdminIntegrations />, ADMIN_ROLES, 'System Settings') },
    { path: '/admin/maintenance', element: withAuth(<AdminMaintenance />, ADMIN_ROLES, 'System Settings') },
    { path: '/admin/subscribers', element: withAuth(<AdminSubscribers />, ADMIN_ROLES, 'System Settings') },
    { path: '/admin/audit-log', element: withAuth(<AdminAuditLog />, ADMIN_ROLES, 'View Audit Log') },

    { path: '*', element: <NotFound /> },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  },
)

export default function AppRoutes() {
  return (
    <RouterProvider
      router={router}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    />
  )
}
