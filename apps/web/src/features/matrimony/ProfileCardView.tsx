import { type ProfileCard, type ProfileStatus, gotraName } from '@samaj/shared';
import { MapPin } from '@/components/ui/icons';
import { Link } from 'react-router';
import { Avatar, Badge, Card, Icon, Skeleton } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { formatHeight } from './api';

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

/** Name, age, height and education at a glance; the whole card opens the profile. */
export function ProfileCardView({ profile, href, showStatus }: { profile: ProfileCard; href: string; showStatus?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const facts = [
    profile.age !== null ? t('family.age', { age: profile.age }) : null,
    profile.heightCm ? formatHeight(profile.heightCm) : null,
  ].filter(Boolean);

  return (
    <Card as="li" className="relative flex gap-3 transition-colors duration-150 hover:border-line-strong">
      <Avatar name={profile.name} src={profile.photoUrl} size="xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-display text-lg font-semibold break-words text-fg">
          <Link to={href} className="after:absolute after:inset-0 after:rounded-md hover:underline">
            {profile.name}
          </Link>
        </h2>
        {facts.length > 0 && <p className="text-sm text-fg tabular-nums">{facts.join(' · ')}</p>}
        {(profile.education || profile.occupation) && (
          <p className="text-sm text-fg-muted">{[profile.education, profile.occupation].filter(Boolean).join(' · ')}</p>
        )}
        <p className="flex items-center gap-1 text-sm text-fg-muted">
          <Icon icon={MapPin} size="sm" />
          <span className="truncate">{placeLabel(profile.place, profile.branch, language)}</span>
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {showStatus && <ProfileStatusBadge status={profile.status} />}
          {profile.gotra && <Badge tone="zari">{gotraName(profile.gotra, language)}</Badge>}
        </div>
      </div>
    </Card>
  );
}

export function ProfileCardSkeleton() {
  return (
    <li className="flex gap-3 rounded-md border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="size-16 rounded-full" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </li>
  );
}
