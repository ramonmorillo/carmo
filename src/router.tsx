import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { AdminPage } from './pages/AdminPage';
import { AgendaPage } from './pages/AgendaPage';
import { ConfirmEmailLinkPage } from './pages/ConfirmEmailLinkPage';
import { HomePage } from './pages/HomePage';
import { InterventionsPage } from './pages/InterventionsPage';
import { LoginPage } from './pages/LoginPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';
import { ProjectPage } from './pages/ProjectPage';
import { QuestionnaireFormPage } from './pages/QuestionnaireFormPage';
import { QuestionnairesPage } from './pages/QuestionnairesPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { StratificationPage } from './pages/StratificationPage';
import { VisitPage } from './pages/VisitPage';

export const router = createHashRouter([
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/confirm', element: <ConfirmEmailLinkPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: '/dashboard', element: <HomePage /> },
      { path: '/patients', element: <PatientsPage /> },
      { path: '/patients/:id', element: <PatientDetailPage /> },
      { path: '/visits/:visitId', element: <VisitPage /> },
      { path: '/visits/:visitId/questionnaires/:instrument', element: <QuestionnaireFormPage /> },
      { path: '/agenda', element: <AgendaPage /> },
      { path: '/questionnaires', element: <QuestionnairesPage /> },
      { path: '/stratification', element: <StratificationPage /> },
      { path: '/interventions', element: <InterventionsPage /> },
      // Exportación: incluye xlsx; solo se carga al entrar.
      { path: '/export', lazy: async () => ({ Component: (await import('./pages/ExportPage')).ExportPage }) },
      { path: '/admin', element: <AdminPage /> },
      { path: '/project', element: <ProjectPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
