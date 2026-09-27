import { type PendingFamily, type ReviewSort, isGlobalRole } from '@samaj/shared';
import { ChevronRight, ClipboardCheck, HeartHandshake, HourglassMedium, MapPin, UserPlus } from '@/components/ui/icons';
import { useState } from 'react';
import { Link } from 'react-router';
import { LIST_PAGE } from '@/components/layout/page-width';
import { PageHeader } from '@/components/layout/PageHeader';
import { type ActiveFilter, Avatar, Badge, Button, EmptyState, ErrorState, Icon, ListToolbar, LoadMore, Skeleton, SortSelect, Tabs } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { placeLabel } from '@/features/branches/api';
import { BranchSelect, useBranchLabel } from '@/features/branches/BranchSelect';
import { type ReviewFilters, usePendingFamilies } from '@/features/families/api';
import { EnrolFamilyModal } from '@/features/families/EnrolFamilyModal';
import { usePendingProfiles } from '@/features/matrimony/api';
import { ProfileCardSkeleton, ProfileCardView } from '@/features/matrimony/ProfileCardView';
import { usePendingMembers, usePendingMoves } from '@/features/families/links-api';
import { PendingMembersList, PendingMovesList } from './ApprovalLists';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatTotal, useLanguageStore, useT } from '@/i18n';

/** Past a week, a waiting family is flagged red. */
const LONG_WAIT_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
const LIST = 'divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card';
/** Columns from lg up; phones show each family as a compact row. */
const COLUMNS = 'lg:grid lg:grid-cols-[3rem_minmax(14rem,2fr)_minmax(10rem,1.5fr)_6rem_minmax(8rem,1fr)_minmax(8rem,1fr)_5.5rem] lg:gap-4';

function PendingHeader() {
  const t = useT();
  return (
    <li aria-hidden="true" className={cn('hidden items-center bg-surface-muted px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase', COLUMNS)}>
      <span />
      <span>{t('review.col.family')}</span>
      <span>{t('directory.col.place')}</span>
      <span>{t('review.col.people')}</span>
      <span>{t('review.col.submitted')}</span>
      <span>{t('review.col.waiting')}</span>
      <span />
    </li>
  );
}

function PendingCard({ family }: { family: PendingFamily }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const days = Math.floor((Date.now() - new Date(family.submittedAt).getTime()) / DAY);
  const waiting =
    days >= 1 ? (
      <Badge tone={days > LONG_WAIT_DAYS ? 'danger' : 'warning'} icon={HourglassMedium}>
        {t('review.waitingDays', { count: days })}
      </Badge>
    ) : null;
  return (
    <li>
      {/* The whole row is the link: a big target on phones. */}
      <Link to={`/families/${family.id}`} className={cn('flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted lg:py-2.5', COLUMNS)}>
        <Avatar name={family.headName} size="lg" className="lg:size-10" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words text-fg">{t('family.title', { name: family.headName })}</span>
            {waiting && <span className="lg:hidden">{waiting}</span>}
          </p>
          <p className="flex items-center gap-1 text-sm text-fg-muted lg:hidden">
            <Icon icon={MapPin} size="sm" />
            <span className="truncate">{placeLabel(family.place, family.branch, language)}</span>
          </p>
          <p className="text-sm text-fg-muted tabular-nums lg:hidden">
            {t('review.people', { count: family.memberCount })} · {t('review.submitted', { date: formatDate(family.submittedAt, language) })}
          </p>
        </div>
        <span className="hidden truncate text-sm text-fg lg:block">{placeLabel(family.place, family.branch, language)}</span>
        <span className="hidden text-sm text-fg tabular-nums lg:block">{formatNumber(family.memberCount, language)}</span>
        <span className="hidden text-sm text-fg tabular-nums lg:block">{formatDate(family.submittedAt, language)}</span>
        <span className="hidden lg:block">{waiting ?? <span className="text-sm text-fg-muted">–</span>}</span>
        <span className="flex items-center justify-end gap-1 text-sm font-semibold text-primary">
          <span className="hidden sm:inline">{t('review.open')}</span>
          <Icon icon={ChevronRight} />
        </span>
      </Link>
    </li>
  );
}

function PendingCardSkeleton() {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', COLUMNS)} aria-hidden="true">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </li>
  );
}

