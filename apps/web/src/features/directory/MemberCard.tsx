import { type Member, formatPhone, gotraName } from '@samaj/shared';
import { Phone } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Badge, Icon, Skeleton } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';

/**
 * One person in the directory: a compact row, so a phone screen shows seven
 * or eight people at once. The whole row opens the family; the call button
 * sits above that link.
 */
export function MemberCard({ member }: { member: Member }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const location = placeLabel(member.place, member.branch, language);
  const head = member.familyHead && member.familyHead !== member.name ? member.familyHead : null;

  return (
    <li className="relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted">
      <Avatar name={member.name} src={member.photoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-semibold break-words text-fg">
          <Link to={`/families/${member.familyId}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus">
            {member.name}
          </Link>
        </h2>
        <p className="truncate text-sm text-fg-muted">
          {location}
          {head && ` · ${t('directory.familyHead', { name: head })}`}
        </p>
        {(member.gotra || member.occupation || member.relation !== 'head') && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            {member.relation !== 'head' && <Badge tone="primary">{t(`relation.${member.relation}`)}</Badge>}
            {member.gotra && <Badge tone="zari">{gotraName(member.gotra, language)}</Badge>}
            {member.occupation && <span className="truncate text-xs text-fg-muted">{member.occupation}</span>}
          </p>
        )}
      </div>
      {member.phone && (
        <a
          href={`tel:${member.phone}`}
          aria-label={t('directory.call', { name: member.name })}
          title={formatPhone(member.phone)}
          className="relative z-10 flex size-touch shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-primary transition-colors duration-150 hover:bg-primary-soft"
        >
          <Icon icon={Phone} />
        </a>
      )}
    </li>
  );
}

/** Same geometry as MemberCard so nothing jumps when data arrives. */
export function MemberCardSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-5 w-24" />
      </div>
    </li>
  );
}
