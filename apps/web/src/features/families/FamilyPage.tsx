import { type FamilyDetail, type FamilyMember, type HistoryAction, RELATION_GENERATION, type Relation } from '@samaj/shared';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Button, Card, EmptyState, ErrorState, Icon, Modal, Skeleton, buttonVariants, toast } from '@/components/ui';
import {
  type AppIcon,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  Clock,
  KeyRound,
  Network,
  Pencil,
  Plus,
  SearchX,
  Send,
  Smartphone,
  TriangleAlert,
  UserPlus,
  X,
  XCircle,
} from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { branchName } from '@/features/branches/api';
import { MemberPrivacyModal } from '@/features/privacy/PrivacyControls';
import { ResetCodeModal } from '@/features/users/ResetCodeModal';
import { type MessageKey, formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFamily, useRemoveMember, useReview } from './api';
import { FamilyDetailsModal } from './FamilyDetailsModal';
import { FamilyRequestsPanel, RelatedFamilies } from './FamilyLinks';
import { FamilyMemberRow, FamilyMemberRowSkeleton } from './FamilyMemberRow';
import { FamilyChecklist, FamilySummary } from './FamilyOverview';
import { InviteCodeModal } from './InviteCodeModal';
import { MemberFormModal } from './MemberFormModal';
import { MemberSheet } from './MemberSheet';
import { MovedOutList } from './MovedOut';
import { type ElderPair, EldersModal } from './EldersModal';
import { ExternalParentModal } from './ExternalParentModal';
import { NotJoinedCard } from './NotJoinedCard';
import { ReviewPanel } from './ReviewPanel';

/** /family: the signed-in user's own family. */
export function MyFamilyRedirect() {
  const me = useMe();
  return me.data ? <Navigate to={`/families/${me.data.familyId}`} replace /> : null;
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

const HISTORY_ICON: Record<HistoryAction, AppIcon> = {
  created: UserPlus,
  updated: Pencil,
  verified: BadgeCheck,
  rejected: TriangleAlert,
  resubmitted: Send,
  invited: Smartphone,
  joined: KeyRound,
  memberApproved: CircleCheck,
  memberRejected: XCircle,
  linked: Network,
  unlinked: X,
  movedIn: ArrowRight,
  movedOut: ArrowLeft,
};

/** "3 days ago", "yesterday", or the date when it's long past. */
function useWhen() {
  const language = useLanguageStore((s) => s.language);
  const rtf = new Intl.RelativeTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { numeric: 'auto' });
  return (iso: string) => {
    const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    if (Math.abs(minutes) < 24 * 60) return rtf.format(Math.round(minutes / 60), 'hour');
    if (Math.abs(minutes) < 30 * 24 * 60) return rtf.format(Math.round(minutes / (24 * 60)), 'day');
    return formatDate(iso, language);
  };
}

