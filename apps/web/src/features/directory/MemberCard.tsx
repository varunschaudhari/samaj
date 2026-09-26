import { type Member, formatPhone, gotraName } from '@samaj/shared';
import { MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Badge, Card, Icon, Skeleton, SkeletonText, buttonVariants } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

export function MemberCard({ member }: { member: Member }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const location = placeLabel(member.place, member.branch, language);

  return (
    <Card as="li" className="relative flex flex-col gap-3 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-start gap-3">
        <Avatar name={member.name} src={member.photoUrl} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold break-words text-fg">
            {/* The stretched link makes the whole card open the family; the phone button sits above it. */}
            <Link to={`/families/${member.familyId}`} className="after:absolute after:inset-0 after:rounded-md hover:underline">
              {member.name}
            </Link>
          </h2>
          <p className="flex items-center gap-1 text-sm text-fg-muted">
            <Icon icon={MapPin} size="sm" />
            <span className="truncate">{location}</span>
          </p>
          {member.familyHead && member.familyHead !== member.name && (
            <p className="text-sm text-fg-muted">{t('directory.familyHead', { name: member.familyHead })}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {member.relation !== 'head' && <Badge tone="primary">{t(`relation.${member.relation}`)}</Badge>}
        {member.gotra && <Badge tone="zari">{gotraName(member.gotra, language)}</Badge>}
        {member.occupation && <Badge>{member.occupation}</Badge>}
      </div>

      {member.phone && (
        <a
          href={`tel:${member.phone}`}
          aria-label={t('directory.call', { name: member.name })}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'relative z-10 self-start tabular-nums')}
        >
          <Icon icon={Phone} />
          {formatPhone(member.phone)}
        </a>
      )}
    </Card>
  );
}

/** Same geometry as MemberCard so nothing jumps when data arrives. */
export function MemberCardSkeleton() {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4" aria-hidden="true">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-5 w-2/3" />
          <SkeletonText lines={2} />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
    </li>
  );
}
