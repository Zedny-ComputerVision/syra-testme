import React, { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useParams } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary/ErrorBoundary'
import Navbar from '../components/Navbar/Navbar'
import ScrollProgress from '../components/ScrollProgress/ScrollProgress'
import ScrollRestoration from '../components/ScrollRestoration/ScrollRestoration'
import ScrollTopButton from '../components/ScrollTopButton/ScrollTopButton'
import Sidebar from '../components/Sidebar/Sidebar'
import Loader from '../components/common/Loader/Loader'
import useAuth from '../hooks/useAuth'
import api, { cancelRouteScopedRequests } from '../services/api'

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
const AdminLiveMonitor = lazyPage(() => import('../pages/Admin/AdminLiveMonitor/AdminLiveMonitor'), { label: 'Loading live monitor...' })
const Maintenance = lazyPage(() => import('../pages/Maintenance/Maintenance'), { fullPage: true, label: 'Loading maintenance notice...' })

const MAINTENANCE_CACHE_TTL_MS = 120000
let maintenanceCache = {
  data: null,
  fetchedAt: 0,
  inflight: null,
}

async function readMaintenanceStatus() {
  const now = Date.now()
  if (maintenanceCache.fetchedAt && (now - maintenanceCache.fetchedAt) < MAINTENANCE_CACHE_TTL_MS) {
    return maintenanceCache.data
  }
  if (maintenanceCache.inflight) {
    return maintenanceCache.inflight
  }

  maintenanceCache.inflight = api.get('admin-settings/maintenance/public')
    .then(({ data }) => {
      if (!data || typeof data.mode !== 'string') {
        throw new Error('Maintenance status unavailable')
      }
      maintenanceCache.data = {
        mode: data.mode,
        banner: typeof data.banner === 'string' ? data.banner : '',
      }
      maintenanceCache.fetchedAt = Date.now()
      return maintenanceCache.data
    })
    .finally(() => {
      maintenanceCache.inflight = null
    })

  return maintenanceCache.inflight
}

function RequireLogin({ children }) {
  const location = useLocation()
  const { user, loading } = useAuth()

  if (loading) return <Loader fullPage label="Authenticating..." />
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }
  return children
}

function RequireAccess({ children, roles, permission }) {
  const { user, hasPermission, permissionsLoading, permissionsError } = useAuth()

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/access-denied" replace />
  }
  if (permission && permissionsLoading) {
    return <Loader fullPage label="Loading access..." />
  }
  if (permission && permissionsError) {
    return (
      <div className="maintenance-page">
        <h2>Permissions unavailable</h2>
        <p>{permissionsError}</p>
        <button type="button" onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/access-denied" replace />
  }
  return children
}

function Shell({ children }) {
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('syra_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [maintenance, setMaintenance] = useState({ mode: 'off', banner: '' })
  const [maintenanceError, setMaintenanceError] = useState('')
  const location = useLocation()
  const isAttemptTakeMode = /^\/attempts\/[^/]+\/take$/.test(location.pathname)
  const isLegacyExamMode = ['/exam/', '/system-check/', '/verify-identity/', '/rules/']
    .some((prefix) => location.pathname.startsWith(prefix))
  const isTestJourneyMode = /^\/tests\/[^/]+(\/(system-check|verify-identity|rules))?$/.test(location.pathname)
  const isVideoReviewMode = /^\/admin\/(videos|attempts\/[^/]+\/videos)/.test(location.pathname)
  const isExamMode = isAttemptTakeMode || isLegacyExamMode || isTestJourneyMode || isVideoReviewMode
  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await readMaintenanceStatus()
        setMaintenance(data)
        setMaintenanceError('')
      } catch {
        setMaintenanceError('Maintenance status could not be loaded.')
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
    try {
      window.localStorage.setItem('syra_sidebar_collapsed', sidebarCollapsed ? 'true' : 'false')
    } catch {
      // ignore storage failures
    }
  }, [sidebarCollapsed])

  useEffect(() => () => {
    cancelRouteScopedRequests('navigation')
  }, [location.key])

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
      {maintenanceError && (
        <div className="maintenance-banner">
          {maintenanceError}
        </div>
      )}
      {maintenance.mode !== 'off' && (
        <div className="maintenance-banner">
          {maintenance.banner || 'Maintenance in progress'}
        </div>
      )}
      <div
        className={`app-shell ${isExamMode ? 'app-shell--exam' : ''}`}
        style={!isExamMode ? { '--sidebar-width': sidebarCollapsed ? '88px' : '248px' } : undefined}
      >
        {!isExamMode && (
          <Sidebar
            collapsed={sidebarCollapsed}
            mobileOpen={mobileOpen}
            onClose={() => setMobileOpen(false)}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />
        )}
        <div className="app-shell__main">
          {!isExamMode && (
            <Navbar
              onMenuToggle={() => setMobileOpen((prev) => !prev)}
            />
          )}
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

