import type { FamilyMember } from '@samaj/shared';
import { Avatar, Badge, Icon, Skeleton } from '@/components/ui';
import { ChevronRight, EyeOff, HourglassMedium } from '@/components/ui/icons';
import { formatNumber, useLanguageStore, useT } from '@/i18n';

/**
 * One person on the family page. The whole tile opens their card, where the
 * details and actions are, so nothing here competes with the name.
 */
export function FamilyMemberRow({ member, isSelf, onOpen }: { member: FamilyMember; isSelf: boolean; onOpen: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const age = member.birthYear ? new Date().getFullYear() - member.birthYear : null;
  const facts = [t(`relation.${member.relation}`), age !== null ? t('family.age', { age: formatNumber(age, language) }) : null, member.occupation].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full items-center gap-3 rounded-md border border-line bg-surface p-3 text-left shadow-card transition-colors duration-150 hover:border-line-strong"
      >
        <Avatar name={member.name} src={member.photoUrl} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words text-fg">{member.name}</span>
            {member.isHead && <Badge tone="primary">{t('family.headBadge')}</Badge>}
            {isSelf && <Badge tone="success">{t('member.sheet.you')}</Badge>}
          </span>
          <span className="text-sm text-fg-muted">{facts.join(' · ')}</span>
          {(member.approval === 'pending' || (member.privacy && !member.privacy.listed)) && (
            <span className="mt-0.5 flex flex-wrap gap-1.5">
              {member.approval === 'pending' && (
                <Badge tone="warning" icon={HourglassMedium}>
                  {t('family.awaitingApproval')}
                </Badge>
              )}
              {member.privacy && !member.privacy.listed && <Badge icon={EyeOff}>{t('privacy.notListedBadge')}</Badge>}
            </span>
          )}
        </span>
        <Icon icon={ChevronRight} className="shrink-0 text-fg-muted" />
      </button>
    </li>
  );
}

export function FamilyMemberRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-surface p-3" aria-hidden="true">
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </li>
  );
}
