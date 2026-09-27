import { type Member, formatPhone, gotraName } from '@samaj/shared';
import { Link } from 'react-router';
import { Avatar, Badge, Icon, Skeleton } from '@/components/ui';
import { ChevronRight, MapPin, Phone } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** The list itself: one rounded panel, rows divided by hairlines. */
export const MEMBER_LIST = 'overflow-hidden rounded-md border border-line bg-surface shadow-card';

/**
 * The directory's columns from lg up. Phones show each person as a compact
 * row; wide screens line the same rows up as a table, so people can be
 * compared at a glance.
 */
const COLUMNS =
  'lg:grid lg:grid-cols-[minmax(15rem,2.2fr)_minmax(11rem,1.6fr)_minmax(6.5rem,0.9fr)_minmax(8rem,1.2fr)_12.5rem_1.25rem] lg:items-center lg:gap-6';

/** Column headings for wide screens. Decorative: each row names its own content for screen readers. */
export function MemberListHeader() {
  const t = useT();
  return (
    <li aria-hidden="true" className={cn('hidden border-b border-line px-5 py-3 text-xs font-medium text-fg-muted', COLUMNS)}>
      <span>{t('directory.col.name')}</span>
      <span>{t('directory.col.place')}</span>
      <span>{t('directory.col.gotra')}</span>
      <span>{t('directory.col.occupation')}</span>
      <span className="text-right">{t('directory.col.phone')}</span>
      <span />
    </li>
  );
}

function CallButton({ member }: { member: Member }) {
  const t = useT();
  if (!member.phone) return null;
  return (
    <a
      href={`tel:${member.phone}`}
      aria-label={t('directory.call', { name: member.name })}
      className="group/call relative z-10 inline-flex min-h-touch shrink-0 items-center gap-2.5 rounded-full text-sm font-medium whitespace-nowrap text-fg tabular-nums lg:pr-1"
    >
      <span className="hidden lg:inline">{formatPhone(member.phone)}</span>
      <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary transition-colors duration-150 group-hover/call:bg-primary group-hover/call:text-on-primary">
        <Icon icon={Phone} size="sm" />
      </span>
    </a>
  );
}

/**
 * One person. The whole row opens the family; the call button sits above
 * that link.
 */
export function MemberCard({ member }: { member: Member }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const location = placeLabel(member.place, member.branch, language);
  const head = member.familyHead && member.familyHead !== member.name ? member.familyHead : null;
  const gotra = member.gotra ? gotraName(member.gotra, language) : null;
  const relation = t(`relation.${member.relation}`);

  return (
    <li className={cn('group relative flex items-center gap-3 border-b border-line px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-canvas lg:px-5', COLUMNS)}>
      {/* Name, with the relation under it. On phones the place and gotra join them. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.name} src={member.photoUrl} size="md" />
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-semibold text-fg">
            <Link
              to={`/families/${member.familyId}`}
              className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
            >
              {member.name}
            </Link>
          </h2>
          <p className="truncate text-sm text-fg-muted">
            {relation}
            <span className="lg:hidden"> · {location}</span>
          </p>
          {gotra && (
            <p className="mt-1 lg:hidden">
              <Badge tone="zari">{gotra}</Badge>
            </p>
          )}
        </div>
      </div>

      {/* Wide screens: the rest has its own columns. */}
      <div className="hidden min-w-0 flex-col lg:flex">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg">
          <Icon icon={MapPin} size="sm" className="shrink-0 text-fg-muted" />
          <span className="truncate">{location}</span>
        </span>
        {head && <span className="truncate pl-5.5 text-xs text-fg-muted">{t('directory.familyHead', { name: head })}</span>}
      </div>
      <div className="hidden lg:block">{gotra ? <Badge tone="zari">{gotra}</Badge> : <span className="text-sm text-fg-muted">–</span>}</div>
      <div className="hidden truncate text-sm text-fg lg:block">{member.occupation ?? <span className="text-fg-muted">–</span>}</div>

      <div className="flex shrink-0 justify-end">
        {member.phone ? <CallButton member={member} /> : <span className="hidden text-sm text-fg-muted lg:inline">{t('directory.phoneHidden')}</span>}
      </div>
      <Icon icon={ChevronRight} size="sm" className="hidden text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5 lg:block" />
    </li>
  );
}

/** Same geometry as MemberCard so nothing jumps when data arrives. */
export function MemberCardSkeleton() {
  return (
    <li className={cn('flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 lg:px-5', COLUMNS)} aria-hidden="true">
      <div className="flex flex-1 items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="hidden h-4 w-3/4 lg:block" />
      <Skeleton className="hidden h-5 w-16 lg:block" />
      <Skeleton className="hidden h-4 w-2/3 lg:block" />
      <Skeleton className="ml-auto size-9 rounded-full lg:h-9 lg:w-40" />
      <span className="hidden lg:block" />
    </li>
  );
}
