import type { FamilyDetail, FamilyMember } from '@samaj/shared';
import { Link } from 'react-router';
import { Card, Icon } from '@/components/ui';
import { ChevronRight, HourglassMedium, Network, Users } from '@/components/ui/icons';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { useFamilyTree } from './tree-api';
import { unjoinedIn } from './unjoined';

const SHOWN = 6;

/**
 * For the family's editors: who the tree can't join upward yet (the head's
 * parents' home, a wife's माहेर, a grandchild's parent), each one tap from
 * the fix, and the parent links still waiting for the other family.
 */
export function NotJoinedCard({
  family,
  onParentElsewhere,
  onEditMember,
}: {
  family: FamilyDetail;
  onParentElsewhere: (m: FamilyMember) => void;
  onEditMember: (m: FamilyMember) => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const tree = useFamilyTree(family.id, family.permissions.canEdit);
  if (!family.permissions.canEdit || !tree.data) return null;

  const waiting = family.members.filter((m) => m.externalParent?.pending);
  const open = unjoinedIn(tree.data, family.id).flatMap((u) => {
    const member = family.members.find((m) => m.id === u.person.id);
    // Already asked: shown as waiting instead.
    return member && !member.externalParent?.pending ? [{ ...u, member }] : [];
  });
  if (open.length === 0 && waiting.length === 0) return null;

  return (
    <Card as="section" aria-labelledby="not-joined" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="not-joined" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
          <Icon icon={Network} weight="duotone" className="text-primary" />
          {t('unjoined.title')}
        </h2>
        <p className="text-sm text-fg-muted">{t('unjoined.body')}</p>
      </div>
      <ul className="-mx-2 flex flex-col">
        {open.slice(0, SHOWN).map((u) => (
          <li key={u.member.id}>
            <button
              type="button"
              onClick={() => (u.kind === 'whoseChild' ? onEditMember(u.member) : onParentElsewhere(u.member))}
              className="flex min-h-touch w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-muted"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon icon={Users} size="sm" />
              </span>
              <span className="flex-1 text-sm font-semibold text-fg">{t(`unjoined.${u.kind}`, { name: u.member.name })}</span>
              <Icon icon={ChevronRight} className="text-fg-muted" />
            </button>
          </li>
        ))}
        {waiting.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-2 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
              <Icon icon={HourglassMedium} size="sm" />
            </span>
            <span className="flex-1 text-sm text-fg">{t('unjoined.waiting', { name: m.name, family: m.externalParent?.family.headName ?? '' })}</span>
          </li>
        ))}
      </ul>
      {open.length > SHOWN && <p className="text-xs text-fg-muted">{t('unjoined.more', { count: formatNumber(open.length - SHOWN, language) })}</p>}
      <Link to={`/families/${family.id}/tree`} className="self-start text-sm font-semibold text-primary hover:underline">
        {t('tree.open')}
      </Link>
    </Card>
  );
}
