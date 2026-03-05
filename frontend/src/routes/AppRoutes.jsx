import React, { useState, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import useAuth from '../hooks/useAuth'
import Sidebar from '../components/Sidebar/Sidebar'
import Navbar from '../components/Navbar/Navbar'
import Footer from '../components/Footer/Footer'
import Loader from '../components/common/Loader/Loader'

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
import AdminManageTestPage from '../pages/Admin/AdminManageTestPage/AdminManageTestPage'
import AdminAttemptVideos from '../pages/Admin/AdminAttemptVideos/AdminAttemptVideos'
import QuestionPoolDetail from '../pages/Admin/QuestionPoolDetail/QuestionPoolDetail'
import TrainingCourses from '../pages/TrainingCourses/TrainingCourses'
import MySurveys from '../pages/MySurveys/MySurveys'
import AdminPredefinedReports from '../pages/Admin/AdminPredefinedReports/AdminPredefinedReports'
import AdminFavoriteReports from '../pages/Admin/AdminFavoriteReports/AdminFavoriteReports'
import AdminIntegrations from '../pages/Admin/AdminIntegrations/AdminIntegrations'
import AdminMaintenance from '../pages/Admin/AdminMaintenance/AdminMaintenance'
import AdminSubscribers from '../pages/Admin/AdminSubscribers/AdminSubscribers'
import AdminCustomReports from '../pages/Admin/AdminCustomReports/AdminCustomReports'
import Maintenance from '../pages/Maintenance/Maintenance'

/* ── ComingSoon placeholder ── */
function ComingSoon({ title }) {
  return (
    <div style={{ padding: '2.5rem', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🚧</div>
      <h2 style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>{title}</h2>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>This feature is under development and will be available soon.</p>
    </div>
  )
}

/* ── ProtectedRoute ── */
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()

  if (loading) return <Loader fullPage label="Authenticating..." />
  if (!user) return <Navigate to="/login" replace />
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

/* ── Shell (Sidebar + Navbar + Footer wrapper) ── */
function Shell({ children }) {
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [maintenance, setMaintenance] = useState({ mode: 'off', banner: '' })
  const location = useLocation()

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/admin-settings/maintenance/public')
        if (!res.ok) return
        const data = await res.json()
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
    <div className="app-shell">
      {maintenance.mode !== 'off' && (
        <div className="maintenance-banner">
          {maintenance.banner || 'Maintenance in progress'}
        </div>
      )}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="app-shell__main">
        <Navbar onMenuToggle={() => setMobileOpen(prev => !prev)} />
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className="app-shell__content glass"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
        <Footer />
      </div>
    </div>
  )
}

/* ── AuthPage helper ── */
function AuthPage({ children, roles }) {
  return (
    <ProtectedRoute roles={roles}>
      <Shell>{children}</Shell>
    </ProtectedRoute>
  )
}

const ADMIN_ROLES = ['ADMIN', 'INSTRUCTOR']
const SUPER_ADMIN = ['ADMIN']
const withAuth = (element, roles) => <AuthPage roles={roles}>{element}</AuthPage>

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    { path: '/signup', element: <SignUp /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/change-password', element: withAuth(<ChangePassword />) },
    { path: '/maintenance', element: <Maintenance /> },

    // Learner
    { path: '/', element: withAuth(<Home />) },
    { path: '/exams', element: withAuth(<Exams />) },
    { path: '/exams/:examId', element: withAuth(<ExamInstructions />) },
    { path: '/training', element: withAuth(<TrainingCourses />) },
    { path: '/surveys', element: withAuth(<MySurveys />) },
    { path: '/system-check/:examId', element: withAuth(<SystemCheckPage />) },
    { path: '/verify-identity/:examId', element: withAuth(<VerifyIdentityPage />) },
    { path: '/rules/:examId', element: withAuth(<RulesPage />) },
    { path: '/exam/:attemptId', element: withAuth(<Proctoring />) },
    { path: '/attempts', element: withAuth(<Attempts />) },
    { path: '/attempts/:id', element: withAuth(<AttemptResult />) },
    { path: '/attempt-result/:id', element: withAuth(<AttemptResult />) },
    { path: '/schedule', element: withAuth(<Schedule />) },
    { path: '/profile', element: withAuth(<Profile />) },

    // Admin Dashboard
    { path: '/admin', element: withAuth(<AdminDashboard />, ADMIN_ROLES) },
    { path: '/admin/dashboard', element: withAuth(<AdminDashboard />, ADMIN_ROLES) },

    // Tests
    { path: '/admin/tests', element: withAuth(<AdminExams />, ADMIN_ROLES) },
    { path: '/admin/tests/:id', element: withAuth(<AdminManageTestPage />, ADMIN_ROLES) },
    { path: '/admin/attempts/:attemptId/videos', element: withAuth(<AdminAttemptVideos />, ADMIN_ROLES) },
    { path: '/admin/exams', element: withAuth(<AdminExams />, ADMIN_ROLES) },
    { path: '/admin/exams/new', element: withAuth(<AdminNewTestWizard />, ADMIN_ROLES) },
    { path: '/admin/exams/:id/edit', element: withAuth(<AdminNewTestWizard />, ADMIN_ROLES) },
    { path: '/admin/new', element: withAuth(<AdminNewTestWizard />, ADMIN_ROLES) },
    { path: '/admin/categories', element: withAuth(<AdminCategories />, ADMIN_ROLES) },
    { path: '/admin/grading-scales', element: withAuth(<AdminGradingScales />, ADMIN_ROLES) },
    { path: '/admin/question-pools', element: withAuth(<AdminQuestionPools />, ADMIN_ROLES) },
    { path: '/admin/question-pools/:id', element: withAuth(<QuestionPoolDetail />, ADMIN_ROLES) },

    // Testing Center
    { path: '/admin/sessions', element: withAuth(<AdminTestingSessions />, ADMIN_ROLES) },
    { path: '/admin/schedules', element: withAuth(<AdminTestingSessions />, ADMIN_ROLES) },
    { path: '/admin/candidates', element: withAuth(<AdminCandidates />, ADMIN_ROLES) },
    { path: '/admin/attempt-analysis', element: withAuth(<AdminAttemptAnalysis />, ADMIN_ROLES) },

    // Users
    { path: '/admin/users', element: withAuth(<AdminUsers />, SUPER_ADMIN) },
    { path: '/admin/roles', element: withAuth(<AdminRolesPermissions />, SUPER_ADMIN) },

    // Templates / Certificates / Reports
    { path: '/admin/templates', element: withAuth(<AdminTemplates />, ADMIN_ROLES) },
    { path: '/admin/certificates', element: withAuth(<AdminCertificates />, ADMIN_ROLES) },
    { path: '/admin/reports', element: withAuth(<AdminReports />, ADMIN_ROLES) },
    { path: '/admin/courses', element: withAuth(<AdminCourses />, ADMIN_ROLES) },
    { path: '/admin/user-groups', element: withAuth(<AdminUserGroups />, ADMIN_ROLES) },
    { path: '/admin/settings', element: withAuth(<AdminSettings />, ADMIN_ROLES) },
    { path: '/admin/surveys', element: withAuth(<AdminSurveys />, ADMIN_ROLES) },
    { path: '/admin/predefined-reports', element: withAuth(<AdminPredefinedReports />, ADMIN_ROLES) },
    { path: '/admin/favorite-reports', element: withAuth(<AdminFavoriteReports />, ADMIN_ROLES) },
    { path: '/admin/report-builder', element: withAuth(<AdminCustomReports />, ADMIN_ROLES) },
    { path: '/admin/integrations', element: withAuth(<AdminIntegrations />, ADMIN_ROLES) },
    { path: '/admin/maintenance', element: withAuth(<AdminMaintenance />, ADMIN_ROLES) },
    { path: '/admin/subscribers', element: withAuth(<AdminSubscribers />, ADMIN_ROLES) },

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
