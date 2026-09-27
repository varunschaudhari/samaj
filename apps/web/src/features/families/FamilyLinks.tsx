import {
  type FamilyDetail,
  type FamilyMember,
  LINK_KINDS,
  type LinkKind,
  type LinkedFamily,
  type MemberMoveView,
  PARENT_CHOICES,
  PARTNER_CHOICES,
  RELATIONS,
  type Relation,
} from '@samaj/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Badge, Button, Card, ErrorState, Icon, IconButton, Modal, Select, Skeleton, Textarea, toast } from '@/components/ui';
import { ArrowRight, Check, HeartHandshake, Network, Plus, Trash2, X } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { placeLabel } from '@/features/branches/api';
import { type MessageKey, formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useFamily } from './api';
import {
  useAcceptLink,
  useAcceptParentLink,
  useAgreeMove,
  useCancelMove,
  useDeclineMove,
  useDeclineParentLink,
  useFamilyRequests,
  useRemoveLink,
  useRequestLink,
  useRequestMove,
} from './links-api';

/** "Family of Anil Wagh · Bhusawal", linking to the family when the viewer may open it. */
function FamilyName({ family }: { family: LinkedFamily }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const name = t('family.title', { name: family.headName });
  return (
    <span className="flex min-w-0 flex-col">
      {family.canView ? (
        <Link to={`/families/${family.id}`} className="font-semibold break-words text-fg hover:underline">
          {name}
        </Link>
      ) : (
        <span className="font-semibold break-words text-fg">{name}</span>
      )}
      <span className="text-sm text-fg-muted">{placeLabel(family.place, family.branch, language)}</span>
    </span>
  );
}

/** A reason box for declining or turning something down. */
export function ReasonModal({
  open,
  title,
  body,
  confirmLabel,
  required = false,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  required?: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  const tooShort = required && reason.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea label={required ? t('links.reason') : t('links.reasonOptional')} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} />
    </Modal>
  );
}

/** Linked families on a family page, and the way to propose one. */
export function RelatedFamilies({ family }: { family: FamilyDetail }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const remove = useRemoveLink();
  const [linking, setLinking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { links, permissions } = family;
  const movable = family.members.filter((m) => !m.isHead && m.approval === 'approved' && !m.deceased);
  const canMove = permissions.canRequestMove && movable.length > 0;
  if (links.length === 0 && !permissions.canLink && !canMove) return null;

  return (
    <Card as="section" aria-labelledby="related-families" className="flex flex-col gap-3">
      <h2 id="related-families" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
        <Icon icon={Network} weight="duotone" className="text-primary" />
        {t('links.title')}
      </h2>
      {links.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('links.none')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={l.family.headName} size="md" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">{t(`links.kind.${l.kind}`)}</span>
                <FamilyName family={l.family} />
              </div>
              {l.canRemove && <IconButton icon={Trash2} label={t('links.remove', { name: l.family.headName })} onClick={() => setRemoving(l.id)} />}
            </li>
          ))}
        </ul>
      )}
      {(permissions.canLink || canMove) && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {permissions.canLink && (
            <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={() => setLinking(true)}>
              {t('links.linkToMine')}
            </Button>
          )}
          {canMove && (
            <Button variant="ghost" size="sm" leadingIcon={ArrowRight} onClick={() => setMoving(true)}>
              {t('moves.open')}
            </Button>
          )}
        </div>
      )}
      <LinkFamilyModal family={family} open={linking} onClose={() => setLinking(false)} />
      <MoveRequestModal family={family} people={movable} open={moving} onClose={() => setMoving(false)} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('links.removeTitle')}
        description={t('links.removeBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(removing, {
                  onSuccess: () => {
                    toast.success(t('links.removed'));
                    setRemoving(null);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              {t('links.removeConfirm')}
            </Button>
          </>
        }
      />
    </Card>
  );
}

