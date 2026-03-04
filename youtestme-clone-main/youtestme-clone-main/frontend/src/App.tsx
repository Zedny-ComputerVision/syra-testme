// Version: 1.0.1 - Design Sync
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import AdminWrapper from './layouts/AdminWrapper';
import MainLayout from './layouts/main-layout';
import AdminHome from './pages/AdminHome';
import MySurveys from './pages/admin/MySurveys';
import AttemptAnalysis from './pages/admin/AttemptAnalysis';

import UserProfiles from './pages/admin/UserProfiles';
import UserGroups from './pages/admin/UserGroups';
import RolesAndPermissions from './pages/admin/RolesAndPermissions';
import ManageTests from './pages/admin/ManageTests';
import TestTemplates from './pages/admin/TestTemplates';
import ManageCertificates from './pages/admin/ManageCertificates';
import QuestionPools from './pages/admin/QuestionPools';
import QuestionPoolDetail from './pages/admin/QuestionPoolDetail';
import GradingScales from './pages/admin/GradingScales';
import Categories from './pages/admin/Categories';
import TestingSessions from './pages/admin/TestingSessions';
import Candidates from './pages/admin/Candidates';
import ManageSurveys from './pages/admin/ManageSurveys';
import NewSurveyWizard from './pages/admin/NewSurveyWizard';

import NewTestWizard from './pages/admin/NewTestWizard';
import SurveyQuestionPools from './pages/admin/SurveyQuestionPools';
import SurveyGradingScales from './pages/admin/SurveyGradingScales';
import ReportBuilder from './pages/admin/ReportBuilder';
import PredefinedReports from './pages/admin/PredefinedReports';
import MyFavoriteReports from './pages/admin/MyFavoriteReports';
import ScheduledReports from './pages/admin/ScheduledReports';
import Subscribers from './pages/admin/Subscribers';
import Settings from './pages/admin/Settings';
import Integrations from './pages/admin/Integrations';
import Maintenance from './pages/admin/Maintenance';
import Dashboard from './pages/Dashboard';
import MyTests from './pages/MyTests';
import Sessions from './pages/Sessions';
import ExamWindow from './pages/ExamWindow';
import EquipmentCheck from './pages/EquipmentCheck';
import VerifyID from './pages/VerifyID';
import AdminDashboard from './pages/AdminDashboard';
import AdminTests from './pages/AdminTests';
import Login from './pages/Login';
import SignUp from './pages/authentication/SignUp';
import AdminMyTests from './pages/admin/MyTests';
import EditTest from './pages/admin/EditTest';
import CustomThemeProvider from 'providers/CustomThemeProvider';
import { AuthProvider } from 'hooks/useAuth';

import MyTrainingCourses from './pages/MyTrainingCourses';
import TrainingCourses from './pages/admin/TrainingCourses';

function App() {
  return (
    <CustomThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/exam/:id" element={<ExamWindow />} />
            <Route path="/verify-id/:id" element={<VerifyID />} />
            <Route path="/admin" element={
              <AdminWrapper>
                <MainLayout>
                  <Outlet />
                </MainLayout>
              </AdminWrapper>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="home" element={<AdminHome />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="tests" element={<AdminTests />} />
              <Route path="my-surveys" element={<MySurveys />} />
              <Route path="reports/:attemptId" element={<AttemptAnalysis />} />

              <Route path="user-profiles" element={<UserProfiles />} />
              <Route path="user-groups" element={<UserGroups />} />
              <Route path="roles-permissions" element={<RolesAndPermissions />} />
              <Route path="manage-tests" element={<ManageTests />} />
              <Route path="test-templates" element={<TestTemplates />} />
              <Route path="manage-certificates" element={<ManageCertificates />} />
              <Route path="question-pools" element={<QuestionPools />} />
              <Route path="question-pools/:id" element={<QuestionPoolDetail />} />
              <Route path="grading-scales" element={<GradingScales />} />
              <Route path="categories" element={<Categories />} />
              <Route path="testing-sessions" element={<TestingSessions />} />
              <Route path="candidates" element={<Candidates />} />
              <Route path="manage-surveys" element={<ManageSurveys />} />
              <Route path="new-survey" element={<NewSurveyWizard />} />

              <Route path="report-builder" element={<ReportBuilder />} />
              <Route path="predefined-reports" element={<PredefinedReports />} />
              <Route path="favorite-reports" element={<MyFavoriteReports />} />
              <Route path="scheduled-reports" element={<ScheduledReports />} />
              <Route path="subscribers" element={<Subscribers />} />
              <Route path="new-test" element={<NewTestWizard />} />
              <Route path="edit-test/:id" element={<NewTestWizard />} />
              <Route path="test-management/:testId/:section" element={<EditTest />} />
              <Route path="survey-question-pools" element={<SurveyQuestionPools />} />
              <Route path="survey-grading-scales" element={<SurveyGradingScales />} />
              <Route path="my-tests" element={<AdminMyTests />} />

              <Route path="training" element={<TrainingCourses />} />
              <Route path="settings" element={<Settings />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="maintenance" element={<Maintenance />} />
            </Route>
            {/* User Routes */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="tests" element={<MyTests />} />
              <Route path="surveys" element={<MySurveys />} />
              <Route path="training" element={<MyTrainingCourses />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="equipment" element={<EquipmentCheck />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </CustomThemeProvider>
  );
}

export default App;
