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

const AttendanceScanPage = lazy(() => import('./pages/AttendanceScanPage').then((module) => ({ default: module.AttendanceScanPage })));

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authenticated, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <div className="grid min-h-screen place-items-center text-slate-500">{t("Checking your session…")}</div>;
  return authenticated ? <>{children}</> : <Navigate to="/login" replace state={location.pathname === '/teacher-badge' ? { returnTo: location.pathname + location.hash } : undefined} />;
};

const RequireRoles: React.FC<{ roles: string[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { hasRole } = useAuth();
  if (hasRole(roles)) return <>{children}</>;
  return <Navigate to={hasRole(['PARENT']) ? '/parent-portal' : hasRole(['ENSEIGNANT']) ? '/students' : '/'} replace />;
};

const HomeByRole: React.FC = () => {
  const { hasRole } = useAuth();
  const destination = hasRole(['CONTROLEUR_PRESENCE']) ? '/attendance/scan' : hasRole(['PARENT']) ? '/parent-portal' : hasRole(['ENSEIGNANT']) ? '/students' : '/';
  return <Navigate to={destination} replace />;
};

export const App: React.FC = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><DashboardPage /></RequireRoles>} />
          <Route path="students" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT']}><StudentsPage /></RequireRoles>} />
          <Route path="parent-portal" element={<RequireRoles roles={['PARENT']}><ParentPortalPage /></RequireRoles>} />
          <Route path="academic-transition" element={<RequireRoles roles={['ADMIN','DIRECTEUR']}><AcademicTransitionPage /></RequireRoles>} />
          <Route path="parents" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><ParentsPage /></RequireRoles>} />
          <Route path="kimono" element={<RequireRoles roles={['ADMIN','DIRECTEUR','COMPTABLE']}><ActivityPaymentsPage category="KIMONO" /></RequireRoles>} />
          <Route path="karate" element={<RequireRoles roles={['ADMIN','DIRECTEUR','COMPTABLE']}><ActivityPaymentsPage category="KARATE" /></RequireRoles>} />
          <Route path="refunds" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><RefundsPage /></RequireRoles>} />
          <Route path="finance-control" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><FinanceControlPage /></RequireRoles>} />
          <Route path="registration-report" element={<RequireRoles roles={['ADMIN','DIRECTEUR','COMPTABLE']}><RegistrationReportPage /></RequireRoles>} />
          <Route path="teacher-badge" element={<RequireRoles roles={['ENSEIGNANT']}><TeacherBadgePage /></RequireRoles>} />
          <Route path="finances" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}><FinancesPage /></RequireRoles>} />
          <Route path="grades" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'ENSEIGNANT']}><GradesPage /></RequireRoles>} />
          <Route path="attendance" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'ENSEIGNANT']}><AttendancePage /></RequireRoles>} />
          <Route path="attendance/scan" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE']}><Suspense fallback={<div className="p-8 text-sm text-slate-500">{t("Chargement du scanner…")}</div>}><AttendanceScanPage /></Suspense></RequireRoles>} />
          <Route path="classes" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT']}><ClassesPage /></RequireRoles>} />
          <Route path="users" element={<RequireRoles roles={['ADMIN']}><UsersPage /></RequireRoles>} />
          <Route path="school-information" element={<SchoolInformationPage />} />
          <Route path="password" element={<PasswordPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="staff-attendance" element={<RequireRoles roles={['ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE']}><StaffAttendancePage /></RequireRoles>} />
          <Route path="data-transfer" element={<RequireRoles roles={['ADMIN']}><DataTransferPage /></RequireRoles>} />
        </Route>
        <Route path="*" element={<HomeByRole />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
