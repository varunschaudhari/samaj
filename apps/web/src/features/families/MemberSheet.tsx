import { CHILD_RELATIONS, type FamilyMember, birthYearProblems, formatPhone } from '@samaj/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, Badge, Icon, Modal, buttonVariants } from '@/components/ui';
import {
  type AppIcon,
  BadgeCheck,
  Briefcase,
  ChevronRight,
  EyeOff,
  GraduationCap,
  HeartHandshake,
  HourglassMedium,
  House,
  KeyRound,
  Pencil,
  Phone,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
  Network,
} from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { formatNumber, formatYear, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useDisplayName, useLifeLabel } from './life';

export interface MemberActions {
  onEdit?: () => void;
  onPrivacy?: () => void;
  onInvite?: () => void;
  onResetPassword?: () => void;
  onRemove?: () => void;
  onShowInTree?: () => void;
  /** Point at their parent in another, linked family. */
  onParentElsewhere?: () => void;
}

function Action({ icon, label, hint, onClick, danger = false }: { icon: AppIcon; label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-muted',
          danger ? 'text-danger' : 'text-fg',
        )}
      >
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', danger ? 'bg-danger-soft' : 'bg-primary-soft text-primary')}>
          <Icon icon={icon} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{label}</span>
          {hint && <span className="text-xs text-fg-muted">{hint}</span>}
        </span>
        <Icon icon={ChevronRight} className="text-fg-muted" />
      </button>
    </li>
  );
}

function Fact({ icon, children }: { icon: AppIcon; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-fg">
      <Icon icon={icon} size="sm" className="text-fg-muted" />
      {children}
    </li>
  );
}

/**
 * One person, opened from the family page: their details, a call button, and
 * everything the viewer may do for them, each with a name instead of an icon
 * to guess at.
 */
