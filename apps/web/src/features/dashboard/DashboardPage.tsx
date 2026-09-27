import { type Dashboard, type DashboardBranchRow, can, isGlobalRole } from '@samaj/shared';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { LIST_PAGE } from '@/components/layout/page-width';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, ErrorState, Icon, IconButton, ListToolbar, Skeleton, SortSelect, buttonVariants } from '@/components/ui';
import {
  type AppIcon,
  BookUser,
  CalendarDays,
  CalendarPlus,
  ChartBar,
  ChevronRight,
  ClipboardCheck,
  HeartHandshake,
  Megaphone,
  Network,
  RotateCw,
  UserPlus,
  Users,
  UsersRound,
} from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { branchName } from '@/features/branches/api';
import { EnrolFamilyModal } from '@/features/families/EnrolFamilyModal';
import { type MessageKey, formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useDashboard } from './api';

type Tone = 'primary' | 'kumkum' | 'info' | 'zari' | 'success';
const TONE: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary',
  kumkum: 'bg-kumkum-soft text-kumkum',
  info: 'bg-info-soft text-info',
  zari: 'bg-zari-soft text-zari-fg',
  success: 'bg-success-soft text-success',
};

function StatCard({ icon, tone, label, value, detail, to }: { icon: AppIcon; tone: Tone; label: string; value: string; detail?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex size-11 items-center justify-center rounded-md', TONE[tone])}>
          <Icon icon={icon} size="lg" weight="duotone" />
        </span>
        {to && <Icon icon={ChevronRight} className="text-fg-muted" />}
      </div>
      <p className="mt-3 font-display text-3xl leading-none font-semibold text-fg tabular-nums">{value}</p>
      <p className="mt-1 text-sm font-semibold text-fg">{label}</p>
      {detail && <p className="mt-0.5 text-xs text-fg-muted tabular-nums">{detail}</p>}
    </>
  );
  const className = 'flex h-full flex-col rounded-md border border-line bg-surface p-4 shadow-card';
  return to ? (
    <Link to={to} className={cn(className, 'transition-colors duration-150 hover:border-line-strong')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-md border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="size-11 rounded-md" />
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-2 h-4 w-28" />
    </div>
  );
}

/** Verified, waiting and returned families as one bar, with the numbers beside it. */
function VerificationCard({ families }: { families: Dashboard['families'] }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const total = families.verified + families.pending + families.rejected;
  const parts = [
    { key: 'verified', value: families.verified, bar: 'bg-success', label: t('status.verified') },
    { key: 'pending', value: families.pending, bar: 'bg-zari', label: t('dashboard.waiting') },
    { key: 'rejected', value: families.rejected, bar: 'bg-danger', label: t('dashboard.returned') },
  ];
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fg">{t('dashboard.verification')}</h2>
        <span className="text-sm text-fg-muted tabular-nums">{t('dashboard.verifiedPct', { pct: formatNumber(pct(families.verified), language) })}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        {parts.map((p) => p.value > 0 && <div key={p.key} className={p.bar} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.key} className="flex flex-col">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span className={cn('size-2.5 rounded-full', p.bar)} aria-hidden="true" />
              {p.label}
            </span>
            <span className="font-display text-xl font-semibold text-fg tabular-nums">{formatNumber(p.value, language)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** New families per week, as bars. The same numbers are in a table for screen readers. */
function SubmissionsCard({ weeks }: { weeks: Dashboard['submissions'] }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const label = (iso: string) =>
    new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { day: 'numeric', month: 'numeric' }).format(new Date(`${iso}T00:00:00`));
  const thisWeek = weeks.at(-1)?.count ?? 0;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fg">{t('dashboard.newFamilies')}</h2>
        <span className="text-sm text-fg-muted tabular-nums">{t('dashboard.thisWeek', { count: formatNumber(thisWeek, language) })}</span>
      </div>
      <div className="flex h-36 items-end gap-1.5" aria-hidden="true">
        {weeks.map((w, i) => (
          <div key={w.weekStart} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-fg-muted tabular-nums">{w.count > 0 ? formatNumber(w.count, language) : ''}</span>
            <div
              className={cn('w-full max-w-10 rounded-t-sm', i === weeks.length - 1 ? 'bg-primary' : 'bg-primary/35')}
              style={{ height: `${Math.max(4, (w.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-center text-[0.6875rem] leading-tight text-fg-muted" aria-hidden="true">
        {weeks.map((w, i) => (
          <span key={w.weekStart} className={cn('flex-1 truncate', i % 2 === 1 && 'max-sm:invisible')}>
            {label(w.weekStart)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t('dashboard.newFamilies')}</caption>
        <thead>
          <tr>
            <th>{t('dashboard.weekOf')}</th>
            <th>{t('dashboard.families')}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{label(w.weekStart)}</td>
              <td>{w.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

type BranchSort = 'families' | 'pending' | 'name';

function BranchTable({ rows, scope }: { rows: DashboardBranchRow[]; scope: Dashboard['scope'] }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<BranchSort>('families');
  const q = search.trim().toLocaleLowerCase();
  const shown = rows
    .filter((r) => !q || r.name.toLocaleLowerCase().includes(q) || r.nameMr.includes(search.trim()))
    .sort((a, b) =>
      sort === 'name'
        ? branchName(a, language).localeCompare(branchName(b, language), language)
        : sort === 'pending'
          ? b.pending - a.pending || b.families - a.families
          : b.families - a.families || a.name.localeCompare(b.name),
    );
  const n = (v: number) => formatNumber(v, language);

  return (
    <Card padding="none" className="flex flex-col">
      <div className="flex flex-col gap-3 p-4 pb-0">
        <h2 className="font-display text-lg font-semibold text-fg">{scope ? t('dashboard.byTown') : t('dashboard.byDistrict')}</h2>
        {rows.length > 5 ? (
          <ListToolbar
            search={{ value: search, onChange: setSearch, label: t('branches.search'), placeholder: t('branches.searchPlaceholder') }}
            summary={t('branches.showing', { count: shown.length })}
            sort={
              <SortSelect<BranchSort>
                label={t('list.sortBy')}
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'families', label: t('dashboard.sort.families') },
                  { value: 'pending', label: t('dashboard.sort.pending') },
                  { value: 'name', label: t('dashboard.sort.name') },
                ]}
              />
            }
          />
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-fg-muted">{t('branches.noMatch.title')}</p>
      ) : (
        <>
          {/* Phones: one row per branch; wider screens: the table. */}
          <ul className="divide-y divide-line md:hidden">
            {shown.map((r) => {
              const pct = r.families ? Math.round((r.verified / r.families) * 100) : 0;
              return (
                <li key={r.id}>
                  <Link to={`/directory?branch=${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-fg">{branchName(r, language)}</span>
                        {r.pending > 0 && <Badge tone="kumkum">{t('dashboard.waitingCount', { count: n(r.pending) })}</Badge>}
                        {r.committee === 0 && <Badge tone="danger">{t('dashboard.noCommittee')}</Badge>}
                      </span>
                      <span className="text-xs text-fg-muted tabular-nums">
                        {t('dashboard.rowSummary', { families: n(r.families), verified: n(r.verified) })}
                      </span>
                      <span className="flex h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                        <span className="bg-success" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                    <Icon icon={ChevronRight} className="text-fg-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  <th scope="col" className="px-4 py-3">
                    {t('directory.filterBranch')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {t('dashboard.families')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {t('status.verified')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {t('dashboard.waiting')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {t('dashboard.committee')}
                  </th>
                  <th scope="col" className="w-10 px-2 py-3">
                    <span className="sr-only">{t('dashboard.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => {
                  const pct = r.families ? Math.round((r.verified / r.families) * 100) : 0;
                  return (
                    <tr key={r.id} className="transition-colors duration-150 hover:bg-surface-muted">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-fg">
                        <span className="flex flex-col">
                          {branchName(r, language)}
                          {/* How far along this branch is. */}
                          <span className="mt-1.5 flex h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                            <span className="bg-success" style={{ width: `${pct}%` }} />
                          </span>
                        </span>
                      </th>
                      <td className="px-3 py-3 text-right text-fg tabular-nums">{n(r.families)}</td>
                      <td className="px-3 py-3 text-right text-fg tabular-nums">{n(r.verified)}</td>
                      <td className={cn('px-3 py-3 text-right tabular-nums', r.pending > 0 ? 'font-semibold text-kumkum' : 'text-fg-muted')}>{n(r.pending)}</td>
                      <td className={cn('px-3 py-3 text-right tabular-nums', r.committee === 0 ? 'text-danger' : 'text-fg')}>
                        {r.committee === 0 ? t('dashboard.none') : n(r.committee)}
                      </td>
                      <td className="px-2 py-1">
                        <Link
                          to={`/directory?branch=${r.id}`}
                          aria-label={t('dashboard.openBranch', { name: branchName(r, language) })}
                          className="flex size-touch items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-primary"
                        >
                          <Icon icon={ChevronRight} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function QuickActions({ onEnrol }: { onEnrol: () => void }) {
  const t = useT();
  const me = useMe();
  const role = me.data?.role;
  if (!role) return null;
  const admin = isGlobalRole(role);
  const links: { to: string; icon: AppIcon; label: MessageKey }[] = [
    { to: admin ? '/admin/review' : '/review', icon: ClipboardCheck, label: 'dashboard.action.review' },
    { to: '/community/notices', icon: Megaphone, label: 'dashboard.action.notice' },
    { to: '/community/events', icon: CalendarPlus, label: 'dashboard.action.event' },
    ...(can(role, 'user:assign-role') ? [{ to: '/admin/people', icon: Users, label: 'dashboard.action.people' } as const] : []),
    ...(can(role, 'branch:manage') ? [{ to: '/admin/branches', icon: Network, label: 'dashboard.action.branches' } as const] : []),
  ];
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-fg">{t('dashboard.actions')}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button leadingIcon={UserPlus} onClick={onEnrol} className="justify-start">
          {t('enrol.open')}
        </Button>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className={cn(buttonVariants({ variant: 'secondary' }), 'justify-start')}>
            <Icon icon={l.icon} />
            {t(l.label)}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** Committee and admins: their branch (or every branch) at a glance. */
export function DashboardPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const dashboard = useDashboard();
  const [enrolling, setEnrolling] = useState(false);
  const d = dashboard.data;
  const n = (v: number) => formatNumber(v, language);
  const reviewHref = me.data && isGlobalRole(me.data.role) ? '/admin/review' : '/review';

  const scopeName = d ? (d.scope ? branchName(d.scope, language) : t('dashboard.allBranches')) : null;
  const updated = d
    ? new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(d.generatedAt))
    : null;

  let body;
  if (dashboard.isPending) {
    body = (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-busy="true" aria-label={t('common.loading')}>
        {Array.from({ length: 6 }, (_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
    );
  } else if (dashboard.isError || !d) {
    body = <ErrorState title={t('dashboard.error')} error={dashboard.error} onRetry={() => dashboard.refetch()} retrying={dashboard.isFetching} />;
  } else {
    const families = d.families.verified + d.families.pending + d.families.rejected;
    body = (
      <div className="flex flex-col gap-4">
        <section aria-label={t('dashboard.figures')} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            icon={UsersRound}
            tone="primary"
            label={t('dashboard.families')}
            value={n(families)}
            detail={t('dashboard.familiesDetail', { verified: n(d.families.verified) })}
          />
          <StatCard
            icon={ClipboardCheck}
            tone={d.families.pending > 0 ? 'kumkum' : 'success'}
            label={t('dashboard.waitingReview')}
            value={n(d.families.pending)}
            detail={d.families.pending > 0 ? t('dashboard.reviewNow') : t('home.review.none')}
            to={reviewHref}
          />
          <StatCard icon={BookUser} tone="info" label={t('dashboard.members')} value={n(d.members)} detail={t('dashboard.membersDetail')} to="/directory" />
          <StatCard
            icon={HeartHandshake}
            tone="kumkum"
            label={t('dashboard.profiles')}
            value={n(d.matrimony.active)}
            detail={d.matrimony.pending > 0 ? t('dashboard.profilesPending', { count: n(d.matrimony.pending) }) : undefined}
            to={reviewHref}
          />
          <StatCard icon={CalendarDays} tone="zari" label={t('dashboard.upcomingEvents')} value={n(d.events.upcoming)} to="/community/events" />
          <StatCard icon={Megaphone} tone="success" label={t('dashboard.notices30')} value={n(d.notices.last30Days)} to="/community/notices" />
        </section>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VerificationCard families={d.families} />
          <SubmissionsCard weeks={d.submissions} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <BranchTable rows={d.branches} scope={d.scope} />
          <QuickActions onEnrol={() => setEnrolling(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <PageHeader
        title={t('dashboard.title')}
        description={
          scopeName ? (
            <span className="flex flex-wrap items-center gap-x-2">
              <Icon icon={ChartBar} size="sm" />
              {scopeName}
              <span aria-hidden="true">·</span>
              {t('dashboard.updated', { time: updated ?? '' })}
            </span>
          ) : (
            <Skeleton className="h-4 w-40" />
          )
        }
        actions={<IconButton icon={RotateCw} label={t('dashboard.refresh')} onClick={() => dashboard.refetch()} disabled={dashboard.isFetching} />}
      />
      {body}
      <EnrolFamilyModal open={enrolling} onClose={() => setEnrolling(false)} />
    </div>
  );
}
