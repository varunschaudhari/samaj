import { can } from '@samaj/shared';
import { LogOut, UserRound, WifiOff } from '@/components/ui/icons';
import { NavLink, Outlet, useNavigation } from 'react-router';
import { Avatar, Button, Icon, Tooltip, toast } from '@/components/ui';
import { useLogout, useMe } from '@/features/auth/api';
import { usePendingCount } from '@/features/families/api';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/offline';
import { BrandMark } from './BrandMark';
import { LanguageSwitch } from './LanguageSwitch';
import { type NavItem, tabBarItems, visibleNavItems } from './nav-items';

/** Count bubble on the Review item. The number is also spoken via sr-only text. */
function PendingBadge({ count, className }: { count: number; className?: string }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('inline-flex min-w-5 items-center justify-center rounded-full bg-kumkum px-1.5 text-xs leading-5 font-semibold text-on-primary tabular-nums', className)}
      >
        {count > 99 ? '99+' : formatNumber(count, language)}
      </span>
      <span className="sr-only">{t('nav.pendingCount', { count })}</span>
    </>
  );
}

/**
 * Phones: top bar plus a bottom tab bar (icon and label, thumb-reachable).
 * md and up: a left sidebar with the same items.
 */
export function AppShell() {
  const t = useT();
  const logout = useLogout();
  const me = useMe();
  const online = useOnline();
  // A page's code is still downloading: say so at once, so a tap on a slow connection isn't met with nothing.
  const loadingPage = useNavigation().state === 'loading';
  const role = me.data?.role;
  const items = visibleNavItems(role);
  const pending = usePendingCount(Boolean(role && can(role, 'member:verify')));
  // Link straight to the family page (not the /family redirect) so the tab shows as active there.
  const hrefFor = (item: NavItem) => (item.to === '/family' && me.data ? `/families/${me.data.familyId}` : item.to);
  const badgeFor = (item: NavItem) => (item.pendingBadge ? (pending.data ?? 0) : 0);

  const signOut = () => logout.mutate(undefined, { onSettled: () => toast.info(t('auth.loggedOut')) });

  return (
    <div className="min-h-dvh bg-canvas md:grid md:grid-cols-[15rem_1fr]">
      {loadingPage && (
        <div role="progressbar" aria-label={t('common.loading')} className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-zari-soft">
          <div className="h-full w-1/3 animate-page-load rounded-full bg-zari" />
        </div>
      )}
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('nav.skipToContent')}
      </a>

      {/* Sidebar, md and up */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-3 py-5 md:flex">
        <BrandMark className="px-3" />
        <nav aria-label={t('nav.primary')} className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={hrefFor(item)}
              className={({ isActive }) =>
                cn(
                  'flex min-h-touch items-center gap-3 rounded-sm px-3 font-semibold transition-colors duration-150',
                  isActive ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon icon={item.icon} size="lg" weight={isActive ? 'fill' : 'regular'} />
                  <span className="flex-1">{t(item.label)}</span>
                  <PendingBadge count={badgeFor(item)} />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-1">
          <LanguageSwitch />
          <Button variant="ghost" leadingIcon={LogOut} onClick={signOut} loading={logout.isPending} className="justify-start px-2">
            {t('auth.logout')}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar, phones */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/95 py-2 pr-2 pl-4 backdrop-blur md:hidden">
          <BrandMark />
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <Tooltip content={t('nav.profile')} side="bottom">
              <NavLink to="/profile" aria-label={t('nav.profile')} className="flex size-touch items-center justify-center rounded-full">
                {me.data ? <Avatar name={me.data.name} size="sm" /> : <Icon icon={UserRound} />}
              </NavLink>
            </Tooltip>
          </div>
        </header>

        {!online && (
          <p role="status" className="sticky top-15 z-20 flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-sm text-fg md:top-0">
            <Icon icon={WifiOff} size="sm" className="text-warning" />
            {t('offline.banner')}
          </p>
        )}
        <main id="main" tabIndex={-1} className="flex-1 px-4 pt-5 pb-28 focus:outline-none sm:px-6 md:px-8 md:pt-8 md:pb-12">
          <Outlet />
        </main>

        {/* Bottom tab bar, phones */}
        <nav
          aria-label={t('nav.primary')}
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {tabBarItems(role).map((item) => (
            <NavLink
              key={item.to}
              to={hrefFor(item)}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[0.75rem] leading-tight font-semibold transition-colors duration-150',
                  isActive ? 'text-primary' : 'text-fg-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('relative flex h-7 w-14 items-center justify-center rounded-full', isActive && 'bg-primary-soft')}>
                    <Icon icon={item.icon} size="lg" weight={isActive ? 'fill' : 'regular'} />
                    <PendingBadge count={badgeFor(item)} className="absolute -top-1 right-1" />
                  </span>
                  <span className="max-w-full truncate">{t(item.tabLabel ?? item.label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
