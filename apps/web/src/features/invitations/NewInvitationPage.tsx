import { themeFor } from '@samaj/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, EmptyState, Icon, buttonVariants, toast } from '@/components/ui';
import { ArrowLeft, ArrowRight, Check, Mail, Send } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { useFamily } from '@/features/families/api';
import { formatDate, formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useAudience, useCreateInvitation } from './api';
import { GuestPicker, type GuestPicks, emptyPicks, pickCount, picksToInput } from './GuestPicker';
import { type CardData, InvitationCard } from './InvitationCard';
import { type FormSection, type InvitationDraft, InvitationForm, draftErrors, draftFrom, draftToInput, sectionErrors } from './InvitationForm';

type Step = FormSection | 'guests' | 'review';
const STEPS: Step[] = ['occasion', 'functions', 'patrika', 'guests', 'review'];

/** The draft stays on this device, so a reload or a closed tab doesn't lose it. The guest picks are quick to redo. */
const DRAFT_KEY = 'samaj.invitationDraft';
function readDraft(): { draft: InvitationDraft; step: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as { draft: InvitationDraft; step: number }) : null;
  } catch {
    return null;
  }
}
function saveDraft(value: { draft: InvitationDraft; step: number } | null) {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private browsing: the draft just isn't kept.
  }
}

