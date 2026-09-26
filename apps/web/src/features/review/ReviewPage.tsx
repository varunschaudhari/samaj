import type { PendingFamily } from '@samaj/shared';
import { ChevronRight, ClipboardCheck, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, Skeleton } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { usePendingFamilies } from '@/features/families/api';
import { formatDate, useLanguageStore, useT } from '@/i18n';

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

export function ReviewPage() {
  const t = useT();
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={t('review.page.title')}
        description={total === undefined ? <Skeleton className="h-4 w-32" /> : <span className="tabular-nums">{t('review.page.count', { count: total })}</span>}
      />
      {body}
    </div>
  );
}
