import type { FamilyStatus } from '@samaj/shared';
import { BadgeCheck, Clock, TriangleAlert } from '@/components/ui/icons';
import { Badge } from '@/components/ui';
import { useT } from '@/i18n';

const STYLE = {
  pending: { tone: 'warning', icon: Clock },
  verified: { tone: 'success', icon: BadgeCheck },
  rejected: { tone: 'danger', icon: TriangleAlert },
} as const;

export function FamilyStatusBadge({ status, className }: { status: FamilyStatus; className?: string }) {
  const t = useT();
  const { tone, icon } = STYLE[status];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {t(`status.${status}`)}
    </Badge>
  );
}