/** Numbered steps; those already reached can be opened again. */
function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (i: number) => void }) {
  const t = useT();
  return (
    <nav aria-label={t('invite.step.label')}>
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={i > reached}
                aria-current={current ? 'step' : undefined}
                onClick={() => onGo(i)}
                className="flex min-h-touch min-w-0 flex-col items-center gap-1 rounded-md px-1 disabled:cursor-default sm:flex-row sm:gap-2"
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums',
                    current ? 'border-primary bg-primary text-on-primary' : done ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-fg-muted',
                  )}
                >
                  {done ? <Icon icon={Check} size="sm" /> : i + 1}
                </span>
                <span className={cn('truncate text-xs font-semibold sm:text-sm', current ? 'text-fg' : 'text-fg-muted', !current && 'hidden sm:inline')}>{t(`invite.step.${s}`)}</span>
              </button>
              {i < STEPS.length - 1 && <span className={cn('h-0.5 min-w-3 flex-1 rounded-full', done ? 'bg-primary' : 'bg-line')} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A new invitation, step by step: the occasion and its design, the
 * functions, what the patrika says, who to invite, and a last look at the
 * card before sending. The card's preview follows along.
 */
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
  const saved = useRef(readDraft());
  const [draft, setDraft] = useState<InvitationDraft>(() => saved.current?.draft ?? draftFrom());
  const [step, setStep] = useState(() => Math.min(saved.current?.step ?? 0, 2));
  const [reached, setReached] = useState(step);
  const [picks, setPicks] = useState<GuestPicks>(emptyPicks());
  // Errors show for a step once they've tried to leave it.
  const [tried, setTried] = useState<Set<Step>>(new Set());
  const all = draftErrors(draft);
  const errors = Object.fromEntries(Object.entries(all).filter(([path]) => [...tried].some((s) => s !== 'guests' && s !== 'review' && sectionErrors({ [path]: '' }, s).length)));
  const count = pickCount(picks);
  const current = STEPS[step] ?? 'occasion';

  useEffect(() => saveDraft({ draft, step }), [draft, step]);
  const top = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

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

  /** Can this step be left? If not, say what to fix and take them to it. */
  const check = (s: Step): boolean => {
    const bad = s === 'guests' ? count === 0 : s === 'review' ? false : sectionErrors(all, s).length > 0;
    if (!bad) return true;
    setTried((prev) => new Set([...prev, s]));
    toast.error(t(s === 'guests' ? 'validation.guestsNeeded' : 'invite.step.fixFirst'));
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('main [aria-invalid="true"]');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
    return false;
  };
  const next = () => check(current) && go(step + 1);
  const jump = (i: number) => {
    // Going back is free; going forward checks each step on the way.
    for (let s = step; s < i; s++) {
      const at = STEPS[s];
      if (at && !check(at)) return go(s);
    }
    go(i);
  };

  const send = () => {
    for (const [i, s] of STEPS.entries()) if (!check(s)) return go(i);
    create.mutate(
      { ...draftToInput(draft), ...picksToInput(picks) },
      {
        onSuccess: (inv) => {
          saveDraft(null);
          toast.success(t('invite.form.sent', { count: formatNumber(inv.invitedCount ?? count, language) }));
          void navigate(`/invitations/${inv.id}`);
        },
      },
    );
  };
  const startOver = () => {
    saveDraft(null);
    setDraft(draftFrom());
    setPicks(emptyPicks());
    setTried(new Set());
    setReached(0);
    go(0);
  };

  const preview = draftToInput(draft);
  // The one remembered, from the family, for the preview's photo and years.
  const memorial = family.data?.members.find((m) => m.id === draft.memorialMemberId);
  const card: CardData = {
    kind: draft.kind,
    theme: draft.theme,
    forNames: draft.forNames.trim() || null,
    message: draft.message.trim() || null,
    hostName: family.data?.headName ?? '',
    functions: preview.functions.map((f) => ({ name: f.name, startsAt: f.startsAt || null, endsAt: f.endsAt ?? null, venue: f.venue, mapUrl: f.mapUrl ?? null, muhuratAt: f.muhuratAt ?? null })),
    honorees: preview.honorees?.map((h) => ({ name: h.name, detail: h.detail ?? null })),
    kripa: preview.kripa,
    blessings: preview.blessings,
    inviters: preview.inviters,
    memorial: memorial && { years: memorial.deathYear ? `${memorial.birthYear ?? '…'} – ${memorial.deathYear}` : null, photoSrc: memorial.photoUrl },
  };
  const firstDay = preview.functions.map((f) => f.startsAt).filter(Boolean).sort()[0];
  const people = picksToInput(picks).personIds.length;

  return (
    <div ref={top} className="mx-auto flex w-full max-w-6xl scroll-mt-4 flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        {back}
        {saved.current && (
          <Button variant="ghost" size="sm" onClick={startOver}>
            {t('invite.step.startOver')}
          </Button>
        )}
      </div>
      <PageHeader title={t('invite.new')} description={t(`invite.step.${current}Hint`)} />
      <Stepper step={step} reached={reached} onGo={jump} />

      <div className={cn('grid items-start gap-5', current !== 'review' && 'lg:grid-cols-[minmax(0,1fr)_24rem]')}>
        <div className="flex min-w-0 flex-col gap-5">
          {current === 'occasion' || current === 'functions' || current === 'patrika' ? (
            <Card className="flex flex-col gap-5">
              <InvitationForm draft={draft} onChange={setDraft} errors={errors} sections={[current]} />
            </Card>
          ) : current === 'guests' ? (
            <Card as="section" aria-labelledby="invite-guests" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="invite-guests" className="font-display text-xl font-semibold text-fg">
                  {t('invite.form.guests')}
                </h2>
                <p className="text-sm text-fg-muted">{t('invite.form.guestsHint')}</p>
              </div>
              <GuestPicker audience={audience.data} picks={picks} onChange={setPicks} ownFamilyId={me.data?.familyId ?? ''} />
              {tried.has('guests') && count === 0 && <p className="text-sm text-danger">{t('validation.guestsNeeded')}</p>}
            </Card>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <InvitationCard data={card} />
              <Card as="section" aria-labelledby="invite-summary" className="flex flex-col gap-3 lg:sticky lg:top-6">
                <h2 id="invite-summary" className="font-display text-lg font-semibold text-fg">
                  {t('invite.step.summary')}
                </h2>
                <dl className="flex flex-col divide-y divide-line text-sm">
                  {(
                    [
                      ['occasion', `${t(`invite.kind.${draft.kind}`)} · ${t(`invite.theme.${themeFor(draft.kind, draft.theme)}`)}`, 0],
                      ['functions', `${t('invite.list.functions', { count: formatNumber(preview.functions.length, language) })}${firstDay ? ` · ${formatDate(firstDay, language)}` : ''}`, 1],
                      ['patrika', draft.honorees.length || draft.inviters.trim() ? t('invite.step.patrikaFilled') : t('invite.step.patrikaEmpty'), 2],
                      ['guests', `${count === 1 ? t('invite.form.familyOne') : t('invite.form.families', { count: formatNumber(count, language) })}${people ? ` · ${t('invite.step.byName', { count: formatNumber(people, language) })}` : ''}`, 3],
                    ] as const
                  ).map(([key, value, i]) => (
                    <div key={key} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 flex-col">
                        <dt className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t(`invite.step.${key}`)}</dt>
                        <dd className="truncate text-fg">{value}</dd>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => go(i)}>
                        {t('invite.step.change')}
                      </Button>
                    </div>
                  ))}
                </dl>
                {create.isError && <FormAlert message={errorMessage(create.error)} />}
                <Button leadingIcon={Send} loading={create.isPending} onClick={send} className="w-full">
                  {count === 1 ? t('invite.form.sendToOne') : t('invite.form.sendTo', { count: formatNumber(count, language) })}
                </Button>
              </Card>
            </div>
          )}

          {/* On phones the card sits under the step, one tap away. */}
          {current !== 'review' && (
            <details className="rounded-md border border-line bg-surface lg:hidden">
              <summary className="min-h-touch cursor-pointer px-4 py-3 text-sm font-semibold text-primary">{t('invite.form.preview')}</summary>
              <div className="p-3 pt-0">
                <InvitationCard data={card} />
              </div>
            </details>
          )}

          {/* Back and Next stay in reach, above the phone's tab bar. */}
          <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-md border border-line bg-surface/95 p-3 shadow-card backdrop-blur md:bottom-4">
            <Button variant="ghost" leadingIcon={ArrowLeft} disabled={step === 0} onClick={() => go(step - 1)}>
              {t('invite.step.back')}
            </Button>
            <span className="text-sm text-fg-muted tabular-nums">{t('invite.step.of', { step: formatNumber(step + 1, language), total: formatNumber(STEPS.length, language) })}</span>
            {current === 'review' ? (
              <Button leadingIcon={Send} loading={create.isPending} onClick={send}>
                {t('invite.form.send')}
              </Button>
            ) : (
              <Button trailingIcon={ArrowRight} onClick={next}>
                {t(current === 'guests' ? 'invite.step.toReview' : 'invite.step.next')}
              </Button>
            )}
          </div>
        </div>

        {current !== 'review' && (
          <aside className="hidden flex-col gap-2 lg:sticky lg:top-6 lg:flex">
            <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t('invite.form.preview')}</h2>
            <InvitationCard data={card} />
          </aside>
        )}
      </div>
    </div>
  );
}
