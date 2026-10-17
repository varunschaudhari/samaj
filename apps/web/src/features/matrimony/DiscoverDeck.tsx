import type { ProfileCard } from '@samaj/shared';
import { ArrowRight, HeartHandshake, Sparkle, Star, X } from '@/components/ui/icons';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Icon, Skeleton, buttonVariants, toast } from '@/components/ui';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { type SearchFilters, useProfile, useProfileSearch, useSendInterest, useSetMark } from './api';
import { profileChips } from './biodata';
import { PhotoStory } from './PhotoStory';
import { MatchBadge } from './ProfileCardView';
import { galleryOf } from './ProfilePhotos';

/** How far a card must be dragged, in px, to count as pass (left) or shortlist (right). */
const SWIPE_AT = 110;

/** The top card: the whole profile in brief, draggable on touch screens. */
function DeckCard({ card, forProfile, busy, onPass, onShortlist }: { card: ProfileCard; forProfile: string; busy: boolean; onPass: () => void; onShortlist: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const detail = useProfile(card.id);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const p = detail.data;
  const chips = p ? profileChips(p, t, language).slice(0, 5) : [];
  const prompt = p?.prompts[0];

  const end = () => {
    if (dx > SWIPE_AT) onShortlist();
    else if (dx < -SWIPE_AT) onPass();
    start.current = null;
    setDx(0);
  };

  return (
    <article
      className="relative mx-auto w-full max-w-md touch-pan-y overflow-hidden rounded-lg bg-surface shadow-overlay select-none"
      style={{ transform: `translateX(${dx}px) rotate(${dx / 25}deg)`, transition: start.current === null ? 'transform 200ms ease-out' : 'none' }}
      onPointerDown={(e) => {
        if (busy || e.pointerType === 'mouse') return;
        start.current = e.clientX;
      }}
      onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <PhotoStory photos={p ? galleryOf(p) : card.photoUrl ? [{ id: 'card', url: card.photoUrl }] : []} name={card.name} className="aspect-[4/5]">
        {card.match && <MatchBadge match={card.match} className="self-start" />}
        <h2 className="font-display text-3xl leading-tight font-semibold">
          {card.name}
          {card.age !== null && <span className="font-medium text-on-photo-muted">, {formatNumber(card.age, language)}</span>}
        </h2>
      </PhotoStory>

      {/* What the drag means, shown as it happens. */}
      {dx !== 0 && (
        <span
          className={cn(
            'pointer-events-none absolute top-6 rounded-md border-2 px-3 py-1 font-display text-xl font-bold uppercase',
            dx > 0 ? 'left-6 -rotate-12 border-zari text-zari' : 'right-6 rotate-12 border-danger text-danger',
          )}
          style={{ opacity: Math.min(Math.abs(dx) / SWIPE_AT, 1) }}
          aria-hidden="true"
        >
          {dx > 0 ? t('matrimony.shortlist.short') : t('matrimony.pass.short')}
        </span>
      )}

      <div className="flex flex-col gap-3 p-4">
        {detail.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            {chips.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <li key={c.text} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-fg">
                    <Icon icon={c.icon} size="sm" className="text-primary" />
                    {c.text}
                  </li>
                ))}
              </ul>
            )}
            {prompt && (
              <div className="border-l-4 border-l-kumkum pl-3">
                <p className="text-xs font-semibold text-kumkum">{t(`matrimony.prompt.${prompt.prompt}`)}</p>
                <p className="line-clamp-3 font-display text-lg leading-snug text-fg">{prompt.answer}</p>
              </div>
            )}
          </>
        )}
        <Link to={`/matrimony/profiles/${card.id}?from=${forProfile}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}>
          {t('matrimony.discover.full')}
          <Icon icon={ArrowRight} />
        </Link>
      </div>
    </article>
  );
}

/**
 * Discover: one profile at a time, best matches first, only ones the family
 * hasn't seen. Pass hides it, the star shortlists it, the heart sends interest;
 * each moves on to the next. The other family only ever hears of the interest.
 */
export function DiscoverDeck({ filters }: { filters: SearchFilters }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const results = useProfileSearch({ ...filters, view: 'discover' });
  const setMark = useSetMark();
  const send = useSendInterest();
  const card = results.data?.pages[0]?.items[0];
  const left = results.data?.pages[0]?.total ?? 0;
  const busy = setMark.isPending || send.isPending || results.isFetching;
  const onError = (err: unknown) => toast.error(errorMessage(err));

  if (results.isPending) return <Skeleton className="mx-auto aspect-[4/5] w-full max-w-md rounded-lg" />;
  if (results.isError) return <ErrorState title={t('matrimony.search.error')} error={results.error} onRetry={() => results.refetch()} retrying={results.isFetching} />;
  if (!card) return <EmptyState icon={Sparkle} title={t('matrimony.discover.doneTitle')} body={t('matrimony.discover.doneBody')} />;

  const mark = (kind: 'pass' | 'shortlist') =>
    setMark.mutate(
      { fromProfileId: filters.forProfile, profileId: card.id, kind },
      { onSuccess: () => kind === 'shortlist' && toast.success(t('matrimony.shortlist.added', { name: card.name })), onError },
    );

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-fg-muted tabular-nums">{t('matrimony.discover.left', { count: left })}</p>
      <DeckCard key={card.id} card={card} forProfile={filters.forProfile} busy={busy} onPass={() => mark('pass')} onShortlist={() => mark('shortlist')} />
      <div className="flex items-center gap-5">
        <button
          type="button"
          aria-label={t('matrimony.pass.label', { name: card.name })}
          disabled={busy}
          onClick={() => mark('pass')}
          className="flex size-16 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted shadow-card transition-colors duration-150 hover:text-danger disabled:opacity-50"
        >
          <Icon icon={X} size="lg" />
        </button>
        <button
          type="button"
          aria-label={t('matrimony.interest.sendFor', { name: card.name })}
          disabled={busy}
          onClick={() => send.mutate({ fromProfileId: filters.forProfile, toProfileId: card.id }, { onSuccess: () => toast.success(t('matrimony.interest.sentToast', { name: card.name })), onError })}
          className="flex size-20 items-center justify-center rounded-full bg-kumkum text-on-primary shadow-raised transition-transform duration-150 hover:scale-105 disabled:opacity-50"
        >
          <Icon icon={HeartHandshake} size="xl" weight="fill" />
        </button>
        <button
          type="button"
          aria-label={t('matrimony.shortlist.add', { name: card.name })}
          disabled={busy}
          onClick={() => mark('shortlist')}
          className="flex size-16 items-center justify-center rounded-full border border-zari bg-surface text-zari-fg shadow-card transition-colors duration-150 hover:bg-zari-soft disabled:opacity-50"
        >
          <Icon icon={Star} size="lg" />
        </button>
      </div>
      <p className="max-w-sm text-center text-xs text-fg-muted">{t('matrimony.discover.privacy')}</p>
    </div>
  );
}
