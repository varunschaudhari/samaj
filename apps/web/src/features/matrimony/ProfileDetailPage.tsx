import { type ProfileDetail, formatPhone, gotraName } from '@samaj/shared';
import { BadgeCheck, Check, Clock, EyeOff, HeartHandshake, MapPin, Pause, Pencil, Phone, Play, Send, Trash2, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Avatar, Button, Card, CardTitle, EmptyState, ErrorState, Icon, Modal, Select, Skeleton, Textarea, buttonVariants, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { placeLabel } from '@/features/branches/api';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatHeight, useInterestAction, useMyMatrimony, useProfile, useProfileAction, useSendInterest } from './api';
import { ProfileStatusBadge } from './ProfileCardView';
import { type ProfileFormTarget, ProfileFormModal } from './ProfileFormModal';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-fg-muted sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="font-semibold break-words text-fg">{children}</dd>
    </div>
  );
}

/** Send, answer or follow an interest between this profile and the viewer's family. */
function InterestPanel({ profile }: { profile: ProfileDetail }) {
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
  if (profile.status !== 'active' || !from) return null;

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

/** For the profile's family: status, and what they can do about it. */
function FamilyPanel({ profile, onEdit }: { profile: ProfileDetail; onEdit: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { simple, withReason } = useProfileAction(profile.id);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState<'married' | 'withdrawn'>('married');
  const onError = (err: unknown) => toast.error(errorMessage(err));
  const act = (action: 'pause' | 'resume' | 'resubmit', message: string) => simple.mutate(action, { onSuccess: () => toast.success(message), onError });

  const note = {
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
      {profile.status !== 'closed' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" leadingIcon={Pencil} onClick={onEdit}>
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
            <Button size="sm" leadingIcon={Send} loading={simple.isPending} onClick={() => act('resubmit', t('verify.resubmitted'))}>
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
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="aspect-square w-full max-w-xs rounded-lg" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full rounded-md" />
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

  return (
    <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,18rem)_1fr] md:items-start md:gap-6">
      <div className="flex flex-col gap-3">
        {p.photoUrl ? (
          <img src={p.photoUrl} alt={t('matrimony.photoOf', { name: p.name })} className="aspect-square w-full max-w-xs rounded-lg object-cover" />
        ) : (
          <Avatar name={p.name} size="xl" />
        )}
        {p.contact && (
          <Card className="flex flex-col gap-2 border-success bg-success-soft">
            <p className="text-sm text-fg">
              {own ? t('matrimony.contactOwn') : t('matrimony.contactShared')} <span className="font-semibold">{p.contact.name}</span>
            </p>
            <a href={`tel:${p.contact.phone}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start tabular-nums')}>
              <Icon icon={Phone} />
              {formatPhone(p.contact.phone)}
            </a>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* h2: the Matrimony page title above is the h1. */}
            <h2 className="font-display text-2xl font-semibold text-fg md:text-3xl">{p.name}</h2>
            {(own || p.permissions.canReview) && <ProfileStatusBadge status={p.status} />}
          </div>
          <p className="flex items-center gap-1 text-sm text-fg-muted">
            <Icon icon={MapPin} size="sm" />
            {placeLabel(p.place, p.branch, language)}
          </p>
        </header>

        {own && <FamilyPanel profile={p} onEdit={() => setFormTarget({ mode: 'edit', profile: p })} />}
        {p.permissions.canReview && <ReviewerPanel profile={p} />}
        {!own && <InterestPanel profile={p} />}

        <Card>
          <dl className="divide-y divide-line">
            {p.age !== null && <Fact label={t('matrimony.age')}>{formatNumber(p.age, language)}</Fact>}
            {p.heightCm && <Fact label={t('matrimony.height')}>{formatHeight(p.heightCm)}</Fact>}
            {p.education && <Fact label={t('member.education')}>{p.education}</Fact>}
            {p.occupation && <Fact label={t('member.occupation')}>{p.occupation}</Fact>}
            {p.income && <Fact label={t('matrimony.income')}>{t(`matrimony.income.${p.income}`)}</Fact>}
            <Fact label={t('family.gotra')}>{gotraName(p.gotra, language) ?? t('family.gotraNone')}</Fact>
            {p.maternalGotra && <Fact label={t('matrimony.maternalGotra')}>{gotraName(p.maternalGotra, language)}</Fact>}
            {p.manglik && <Fact label={t('matrimony.manglik')}>{t(`matrimony.manglik.${p.manglik}`)}</Fact>}
          </dl>
        </Card>
        {p.about && (
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-fg-muted">{t('matrimony.about')}</h2>
            <p className="max-w-prose whitespace-pre-line text-fg">{p.about}</p>
          </section>
        )}
        {p.expectations && (
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-fg-muted">{t('matrimony.expectations')}</h2>
            <p className="max-w-prose whitespace-pre-line text-fg">{p.expectations}</p>
          </section>
        )}
      </div>

      <ProfileFormModal target={formTarget} onClose={() => setFormTarget(null)} />
    </div>
  );
}
