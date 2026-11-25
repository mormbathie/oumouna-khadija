import { RefundsPage } from './pages/RefundsPage';
import { RegistrationReportPage } from './pages/RegistrationReportPage';
import { TeacherBadgePage } from './pages/TeacherBadgePage';
import { ParentPortalPage } from './pages/ParentPortalPage';
import { AcademicTransitionPage } from './pages/AcademicTransitionPage';
import { FinanceControlPage } from './pages/FinanceControlPage';
import { ActivityPaymentsPage } from './pages/ActivityPaymentsPage';
import { SchoolInformationPage } from './pages/SchoolInformationPage';
import { t } from "./i18n/index";
import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { FeaturesProvider, useFeatures } from './auth/FeaturesContext';
import { FeaturesPage } from './pages/FeaturesPage';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { ParentsPage } from './pages/ParentsPage';
import { FinancesPage } from './pages/FinancesPage';
import { GradesPage } from './pages/GradesPage';
import { AttendancePage } from './pages/AttendancePage';
import { ClassesPage } from './pages/ClassesPage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { PasswordPage } from './pages/PasswordPage';
import { ProfilePage } from './pages/ProfilePage';
import { StaffAttendancePage } from './pages/StaffAttendancePage';
import { DataTransferPage } from './pages/DataTransferPage';
import { FeeSettingsPage } from './pages/FeeSettingsPage';
import { QuranCirclesPage } from './pages/QuranCirclesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { BoardingPage } from './pages/BoardingPage';

const AttendanceScanPage = lazy(() => import('./pages/AttendanceScanPage').then((module) => ({ default: module.AttendanceScanPage })));

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authenticated, initializing, user } = useAuth();
  const location = useLocation();
  if (initializing) return <div className="grid min-h-screen place-items-center text-slate-500">{t("Checking your session…")}</div>;
  // A temporary password (parent access, administrator reset) must be replaced before anything else.
  if (authenticated && user?.mustChangePassword && location.pathname !== '/password') return <Navigate to="/password" replace />;
  return authenticated ? <>{children}</> : <Navigate to="/login" replace state={location.pathname === '/teacher-badge' ? { returnTo: location.pathname + location.hash } : undefined} />;
};

