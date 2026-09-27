import { type InterestItem, formatPhone } from '@samaj/shared';
import { Check, Inbox, Phone, Undo2, X } from '@/components/ui/icons';
import { Link } from 'react-router';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Icon, Skeleton, buttonVariants, toast } from '@/components/ui';
import { formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useInterestAction, useInterests } from './api';

const STATUS_TONE = { pending: 'warning', accepted: 'success', declined: 'neutral', withdrawn: 'neutral' } as const;

function InterestRow({ item }: { item: InterestItem }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const action = useInterestAction();
  const run = (kind: 'accept' | 'decline' | 'withdraw') =>
    action.mutate(
      { id: item.id, action: kind },
      { onSuccess: () => toast.success(t(`matrimony.interest.done.${kind}`)), onError: (err) => toast.error(errorMessage(err)) },
    );

  const direction = item.sentByViewer ? t('matrimony.interest.sentFrom', { name: item.own.name }) : t('matrimony.interest.receivedFor', { name: item.own.name });

  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={item.other.name} src={item.other.photoUrl} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link to={`/matrimony/profiles/${item.other.id}?from=${item.own.id}`} className="font-display text-lg font-semibold break-words text-fg hover:underline">
            {item.other.name}
          </Link>
          <p className="text-sm text-fg-muted">
            {[item.other.age !== null ? t('family.age', { age: item.other.age }) : null, item.other.education].filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-fg-muted tabular-nums">
            {direction} · {formatDate(item.createdAt, language)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[item.status]}>{t(`matrimony.interest.status.${item.status}`)}</Badge>
      </div>

      {item.contact && (
        <div className="flex flex-wrap items-center gap-3 rounded-sm bg-success-soft p-3">
          <p className="text-sm text-fg">
            {t('matrimony.contactShared')} <span className="font-semibold">{item.contact.name}</span>
          </p>
          <a href={`tel:${item.contact.phone}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'tabular-nums')}>
            <Icon icon={Phone} />
            {formatPhone(item.contact.phone)}
          </a>
        </div>
      )}

      {item.status === 'pending' && (
        <div className="flex flex-wrap gap-2">
          {item.sentByViewer ? (
            <Button variant="ghost" size="sm" leadingIcon={Undo2} loading={action.isPending} onClick={() => run('withdraw')}>
              {t('matrimony.interest.withdraw')}
            </Button>
          ) : (
            <>
              <Button size="sm" leadingIcon={Check} loading={action.isPending} onClick={() => run('accept')}>
                {t('matrimony.interest.accept')}
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={X} disabled={action.isPending} onClick={() => run('decline')}>
                {t('matrimony.interest.decline')}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Section({ title, items }: { title: string; items: InterestItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <InterestRow key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

export function InterestsPage() {
  const t = useT();
  const interests = useInterests();

  if (interests.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (interests.isError) return <ErrorState title={t('matrimony.interest.error')} error={interests.error} onRetry={() => interests.refetch()} retrying={interests.isFetching} />;

  const items = interests.data;
  if (items.length === 0) return <EmptyState icon={Inbox} title={t('matrimony.interest.emptyTitle')} body={t('matrimony.interest.emptyBody')} />;

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('matrimony.interest.toAnswer')} items={items.filter((i) => !i.sentByViewer && i.status === 'pending')} />
      <Section title={t('matrimony.interest.accepted')} items={items.filter((i) => i.status === 'accepted')} />
      <Section title={t('matrimony.interest.sent')} items={items.filter((i) => i.sentByViewer && i.status === 'pending')} />
      <Section title={t('matrimony.interest.closed')} items={items.filter((i) => i.status === 'declined' || i.status === 'withdrawn')} />
    </div>
  );
}
