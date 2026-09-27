import { type Member, formatPhone, gotraName } from '@samaj/shared';
import { Link } from 'react-router';
import { Avatar, Badge, Icon, Skeleton } from '@/components/ui';
import { Phone } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * The directory's columns from lg up. Phones show each person as a compact
 * row; wide screens line the same rows up as a table, so the whole width is
 * used and people can be compared at a glance.
 */
const COLUMNS = 'lg:grid lg:grid-cols-[3rem_minmax(13rem,2fr)_minmax(11rem,1.6fr)_minmax(7rem,1fr)_minmax(8rem,1.2fr)_11rem] lg:gap-4';

/** Column headings for wide screens. Decorative: each row names its own content for screen readers. */
export function MemberListHeader() {
  const t = useT();
  return (
    <li aria-hidden="true" className={cn('hidden items-center border-b border-line bg-surface-muted px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase', COLUMNS)}>
      <span />
      <span>{t('directory.col.name')}</span>
      <span>{t('directory.col.place')}</span>
      <span>{t('directory.col.gotra')}</span>
      <span>{t('directory.col.occupation')}</span>
      <span className="text-right">{t('directory.col.phone')}</span>
    </li>
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

  return (
    <li className={cn('relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted lg:py-2.5', COLUMNS, 'lg:items-center')}>
      <Avatar name={member.name} src={member.photoUrl} size="lg" className="lg:size-10" />

      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-semibold break-words text-fg">
          <Link to={`/families/${member.familyId}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus">
            {member.name}
          </Link>
        </h2>
        {/* Phones: place and details under the name. */}
        <p className="truncate text-sm text-fg-muted lg:hidden">
          {location}
          {head && ` · ${t('directory.familyHead', { name: head })}`}
        </p>
        {(gotra || member.occupation || member.relation !== 'head') && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 lg:hidden">
            {member.relation !== 'head' && <Badge tone="primary">{t(`relation.${member.relation}`)}</Badge>}
            {gotra && <Badge tone="zari">{gotra}</Badge>}
            {member.occupation && <span className="truncate text-xs text-fg-muted">{member.occupation}</span>}
          </p>
        )}
        {/* Wide screens: the relation stays with the name; the rest has its own columns. */}
        {member.relation !== 'head' && <span className="hidden text-xs text-fg-muted lg:block">{t(`relation.${member.relation}`)}</span>}
      </div>

      <div className="hidden min-w-0 flex-col text-sm lg:flex">
        <span className="truncate text-fg">{location}</span>
        {head && <span className="truncate text-xs text-fg-muted">{t('directory.familyHead', { name: head })}</span>}
      </div>
      <div className="hidden text-sm lg:block">{gotra ? <Badge tone="zari">{gotra}</Badge> : <span className="text-fg-muted">–</span>}</div>
      <div className="hidden truncate text-sm text-fg lg:block">{member.occupation ?? <span className="text-fg-muted">–</span>}</div>

      <div className="relative z-10 flex shrink-0 justify-end">
        {member.phone ? (
          <a
            href={`tel:${member.phone}`}
            aria-label={t('directory.call', { name: member.name })}
            title={formatPhone(member.phone)}
            className="flex size-touch items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-primary transition-colors duration-150 hover:bg-primary-soft lg:h-10 lg:w-auto lg:px-3"
          >
            <Icon icon={Phone} />
            <span className="hidden text-sm font-semibold tabular-nums lg:inline">{formatPhone(member.phone)}</span>
          </a>
        ) : (
          <span className="hidden text-sm text-fg-muted lg:inline">{t('directory.phoneHidden')}</span>
        )}
      </div>
    </li>
  );
}

/** Same geometry as MemberCard so nothing jumps when data arrives. */
export function MemberCardSkeleton() {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 lg:py-2.5', COLUMNS)} aria-hidden="true">
      <Skeleton className="size-12 rounded-full lg:size-10" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-2/3 lg:hidden" />
      </div>
      <Skeleton className="hidden h-4 w-3/4 lg:block" />
      <Skeleton className="hidden h-5 w-16 lg:block" />
      <Skeleton className="hidden h-4 w-2/3 lg:block" />
      <Skeleton className="hidden h-9 w-full rounded-full lg:block" />
    </li>
  );
}
