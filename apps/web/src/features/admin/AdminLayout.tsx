import { can } from '@samaj/shared';
import { ClipboardCheck, Network, Users } from '@/components/ui/icons';
import { Navigate, NavLink, Outlet } from 'react-router';
import { LIST_PAGE } from '@/components/layout/page-width';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { to: '/admin/review', label: 'admin.review', icon: ClipboardCheck, permission: 'member:verify' },
  { to: '/admin/people', label: 'admin.people', icon: Users, permission: 'user:assign-role' },
  { to: '/admin/branches', label: 'admin.branches', icon: Network, permission: 'branch:manage' },
] as const;

/** One Admin tab with Review, People and Branches as sections, so admins keep five tabs on phones. */
export function AdminLayout() {
  const t = useT();
  const me = useMe();
  const role = me.data?.role;
  const sections = SECTIONS.filter((s) => role && can(role, s.permission));

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <PageHeader title={t('admin.title')} />
      <nav aria-label={t('admin.title')} className="flex gap-1 border-b border-line">
        {sections.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              cn(
                '-mb-px flex min-h-touch flex-1 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors duration-150 sm:flex-none sm:px-4',
                isActive ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
              )
            }
          >
            <Icon icon={s.icon} className="hidden sm:block" />
            {t(s.label)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

/** /admin: open the first section this person may use. */
export function AdminIndex() {
  const me = useMe();
  const role = me.data?.role;
  const first = SECTIONS.find((s) => role && can(role, s.permission));
  return <Navigate to={first?.to ?? '/directory'} replace />;
}