/** "This family is my …": the viewer's family proposes a link to the family on screen. */
function LinkFamilyModal({ family, open, onClose }: { family: FamilyDetail; open: boolean; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const request = useRequestLink();
  const [kind, setKind] = useState<LinkKind | ''>('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('links.askTitle', { name: family.headName })}
      description={t('links.askBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!kind}
            loading={request.isPending}
            onClick={() =>
              kind &&
              request.mutate(
                { toFamilyId: family.id, kind },
                {
                  onSuccess: () => {
                    toast.success(t('links.sent', { name: family.headName }));
                    setKind('');
                    onClose();
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            {t('links.send')}
          </Button>
        </>
      }
    >
      <Select label={t('links.askKind')} value={kind} onChange={(e) => setKind(e.target.value as LinkKind | '')}>
        <option value="">{t('links.choose')}</option>
        {LINK_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`links.mine.${k}`)}
          </option>
        ))}
      </Select>
    </Modal>
  );
}

/** "Moved to our family": the viewer's family asks for someone from the family on screen. */
function MoveRequestModal({ family, people, open, onClose }: { family: FamilyDetail; people: FamilyMember[]; open: boolean; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const request = useRequestMove();
  const [memberId, setMemberId] = useState('');
  const [relation, setRelation] = useState<Exclude<Relation, 'head'> | ''>('');
  const [note, setNote] = useState('');
  const [tieId, setTieId] = useState('');
  const member = people.find((p) => p.id === memberId) ?? null;
  // Whose wife (or child) they will be in the viewer's own family.
  const me = useMe();
  const own = useFamily(open ? me.data?.familyId : undefined);
  const partnerFrom = relation ? PARTNER_CHOICES[relation] : undefined;
  const parentFrom = relation ? PARENT_CHOICES[relation] : undefined;
  const tieOptions = (own.data?.members ?? []).filter((m) => (partnerFrom ?? parentFrom)?.includes(m.relation));
  const close = () => {
    setMemberId('');
    setRelation('');
    setNote('');
    setTieId('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('moves.openTitle')}
      description={t('moves.askBody', { family: family.headName })}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!relation || !member}
            loading={request.isPending}
            onClick={() =>
              member &&
              relation &&
              request.mutate(
                {
                  memberId: member.id,
                  relation,
                  note,
                  // With only one person it could be, it is that one.
                  ...(partnerFrom && { partnerId: tieId || (tieOptions.length === 1 ? tieOptions[0]?.id : '') }),
                  ...(parentFrom && { parentId: tieId || (tieOptions.length === 1 ? tieOptions[0]?.id : '') }),
                },
                {
                  onSuccess: () => {
                    toast.success(t('moves.sent', { name: member.name, family: family.headName }));
                    close();
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            {t('moves.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label={t('moves.who')} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">{t('links.choose')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({t(`relation.${p.relation}`)})
            </option>
          ))}
        </Select>
        <Select
          label={t('moves.relation')}
          value={relation}
          onChange={(e) => {
            setRelation(e.target.value as Exclude<Relation, 'head'> | '');
            setTieId('');
          }}
        >
          <option value="">{t('links.choose')}</option>
          {RELATIONS.filter((r) => r !== 'head').map((r) => (
            <option key={r} value={r}>
              {t(`relation.${r}`)}
            </option>
          ))}
        </Select>
        {tieOptions.length > 1 && (
          <Select label={t(partnerFrom ? (member?.gender === 'male' ? 'member.partnerChoice.husband' : 'member.partnerChoice.wife') : 'member.parentChoice')} value={tieId} onChange={(e) => setTieId(e.target.value)}>
            <option value="">{t('links.choose')}</option>
            {tieOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
        <Textarea label={t('moves.note')} hint={t('moves.noteHint')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
      </div>
    </Modal>
  );
}

const MOVE_STATUS_TONE: Record<MemberMoveView['status'], 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  awaitingFamily: 'warning',
  awaitingCommittee: 'info',
  done: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

/** One move, as the two families see it. */
function MoveLine({ move }: { move: MemberMoveView }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-fg">{move.member.name}</span>
        <Badge tone={MOVE_STATUS_TONE[move.status]}>{t(`moves.status.${move.status}`)}</Badge>
      </p>
      <p className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
        {t('family.title', { name: move.from.headName })}
        <Icon icon={ArrowRight} size="sm" />
        {t('family.title', { name: move.to.headName })} · {t(`relation.${move.relation}`)}
        {move.tie && ` · ${t(move.tie.kind === 'partner' ? 'moves.tie.partner' : 'moves.tie.parent', { name: move.tie.name })}`}
      </p>
      {move.note && <p className="text-sm text-fg">“{move.note}”</p>}
      {move.declineReason && <p className="text-sm text-danger">{move.declineReason}</p>}
      <p className="text-xs text-fg-muted tabular-nums">
        {t('links.askedBy', { name: move.requestedByName })} · {formatDate(move.createdAt, language)}
      </p>
    </div>
  );
}

/** Everything waiting for this family: links to accept, people asked for, and its own requests. */
export function FamilyRequestsPanel({ familyId }: { familyId: string }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const requests = useFamilyRequests(familyId);
  const accept = useAcceptLink();
  const removeLink = useRemoveLink();
  const agree = useAgreeMove();
  const decline = useDeclineMove();
  const cancel = useCancelMove();
  const acceptParent = useAcceptParentLink();
  const declineParent = useDeclineParentLink();
  const [declining, setDeclining] = useState<MemberMoveView | null>(null);
  const done = (message: MessageKey, values?: Record<string, string>) => ({
    onSuccess: () => toast.success(t(message, values)),
    onError: (err: unknown) => toast.error(errorMessage(err)),
  });

  if (requests.isPending) return <Skeleton className="h-24 w-full rounded-md" />;
  if (requests.isError) return <ErrorState title={t('links.requestsError')} error={requests.error} onRetry={() => requests.refetch()} retrying={requests.isFetching} />;
  const r = requests.data;
  const count = r.incomingLinks.length + r.outgoingLinks.length + r.movesOut.length + r.movesIn.length + r.parentLinksIn.length + r.parentLinksOut.length;
  if (count === 0) return null;

  return (
    <Card as="section" id="requests" aria-labelledby="family-requests" className="flex flex-col gap-3 border-zari/60">
      <h2 id="family-requests" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
        <Icon icon={HeartHandshake} weight="duotone" className="text-kumkum" />
        {t('links.requestsTitle')}
      </h2>
      <ul className="divide-y divide-line">
        {r.incomingLinks.map((l) => (
          <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm text-fg-muted">{t('links.incoming', { kind: t(`links.kind.${l.kind}`) })}</span>
              <FamilyName family={l.family} />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" leadingIcon={Check} loading={accept.isPending} onClick={() => accept.mutate(l.id, done('links.accepted'))}>
                {t('links.accept')}
              </Button>
              <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => removeLink.mutate(l.id, done('links.declined'))}>
                {t('links.decline')}
              </Button>
            </div>
          </li>
        ))}
        {r.movesOut.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm text-fg-muted">{t('moves.outgoingAsk', { family: m.to.headName })}</span>
              <MoveLine move={m} />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" leadingIcon={Check} loading={agree.isPending} onClick={() => agree.mutate(m.id, done('moves.agreed', { name: m.member.name }))}>
                {t('moves.agree')}
              </Button>
              <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => setDeclining(m)}>
                {t('links.decline')}
              </Button>
            </div>
          </li>
        ))}
        {r.parentLinksIn.map((p) => (
          <li key={p.memberId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm text-fg-muted">{t('parentLinks.incoming', { family: p.family.headName })}</span>
              <span className="font-semibold text-fg">{t('parentLinks.claim', { parent: p.parent.name, child: p.memberName })}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" leadingIcon={Check} loading={acceptParent.isPending} onClick={() => acceptParent.mutate(p.memberId, done('parentLinks.accepted'))}>
                {t('parentLinks.accept')}
              </Button>
              <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => declineParent.mutate(p.memberId, done('parentLinks.declined'))}>
                {t('parentLinks.decline')}
              </Button>
            </div>
          </li>
        ))}
        {r.parentLinksOut.map((p) => (
          <li key={p.memberId} className="flex flex-col gap-0.5 py-3">
            <span className="text-sm text-fg-muted">{t('parentLinks.outgoing', { family: p.family.headName })}</span>
            <span className="font-semibold text-fg">{t('parentLinks.claim', { parent: p.parent.name, child: p.memberName })}</span>
          </li>
        ))}
        {r.outgoingLinks.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm text-fg-muted">{t('links.outgoing', { kind: t(`links.kind.${l.kind}`) })}</span>
              <FamilyName family={l.family} />
            </div>
            <Button size="sm" variant="ghost" onClick={() => removeLink.mutate(l.id, done('links.cancelled'))}>
              {t('links.cancel')}
            </Button>
          </li>
        ))}
        {r.movesIn.map((m) => (
          <li key={m.id} className="flex items-start gap-3 py-3">
            <MoveLine move={m} />
            {(m.status === 'awaitingFamily' || m.status === 'awaitingCommittee') && (
              <Button size="sm" variant="ghost" onClick={() => cancel.mutate(m.id, done('moves.cancelled'))}>
                {t('links.cancel')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ReasonModal
        open={declining !== null}
        title={declining ? t('moves.declineTitle', { name: declining.member.name }) : ''}
        body={t('moves.declineBody')}
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
    </Card>
  );
}
