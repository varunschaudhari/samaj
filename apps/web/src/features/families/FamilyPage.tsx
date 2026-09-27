import { type FamilyDetail, type FamilyMember, gotraName } from '@samaj/shared';
import { Clock, MapPin, Pencil, SearchX, Send, TriangleAlert, UserPlus } from '@/components/ui/icons';
import { type ReactNode, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, EmptyState, ErrorState, Icon, Modal, Skeleton, Tabs, buttonVariants, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { branchName, placeLabel } from '@/features/branches/api';
import { formatDate, formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useFamily, useRemoveMember, useReview } from './api';
import { FamilyDetailsModal } from './FamilyDetailsModal';
import { FamilyMemberRow, FamilyMemberRowSkeleton } from './FamilyMemberRow';
import { FamilyStatusBadge } from './FamilyStatusBadge';
import { InviteCodeModal } from './InviteCodeModal';
import { MemberFormModal } from './MemberFormModal';
import { ResetCodeModal } from '@/features/users/ResetCodeModal';
import { ReviewPanel } from './ReviewPanel';
import { FamilyRequestsPanel, RelatedFamilies } from './FamilyLinks';

/** /family: the signed-in user's own family. */
export function MyFamilyRedirect() {
  const me = useMe();
  return me.data ? <Navigate to={`/families/${me.data.familyId}`} replace /> : null;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-fg-muted sm:w-36 sm:shrink-0">{label}</dt>
      <dd className="font-semibold break-words text-fg">{children}</dd>
    </div>
  );
}

