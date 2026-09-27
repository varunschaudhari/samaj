import { type ProfileCard, type ProfileStatus, gotraName } from '@samaj/shared';
import { GraduationCap, MapPin, Star } from '@/components/ui/icons';
import { Link } from 'react-router';
import { Avatar, Badge, Icon, Skeleton } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { headlineFacts } from './biodata';

const STATUS_TONE: Record<ProfileStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
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
function MatchBadge({ match }: { match: NonNullable<ProfileCard['match']> }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const full = match.met === match.total;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-card',
        full ? 'bg-primary text-on-primary' : 'bg-surface text-fg',
      )}
    >
      {full && <Icon icon={Star} size="sm" weight="fill" />}
      {full ? t('matrimony.matchFull') : t('matrimony.match', { met: formatNumber(match.met, language), total: formatNumber(match.total, language) })}
    </span>
  );
}

/**
 * A profile at a glance: photo, name, age, height and marital status, what
 * they do and where. The whole card opens the profile. On phones the photo
 * sits beside the text so a list stays scannable; wider screens stack it on top.
 */
export function ProfileCardView({ profile, href, showStatus }: { profile: ProfileCard; href: string; showStatus?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const facts = headlineFacts(profile, t, language);
  const work = [profile.education, profile.occupation].filter(Boolean).join(' · ');
  const gotra = profile.gotra ? gotraName(profile.gotra, language) : null;

  return (
    <li className="group relative flex min-w-0 overflow-hidden rounded-md border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised sm:flex-col">
      {/* A real photo gets a big frame; without one, a slim band with initials so the card doesn't look empty. */}
      <div
        className={cn(
          'relative w-28 shrink-0 overflow-hidden bg-primary-soft sm:w-full',
          profile.photoUrl ? 'aspect-[4/5] sm:aspect-[4/3]' : 'flex items-center sm:h-24',
        )}
      >
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Avatar name={profile.name} size="xl" className="ring-4 ring-surface" />
          </div>
        )}
        {profile.match && (
          <span className="absolute top-2 left-2 hidden sm:block">
            <MatchBadge match={profile.match} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <h2 className="truncate font-display text-lg leading-snug font-semibold text-fg">
          <Link to={href} className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus">
            {profile.name}
          </Link>
        </h2>
        {facts.length > 0 && <p className="text-sm font-medium text-fg tabular-nums">{facts.join(' · ')}</p>}
        {work && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
            <Icon icon={GraduationCap} size="sm" className="shrink-0" />
            <span className="truncate">{work}</span>
          </p>
        )}
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
          <Icon icon={MapPin} size="sm" className="shrink-0" />
          <span className="truncate">{placeLabel(profile.place, profile.branch, language)}</span>
        </p>
        {(showStatus || gotra || profile.match) && (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {showStatus && <ProfileStatusBadge status={profile.status} />}
            {gotra && <Badge tone="zari">{gotra}</Badge>}
            {/* Phones: the match sits with the badges, since the photo is small. */}
            {profile.match && (
              <span className="sm:hidden">
                <MatchBadge match={profile.match} />
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ProfileCardSkeleton() {
  return (
    <li className="flex overflow-hidden rounded-md border border-line bg-surface sm:flex-col" aria-hidden="true">
      <Skeleton className="aspect-[4/5] w-28 shrink-0 rounded-none sm:aspect-[4/3] sm:w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </li>
  );
}
