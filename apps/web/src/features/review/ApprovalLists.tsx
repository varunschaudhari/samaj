import type { MemberMoveView, PendingMember } from '@samaj/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Button, EmptyState, ErrorState, Icon, Skeleton, toast } from '@/components/ui';
import { ArrowRight, Check, UserPlus, Users, X } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { ReasonModal } from '@/features/families/FamilyLinks';
import { useApproveMember, useApproveMove, useDeclineMove, useRejectMember } from '@/features/families/links-api';
import { formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';

const LIST = 'divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card';

function ListSkeleton() {
  return (
    <ul className={LIST} aria-busy="true">
      {[0, 1].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface QueryLike<T> {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  data: T[] | undefined;
  refetch: () => unknown;
}

/** People families added after verification: approve, or turn down with a reason. */
export function PendingMembersList({ query }: { query: QueryLike<PendingMember> }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const approve = useApproveMember();
  const reject = useRejectMember();
  const [rejecting, setRejecting] = useState<PendingMember | null>(null);

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <ErrorState title={t('approvals.error')} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  const items = query.data ?? [];
  if (items.length === 0) return <EmptyState icon={UserPlus} title={t('approvals.emptyTitle')} body={t('approvals.emptyBody')} />;

  return (
    <>
      <ul className={LIST}>
        {items.map((m) => {
          const age = m.birthYear ? new Date().getFullYear() - m.birthYear : null;
          return (
            <li key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Avatar name={m.name} size="md" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold break-words text-fg">{m.name}</span>
                  <span className="text-sm text-fg-muted">
                    {[t(`relation.${m.relation}`), age !== null ? t('family.age', { age }) : null].filter(Boolean).join(' · ')}
                  </span>
                  <Link to={`/families/${m.family.id}`} className="text-sm font-semibold text-primary hover:underline">
                    {t('family.title', { name: m.family.headName })} · {placeLabel(m.family.place, m.family.branch, language)}
                  </Link>
                  <span className="text-xs text-fg-muted tabular-nums">
                    {t('approvals.addedBy', { name: m.addedByName })} · {formatDate(m.addedAt, language)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  leadingIcon={Check}
                  loading={approve.isPending && approve.variables === m.id}
                  onClick={() =>
                    approve.mutate(m.id, { onSuccess: () => toast.success(t('approvals.approved', { name: m.name })), onError: (err) => toast.error(errorMessage(err)) })
                  }
                >
                  {t('approvals.approve')}
                </Button>
                <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => setRejecting(m)}>
                  {t('approvals.reject')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ReasonModal
        open={rejecting !== null}
        required
        title={rejecting ? t('approvals.rejectTitle', { name: rejecting.name }) : ''}
        body={t('approvals.rejectBody')}
        confirmLabel={t('approvals.reject')}
        loading={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) =>
          rejecting &&
          reject.mutate(
            { id: rejecting.id, input: { reason } },
            {
              onSuccess: () => {
                toast.success(t('approvals.rejected', { name: rejecting.name }));
                setRejecting(null);
              },
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      />
    </>
  );
}

/** People moving into families in the committee's branch; the old family has agreed. */
export function PendingMovesList({ query }: { query: QueryLike<MemberMoveView> }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const approve = useApproveMove();
  const decline = useDeclineMove();
  const [declining, setDeclining] = useState<MemberMoveView | null>(null);

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <ErrorState title={t('moves.queueError')} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  const items = query.data ?? [];
  if (items.length === 0) return <EmptyState icon={Users} title={t('moves.emptyTitle')} body={t('moves.emptyBody')} />;

  return (
    <>
      <ul className={LIST}>
        {items.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold break-words text-fg">{m.member.name}</span>
              <span className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
                <Link to={`/families/${m.from.id}`} className="hover:underline">
                  {t('family.title', { name: m.from.headName })}
                </Link>
                <Icon icon={ArrowRight} size="sm" />
                <Link to={`/families/${m.to.id}`} className="font-semibold text-primary hover:underline">
                  {t('family.title', { name: m.to.headName })}
                </Link>
                · {t(`relation.${m.relation}`)}
              </span>
              {m.note && <span className="text-sm text-fg">“{m.note}”</span>}
              <span className="text-xs text-fg-muted tabular-nums">
                {t('moves.agreedBy', { name: m.agreedByName ?? '' })} · {formatDate(m.createdAt, language)}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                leadingIcon={Check}
                loading={approve.isPending && approve.variables === m.id}
                onClick={() =>
                  approve.mutate(m.id, { onSuccess: () => toast.success(t('moves.approved', { name: m.member.name })), onError: (err) => toast.error(errorMessage(err)) })
                }
              >
                {t('approvals.approve')}
              </Button>
              <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => setDeclining(m)}>
                {t('links.decline')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ReasonModal
        open={declining !== null}
        title={declining ? t('moves.declineTitle', { name: declining.member.name }) : ''}
        body={t('moves.declineBodyCommittee')}
        confirmLabel={t('links.decline')}
        loading={decline.isPending}
        onClose={() => setDeclining(null)}
        onConfirm={(reason) =>
          declining &&
          decline.mutate(
            { id: declining.id, input: { reason } },
            {
              onSuccess: () => {
                toast.success(t('moves.declined'));
                setDeclining(null);
              },
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      />
    </>
  );
}
