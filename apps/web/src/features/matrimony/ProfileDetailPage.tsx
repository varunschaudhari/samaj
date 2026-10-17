import { type MissingField, type ProfileDetail, formatPhone, gotraName } from '@samaj/shared';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  EyeOff,
  FileText,
  HeartHandshake,
  Lock,
  NotePencil,
  Pause,
  Pencil,
  Phone,
  Play,
  Send,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from '@/components/ui/icons';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Badge, Button, Card, CardTitle, EmptyState, ErrorState, Icon, Modal, Select, Skeleton, Textarea, buttonVariants, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { placeLabel } from '@/features/branches/api';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useInterestAction, useMyMatrimony, useProfile, useProfileAction, useSendInterest, useSetMark } from './api';
import { type BiodataSection, MISSING_LABEL, foldedSections, glanceRows, headlineFacts, preferenceChips } from './biodata';
import { PhotoStory } from './PhotoStory';
import { ProfileStatusBadge } from './ProfileCardView';
import { type ProfileFormTarget, ProfileFormModal } from './ProfileFormModal';
import { PhotoManager, galleryOf } from './ProfilePhotos';

/** One biodata section, folded away until wanted, so the profile reads like a story first. */
function SectionDetails({ section, open }: { section: BiodataSection; open?: boolean }) {
  return (
    <details open={open} className="group/section rounded-lg border border-line bg-surface shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon icon={section.icon} size="sm" />
        </span>
        <span className="flex-1 font-display text-lg font-semibold text-fg">{section.title}</span>
        <Icon icon={ChevronDown} className="text-fg-muted transition-transform duration-200 group-open/section:rotate-180" />
      </summary>
      <dl className="divide-y divide-line border-t border-line px-4">
        {section.rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5 text-sm">
            <dt className="text-fg-muted">{r.label}</dt>
            <dd className="font-medium break-words text-fg">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** A Bumble-style prompt: the question small, the answer large. */
function PromptCard({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="flex flex-col gap-2 border-l-4 border-l-kumkum p-5">
      <h3 className="text-sm font-semibold text-kumkum">{question}</h3>
      <div className="font-display text-xl leading-snug font-medium text-fg">{children}</div>
    </Card>
  );
}

/** Send, answer or follow an interest between this profile and the viewer's family. */
function InterestPanel({ profile, showSend = false }: { profile: ProfileDetail; showSend?: boolean }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [params] = useSearchParams();
  const mine = useMyMatrimony();
  const send = useSendInterest();
  const answer = useInterestAction();
  const live = (mine.data?.profiles ?? []).filter((p) => p.status === 'active' && p.gender !== profile.gender);
  const [fromId, setFromId] = useState(params.get('from') ?? '');
  const from = live.find((p) => p.id === fromId) ?? live[0];
  const interest = profile.interest;

  const onError = (err: unknown) => toast.error(errorMessage(err));

  if (interest?.status === 'accepted') return null; // The contact card says it all.
  if (interest?.status === 'pending' && !interest.sentByViewer) {
    return (
      <Card variant="raised" className="flex flex-col gap-3 border-primary">
        <p className="font-semibold text-fg">{t('matrimony.interest.theySent')}</p>
        <div className="flex flex-wrap gap-2">
          <Button leadingIcon={Check} loading={answer.isPending} onClick={() => answer.mutate({ id: interest.id, action: 'accept' }, { onSuccess: () => toast.success(t('matrimony.interest.done.accept')), onError })}>
            {t('matrimony.interest.accept')}
          </Button>
          <Button variant="secondary" leadingIcon={X} disabled={answer.isPending} onClick={() => answer.mutate({ id: interest.id, action: 'decline' }, { onSuccess: () => toast.success(t('matrimony.interest.done.decline')), onError })}>
            {t('matrimony.interest.decline')}
          </Button>
        </div>
      </Card>
    );
  }
  if (interest?.status === 'pending') {
    return (
      <Card variant="muted" className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-fg">
          <Icon icon={Clock} className="text-warning" />
          {t('matrimony.interest.waiting')}
        </p>
        <Button variant="ghost" size="sm" loading={answer.isPending} onClick={() => answer.mutate({ id: interest.id, action: 'withdraw' }, { onSuccess: () => toast.success(t('matrimony.interest.done.withdraw')), onError })}>
          {t('matrimony.interest.withdraw')}
        </Button>
      </Card>
    );
  }
  if (interest?.status === 'declined') return <p className="text-sm text-fg-muted">{t('matrimony.interest.declinedNote')}</p>;
  // Sending lives in the action bar at the bottom.
  if (!showSend || profile.status !== 'active' || !from) return null;

  return (
    <Card variant="raised" className="flex flex-col gap-3">
      <CardTitle>{t('matrimony.interest.sendTitle')}</CardTitle>
      <p className="text-sm text-fg-muted">{t('matrimony.interest.sendBody')}</p>
      {live.length > 1 && (
        <Select label={t('matrimony.interest.onBehalf')} value={from.id} onChange={(e) => setFromId(e.target.value)}>
          {live.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
      <Button
        leadingIcon={Send}
        className="self-start"
        loading={send.isPending}
        onClick={() =>
          send.mutate(
            { fromProfileId: from.id, toProfileId: profile.id },
            { onSuccess: () => toast.success(t('matrimony.interest.sentToast', { name: profile.name })), onError },
          )
        }
      >
        {live.length > 1 ? t('matrimony.interest.send') : t('matrimony.interest.sendFor', { name: from.name })}
      </Button>
    </Card>
  );
}

/**
 * The dating-app action bar, stuck to the bottom of the screen: pass (hide
 * it from our results), send interest, or shortlist it. Acting for one of the
 * family's live profiles; with more than one, a picker says which.
 */
function ActionBar({ profile }: { profile: ProfileDetail }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mine = useMyMatrimony();
  const send = useSendInterest();
  const setMark = useSetMark();
  const live = (mine.data?.profiles ?? []).filter((p) => p.status === 'active' && p.gender !== profile.gender);
  const [fromId, setFromId] = useState(params.get('from') ?? '');
  const from = live.find((p) => p.id === fromId) ?? live[0];
  if (!from || profile.status !== 'active') return null;

  const kind = profile.marks.find((m) => m.fromProfileId === from.id)?.kind ?? null;
  const canSend = !profile.interest || profile.interest.status === 'withdrawn';
  const onError = (err: unknown) => toast.error(errorMessage(err));
  const mark = (next: 'shortlist' | 'pass' | null, done: string, after?: () => void) =>
    setMark.mutate({ fromProfileId: from.id, profileId: profile.id, kind: next }, { onSuccess: () => { toast.success(done); after?.(); }, onError });

  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-2 md:bottom-6 lg:col-span-2 print:hidden">
      {live.length > 1 && (
        <label className="flex items-center gap-2 rounded-full bg-surface/95 px-3 py-1 text-xs text-fg-muted shadow-card backdrop-blur">
          {t('matrimony.interest.onBehalf')}
          <select className="bg-transparent font-semibold text-fg" value={from.id} onChange={(e) => setFromId(e.target.value)}>
            {live.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-4 rounded-full bg-surface/95 p-2 shadow-overlay backdrop-blur">
        <button
          type="button"
          aria-label={t('matrimony.pass.label', { name: profile.name })}
          disabled={setMark.isPending}
          onClick={() => mark('pass', t('matrimony.pass.done', { name: profile.name }), () => navigate(-1))}
          className="flex size-14 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted transition-colors duration-150 hover:text-danger"
        >
          <Icon icon={X} size="lg" />
        </button>
        <button
          type="button"
          aria-label={canSend ? t('matrimony.interest.sendFor', { name: from.name }) : t('matrimony.interest.sentAlready')}
          disabled={!canSend || send.isPending}
          onClick={() => send.mutate({ fromProfileId: from.id, toProfileId: profile.id }, { onSuccess: () => toast.success(t('matrimony.interest.sentToast', { name: profile.name })), onError })}
          className="flex size-16 items-center justify-center rounded-full bg-kumkum text-on-primary shadow-raised transition-transform duration-150 hover:scale-105 disabled:scale-100 disabled:opacity-50"
        >
          <Icon icon={HeartHandshake} size="lg" weight="fill" />
        </button>
        <button
          type="button"
          aria-pressed={kind === 'shortlist'}
          aria-label={kind === 'shortlist' ? t('matrimony.shortlist.remove', { name: profile.name }) : t('matrimony.shortlist.add', { name: profile.name })}
          disabled={setMark.isPending}
          onClick={() =>
            kind === 'shortlist' ? mark(null, t('matrimony.shortlist.removed')) : mark('shortlist', t('matrimony.shortlist.added', { name: profile.name }))
          }
          className={cn(
            'flex size-14 items-center justify-center rounded-full border transition-colors duration-150',
            kind === 'shortlist' ? 'border-zari bg-zari text-on-primary' : 'border-line-strong bg-surface text-zari-fg hover:bg-zari-soft',
          )}
        >
          <Icon icon={Star} size="lg" weight={kind === 'shortlist' ? 'fill' : 'regular'} />
        </button>
      </div>
      <p className="hidden rounded-full bg-surface/90 px-3 py-0.5 text-xs text-fg-muted backdrop-blur md:block">
        {canSend ? t('matrimony.actions.hint') : t('matrimony.interest.sentAlready')}
      </p>
    </div>
  );
}

/** What still has to be filled before approval. Each item opens the form at its step; kul is set on the family page. */
function MissingChecklist({ profile, onEdit }: { profile: ProfileDetail; onEdit: (field?: MissingField) => void }) {
  const t = useT();
  const missing = profile.missing ?? [];
  if (missing.length === 0 || profile.status === 'closed') return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Icon icon={CircleAlert} size="sm" className="text-warning" />
        {t(profile.status === 'draft' || profile.status === 'rejected' ? 'matrimony.missing.title' : 'matrimony.missing.titleLive', { count: missing.length })}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {missing.map((field) =>
          field === 'gotra' ? (
            <li key={field}>
              <Link to={`/families/${profile.familyId}`} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold text-primary hover:underline">
                {t(MISSING_LABEL[field])}
                <Icon icon={ChevronRight} size="sm" />
              </Link>
            </li>
          ) : (
            <li key={field}>
              <button type="button" onClick={() => onEdit(field)} className="inline-flex min-h-8 items-center rounded-full bg-surface px-3 text-xs font-semibold text-fg hover:text-primary">
                {t(MISSING_LABEL[field])}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FamilyPanel({ profile, onEdit }: { profile: ProfileDetail; onEdit: (field?: MissingField) => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { simple, withReason } = useProfileAction(profile.id);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState<'married' | 'withdrawn'>('married');
  const onError = (err: unknown) => toast.error(errorMessage(err));
  const act = (action: 'submit' | 'pause' | 'resume' | 'resubmit', message: string) => simple.mutate(action, { onSuccess: () => toast.success(message), onError });
  const complete = (profile.missing ?? []).length === 0;

  const note = {
    draft: { icon: NotePencil, tone: 'text-fg-muted', text: complete ? t('matrimony.own.draftReady') : t('matrimony.own.draft') },
    pending: { icon: Clock, tone: 'text-warning', text: t('matrimony.own.pending') },
    active: { icon: BadgeCheck, tone: 'text-success', text: t('matrimony.own.active') },
    paused: { icon: EyeOff, tone: 'text-fg-muted', text: t('matrimony.own.paused') },
    rejected: { icon: TriangleAlert, tone: 'text-danger', text: t('matrimony.own.rejected') },
    closed: { icon: HeartHandshake, tone: 'text-fg-muted', text: t(`matrimony.own.closed.${profile.closeReason ?? 'withdrawn'}`) },
  }[profile.status];

  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-sm text-fg">
        <Icon icon={note.icon} className={cn('mt-0.5', note.tone)} />
        {note.text}
      </p>
      {profile.moderationNote && (
        <blockquote className="rounded-sm bg-surface-muted p-3 text-sm text-fg">
          <span className="block text-xs font-semibold text-fg-muted">{t('verify.reason')}</span>
          {profile.moderationNote}
        </blockquote>
      )}
      <MissingChecklist profile={profile} onEdit={onEdit} />
      {profile.status !== 'closed' && (
        <div className="flex flex-wrap gap-2">
          {profile.status === 'draft' && (
            <Button size="sm" leadingIcon={Send} disabled={!complete} loading={simple.isPending} onClick={() => act('submit', t('matrimony.submitted'))}>
              {t('matrimony.submitForReview')}
            </Button>
          )}
          <Button variant="secondary" size="sm" leadingIcon={Pencil} onClick={() => onEdit()}>
            {t('common.edit')}
          </Button>
          {profile.status === 'active' && (
            <Button variant="secondary" size="sm" leadingIcon={Pause} loading={simple.isPending} onClick={() => act('pause', t('matrimony.paused'))}>
              {t('matrimony.pause')}
            </Button>
          )}
          {profile.status === 'paused' && (
            <Button variant="secondary" size="sm" leadingIcon={Play} loading={simple.isPending} onClick={() => act('resume', t('matrimony.resumed'))}>
              {t('matrimony.resume')}
            </Button>
          )}
          {profile.status === 'rejected' && (
            <Button size="sm" leadingIcon={Send} disabled={!complete} loading={simple.isPending} onClick={() => act('resubmit', t('verify.resubmitted'))}>
              {t('verify.resubmit')}
            </Button>
          )}
          <Button variant="ghost" size="sm" leadingIcon={HeartHandshake} onClick={() => setClosing(true)}>
            {t('matrimony.close')}
          </Button>
        </div>
      )}
      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title={t('matrimony.closeTitle')}
        description={t('matrimony.closeBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={withReason.isPending}
              onClick={() =>
                withReason.mutate(
                  { action: 'close', reason },
                  {
                    onSuccess: () => {
                      toast.success(t(reason === 'married' ? 'matrimony.closedMarried' : 'matrimony.closedWithdrawn'));
                      setClosing(false);
                    },
                    onError,
                  },
                )
              }
            >
              {t('matrimony.closeConfirm')}
            </Button>
          </>
        }
      >
        <Select label={t('matrimony.closeReason')} value={reason} onChange={(e) => setReason(e.target.value as 'married' | 'withdrawn')}>
          <option value="married">{t('matrimony.closeMarried')}</option>
          <option value="withdrawn">{t('matrimony.closeWithdrawn')}</option>
        </Select>
      </Modal>
    </Card>
  );
}

/**
 * For the committee or office filling in a family's profile, as at a melava
 * counter: what is missing, edit, and send a finished draft on.
 */
function OfficePanel({ profile, onEdit }: { profile: ProfileDetail; onEdit: (field?: MissingField) => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { simple } = useProfileAction(profile.id);
  const complete = (profile.missing ?? []).length === 0;
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{t('matrimony.office.title')}</CardTitle>
      <p className="text-sm text-fg-muted">{t('matrimony.office.body')}</p>
      <MissingChecklist profile={profile} onEdit={onEdit} />
      <div className="flex flex-wrap gap-2">
        {profile.status === 'draft' && (
          <Button
            size="sm"
            leadingIcon={Send}
            disabled={!complete}
            loading={simple.isPending}
            onClick={() => simple.mutate('submit', { onSuccess: () => toast.success(t('matrimony.submitted')), onError: (err) => toast.error(errorMessage(err)) })}
          >
            {t('matrimony.submitForReview')}
          </Button>
        )}
        <Button variant="secondary" size="sm" leadingIcon={Pencil} onClick={() => onEdit()}>
          {t('common.edit')}
        </Button>
      </div>
    </Card>
  );
}

/** For the branch committee: approve or reject a waiting profile, or take down a live one. */
function ReviewerPanel({ profile }: { profile: ProfileDetail }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { simple, withReason } = useProfileAction(profile.id);
  const [noteFor, setNoteFor] = useState<'reject' | 'remove' | null>(null);
  const [note, setNote] = useState('');
  const onError = (err: unknown) => toast.error(errorMessage(err));

  if (profile.status !== 'pending' && profile.status !== 'active' && profile.status !== 'paused') return null;

  return (
    <Card variant="raised" className="flex flex-col gap-3 border-primary">
      <CardTitle>{t('matrimony.review.title')}</CardTitle>
      <p className="text-sm text-fg-muted">{profile.status === 'pending' ? t('matrimony.review.body') : t('matrimony.review.liveBody')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {profile.status === 'pending' ? (
          <>
            <Button leadingIcon={BadgeCheck} loading={simple.isPending} onClick={() => simple.mutate('approve', { onSuccess: () => toast.success(t('matrimony.review.approved')), onError })}>
              {t('matrimony.review.approve')}
            </Button>
            <Button variant="secondary" onClick={() => setNoteFor('reject')}>
              {t('review.reject')}
            </Button>
          </>
        ) : (
          <Button variant="danger" leadingIcon={Trash2} onClick={() => setNoteFor('remove')}>
            {t('matrimony.review.remove')}
          </Button>
        )}
      </div>
      <Modal
        open={noteFor !== null}
        onClose={() => setNoteFor(null)}
        title={noteFor === 'remove' ? t('matrimony.review.remove') : t('review.rejectTitle')}
        description={t('matrimony.review.noteBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              leadingIcon={Send}
              loading={withReason.isPending}
              onClick={() =>
                noteFor &&
                withReason.mutate(
                  { action: noteFor, reason: note },
                  {
                    onSuccess: () => {
                      toast.success(t('review.rejected'));
                      setNoteFor(null);
                      setNote('');
                    },
                    onError,
                  },
                )
              }
            >
              {t('review.send')}
            </Button>
          </>
        }
      >
        <Textarea label={t('review.reason')} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </Card>
  );
}

export function ProfileDetailPage() {
  const { id = '' } = useParams();
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const profile = useProfile(id);
  const me = useMe();
  const [formTarget, setFormTarget] = useState<ProfileFormTarget | null>(null);

  if (profile.isPending) {
    return (
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[20rem_1fr]" aria-busy="true">
        <Skeleton className="aspect-[4/5] w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      </div>
    );
  }
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 404) {
      return (
        <EmptyState
          icon={HeartHandshake}
          title={t('matrimony.gone.title')}
          body={t('matrimony.gone.body')}
          action={
            <Link to="/matrimony/search" className={buttonVariants({ variant: 'secondary' })}>
              {t('matrimony.tab.search')}
            </Link>
          }
        />
      );
    }
    return <ErrorState title={t('matrimony.error.title')} error={profile.error} onRetry={() => profile.refetch()} retrying={profile.isFetching} />;
  }

  const p = profile.data;
  // Own family, not "can edit": committee members can edit profiles in their branch too,
  // but they act on them as reviewers.
  const own = me.data?.familyId === p.familyId;
  const sections = foldedSections(p, t, language);
  const glance = glanceRows(p, t, language);
  const prefs = preferenceChips(p, t, language);
  // Age is in the title already; the line under it has height and marital status.
  const facts = headlineFacts({ ...p, age: null }, t, language);

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* Left on wide screens, and staying put while the details scroll: the photos. */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-6">
        <PhotoStory photos={galleryOf(p)} name={p.name} className="-mx-4 aspect-[4/5] shadow-raised sm:mx-0 sm:rounded-lg">
          <div className="flex flex-wrap items-center gap-1.5">
            {p.status === 'active' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-on-photo/20 px-2 py-0.5 text-xs font-semibold backdrop-blur">
                <Icon icon={BadgeCheck} size="sm" weight="fill" className="text-zari" />
                {t('matrimony.approved')}
              </span>
            )}
            {(own || p.permissions.canReview) && p.status !== 'active' && <ProfileStatusBadge status={p.status} />}
          </div>
          {/* h2: the Matrimony page title above is the h1. */}
          <h2 className="font-display text-3xl leading-tight font-semibold break-words">
            {p.name}
            {p.age !== null && <span className="font-medium text-on-photo-muted">, {formatNumber(p.age, language)}</span>}
          </h2>
          {facts.length > 0 && <p className="text-sm text-on-photo-muted">{facts.join(' · ')}</p>}
        </PhotoStory>
        {own && p.status !== 'closed' && <PhotoManager profile={p} />}
      </div>

      <div className="flex flex-col gap-4">
        {/* At a glance: the facts families look for first, plainly. */}
        {glance.length > 0 && (
          <Card as="section" className="flex flex-col gap-1">
            <CardTitle>{t('matrimony.glance.title')}</CardTitle>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              {glance.map((r) => (
                <div key={r.label} className="flex flex-col border-b border-line py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                  <dt className="text-xs text-fg-muted">{r.label}</dt>
                  <dd className="font-medium break-words text-fg">{r.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {p.contact && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success bg-success-soft p-3">
            <p className="text-sm text-fg">
              {own ? t('matrimony.contactOwn') : t('matrimony.contactShared')} <span className="font-semibold">{p.contact.name}</span>
            </p>
            <a href={`tel:${p.contact.phone}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'tabular-nums')}>
              <Icon icon={Phone} />
              {formatPhone(p.contact.phone)}
            </a>
          </div>
        )}

        {own && <FamilyPanel profile={p} onEdit={(field) => setFormTarget({ mode: 'edit', profile: p, startAt: field })} />}
        {!own && p.permissions.canEdit && p.status !== 'closed' && <OfficePanel profile={p} onEdit={(field) => setFormTarget({ mode: 'edit', profile: p, startAt: field })} />}
        {p.permissions.canReview && <ReviewerPanel profile={p} />}
        {!own && <InterestPanel profile={p} />}

        {/* The story: in their own words first, then what they hope for. */}
        {p.about && <PromptCard question={t('matrimony.about')}>{p.about}</PromptCard>}
        {p.prompts.map((pr) => (
          <PromptCard key={pr.prompt} question={t(`matrimony.prompt.${pr.prompt}`)}>
            {pr.answer}
          </PromptCard>
        ))}
        {(p.expectations || prefs.length > 0) && (
          <PromptCard question={t('matrimony.expectations')}>
            {prefs.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5 font-sans">
                {prefs.map((chip) => (
                  <li key={chip}>
                    <Badge tone="primary">{chip}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {p.expectations && <p className="whitespace-pre-line">{p.expectations}</p>}
          </PromptCard>
        )}

        {sections.map((section) => (
          <SectionDetails key={section.id} section={section} />
        ))}
        {!p.contact && !own && (
          <p className="flex items-center gap-2 rounded-lg bg-surface-muted p-3 text-sm text-fg-muted">
            <Icon icon={Lock} size="sm" />
            {t('matrimony.biodata.contactHidden')}
          </p>
        )}

        <Link to={`/matrimony/profiles/${p.id}/biodata`} className={cn(buttonVariants({ variant: 'secondary' }), 'self-start')}>
          <Icon icon={FileText} />
          {t('matrimony.biodata')}
        </Link>
      </div>

      {!own && <ActionBar profile={p} />}

      <ProfileFormModal target={formTarget} onClose={() => setFormTarget(null)} />
    </div>
  );
}
