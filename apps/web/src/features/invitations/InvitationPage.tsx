import { type InvitationAnswer, type InvitationDetail, MAX_INVITATION_PEOPLE, type RsvpAnswer } from '@samaj/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Icon, Input, Modal, Skeleton, buttonVariants, toast } from '@/components/ui';
import { ArrowLeft, Download, EyeOff, Pencil, Printer, SearchX, Share, UserPlus, XCircle } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { placeLabel } from '@/features/branches/api';
import { formatEventTime } from '@/features/community/events-api';
import { type MessageKey, formatDate, formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAddGuests, useAnswerInvitation, useAudience, useCancelInvitation, useHideFamily, useInvitation, useUpdateInvitation } from './api';
import { GuestPicker, type GuestPicks, emptyPicks, pickCount, picksToInput } from './GuestPicker';
import { InvitationCard } from './InvitationCard';
import { InvitationForm, draftErrors, draftFrom, draftToInput } from './InvitationForm';
import { isRemembrance, shareText } from './kinds';

const ANSWER_LABEL = (quiet: boolean): Record<RsvpAnswer, MessageKey> =>
  quiet ? { yes: 'invite.rsvp.attend', maybe: 'invite.rsvp.maybe', no: 'invite.rsvp.notAttend' } : { yes: 'invite.rsvp.yes', maybe: 'invite.rsvp.maybe', no: 'invite.rsvp.no' };

