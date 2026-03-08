import React, { useState, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import useAuth from '../hooks/useAuth'
import Sidebar from '../components/Sidebar/Sidebar'
import Navbar from '../components/Navbar/Navbar'
import Footer from '../components/Footer/Footer'
import Loader from '../components/common/Loader/Loader'
import api from '../services/api'

/* ── Learner Pages ── */
import Login from '../pages/Login/Login'
import Home from '../pages/Home/Home'
import Exams from '../pages/Exams/Exams'
import ExamInstructions from '../pages/ExamInstructions/ExamInstructions'
import ForgotPassword from '../pages/Auth/ForgotPassword'
import ResetPassword from '../pages/Auth/ResetPassword'
import ChangePassword from '../pages/Auth/ChangePassword'
import SignUp from '../pages/Auth/SignUp'
import SystemCheckPage from '../pages/SystemCheckPage/SystemCheckPage'
import VerifyIdentityPage from '../pages/VerifyIdentityPage/VerifyIdentityPage'
import RulesPage from '../pages/RulesPage/RulesPage'
import Proctoring from '../pages/Proctoring/Proctoring'
import Attempts from '../pages/Attempts/Attempts'
import AttemptResult from '../pages/AttemptResult/AttemptResult'
import Schedule from '../pages/Schedule/Schedule'
import Profile from '../pages/Profile/Profile'
import NotFound from '../pages/NotFound/NotFound'
import AccessDenied from '../pages/AccessDenied/AccessDenied'

/* ── Admin Pages ── */
import AdminDashboard from '../pages/Admin/AdminDashboard/AdminDashboard'
import AdminExams from '../pages/Admin/AdminExams/AdminExams'
import AdminNewTestWizard from '../pages/Admin/AdminNewTestWizard/AdminNewTestWizard'
import AdminCategories from '../pages/Admin/AdminCategories/AdminCategories'
import AdminGradingScales from '../pages/Admin/AdminGradingScales/AdminGradingScales'
import AdminQuestionPools from '../pages/Admin/AdminQuestionPools/AdminQuestionPools'
import AdminTestingSessions from '../pages/Admin/AdminTestingSessions/AdminTestingSessions'
import AdminCandidates from '../pages/Admin/AdminCandidates/AdminCandidates'
import AdminAttemptAnalysis from '../pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis'
import AdminRolesPermissions from '../pages/Admin/AdminRolesPermissions/AdminRolesPermissions'
import AdminUsers from '../pages/Admin/AdminUsers/AdminUsers'
import AdminTemplates from '../pages/Admin/AdminTemplates/AdminTemplates'
import AdminCertificates from '../pages/Admin/AdminCertificates/AdminCertificates'
import AdminReports from '../pages/Admin/AdminReports/AdminReports'
import AdminCourses from '../pages/Admin/AdminCourses/AdminCourses'
import AdminUserGroups from '../pages/Admin/AdminUserGroups/AdminUserGroups'
import AdminSettings from '../pages/Admin/AdminSettings/AdminSettings'
import AdminSurveys from '../pages/Admin/AdminSurveys/AdminSurveys'
import AdminAttemptVideos from '../pages/Admin/AdminAttemptVideos/AdminAttemptVideos'
import AdminManageTestPage from '../pages/Admin/AdminManageTestPage/AdminManageTestPage'
import QuestionPoolDetail from '../pages/Admin/QuestionPoolDetail/QuestionPoolDetail'
import TrainingCourses from '../pages/TrainingCourses/TrainingCourses'
import MySurveys from '../pages/MySurveys/MySurveys'
import AdminPredefinedReports from '../pages/Admin/AdminPredefinedReports/AdminPredefinedReports'
import AdminFavoriteReports from '../pages/Admin/AdminFavoriteReports/AdminFavoriteReports'
import AdminIntegrations from '../pages/Admin/AdminIntegrations/AdminIntegrations'
import AdminMaintenance from '../pages/Admin/AdminMaintenance/AdminMaintenance'
import AdminSubscribers from '../pages/Admin/AdminSubscribers/AdminSubscribers'
import AdminCustomReports from '../pages/Admin/AdminCustomReports/AdminCustomReports'
import AdminAuditLog from '../pages/Admin/AdminAuditLog/AdminAuditLog'
import Maintenance from '../pages/Maintenance/Maintenance'

/* ── ProtectedRoute ── */
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

/* ── Shell (Sidebar + Navbar + Footer wrapper) ── */
function Shell({ children }) {
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [maintenance, setMaintenance] = useState({ mode: 'off', banner: '' })
  const location = useLocation()
  const isAttemptTakeMode = /^\/attempts\/[^/]+\/take$/.test(location.pathname)
  const isLegacyExamMode = ['/exam/', '/system-check/', '/verify-identity/', '/rules/']
    .some((prefix) => location.pathname.startsWith(prefix))
  const isTestJourneyMode = /^\/tests\/[^/]+(\/(system-check|verify-identity|rules))?$/.test(location.pathname)
  const isExamMode = isAttemptTakeMode || isLegacyExamMode || isTestJourneyMode

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await api.get('admin-settings/maintenance/public')
        setMaintenance({ mode: data.mode, banner: data.banner })
      } catch (e) {
        // ignore
      }
    }
    loadSettings()
    const id = setInterval(loadSettings, 120000)
    return () => clearInterval(id)
  }, [])

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
    <div className={`app-shell ${isExamMode ? 'app-shell--exam' : ''}`}>
      {maintenance.mode !== 'off' && (
        <div className="maintenance-banner">
          {maintenance.banner || 'Maintenance in progress'}
        </div>
      )}
      {!isExamMode && <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />}
      <div className="app-shell__main">
        {!isExamMode && <Navbar onMenuToggle={() => setMobileOpen(prev => !prev)} />}
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className={`app-shell__content ${isExamMode ? 'app-shell__content--exam' : 'glass'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
        {!isExamMode && <Footer />}
      </div>
    </div>
  )
}

/* ── AuthPage helper ── */
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

    // Learner
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

    // Admin Dashboard
    { path: '/admin', element: withAuth(<AdminDashboard />, ADMIN_ROLES, 'View Dashboard') },
    { path: '/admin/dashboard', element: withAuth(<AdminDashboard />, ADMIN_ROLES, 'View Dashboard') },

    // Tests (legacy compatibility redirects)
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

    // Testing Center
    { path: '/admin/sessions', element: withAuth(<AdminTestingSessions />, ADMIN_OR_INSTRUCTOR_ROLES, 'Assign Schedules') },
    { path: '/admin/schedules', element: <Navigate to="/admin/sessions" replace /> },
    { path: '/admin/candidates', element: withAuth(<AdminCandidates />, ANALYSIS_ROLES, 'View Attempt Analysis') },
    { path: '/admin/attempt-analysis', element: withAuth(<AdminAttemptAnalysis />, ANALYSIS_ROLES, 'View Attempt Analysis') },

    // Users
    { path: '/admin/users', element: withAuth(<AdminUsers />, ADMIN_OR_INSTRUCTOR_ROLES, 'Manage Users') },
    { path: '/admin/roles', element: withAuth(<AdminRolesPermissions />, SUPER_ADMIN, 'Manage Roles') },

    // Templates / Certificates / Reports
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
  return <RouterProvider router={router} />
}