/** Recent changes as a timeline; the rest on request. */
function History({ family }: { family: FamilyDetail }) {
  const t = useT();
  const when = useWhen();
  const [all, setAll] = useState(false);
  const entries = family.history ?? [];
  const shown = all ? entries : entries.slice(0, 6);
  return (
    <Card as="section" aria-labelledby="family-history" className="flex flex-col gap-3">
      <h2 id="family-history" className="font-display text-lg font-semibold text-fg">
        {t('family.tabHistory')}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('family.history.empty')}</p>
      ) : (
        <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-line">
          {shown.map((h, i) => (
            <li key={`${h.at}-${i}`} className="relative flex gap-3">
              <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-primary">
                <Icon icon={HISTORY_ICON[h.action]} size="sm" />
              </span>
              <div className="flex min-w-0 flex-col">
                <p className="text-sm text-fg">
                  <span className="font-semibold">{t(`family.history.${h.action}`)}</span> {t('family.history.by', { name: h.byName })}
                </p>
                {h.note && <p className="text-sm break-words text-fg-muted">{h.note}</p>}
                <p className="text-xs text-fg-muted">{when(h.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {entries.length > 6 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? t('family.history.less') : t('family.history.all', { count: entries.length })}
        </Button>
      )}
    </Card>
  );
}

function FamilySkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5" aria-busy="true">
      <Skeleton className="h-52 w-full rounded-md" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <FamilyMemberRowSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

/** Generations, top to bottom, with a heading each. */
const GROUPS: { generation: number; label: MessageKey }[] = [
  { generation: -3, label: 'family.gen.greatGrandparents' },
  { generation: -2, label: 'family.gen.grandparents' },
  { generation: -1, label: 'family.gen.parents' },
  { generation: 0, label: 'family.gen.us' },
  { generation: 1, label: 'family.gen.children' },
  { generation: 2, label: 'family.gen.grandchildren' },
  { generation: 3, label: 'family.gen.greatGrandchildren' },
];

/** The first people most families add. */
const QUICK_ADD: Relation[] = ['spouse', 'son', 'daughter', 'father', 'mother'];

export function FamilyPage() {
  const { familyId = '' } = useParams();
  const t = useT();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const family = useFamily(familyId);
  const remove = useRemoveMember(familyId);
  const navigate = useNavigate();

  const [editing, setEditing] = useState<{ member: FamilyMember | null; relation?: Relation } | null>(null);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);
  const [inviting, setInviting] = useState<FamilyMember | null>(null);
  const [privacyFor, setPrivacyFor] = useState<FamilyMember | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [elders, setElders] = useState<ElderPair | null>(null);
  const [parentElsewhere, setParentElsewhere] = useState<FamilyMember | null>(null);

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
  const head = data.members.find((m) => m.isHead);
  const sheetMember = data.members.find((m) => m.id === opened) ?? null;
  const add = (relation?: Relation) => setEditing({ member: null, relation });

  const groups = GROUPS.map((g) => ({ ...g, people: data.members.filter((m) => RELATION_GENERATION[m.relation] === g.generation) })).filter((g) => g.people.length > 0);
  const hasSide = Boolean(data.history) || data.links.length > 0 || canEdit || data.permissions.canLink;

  const members = (
    <section aria-labelledby="family-members" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="family-members" className="font-display text-xl font-semibold text-fg">
          {t('family.tabMembers')}
        </h2>
        {canEdit && data.members.length > 1 && (
          <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={() => add()}>
            {t('family.addShort')}
          </Button>
        )}
      </div>
      {groups.map((g) => (
        <div key={g.generation} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t(g.label)}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.people.map((m) => (
              <FamilyMemberRow key={m.id} member={m} isSelf={m.id === me.data?.memberId} onOpen={() => setOpened(m.id)} />
            ))}
          </ul>
        </div>
      ))}
      <MovedOutList family={data} />
      {canEdit && data.members.length > 1 && !data.members.some((m) => RELATION_GENERATION[m.relation] <= -3) && (
        <Card variant="muted" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-fg">{t('elders.title')}</p>
            <p className="max-w-prose text-sm text-fg-muted">{t('elders.body')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!data.members.some((m) => RELATION_GENERATION[m.relation] === -2) && (
              <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={() => setElders('grandparents')}>
                {t('elders.addGrand')}
              </Button>
            )}
            <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={() => setElders('greatGrandparents')}>
              {t('elders.addGreat')}
            </Button>
          </div>
        </Card>
      )}
      {canEdit && data.members.length === 1 && (
        <Card variant="muted" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-fg">{t('family.onlyHead.title')}</p>
            <p className="max-w-prose text-sm text-fg-muted">{t('family.onlyHead.body')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ADD.map((r) => (
              <Button key={r} variant="secondary" size="sm" leadingIcon={Plus} onClick={() => add(r)}>
                {t(`relation.${r}`)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => add()}>
              {t('family.addSomeoneElse')}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className={cn('grid items-start gap-5', hasSide && 'lg:grid-cols-[minmax(0,1fr)_22rem]')}>
        <div className="flex min-w-0 flex-col gap-5">
          <FamilySummary family={data} onAdd={() => add()} onEditDetails={() => setDetailsOpen(true)} />
          {isOwn && <OwnStatusNotice family={data} />}
          {canReview && data.status === 'pending' && <ReviewPanel family={data} />}
          {canEdit && <FamilyRequestsPanel familyId={data.id} />}
          {members}
        </div>
        {hasSide && (
          <aside className="flex min-w-0 flex-col gap-5">
            <FamilyChecklist
              family={data}
              onAdd={() => add()}
              onEditDetails={() => setDetailsOpen(true)}
              onEditMember={(m) => setEditing({ member: m })}
              onInvite={(m) => setInviting(m)}
            />
            <NotJoinedCard family={data} onParentElsewhere={(m) => setParentElsewhere(m)} onEditMember={(m) => setEditing({ member: m })} />
            <RelatedFamilies family={data} />
            {data.history && <History family={data} />}
          </aside>
        )}
      </div>

      <EldersModal familyId={data.id} pair={elders} onClose={() => setElders(null)} />
      <ExternalParentModal familyId={data.id} member={parentElsewhere} links={data.links} onClose={() => setParentElsewhere(null)} />
      <MemberSheet
        member={sheetMember}
        members={data.members}
        isSelf={sheetMember?.id === me.data?.memberId}
        onClose={() => setOpened(null)}
        actions={{
          onEdit: canEdit ? () => sheetMember && setEditing({ member: sheetMember }) : undefined,
          onPrivacy: () => sheetMember && setPrivacyFor(sheetMember),
          onInvite: () => sheetMember && setInviting(sheetMember),
          onResetPassword: () => {
            if (sheetMember?.accountId) setResetTarget({ userId: sheetMember.accountId, name: sheetMember.name });
          },
          onRemove: canEdit ? () => sheetMember && setRemoving(sheetMember) : undefined,
          onShowInTree: () => sheetMember && navigate(`/families/${data.id}/tree?focus=${sheetMember.id}`),
          onParentElsewhere: canEdit ? () => sheetMember && setParentElsewhere(sheetMember) : undefined,
          onRelation: () =>
            sheetMember && navigate(`/relation?${new URLSearchParams({ b: sheetMember.id, bf: data.id, bn: sheetMember.name }).toString()}`),
        }}
      />
      <MemberPrivacyModal member={privacyFor} isSelf={privacyFor?.id === me.data?.memberId} onClose={() => setPrivacyFor(null)} />
      <MemberFormModal
        familyId={data.id}
        member={editing?.member ?? null}
        initialRelation={editing?.relation}
        headGender={head?.gender}
        members={data.members}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
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