export function MemberSheet({
  member,
  members,
  isSelf,
  actions,
  onClose,
}: {
  member: FamilyMember | null;
  /** The rest of the family, to name whose child or partner they are. */
  members: FamilyMember[];
  isSelf: boolean;
  actions: MemberActions;
  onClose: () => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const displayName = useDisplayName();
  const life = useLifeLabel();
  if (!member) return <Modal open={false} onClose={onClose} title="" />;

  // Close the sheet, then open whatever the action opens.
  const run = (fn?: () => void) => () => {
    onClose();
    fn?.();
  };
  const removable = Boolean(actions.onRemove) && !member.isHead && !member.hasAccount;
  const parent = member.parentId ? members.find((m) => m.id === member.parentId) : undefined;
  const partner = member.partnerId ? members.find((m) => m.id === member.partnerId) : undefined;
  const unlikely = birthYearProblems(members).find((p) => p.memberId === member.id);
  const unlikelyParent = unlikely ? members.find((m) => m.id === unlikely.parentId) : undefined;

  return (
    <Modal open onClose={onClose} title={displayName(member)} description={[t(`relation.${member.relation}`), life(member)].filter(Boolean).join(' · ')}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar name={member.name} src={member.photoUrl} size="xl" className={cn(member.deceased && 'grayscale')} />
          <div className="flex flex-wrap gap-1.5">
            {member.isHead && <Badge tone="primary">{t('family.headBadge')}</Badge>}
            {member.deceased && <Badge>{t('member.deceasedBadge')}</Badge>}
            {member.adopted && <Badge>{t('member.adopted')}</Badge>}
            {member.formerPartner && <Badge>{t('member.formerBadge')}</Badge>}
            {member.hasAccount && (
              <Badge tone="success" icon={BadgeCheck}>
                {isSelf ? t('member.sheet.you') : t('family.signsIn')}
              </Badge>
            )}
            {member.approval === 'pending' && (
              <Badge tone="warning" icon={HourglassMedium}>
                {t('family.awaitingApproval')}
              </Badge>
            )}
            {member.privacy && !member.privacy.listed && <Badge icon={EyeOff}>{t('privacy.notListedBadge')}</Badge>}
          </div>
        </div>

        {unlikely && unlikelyParent && (
          <p role="note" className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">
            <Icon icon={TriangleAlert} size="sm" className="mt-0.5 shrink-0 text-warning" />
            {unlikely.kind === 'afterDeath'
              ? t('member.sheet.yearsAfterDeath', { name: unlikelyParent.name })
              : (unlikely.years ?? 0) <= 0
                ? t('member.sheet.yearsOlder', { name: unlikelyParent.name })
                : t('member.sheet.yearsClose', { name: unlikelyParent.name, years: formatNumber(unlikely.years ?? 0, language) })}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          <Fact icon={UserRound}>
            {t(`gender.${member.gender}`)}
            {member.birthYear ? ` · ${t('member.sheet.born', { year: formatYear(member.birthYear, language) })}` : ''}
            {member.deathYear ? ` · ${t('member.diedIn', { year: formatYear(member.deathYear, language) })}` : ''}
          </Fact>
          {member.occupation && <Fact icon={Briefcase}>{member.occupation}</Fact>}
          {member.education && <Fact icon={GraduationCap}>{member.education}</Fact>}
          {parent && <Fact icon={Users}>{t('member.sheet.childOf', { name: parent.name })}</Fact>}
          {member.maidenName && member.maidenName !== member.name && <Fact icon={UserRound}>{t('member.maidenNameShort', { name: member.maidenName })}</Fact>}
          {member.birthFamily && <Fact icon={House}>{t('member.sheet.bornInto', { name: member.birthFamily.headName })}</Fact>}
          {member.externalParent && (
            <Fact icon={Users}>
              <span>
                {t('member.sheet.childOf', { name: member.externalParent.name })} ·{' '}
                {member.externalParent.pending && <span className="text-fg-muted">({t('parentLinks.waiting')}) </span>}
                {member.externalParent.family.canView ? (
                  <Link to={`/families/${member.externalParent.family.id}`} onClick={onClose} className="font-semibold text-primary hover:underline">
                    {t('family.title', { name: member.externalParent.family.headName })}
                  </Link>
                ) : (
                  t('family.title', { name: member.externalParent.family.headName })
                )}
              </span>
            </Fact>
          )}
          {partner && (
            <Fact icon={HeartHandshake}>
              {t(
                member.formerPartner
                  ? member.gender === 'male'
                    ? 'member.sheet.formerHusbandOf'
                    : 'member.sheet.formerWifeOf'
                  : member.gender === 'male'
                    ? 'member.sheet.husbandOf'
                    : 'member.sheet.wifeOf',
                { name: partner.name },
              )}
            </Fact>
          )}
          {member.movedFrom && (
            <Fact icon={House}>
              <span>
                {t(member.gender === 'female' ? 'member.sheet.maher' : 'member.sheet.from')}{' '}
                {member.movedFrom.canView ? (
                  <Link to={`/families/${member.movedFrom.id}`} onClick={onClose} className="font-semibold text-primary hover:underline">
                    {t('family.title', { name: member.movedFrom.headName })}
                  </Link>
                ) : (
                  <span className="font-semibold">{t('family.title', { name: member.movedFrom.headName })}</span>
                )}
                , {placeLabel(member.movedFrom.place, member.movedFrom.branch, language)}
              </span>
            </Fact>
          )}
          {member.privacy && !member.deceased && (
            <Fact icon={ShieldCheck}>{t('member.sheet.phoneSeenBy', { who: t(`privacy.phone.${member.privacy.phoneVisibility}`) })}</Fact>
          )}
        </ul>

        {member.phone && (
          <a href={`tel:${member.phone}`} className={cn(buttonVariants({ variant: 'secondary' }), 'self-start tabular-nums')}>
            <Icon icon={Phone} />
            {t('member.sheet.call', { phone: formatPhone(member.phone) })}
          </a>
        )}

        {(actions.onEdit || actions.onShowInTree || actions.onPrivacy || member.canInvite || member.canResetPassword || removable) && (
          <ul className="-mx-3 flex flex-col">
            {actions.onEdit && <Action icon={Pencil} label={t('member.sheet.edit')} hint={t('member.sheet.editHint')} onClick={run(actions.onEdit)} />}
            {actions.onShowInTree && <Action icon={Network} label={t('member.sheet.showInTree')} hint={t('member.sheet.showInTreeHint')} onClick={run(actions.onShowInTree)} />}
            {actions.onParentElsewhere && !CHILD_RELATIONS.includes(member.relation) && (
              <Action icon={Users} label={t('member.sheet.parentElsewhere')} hint={t('member.sheet.parentElsewhereHint')} onClick={run(actions.onParentElsewhere)} />
            )}
            {actions.onPrivacy && member.canEditPrivacy && (
              <Action icon={ShieldCheck} label={t('member.sheet.privacy')} hint={t('member.sheet.privacyHint')} onClick={run(actions.onPrivacy)} />
            )}
            {member.canInvite && actions.onInvite && (
              <Action icon={Smartphone} label={t('member.sheet.invite')} hint={t('member.sheet.inviteHint')} onClick={run(actions.onInvite)} />
            )}
            {member.canResetPassword && actions.onResetPassword && (
              <Action icon={KeyRound} label={t('member.sheet.reset')} hint={t('member.sheet.resetHint')} onClick={run(actions.onResetPassword)} />
            )}
            {removable && <Action icon={Trash2} label={t('family.removeMember', { name: member.name })} onClick={run(actions.onRemove)} danger />}
          </ul>
        )}
      </div>
    </Modal>
  );
}
