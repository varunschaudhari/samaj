import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, EmptyState, Icon, buttonVariants, toast } from '@/components/ui';
import { ArrowLeft, Mail, Send } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { useFamily } from '@/features/families/api';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useAudience, useCreateInvitation } from './api';
import { GuestPicker, type GuestPicks, emptyPicks, pickCount, picksToInput } from './GuestPicker';
import { InvitationCard } from './InvitationCard';
import { InvitationForm, draftErrors, draftFrom, draftToInput } from './InvitationForm';

/** Write an invitation, pick who gets it, see the card as they will, and send. */
export function NewInvitationPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const me = useMe();
  const verified = me.data?.familyStatus === 'verified';
  const family = useFamily(me.data?.familyId);
  const audience = useAudience(verified);
  const create = useCreateInvitation();
  const [draft, setDraft] = useState(draftFrom());
  const [picks, setPicks] = useState<GuestPicks>(emptyPicks());
  const [tried, setTried] = useState(false);
  const errors = tried ? draftErrors(draft) : {};
  const count = pickCount(picks);
  const preview = draftToInput(draft);
  // The one remembered, from the family, for the preview's photo and years.
  const memorial = family.data?.members.find((m) => m.id === draft.memorialMemberId);

  const back = (
    <Link to="/invitations" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      <Icon icon={ArrowLeft} />
      {t('invite.page.title')}
    </Link>
  );
  if (me.data && !verified) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div>{back}</div>
        <EmptyState icon={Mail} title={t('invite.new')} body={t('invite.notVerified')} />
      </div>
    );
  }

  const send = () => {
    setTried(true);
    if (Object.keys(draftErrors(draft)).length > 0 || count === 0) return;
    create.mutate(
      { ...draftToInput(draft), ...picksToInput(picks) },
      {
        onSuccess: (inv) => {
          toast.success(t('invite.form.sent', { count: formatNumber(inv.invitedCount ?? count, language) }));
          void navigate(`/invitations/${inv.id}`);
        },
      },
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>{back}</div>
      <PageHeader title={t('invite.new')} description={t('invite.page.description')} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-5">
            <InvitationForm draft={draft} onChange={setDraft} errors={errors} />
          </Card>
          <Card as="section" aria-labelledby="invite-guests" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="invite-guests" className="font-display text-lg font-semibold text-fg">
                {t('invite.form.guests')}
              </h2>
              <p className="text-sm text-fg-muted">{t('invite.form.guestsHint')}</p>
            </div>
            <GuestPicker audience={audience.data} picks={picks} onChange={setPicks} ownFamilyId={me.data?.familyId ?? ''} />
            {tried && count === 0 && <p className="text-sm text-danger">{t('validation.guestsNeeded')}</p>}
          </Card>
          {create.isError && <FormAlert message={errorMessage(create.error)} />}
          <Button leadingIcon={Send} className="self-start" loading={create.isPending} onClick={send}>
            {t('invite.form.send')}
          </Button>
        </div>
        <aside className="flex flex-col gap-2 lg:sticky lg:top-6">
          <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t('invite.form.preview')}</h2>
          <InvitationCard
            data={{
              kind: draft.kind,
              forNames: draft.forNames.trim() || null,
              message: draft.message.trim() || null,
              hostName: family.data?.headName ?? '',
              functions: preview.functions.map((f) => ({ name: f.name, startsAt: f.startsAt || null, endsAt: f.endsAt ?? null, venue: f.venue, mapUrl: f.mapUrl ?? null, muhuratAt: f.muhuratAt ?? null })),
              honorees: preview.honorees?.map((h) => ({ name: h.name, detail: h.detail ?? null })),
              kripa: preview.kripa,
              blessings: preview.blessings,
              inviters: preview.inviters,
              memorial: memorial && { years: memorial.deathYear ? `${memorial.birthYear ?? '…'} – ${memorial.deathYear}` : null, photoSrc: memorial.photoUrl },
            }}
          />
        </aside>
      </div>
    </div>
  );
}