/** A guest family's answer, function by function, with how many are coming. */
function RsvpPanel({ invitation }: { invitation: InvitationDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const answer = useAnswerInvitation(invitation.id);
  const quiet = isRemembrance(invitation.kind);
  const labels = ANSWER_LABEL(quiet);
  // Remembrance: attend or not, no "maybe".
  const choices: RsvpAnswer[] = quiet ? ['yes', 'no'] : ['yes', 'maybe', 'no'];
  const start = () => invitation.functions.map((f) => invitation.mine?.answers.find((a) => a.functionId === f.id) ?? { functionId: f.id, answer: '' as const, people: 2 });
  const [answers, setAnswers] = useState<(Omit<InvitationAnswer, 'answer'> & { answer: RsvpAnswer | '' })[]>(start);
  useEffect(() => setAnswers(start()), [invitation.id, invitation.mine?.respondedAt]);
  const set = (i: number, patch: Partial<(typeof answers)[number]>) => setAnswers((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ready = answers.every((a) => a.answer !== '');

  if (invitation.closed) {
    return <p className="text-center text-sm text-fg-muted">{invitation.cancelled ? t('invite.rsvp.cancelled') : t('invite.rsvp.closed')}</p>;
  }
  return (
    <Card as="section" aria-labelledby="rsvp" className="flex flex-col gap-4 print:hidden">
      <h2 id="rsvp" className="font-display text-lg font-semibold text-fg">
        {t(quiet ? 'invite.rsvp.titleRemembrance' : 'invite.rsvp.title')}
      </h2>
      {invitation.functions.map((f, i) => {
        const a = answers[i];
        if (!a) return null;
        return (
          <div key={f.id} className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
            <div className="flex flex-col">
              <span className="font-semibold text-fg">{f.name}</span>
              <span className="text-sm text-fg-muted">{formatEventTime(f.startsAt, f.endsAt, language)}</span>
            </div>
            <div className="flex flex-wrap items-end gap-2" role="group" aria-label={f.name}>
              {choices.map((c) => (
                <Chip key={c} selected={a.answer === c} onClick={() => set(i, { answer: c })} className="px-4">
                  {t(labels[c])}
                </Chip>
              ))}
              {a.answer && a.answer !== 'no' && (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_INVITATION_PEOPLE}
                  label={t('invite.rsvp.people')}
                  value={String(a.people)}
                  onChange={(e) => set(i, { people: Math.max(0, Math.min(MAX_INVITATION_PEOPLE, Number(e.target.value) || 0)) })}
                  fieldClassName="w-32"
                />
              )}
            </div>
          </div>
        );
      })}
      {answer.isError && <FormAlert message={errorMessage(answer.error)} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!ready}
          loading={answer.isPending}
          onClick={() =>
            answer.mutate(
              { answers: answers.map((a) => ({ functionId: a.functionId, answer: a.answer as RsvpAnswer, people: a.people })) },
              { onSuccess: () => toast.success(t('invite.rsvp.saved', { family: invitation.host.headName })) },
            )
          }
        >
          {t('invite.rsvp.save')}
        </Button>
        {invitation.mine?.respondedByName && invitation.mine.respondedAt && (
          <span className="text-sm text-fg-muted">
            {t('invite.rsvp.answeredBy', { name: invitation.mine.respondedByName })} · {formatDate(invitation.mine.respondedAt, language)}
          </span>
        )}
      </div>
    </Card>
  );
}

/** The guest list as a spreadsheet: family, place, how they were invited, and each function's answer. */
function downloadCsv(inv: InvitationDetail, t: ReturnType<typeof useT>, language: 'en' | 'mr') {
  const labels = ANSWER_LABEL(isRemembrance(inv.kind));
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = [t('invite.csv.family'), t('invite.csv.place'), t('invite.csv.via'), ...inv.functions.map((f) => f.name), t('invite.csv.answeredBy')];
  const rows = (inv.guests ?? []).map((g) => [
    t('family.title', { name: g.family.headName }),
    placeLabel(g.family.place, g.family.branch, language),
    t(`invite.host.via.${g.via}`),
    ...inv.functions.map((f) => {
      const a = g.answers.find((x) => x.functionId === f.id);
      return a ? `${t(labels[a.answer])}${a.answer !== 'no' ? ` (${a.people})` : ''}` : '';
    }),
    g.respondedByName ?? '',
  ]);
  // A byte-order mark so spreadsheet apps read Marathi correctly.
  const csv = `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t(`invite.kind.${inv.kind}`)}${inv.forNames ? ` - ${inv.forNames}` : ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** For the host: the headcount per function, every guest's answers, and what to do next. */
function HostPanel({ invitation }: { invitation: InvitationDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const labels = ANSWER_LABEL(isRemembrance(invitation.kind));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [draft, setDraft] = useState(draftFrom(invitation));
  const [tried, setTried] = useState(false);
  const [picks, setPicks] = useState<GuestPicks>(emptyPicks());
  const update = useUpdateInvitation(invitation.id);
  const addGuests = useAddGuests(invitation.id);
  const cancel = useCancelInvitation(invitation.id);
  const audience = useAudience(adding);
  const n = (v: number) => formatNumber(v, language);
  const url = `${window.location.origin}/invitations/${invitation.id}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    shareText(invitation, { kind: t(`invite.kind.${invitation.kind}`), from: t('invite.from', { name: invitation.host.headName }), open: t('invite.share.link') }, language, url),
  )}`;
  const invited = new Set((invitation.guests ?? []).map((g) => g.family.id));

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          <Icon icon={Share} />
          {t('invite.host.share')}
        </a>
        {!invitation.closed && (
          <>
            <Button variant="secondary" size="sm" leadingIcon={UserPlus} onClick={() => setAdding(true)}>
              {t('invite.host.addGuests')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Pencil}
              onClick={() => {
                setDraft(draftFrom(invitation));
                setTried(false);
                setEditing(true);
              }}
            >
              {t('invite.host.edit')}
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" leadingIcon={Download} onClick={() => downloadCsv(invitation, t, language)}>
          {t('invite.host.download')}
        </Button>
        <Button variant="ghost" size="sm" leadingIcon={Printer} onClick={() => window.print()}>
          {t('invite.host.print')}
        </Button>
        {!invitation.cancelled && (
          <Button variant="ghost" size="sm" leadingIcon={XCircle} className="text-danger" onClick={() => setCancelling(true)}>
            {t('invite.host.cancel')}
          </Button>
        )}
      </div>

      <Card as="section" aria-labelledby="tally" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="tally" className="font-display text-lg font-semibold text-fg">
            {t('invite.host.tally')}
          </h2>
          <span className="text-sm text-fg-muted">{t('invite.replies', { replied: n(invitation.repliedCount ?? 0), invited: n(invitation.invitedCount ?? 0) })}</span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {invitation.functions.map((f) => {
            const tally = invitation.tally?.find((x) => x.functionId === f.id);
            return (
              <li key={f.id} className="flex flex-col gap-1 rounded-md bg-surface-muted p-3">
                <span className="font-semibold text-fg">{f.name}</span>
                <span className="font-display text-2xl font-semibold text-primary tabular-nums">{t('invite.host.people', { count: n(tally?.people ?? 0) })}</span>
                <span className="text-xs text-fg-muted">{t('invite.host.counts', { yes: n(tally?.yes ?? 0), maybe: n(tally?.maybe ?? 0), no: n(tally?.no ?? 0) })}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="guests" className="flex flex-col gap-3">
        <h2 id="guests" className="font-display text-lg font-semibold text-fg">
          {t('invite.host.guests', { count: n(invitation.guests?.length ?? 0) })}
        </h2>
        <ul className="divide-y divide-line">
          {(invitation.guests ?? []).map((g) => (
            <li key={g.family.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <Link to={`/families/${g.family.id}`} className="font-semibold text-fg hover:underline">
                    {t('family.title', { name: g.family.headName })}
                  </Link>
                  <Badge>{t(`invite.host.via.${g.via}`)}</Badge>
                </span>
                <span className="text-xs text-fg-muted">{placeLabel(g.family.place, g.family.branch, language)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {g.respondedAt ? (
                  invitation.functions.map((f) => {
                    const a = g.answers.find((x) => x.functionId === f.id);
                    return a ? (
                      <span key={f.id} className={cn('rounded-full px-2.5 py-1 font-semibold', a.answer === 'yes' ? 'bg-success-soft text-success' : a.answer === 'maybe' ? 'bg-warning-soft text-warning' : 'bg-surface-muted text-fg-muted')}>
                        {f.name}: {t(labels[a.answer])}
                        {a.answer !== 'no' && ` · ${n(a.people)}`}
                      </span>
                    ) : null;
                  })
                ) : (
                  <span className="text-fg-muted">{t('invite.host.noAnswer')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('invite.host.edit')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={update.isPending}
              onClick={() => {
                setTried(true);
                if (Object.keys(draftErrors(draft)).length > 0) return;
                update.mutate(draftToInput(draft), {
                  onSuccess: () => {
                    toast.success(t('invite.form.saved'));
                    setEditing(false);
                  },
                });
              }}
            >
              {t('invite.form.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {update.isError && <FormAlert message={errorMessage(update.error)} />}
          <InvitationForm draft={draft} onChange={setDraft} errors={tried ? draftErrors(draft) : {}} />
        </div>
      </Modal>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('invite.host.addGuests')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={pickCount(picks) === 0}
              loading={addGuests.isPending}
              onClick={() =>
                addGuests.mutate(picksToInput(picks), {
                  onSuccess: () => {
                    toast.success(t('invite.form.sent', { count: n(pickCount(picks)) }));
                    setPicks(emptyPicks());
                    setAdding(false);
                  },
                })
              }
            >
              {t('invite.form.send')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {addGuests.isError && <FormAlert message={errorMessage(addGuests.error)} />}
          <GuestPicker audience={audience.data} picks={picks} onChange={setPicks} ownFamilyId={me.data?.familyId ?? ''} alreadyInvited={invited} />
        </div>
      </Modal>

      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t('invite.host.cancel')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(t('invite.host.cancelled'));
                    setCancelling(false);
                  },
                })
              }
            >
              {t('invite.host.cancel')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">{t('invite.host.cancelConfirm')}</p>
      </Modal>
    </>
  );
}

export function InvitationPage() {
  const { id = '' } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const invitation = useInvitation(id);
  const hide = useHideFamily();

  const back = (
    <Link to="/invitations" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      <Icon icon={ArrowLeft} />
      {t('invite.page.title')}
    </Link>
  );
  if (invitation.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5" aria-busy="true">
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }
  if (invitation.isError) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div>{back}</div>
        {invitation.error instanceof ApiError && invitation.error.status === 404 ? (
          <EmptyState icon={SearchX} title={t('invite.notFound.title')} body={t('invite.notFound.body')} />
        ) : (
          <ErrorState title={t('invite.error')} error={invitation.error} onRetry={() => invitation.refetch()} retrying={invitation.isFetching} />
        )}
      </div>
    );
  }
  const inv = invitation.data;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="print:hidden">{back}</div>
      <InvitationCard
        cancelled={inv.cancelled}
        data={{ kind: inv.kind, forNames: inv.forNames, message: inv.message, hostName: inv.host.headName, functions: inv.functions }}
      />
      {inv.isHost ? (
        <HostPanel invitation={inv} />
      ) : (
        <>
          <RsvpPanel invitation={inv} />
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={EyeOff}
            className="self-center print:hidden"
            loading={hide.isPending}
            onClick={() =>
              hide.mutate(
                { familyId: inv.host.id, hidden: true },
                {
                  onSuccess: () => {
                    toast.success(t('invite.hidden.done'));
                    void navigate('/invitations');
                  },
                },
              )
            }
          >
            {t('invite.hide')}
          </Button>
        </>
      )}
    </div>
  );
}
