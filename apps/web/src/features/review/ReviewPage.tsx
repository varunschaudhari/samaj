import type { PendingFamily } from '@samaj/shared';
import { ChevronRight, ClipboardCheck, HeartHandshake, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, Skeleton, Tabs } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { usePendingFamilies } from '@/features/families/api';
import { usePendingProfiles } from '@/features/matrimony/api';
import { ProfileCardSkeleton, ProfileCardView } from '@/features/matrimony/ProfileCardView';
import { formatDate, formatNumber, useLanguageStore, useT } from '@/i18n';

function PendingCard({ family }: { family: PendingFamily }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  return (
    <Card as="li" padding="none">
      {/* The whole card is the link: a big target on phones. */}
      <Link to={`/families/${family.id}`} className="flex items-center gap-3 rounded-md p-4 transition-colors duration-150 hover:bg-surface-muted">
        <Avatar name={family.headName} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-display text-lg font-semibold break-words text-fg">{t('family.title', { name: family.headName })}</p>
          <p className="flex items-center gap-1 text-sm text-fg-muted">
            <Icon icon={MapPin} size="sm" />
            <span className="truncate">{placeLabel(family.place, family.branch, language)}</span>
          </p>
          <p className="text-sm text-fg-muted tabular-nums">
            {t('review.people', { count: family.memberCount })} · {t('review.submitted', { date: formatDate(family.submittedAt, language) })}
          </p>
        </div>
        <span className="flex items-center gap-1 text-sm font-semibold text-primary">
          <span className="hidden sm:inline">{t('review.open')}</span>
          <Icon icon={ChevronRight} />
        </span>
      </Link>
    </Card>
  );
}

function PendingCardSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-surface p-4" aria-hidden="true">
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
  const pending = usePendingFamilies();
  const items = pending.data?.pages.flatMap((p) => p.items) ?? [];
  const total = pending.data?.pages[0]?.total;

  let body;
  if (pending.isPending) {
    body = (
      <ul className="flex flex-col gap-3" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((i) => (
          <PendingCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (pending.isError && items.length === 0) {
    body = <ErrorState title={t('review.error.title')} error={pending.error} onRetry={() => pending.refetch()} retrying={pending.isFetching} />;
  } else if (items.length === 0) {
    body = <EmptyState icon={ClipboardCheck} title={t('review.empty.title')} body={t('review.empty.body')} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {items.map((f) => (
            <PendingCard key={f.id} family={f} />
          ))}
        </ul>
        {pending.hasNextPage && (
          <Button variant="secondary" className="self-center" loading={pending.isFetchingNextPage} onClick={() => pending.fetchNextPage()}>
            {t('directory.loadMore')}
          </Button>
        )}
      </div>
    );
  }

  const profiles = usePendingProfiles(true);
  let profileBody;
  if (profiles.isPending) {
    profileBody = (
      <ul className="grid gap-3 md:grid-cols-2" aria-busy="true">
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
      <ul className="grid gap-3 md:grid-cols-2">
        {profiles.data.map((p) => (
          <ProfileCardView key={p.id} profile={p} href={`/matrimony/profiles/${p.id}`} />
        ))}
      </ul>
    );
  }

  const count = (n: number | undefined) => (n === undefined ? '' : ` (${formatNumber(n, language)})`);

  return (
    <div className={embedded ? 'flex flex-col gap-4' : 'mx-auto flex max-w-3xl flex-col gap-5'}>
      {!embedded && (
        <PageHeader
          title={t('review.page.title')}
          description={total === undefined ? <Skeleton className="h-4 w-32" /> : <span className="tabular-nums">{t('review.page.count', { count: total })}</span>}
        />
      )}
      <Tabs
        label={t('review.page.title')}
        items={[
          { id: 'families', label: `${t('review.tab.families')}${count(total)}`, content: body },
          { id: 'profiles', label: `${t('review.tab.profiles')}${count(profiles.data?.length)}`, content: profileBody },
        ]}
      />
    </div>
  );
}
