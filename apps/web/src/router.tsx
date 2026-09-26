import { type Permission, can } from '@samaj/shared';
import type { ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { RouteErrorScreen } from '@/components/layout/ErrorBoundary';
import { useMe } from '@/features/auth/api';
import { LoginPage } from '@/features/auth/LoginPage';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/RequireAuth';
import { SignupPage } from '@/features/auth/SignupPage';
import { BranchesPage } from '@/features/branches/BranchesPage';
import { DirectoryPage } from '@/features/directory/DirectoryPage';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { FamilyPage, MyFamilyRedirect } from '@/features/families/FamilyPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { StyleguidePage } from '@/features/styleguide/StyleguidePage';

/** Hides a page from roles without the permission. The API enforces the same rule. */
function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const me = useMe();
  if (!me.data || !can(me.data.role, permission)) return <Navigate to="/directory" replace />;
  return children;
}

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
          { path: '/family', element: <MyFamilyRedirect /> },
          { path: '/families/:familyId', element: <FamilyPage /> },
          { path: '/review', element: <RequirePermission permission="member:verify"><ReviewPage /></RequirePermission> },
          { path: '/branches', element: <RequirePermission permission="branch:manage"><BranchesPage /></RequirePermission> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
