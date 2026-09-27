import { HeartHandshake, Inbox, Search, UserRound } from '@/components/ui/icons';
import { Navigate, NavLink, Outlet } from 'react-router';
import { LIST_PAGE } from '@/components/layout/page-width';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, Icon, Skeleton } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { VerificationNotice } from '@/features/families/VerificationNotice';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useInterests, useMyMatrimony } from './api';

/** Matrimony: Search, Interests and My profiles, for verified families. */
export function MatrimonyLayout() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const interests = useInterests();
  const waiting = (interests.data ?? []).filter((i) => !i.sentByViewer && i.status === 'pending').length;

  const user = me.data;
  if (user && user.role === 'member' && user.familyStatus !== 'verified') {
    return (
      <div className="mx-auto max-w-lg pt-4">
        <VerificationNotice user={user} />
      </div>
    );
  }

  const sections = [
    { to: '/matrimony/search', label: t('matrimony.tab.search'), icon: Search, badge: 0, end: false },
    { to: '/matrimony/interests', label: t('matrimony.tab.interests'), icon: Inbox, badge: waiting, end: false },
    // Exact match: another family's profile lives under /matrimony/profiles/:id too.
    { to: '/matrimony/profiles', label: t('matrimony.tab.profiles'), icon: UserRound, badge: 0, end: true },
  ];

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <PageHeader title={t('matrimony.title')} description={t('matrimony.subtitle')} />
      <nav aria-label={t('matrimony.title')} className="flex border-b border-line">
        {sections.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.end}
            className={({ isActive }) =>
              cn(
                // Equal thirds on phones, with icons from sm up, so all three labels fit at 360px.
                '-mb-px flex min-h-touch flex-1 items-center justify-center gap-2 border-b-2 px-2 text-center text-sm leading-tight font-semibold transition-colors duration-150 sm:flex-none sm:px-4',
                isActive ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
              )
            }
          >
            <Icon icon={s.icon} className="hidden sm:block" />
            {s.label}
            {s.badge > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-kumkum px-1.5 text-xs leading-5 text-on-primary tabular-nums">
                {formatNumber(s.badge, language)}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

/** /matrimony: straight to search when the family has a live profile, otherwise to their profiles. */
export function MatrimonyIndex() {
  const t = useT();
  const mine = useMyMatrimony();
  if (mine.isPending) return <Skeleton className="h-40 w-full rounded-md" />;
  if (mine.isError) return <EmptyState icon={HeartHandshake} title={t('matrimony.error.title')} body={t('error.INTERNAL')} />;
  const hasLive = mine.data.profiles.some((p) => p.status === 'active');
  return <Navigate to={hasLive ? '/matrimony/search' : '/matrimony/profiles'} replace />;
}
