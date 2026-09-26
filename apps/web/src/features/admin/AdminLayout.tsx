import { can } from '@samaj/shared';
import { Network, Users } from 'lucide-react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { to: '/admin/people', label: 'admin.people', icon: Users, permission: 'user:assign-role' },
  { to: '/admin/branches', label: 'admin.branches', icon: Network, permission: 'branch:manage' },
] as const;

/** One Admin tab in the navigation, with People and Branches as sections, so phones keep five tabs. */
export function AdminLayout() {
  const t = useT();
  const me = useMe();
  const role = me.data?.role;
  const sections = SECTIONS.filter((s) => role && can(role, s.permission));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={t('admin.title')} />
      <nav aria-label={t('admin.title')} className="flex gap-1 border-b border-line">
        {sections.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              cn(
                '-mb-px flex min-h-touch items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors duration-150',
                isActive ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
              )
            }
          >
            <Icon icon={s.icon} />
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