const RequireRoles: React.FC<{ roles: string[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { hasRole } = useAuth();
  if (hasRole(roles)) return <>{children}</>;
  return <Navigate to={hasRole(['PARENT']) ? '/parent-portal' : hasRole(['SURVEILLANT_INTERNAT']) ? '/boarding' : hasRole(['ENSEIGNANT']) ? '/students' : '/'} replace />;
};

// Shown when the administrator switched the module off (direct link, bookmark).
const RequireFeature: React.FC<{ feature: string; children: React.ReactNode }> = ({ feature, children }) => {
  const { isEnabled } = useFeatures();
  if (isEnabled(feature)) return <>{children}</>;
  return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm"><h2 className="text-lg font-bold text-stone-900">Module désactivé</h2><p className="mt-2 text-sm text-stone-500">Cette fonctionnalité a été désactivée par l’administrateur. Les données sont conservées et réapparaîtront dès sa réactivation.</p></div>;
};

const HomeByRole: React.FC = () => {
  const { hasRole } = useAuth();
  const destination = hasRole(['SURVEILLANT_INTERNAT']) ? '/boarding' : hasRole(['CONTROLEUR_PRESENCE']) ? '/attendance/scan' : hasRole(['PARENT']) ? '/parent-portal' : hasRole(['ENSEIGNANT']) ? '/students' : '/';
  return <Navigate to={destination} replace />;
};

export const App: React.FC = () => (
  <AuthProvider>
    <FeaturesProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><DashboardPage /></RequireRoles>} />
          <Route path="students" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT']}><StudentsPage /></RequireRoles>} />
          <Route path="quran-circles" element={<RequireFeature feature="quranCircles"><RequireRoles roles={['ADMIN', 'DIRECTEUR']}><QuranCirclesPage /></RequireRoles></RequireFeature>} />
          <Route path="notifications" element={<RequireFeature feature="whatsapp"><RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><NotificationsPage /></RequireRoles></RequireFeature>} />
          <Route path="boarding" element={<RequireFeature feature="boarding"><RequireRoles roles={['ADMIN', 'DIRECTEUR', 'SURVEILLANT_INTERNAT']}><BoardingPage /></RequireRoles></RequireFeature>} />
          <Route path="parent-portal" element={<RequireFeature feature="parentPortal"><RequireRoles roles={['PARENT']}><ParentPortalPage /></RequireRoles></RequireFeature>} />
          <Route path="academic-transition" element={<RequireRoles roles={['ADMIN','DIRECTEUR']}><AcademicTransitionPage /></RequireRoles>} />
          <Route path="parents" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><ParentsPage /></RequireRoles>} />
          <Route path="kimono" element={<RequireFeature feature="activities"><RequireRoles roles={['ADMIN','DIRECTEUR','COMPTABLE']}><ActivityPaymentsPage category="KIMONO" /></RequireRoles></RequireFeature>} />
          <Route path="karate" element={<RequireFeature feature="activities"><RequireRoles roles={['ADMIN','DIRECTEUR','COMPTABLE']}><ActivityPaymentsPage category="KARATE" /></RequireRoles></RequireFeature>} />
          <Route path="refunds" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><RefundsPage /></RequireRoles>} />
          <Route path="finance-control" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><FinanceControlPage /></RequireRoles>} />
          <Route path="registration-report" element={<RequireRoles roles={['ADMIN','DIRECTEUR','COMPTABLE']}><RegistrationReportPage /></RequireRoles>} />
          <Route path="teacher-badge" element={<RequireFeature feature="staffAttendance"><RequireRoles roles={['ENSEIGNANT']}><TeacherBadgePage /></RequireRoles></RequireFeature>} />
          <Route path="finances" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><FinancesPage /></RequireRoles>} />
          <Route path="grades" element={<RequireFeature feature="grades"><RequireRoles roles={['ADMIN', 'DIRECTEUR', 'ENSEIGNANT']}><GradesPage /></RequireRoles></RequireFeature>} />
          <Route path="attendance" element={<RequireFeature feature="attendance"><RequireRoles roles={['ADMIN', 'DIRECTEUR', 'ENSEIGNANT']}><AttendancePage /></RequireRoles></RequireFeature>} />
          <Route path="attendance/scan" element={<RequireFeature feature="attendance"><RequireRoles roles={['ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE']}><Suspense fallback={<div className="p-8 text-sm text-slate-500">{t("Chargement du scanner…")}</div>}><AttendanceScanPage /></Suspense></RequireRoles></RequireFeature>} />
          <Route path="classes" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT']}><ClassesPage /></RequireRoles>} />
          <Route path="users" element={<RequireRoles roles={['ADMIN']}><UsersPage /></RequireRoles>} />
          <Route path="features" element={<RequireRoles roles={['ADMIN']}><FeaturesPage /></RequireRoles>} />
          <Route path="fee-settings" element={<RequireRoles roles={['ADMIN']}><FeeSettingsPage /></RequireRoles>} />
          <Route path="school-information" element={<SchoolInformationPage />} />
          <Route path="password" element={<PasswordPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="staff-attendance" element={<RequireFeature feature="staffAttendance"><RequireRoles roles={['ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE']}><StaffAttendancePage /></RequireRoles></RequireFeature>} />
          <Route path="data-transfer" element={<RequireFeature feature="dataTransfer"><RequireRoles roles={['ADMIN']}><DataTransferPage /></RequireRoles></RequireFeature>} />
        </Route>
        <Route path="*" element={<HomeByRole />} />
      </Routes>
    </BrowserRouter>
    </FeaturesProvider>
  </AuthProvider>
);

export default App;