function AuthenticatedLayout() {
  return (
    <RequireLogin>
      <Shell>
        <Outlet />
      </Shell>
    </RequireLogin>
  )
}

const ADMIN_ROLES = ['ADMIN']
const SUPER_ADMIN = ['ADMIN']
const ANALYSIS_ROLES = ['ADMIN', 'INSTRUCTOR']
const ADMIN_OR_INSTRUCTOR_ROLES = ['ADMIN', 'INSTRUCTOR']
const LEARNER_ROLES = ['LEARNER']
const withAccess = (element, roles, permission) => (
  <RequireAccess roles={roles} permission={permission}>
    {element}
  </RequireAccess>
)

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
  if (user?.role === 'INSTRUCTOR') {
    return <Navigate to="/profile" replace />
  }
  return <Home />
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    { path: '/signup', element: <SignUp /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/maintenance', element: <Maintenance /> },
    { path: '/exams', element: <LegacyLearnerTestsRedirect /> },
    { path: '/exams/:examId', element: <LegacyLearnerTestDetailRedirect /> },
    { path: '/system-check/:examId', element: <LegacyLearnerSystemCheckRedirect /> },
    { path: '/verify-identity/:examId', element: <LegacyLearnerVerifyIdentityRedirect /> },
    { path: '/rules/:examId', element: <LegacyLearnerRulesRedirect /> },
    { path: '/exam/:attemptId', element: <LegacyAttemptTakeRedirect /> },
    { path: '/admin/exams', element: <Navigate to="/admin/tests" replace /> },
    { path: '/admin/exams/:id', element: <LegacyTestDetailRedirect /> },
    { path: '/admin/exams/:id/manage', element: <LegacyTestDetailRedirect /> },
    { path: '/admin/exams/new', element: <Navigate to="/admin/tests/new" replace /> },
    { path: '/admin/exams/:id/edit', element: <LegacyTestEditRedirect /> },
    { path: '/admin/tests/:id', element: <LegacyTestDetailRedirect /> },
    { path: '/admin/new', element: <Navigate to="/admin/tests/new" replace /> },
    { path: '/admin/schedules', element: <Navigate to="/admin/sessions" replace /> },
    { path: '/admin/roles-permissions', element: <Navigate to="/admin/roles" replace /> },

    {
      element: <AuthenticatedLayout />,
      children: [
        { path: '/change-password', element: <ChangePassword /> },
        { path: '/access-denied', element: <AccessDenied /> },

        { path: '/', element: withAccess(<HomeRoute />, undefined, 'View Dashboard') },
        { path: '/tests', element: withAccess(<Exams />, undefined, 'Take Tests') },
        { path: '/tests/:testId', element: <ExamInstructions /> },
        { path: '/training', element: withAccess(<TrainingCourses />, LEARNER_ROLES) },
        { path: '/surveys', element: withAccess(<MySurveys />, LEARNER_ROLES) },
        { path: '/tests/:testId/system-check', element: <SystemCheckPage /> },
        { path: '/tests/:testId/verify-identity', element: <VerifyIdentityPage /> },
        { path: '/tests/:testId/rules', element: <RulesPage /> },
        { path: '/attempts/:attemptId/take', element: <Proctoring /> },
        { path: '/attempts', element: withAccess(<Attempts />, undefined, 'View Own Attempts') },
        { path: '/attempts/:id', element: <AttemptResult /> },
        { path: '/attempt-result/:id', element: <AttemptResult /> },
        { path: '/schedule', element: withAccess(<Schedule />, undefined, 'View Own Schedule') },
        { path: '/profile', element: <Profile /> },

        { path: '/admin', element: withAccess(<AdminDashboard />, ADMIN_ROLES, 'View Dashboard') },
        { path: '/admin/dashboard', element: withAccess(<AdminDashboard />, ADMIN_ROLES, 'View Dashboard') },
        { path: '/admin/tests', element: withAccess(<AdminExams />, ADMIN_ROLES, 'Edit Tests') },
        { path: '/admin/tests/:id', element: <LegacyTestDetailRedirect /> },
        { path: '/admin/tests/:id/manage', element: withAccess(<AdminManageTestPage />, ADMIN_ROLES, 'Edit Tests') },
        { path: '/admin/tests/new', element: withAccess(<AdminNewTestWizard />, ADMIN_ROLES, 'Create Tests') },
        { path: '/admin/tests/:id/edit', element: withAccess(<AdminNewTestWizard />, ADMIN_ROLES, 'Edit Tests') },
        { path: '/admin/attempts/:attemptId/videos', element: withAccess(<AdminAttemptVideos />, ANALYSIS_ROLES, 'View Attempt Analysis') },
        { path: '/admin/videos/:attemptId', element: withAccess(<AdminAttemptVideos />, ANALYSIS_ROLES, 'View Attempt Analysis') },
        { path: '/admin/videos', element: withAccess(<AdminAttemptVideos />, ANALYSIS_ROLES, 'View Attempt Analysis') },
        { path: '/admin/categories', element: withAccess(<AdminCategories />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Categories') },
        { path: '/admin/grading-scales', element: withAccess(<AdminGradingScales />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Grading Scales') },
        { path: '/admin/question-pools', element: withAccess(<AdminQuestionPools />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Question Pools') },
        { path: '/admin/question-pools/:id', element: withAccess(<QuestionPoolDetail />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Question Pools') },
        { path: '/admin/sessions', element: withAccess(<AdminTestingSessions />, ADMIN_OR_INSTRUCTOR_ROLES, 'Assign Schedules') },
        { path: '/admin/candidates', element: withAccess(<AdminCandidates />, ANALYSIS_ROLES, 'View Attempt Analysis') },
        { path: '/admin/attempt-analysis', element: withAccess(<AdminAttemptAnalysis />, ANALYSIS_ROLES, 'View Attempt Analysis') },
        { path: '/admin/live-monitor', element: withAccess(<AdminLiveMonitor />, ANALYSIS_ROLES, 'View Attempt Analysis') },
        { path: '/admin/users', element: withAccess(<AdminUsers />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Users') },
        { path: '/admin/roles', element: withAccess(<AdminRolesPermissions />, SUPER_ADMIN, 'Manage Roles') },
        { path: '/admin/templates', element: withAccess(<AdminTemplates />, ADMIN_OR_INSTRUCTOR_ROLES, 'Edit Tests') },
        { path: '/admin/certificates', element: withAccess(<AdminCertificates />, ADMIN_ROLES, 'Edit Tests') },
        { path: '/admin/reports', element: withAccess(<AdminReports />, ADMIN_ROLES, 'Generate Reports') },
        { path: '/admin/courses', element: withAccess(<AdminCourses />, ADMIN_OR_INSTRUCTOR_ROLES, 'Edit Tests') },
        { path: '/admin/user-groups', element: withAccess(<AdminUserGroups />, ADMIN_ROLES, 'Manage Users') },
        { path: '/admin/settings', element: withAccess(<AdminSettings />, ADMIN_ROLES, 'System Settings') },
        { path: '/admin/surveys', element: withAccess(<AdminSurveys />, ADMIN_OR_INSTRUCTOR_ROLES, 'Edit Tests') },
        { path: '/admin/predefined-reports', element: withAccess(<AdminPredefinedReports />, ADMIN_ROLES, 'Generate Reports') },
        { path: '/admin/favorite-reports', element: withAccess(<AdminFavoriteReports />, ADMIN_ROLES, 'Generate Reports') },
        { path: '/admin/report-builder', element: withAccess(<AdminCustomReports />, ADMIN_ROLES, 'Generate Reports') },
        { path: '/admin/integrations', element: withAccess(<AdminIntegrations />, ADMIN_ROLES, 'System Settings') },
        { path: '/admin/maintenance', element: withAccess(<AdminMaintenance />, ADMIN_ROLES, 'System Settings') },
        { path: '/admin/subscribers', element: withAccess(<AdminSubscribers />, ADMIN_ROLES, 'System Settings') },
        { path: '/admin/audit-log', element: withAccess(<AdminAuditLog />, ADMIN_ROLES, 'View Audit Log') },
      ],
    },

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
