import { type Permission, can } from '@samaj/shared';
import type { ComponentType, ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { RouteErrorScreen } from '@/components/layout/ErrorBoundary';
import { ShellSkeleton } from '@/components/layout/ShellSkeleton';
import { useMe } from '@/features/auth/api';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/RequireAuth';
import { CommunityLayout } from '@/features/community/CommunityLayout';
import { DirectoryPage } from '@/features/directory/DirectoryPage';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { HomePage } from '@/features/home/HomePage';

/** Hides a page from roles without the permission. The API enforces the same rule. */
function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const me = useMe();
  if (!me.data || !can(me.data.role, permission)) return <Navigate to="/home" replace />;
  return children;
}

/**
 * Loads a page's code when it is first opened. The screens people land on
 * (Home and Directory) are in the first download; the rest, including
 * every form, arrive on demand. That keeps the first load small on a slow
 * connection, and the service worker keeps everything after the first visit.
 */
const page = (load: () => Promise<ComponentType>) => async () => ({ Component: await load() });
const guarded = (permission: Permission, load: () => Promise<ComponentType>) =>
  page(async () => {
    const Page = await load();
    return function Guarded() {
      return (
        <RequirePermission permission={permission}>
          <Page />
        </RequirePermission>
      );
    };
  });

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorScreen />,
    hydrateFallbackElement: <ShellSkeleton />,
    children: [
      {
        path: '/login',
        lazy: page(async () => {
          const { LoginPage } = await import('@/features/auth/LoginPage');
          return () => <RedirectIfAuthed><LoginPage /></RedirectIfAuthed>;
        }),
      },
      {
        path: '/signup',
        lazy: page(async () => {
          const { SignupPage } = await import('@/features/auth/SignupPage');
          return () => <RedirectIfAuthed><SignupPage /></RedirectIfAuthed>;
        }),
      },
      {
        path: '/join',
        lazy: page(async () => {
          const { JoinPage } = await import('@/features/auth/JoinPage');
          return () => <RedirectIfAuthed><JoinPage /></RedirectIfAuthed>;
        }),
      },
      {
        path: '/reset-password',
        lazy: page(async () => {
          const { ResetPasswordPage } = await import('@/features/auth/ResetPasswordPage');
          return () => <RedirectIfAuthed><ResetPasswordPage /></RedirectIfAuthed>;
        }),
      },
      // Public, so it can be read before signing up.
      { path: '/privacy', lazy: page(async () => (await import('@/features/privacy/PrivacyNoticePage')).PrivacyNoticePage) },
      // Public so the design system can be reviewed without an account.
      { path: '/styleguide', lazy: page(async () => (await import('@/features/styleguide/StyleguidePage')).StyleguidePage) },
      // Outside the app shell, so it prints as a clean page.
      {
        path: '/matrimony/profiles/:id/biodata',
        lazy: page(async () => {
          const { BiodataPage } = await import('@/features/matrimony/BiodataPage');
          return () => <RequireAuth><BiodataPage /></RequireAuth>;
        }),
      },
      {
        element: <RequireAuth><AppShell /></RequireAuth>,
        children: [
          { index: true, element: <Navigate to="/home" replace /> },
          { path: '/home', element: <HomePage /> },
          { path: '/dashboard', lazy: guarded('member:verify', async () => (await import('@/features/dashboard/DashboardPage')).DashboardPage) },
          {
            path: '/community',
            element: <CommunityLayout />,
            children: [
              { index: true, element: <Navigate to="/community/notices" replace /> },
              { path: 'notices', lazy: page(async () => (await import('@/features/community/NoticesPage')).NoticesPage) },
              { path: 'events', lazy: page(async () => (await import('@/features/community/EventsPage')).EventsPage) },
              { path: 'events/:id', lazy: page(async () => (await import('@/features/community/EventDetailPage')).EventDetailPage) },
              { path: 'committee', lazy: page(async () => (await import('@/features/community/CommitteePage')).CommitteePage) },
            ],
          },
          { path: '/directory', element: <DirectoryPage /> },
          { path: '/family', lazy: page(async () => (await import('@/features/families/FamilyPage')).MyFamilyRedirect) },
          { path: '/families/:familyId', lazy: page(async () => (await import('@/features/families/FamilyPage')).FamilyPage) },
          { path: '/families/:familyId/tree', lazy: page(async () => (await import('@/features/families/FamilyTreePage')).FamilyTreePage) },
          { path: '/relation', lazy: page(async () => (await import('@/features/families/RelationPage')).RelationPage) },
          {
            path: '/matrimony',
            lazy: page(async () => (await import('@/features/matrimony/MatrimonyLayout')).MatrimonyLayout),
            children: [
              { index: true, lazy: page(async () => (await import('@/features/matrimony/MatrimonyLayout')).MatrimonyIndex) },
              { path: 'search', lazy: page(async () => (await import('@/features/matrimony/SearchPage')).SearchPage) },
              { path: 'interests', lazy: page(async () => (await import('@/features/matrimony/InterestsPage')).InterestsPage) },
              { path: 'profiles', lazy: page(async () => (await import('@/features/matrimony/MyProfilesPage')).MyProfilesPage) },
              { path: 'profiles/:id', lazy: page(async () => (await import('@/features/matrimony/ProfileDetailPage')).ProfileDetailPage) },
            ],
          },
          { path: '/review', lazy: guarded('member:verify', async () => (await import('@/features/review/ReviewPage')).ReviewPage) },
          {
            path: '/admin',
            lazy: page(async () => (await import('@/features/admin/AdminLayout')).AdminLayout),
            children: [
              { index: true, lazy: page(async () => (await import('@/features/admin/AdminLayout')).AdminIndex) },
              {
                path: 'review',
                lazy: guarded('member:verify', async () => {
                  const { ReviewPage } = await import('@/features/review/ReviewPage');
                  return () => <ReviewPage embedded />;
                }),
              },
              { path: 'people', lazy: guarded('user:assign-role', async () => (await import('@/features/users/PeoplePage')).PeoplePage) },
              { path: 'branches', lazy: guarded('branch:manage', async () => (await import('@/features/branches/BranchesPage')).BranchesPage) },
            ],
          },
          // Old address from before People and Branches were grouped under Admin.
          { path: '/branches', element: <Navigate to="/admin/branches" replace /> },
          { path: '/profile', lazy: page(async () => (await import('@/features/profile/ProfilePage')).ProfilePage) },
          { path: '/profile/privacy', lazy: page(async () => (await import('@/features/privacy/PrivacySettingsPage')).PrivacySettingsPage) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
