import { Navigate, createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { RouteErrorScreen } from '@/components/layout/ErrorBoundary';
import { LoginPage } from '@/features/auth/LoginPage';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/RequireAuth';
import { SignupPage } from '@/features/auth/SignupPage';
import { DirectoryPage } from '@/features/directory/DirectoryPage';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { StyleguidePage } from '@/features/styleguide/StyleguidePage';

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorScreen />,
    children: [
      { path: '/login', element: <RedirectIfAuthed><LoginPage /></RedirectIfAuthed> },
      { path: '/signup', element: <RedirectIfAuthed><SignupPage /></RedirectIfAuthed> },
      // Public so the design system can be reviewed without an account.
      { path: '/styleguide', element: <StyleguidePage /> },
      {
        element: <RequireAuth><AppShell /></RequireAuth>,
        children: [
          { index: true, element: <Navigate to="/directory" replace /> },
          { path: '/directory', element: <DirectoryPage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
