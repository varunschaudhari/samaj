import { type Member, formatPhone } from '@samaj/shared';
import { BadgeCheck, MapPin, Phone } from 'lucide-react';
import { Avatar, Badge, Card, Icon, Skeleton, SkeletonText, buttonVariants } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

export function MemberCard({ member }: { member: Member }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const branch = branchName(member.branch, language);
  // When the family lives in the branch town itself, show just the (translated) branch name.
  const location = member.place === member.branch.name || !branch ? branch || member.place : `${member.place} · ${branch}`;

  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={member.name} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold break-words text-fg">{member.name}</h2>
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
        {member.verified ? (
          <Badge tone="success" icon={BadgeCheck}>
            {t('directory.verified')}
          </Badge>
        ) : (
          <Badge tone="warning">{t('directory.unverified')}</Badge>
        )}
        {member.gotra && <Badge tone="zari">{member.gotra}</Badge>}
        {member.occupation && <Badge>{member.occupation}</Badge>}
      </div>

      {member.phone && (
        <a
          href={`tel:${member.phone}`}
          aria-label={t('directory.call', { name: member.name })}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start tabular-nums')}
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