export function ReviewPage({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const [filters, setFilters] = useState<ReviewFilters>({ branchId: '', sort: 'oldest' });
  const pending = usePendingFamilies(filters);
  const branchLabel = useBranchLabel(filters.branchId);
  const active: ActiveFilter[] = branchLabel
    ? [{ key: 'branch', label: `${t('directory.filterBranch')}: ${branchLabel}`, onRemove: () => setFilters((f) => ({ ...f, branchId: '' })) }]
    : [];
  const [enrolling, setEnrolling] = useState(false);
  const items = pending.data?.pages.flatMap((p) => p.items) ?? [];
  const total = pending.data?.pages[0]?.total;

  let body;
  if (pending.isPending) {
    body = (
      <ul className={LIST} aria-busy="true" aria-label={t('common.loading')}>
        <PendingHeader />
        {[0, 1, 2].map((i) => (
          <PendingCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (pending.isError && items.length === 0) {
    body = <ErrorState title={t('review.error.title')} error={pending.error} onRetry={() => pending.refetch()} retrying={pending.isFetching} />;
  } else if (items.length === 0) {
    body = filters.branchId ? (
      <EmptyState icon={ClipboardCheck} title={t('review.emptyBranch.title')} body={t('review.emptyBranch.body')} />
    ) : (
      <EmptyState icon={ClipboardCheck} title={t('review.empty.title')} body={t('review.empty.body')} />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ul className={LIST} aria-busy={pending.isPlaceholderData || undefined}>
          <PendingHeader />
          {items.map((f) => (
            <PendingCard key={f.id} family={f} />
          ))}
        </ul>
        <LoadMore {...pending} label={t('review.loadMore')} />
      </div>
    );
  }

  const profiles = usePendingProfiles(true);
  const pendingMembers = usePendingMembers(true);
  const pendingMoves = usePendingMoves(true);
  let profileBody;
  if (profiles.isPending) {
    profileBody = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
        {[0, 1].map((i) => (
          <ProfileCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (profiles.isError) {
    profileBody = <ErrorState title={t('matrimony.review.error')} error={profiles.error} onRetry={() => profiles.refetch()} retrying={profiles.isFetching} />;
  } else if (profiles.data.length === 0) {
    profileBody = <EmptyState icon={HeartHandshake} title={t('matrimony.review.emptyTitle')} body={t('matrimony.review.emptyBody')} />;
  } else {
    profileBody = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {profiles.data.map((p) => (
          <ProfileCardView key={p.id} profile={p} href={`/matrimony/profiles/${p.id}`} />
        ))}
      </ul>
    );
  }

  const enrolButton = (
    <Button variant="secondary" leadingIcon={UserPlus} onClick={() => setEnrolling(true)}>
      {t('enrol.open')}
    </Button>
  );

  const count = (n: number | undefined) => (n === undefined ? '' : ` (${formatTotal(n, language)})`);

  return (
    <div className={embedded ? 'flex flex-col gap-4' : `${LIST_PAGE} gap-5`}>
      {!embedded && (
        <PageHeader
          title={t('review.page.title')}
          description={total === undefined ? <Skeleton className="h-4 w-32" /> : <span className="tabular-nums">{t('review.page.countShort', { count: formatTotal(total, language) })}</span>}
          actions={enrolButton}
        />
      )}
      {embedded && <div className="flex justify-end">{enrolButton}</div>}
      <Tabs
        label={t('review.page.title')}
        items={[
          {
            id: 'families',
            label: `${t('review.tab.families')}${count(total)}`,
            content: (
              <div className="flex flex-col gap-3">
                <ListToolbar
                  active={active}
                  summary={total === undefined ? <Skeleton className="h-4 w-24" /> : t('review.page.countShort', { count: formatTotal(total, language) })}
                  filters={
                    <BranchSelect
                      label={t('directory.filterBranch')}
                      allLabel={t('review.allMyBranches')}
                      value={filters.branchId}
                      onChange={(branchId) => setFilters((f) => ({ ...f, branchId }))}
                      within={me.data && !isGlobalRole(me.data.role) ? me.data.branchId : undefined}
                      fieldClassName="sm:w-56"
                    />
                  }
                  sort={
                    <SortSelect<ReviewSort>
                      label={t('list.sortBy')}
                      value={filters.sort}
                      onChange={(sort) => setFilters((f) => ({ ...f, sort }))}
                      options={[
                        { value: 'oldest', label: t('review.sort.oldest') },
                        { value: 'newest', label: t('review.sort.newest') },
                      ]}
                    />
                  }
                />
                {body}
              </div>
            ),
          },
          { id: 'people', label: `${t('review.tab.people')}${count(pendingMembers.data?.length)}`, content: <PendingMembersList query={pendingMembers} /> },
          { id: 'moves', label: `${t('review.tab.moves')}${count(pendingMoves.data?.length)}`, content: <PendingMovesList query={pendingMoves} /> },
          { id: 'profiles', label: `${t('review.tab.profiles')}${count(profiles.data?.length)}`, content: profileBody },
        ]}
      />
      <EnrolFamilyModal open={enrolling} onClose={() => setEnrolling(false)} />
    </div>
  );
}
