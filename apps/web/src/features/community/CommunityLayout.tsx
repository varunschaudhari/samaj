import { CalendarDays, type AppIcon, Megaphone, UsersRound } from '@/components/ui/icons';
import { NavLink, Outlet } from 'react-router';
import { LIST_PAGE } from '@/components/layout/page-width';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui';
import { type MessageKey, useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** Sections of the Community tab. */
export const COMMUNITY_SECTIONS: { to: string; label: MessageKey; icon: AppIcon }[] = [
  { to: '/community/notices', label: 'community.notices', icon: Megaphone },
  { to: '/community/events', label: 'community.events', icon: CalendarDays },
  { to: '/community/committee', label: 'community.committee', icon: UsersRound },
];

export function CommunityLayout() {
  const t = useT();
  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <PageHeader title={t('community.title')} description={t('community.subtitle')} />
      {COMMUNITY_SECTIONS.length > 1 && (
        <nav aria-label={t('community.title')} className="flex border-b border-line">
          {COMMUNITY_SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex min-h-touch flex-1 items-center justify-center gap-2 border-b-2 px-2 text-center text-sm leading-tight font-semibold transition-colors duration-150 sm:flex-none sm:px-4',
                  isActive ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
                )
              }
            >
              <Icon icon={s.icon} className="hidden sm:block" />
              {t(s.label)}
            </NavLink>
          ))}
        </nav>
      )}
      <Outlet />
    </div>
  );
}
