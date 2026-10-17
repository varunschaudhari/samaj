import { type ProfileCard, type ProfileStatus, gotraName } from '@samaj/shared';
import { BadgeCheck, MapPin, Star } from '@/components/ui/icons';
import { Link } from 'react-router';
import { Badge, Icon, Skeleton, toast } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatFeet, useSetMark } from './api';

const STATUS_TONE: Record<ProfileStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  pending: 'warning',
  active: 'success',
  rejected: 'danger',
  paused: 'neutral',
  closed: 'neutral',
};

export function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`matrimony.status.${status}`)}</Badge>;
}

/** "3 of 4 preferences", with a star when every preference is met. */
export function MatchBadge({ match, className }: { match: NonNullable<ProfileCard['match']>; className?: string }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const full = match.met === match.total;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-card', full ? 'bg-primary text-on-primary' : 'bg-surface text-fg', className)}>
      {full && <Icon icon={Star} size="sm" weight="fill" />}
      {full ? t('matrimony.matchFull') : t('matrimony.match', { met: formatNumber(match.met, language), total: formatNumber(match.total, language) })}
    </span>
  );
}

/** The star on a card or profile: shortlist it for the family's profile, or take it off the shortlist. */
export function ShortlistButton({ fromProfileId, profileId, name, shortlisted, className }: { fromProfileId: string; profileId: string; name: string; shortlisted: boolean; className?: string }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const setMark = useSetMark();
  return (
    <button
      type="button"
      aria-pressed={shortlisted}
      aria-label={shortlisted ? t('matrimony.shortlist.remove', { name }) : t('matrimony.shortlist.add', { name })}
      disabled={setMark.isPending}
      onClick={() =>
        setMark.mutate(
          { fromProfileId, profileId, kind: shortlisted ? null : 'shortlist' },
          { onSuccess: () => toast.success(shortlisted ? t('matrimony.shortlist.removed') : t('matrimony.shortlist.added', { name })), onError: (err) => toast.error(errorMessage(err)) },
        )
      }
      className={cn(
        'flex size-touch items-center justify-center rounded-full shadow-card transition-colors duration-150',
        shortlisted ? 'bg-zari text-on-primary' : 'bg-surface/90 text-fg hover:text-zari-fg',
        className,
      )}
    >
      <Icon icon={Star} weight={shortlisted ? 'fill' : 'regular'} />
    </button>
  );
}

interface ProfileCardViewProps {
  profile: ProfileCard;
  href: string;
  showStatus?: boolean;
  /** Searching for this profile of the family's: shows the shortlist star. */
  markFrom?: string;
}

/**
 * A profile as a photo card, like a dating app's: the photo fills it, with
 * name, age and a line about them on a shade at the bottom. The whole card
 * opens the profile; the star sits above that link.
 */
export function ProfileCardView({ profile, href, showStatus, markFrom }: ProfileCardViewProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const gotra = profile.gotra ? gotraName(profile.gotra, language) : null;
  const line = [profile.heightCm ? formatFeet(profile.heightCm) : null, profile.education, profile.occupation].filter(Boolean).join(' · ');

  return (
    <li className="group relative isolate aspect-[3/4] min-w-0 overflow-hidden rounded-lg bg-hero shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-raised">
      {profile.photoUrl ? (
        <img src={profile.photoUrl} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]" />
      ) : (
        <div className="absolute inset-0 -z-10 flex items-center justify-center pb-16" aria-hidden="true">
          <span className="font-display text-[3.5rem] leading-none font-semibold text-on-hero-muted/70">
            {profile.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => [...w][0])
              .join('')}
          </span>
        </div>
      )}

      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        <div className="flex flex-col items-start gap-1">
          {profile.match && <MatchBadge match={profile.match} />}
          {showStatus && <ProfileStatusBadge status={profile.status} />}
        </div>
        {markFrom && <ShortlistButton fromProfileId={markFrom} profileId={profile.id} name={profile.name} shortlisted={profile.mark === 'shortlist'} className="relative z-10" />}
      </div>

      <div className="photo-shade absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3 pt-16 text-on-photo sm:p-4 sm:pt-20">
        <h2 className="flex min-w-0 items-baseline gap-1.5 font-display leading-tight font-semibold">
          <Link
            to={href}
            className="truncate text-lg after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-on-photo sm:text-xl"
          >
            {profile.name}
          </Link>
          {profile.age !== null && <span className="shrink-0 text-lg font-medium text-on-photo-muted tabular-nums sm:text-xl">{formatNumber(profile.age, language)}</span>}
        </h2>
        {line && <p className="truncate text-xs text-on-photo-muted sm:text-sm">{line}</p>}
        <p className="flex min-w-0 items-center gap-1 text-xs text-on-photo-muted sm:text-sm">
          <Icon icon={MapPin} size="sm" className="shrink-0" />
          <span className="truncate">{placeLabel(profile.place, profile.branch, language)}</span>
        </p>
        {gotra && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-on-photo">
            <Icon icon={BadgeCheck} size="sm" className="text-zari" weight="fill" />
            {t('matrimony.kulLine', { kul: gotra })}
          </p>
        )}
      </div>
    </li>
  );
}

export function ProfileCardSkeleton() {
  return (
    <li className="aspect-[3/4] overflow-hidden rounded-lg" aria-hidden="true">
      <Skeleton className="size-full rounded-lg" />
    </li>
  );
}

/** The grid for photo cards: two across on phones, more on wider screens. */
export const PROFILE_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5';
