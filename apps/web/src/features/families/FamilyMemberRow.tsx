import { type FamilyMember, formatPhone } from '@samaj/shared';
import { GraduationCap, KeyRound, Pencil, Phone, Trash2 } from 'lucide-react';
import { Avatar, Badge, Icon, IconButton, Skeleton, buttonVariants } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

interface FamilyMemberRowProps {
  member: FamilyMember;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onResetPassword: () => void;
}

export function FamilyMemberRow({ member, canEdit, onEdit, onRemove, onResetPassword }: FamilyMemberRowProps) {
  const t = useT();
  const age = member.birthYear ? new Date().getFullYear() - member.birthYear : null;
  const removable = canEdit && !member.isHead && !member.hasAccount;
  const facts = [t(`relation.${member.relation}`), age !== null ? t('family.age', { age }) : null, member.occupation].filter(Boolean);

  return (
    <li className="flex items-start gap-3 py-3">
      <Avatar name={member.name} src={member.photoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-display text-lg font-semibold break-words text-fg">{member.name}</p>
          {member.isHead && <Badge tone="primary">{t('family.headBadge')}</Badge>}
        </div>
        <p className="text-sm text-fg-muted">{facts.join(' · ')}</p>
        {member.education && (
          <p className="flex items-center gap-1 text-sm text-fg-muted">
            <Icon icon={GraduationCap} size="sm" />
            {member.education}
          </p>
        )}
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            aria-label={t('directory.call', { name: member.name })}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-1 self-start tabular-nums')}
          >
            <Icon icon={Phone} />
            {formatPhone(member.phone)}
          </a>
        )}
      </div>
      {(canEdit || member.canResetPassword) && (
        <div className="flex shrink-0">
          {member.canResetPassword && <IconButton icon={KeyRound} label={t('reset.createFor', { name: member.name })} onClick={onResetPassword} />}
          {canEdit && <IconButton icon={Pencil} label={t('family.editMember', { name: member.name })} onClick={onEdit} />}
          {removable && <IconButton icon={Trash2} label={t('family.removeMember', { name: member.name })} onClick={onRemove} />}
        </div>
      )}
    </li>
  );
}

export function FamilyMemberRowSkeleton() {
  return (
    <li className="flex items-start gap-3 py-3" aria-hidden="true">
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </li>
  );
}