/** Status notice for the family's own members: waiting, or asked to fix something. */
function OwnStatusNotice({ family }: { family: FamilyDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const { resubmit } = useReview(family.id);

  if (family.status === 'pending') {
    return (
      <Card variant="muted" className="flex items-start gap-3">
        <Icon icon={Clock} className="mt-0.5 text-warning" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-fg">{t('verify.pending.title')}</p>
          <p className="max-w-prose text-sm text-fg-muted">{t('verify.pending.body', { branch: branchName(family.branch, language) })}</p>
        </div>
      </Card>
    );
  }
  if (family.status === 'rejected' && family.permissions.canResubmit) {
    return (
      <Card className="flex flex-col gap-3 border-danger bg-danger-soft">
        <div className="flex items-start gap-3">
          <Icon icon={TriangleAlert} className="mt-0.5 text-danger" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-fg">{t('verify.rejected.title')}</p>
            <p className="text-sm text-fg">{t('verify.rejected.body')}</p>
          </div>
        </div>
        {family.rejectionReason && (
          <blockquote className="rounded-sm bg-surface p-3 text-sm text-fg">
            <span className="block text-xs font-semibold text-fg-muted">{t('verify.reason')}</span>
            {family.rejectionReason}
          </blockquote>
        )}
        <Button
          leadingIcon={Send}
          className="self-start"
          loading={resubmit.isPending}
          onClick={() =>
            resubmit.mutate(undefined, {
              onSuccess: () => toast.success(t('verify.resubmitted')),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          {t('verify.resubmit')}
        </Button>
      </Card>
    );
  }
  return null;
}

function History({ family }: { family: FamilyDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  if (!family.history?.length) return <p className="text-sm text-fg-muted">{t('family.history.empty')}</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {family.history.map((h, i) => (
        <li key={`${h.at}-${i}`} className="flex flex-col gap-0.5 py-2.5">
          <p className="text-sm text-fg">
            <span className="font-semibold">{t(`family.history.${h.action}`)}</span> {t('family.history.by', { name: h.byName })}
          </p>
          {h.note && <p className="text-sm text-fg-muted">{h.note}</p>}
          <p className="text-xs text-fg-muted tabular-nums">{formatDate(h.at, language)}</p>
        </li>
      ))}
    </ol>
  );
}

function FamilySkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-32 w-full rounded-md" />
      <ul className="divide-y divide-line">
        {[0, 1, 2].map((i) => (
          <FamilyMemberRowSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

export function FamilyPage() {
  const { familyId = '' } = useParams();
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const family = useFamily(familyId);
  const remove = useRemoveMember(familyId);

  const [editing, setEditing] = useState<{ member: FamilyMember | null } | null>(null);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);
  const [inviting, setInviting] = useState<FamilyMember | null>(null);

  if (family.isPending) return <FamilySkeleton />;

  if (family.isError) {
    if (family.error instanceof ApiError && family.error.status === 404) {
      return (
        <div className="mx-auto max-w-md">
          <EmptyState
            icon={SearchX}
            title={t('family.notFound.title')}
            body={t('family.notFound.body')}
            action={
              <Link to="/directory" className={buttonVariants({ variant: 'secondary' })}>
                {t('notFound.home')}
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-md">
        <ErrorState title={t('family.error.title')} error={family.error} onRetry={() => family.refetch()} retrying={family.isFetching} />
      </div>
    );
  }

  const data = family.data;
  const { canEdit, canReview } = data.permissions;
  const isOwn = me.data?.familyId === data.id;

  const members = (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {data.members.map((m) => (
          <FamilyMemberRow
            key={m.id}
            member={m}
            canEdit={canEdit}
            onEdit={() => setEditing({ member: m })}
            onRemove={() => setRemoving(m)}
            onResetPassword={() => m.accountId && setResetTarget({ userId: m.accountId, name: m.name })}
            onInvite={() => setInviting(m)}
          />
        ))}
      </ul>
      {canEdit && data.members.length === 1 && (
        <EmptyState icon={UserPlus} title={t('family.onlyHead.title')} body={t('family.onlyHead.body')} />
      )}
      {canEdit && (
        <Button leadingIcon={UserPlus} variant={data.members.length === 1 ? 'primary' : 'secondary'} className="self-start" onClick={() => setEditing({ member: null })}>
          {t('family.addMember')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={t('family.title', { name: data.headName })}
        description={
          <span className="flex items-center gap-1">
            <Icon icon={MapPin} size="sm" />
            {placeLabel(data.place, data.branch, language)}
          </span>
        }
        actions={<FamilyStatusBadge status={data.status} />}
      />

      {isOwn && <OwnStatusNotice family={data} />}
      {canReview && data.status === 'pending' && <ReviewPanel family={data} />}
      {canEdit && <FamilyRequestsPanel familyId={data.id} />}

      <Card className="flex flex-col gap-1">
        <dl className="divide-y divide-line">
          <Detail label={t('family.place')}>{data.place}</Detail>
          <Detail label={t('family.branch')}>{branchName(data.branch, language)}</Detail>
          <Detail label={t('family.gotra')}>{gotraName(data.gotra, language) ?? t('family.gotraNone')}</Detail>
          {data.address !== undefined && <Detail label={t('family.address')}>{data.address ?? '–'}</Detail>}
        </dl>
        {canEdit && (
          <Button variant="ghost" size="sm" leadingIcon={Pencil} className="self-start" onClick={() => setDetailsOpen(true)}>
            {t('family.editDetails')}
          </Button>
        )}
      </Card>

      <RelatedFamilies family={data} />

      {data.history ? (
        <Tabs
          label={t('family.title', { name: data.headName })}
          items={[
            { id: 'members', label: `${t('family.tabMembers')} (${formatNumber(data.members.length, language)})`, content: members },
            { id: 'history', label: t('family.tabHistory'), content: <History family={data} /> },
          ]}
        />
      ) : (
        members
      )}

      <MemberFormModal familyId={data.id} member={editing?.member ?? null} open={editing !== null} onClose={() => setEditing(null)} />
      <FamilyDetailsModal family={data} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <ResetCodeModal target={resetTarget} onClose={() => setResetTarget(null)} />
      <InviteCodeModal
        familyId={data.id}
        member={inviting}
        onClose={() => setInviting(null)}
        onAddPhone={(m) => {
          setInviting(null);
          setEditing({ member: m });
        }}
      />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? t('family.removeTitle', { name: removing.name }) : ''}
        description={t('family.removeBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (!removing) return;
                const name = removing.name;
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    toast.success(t('family.memberRemoved', { name }));
                    setRemoving(null);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                });
              }}
            >
              {t('family.removeConfirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}

