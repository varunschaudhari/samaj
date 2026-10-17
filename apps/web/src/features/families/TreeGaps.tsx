import { useState } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import { ClipboardCheck } from '@/components/ui/icons';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import type { TreeEdit } from './AddFromTree';
import { useDisplayName } from './life';
import { GAP_ORDER, type Gap, type GapKind } from './tree-gaps';

/** Rows shown per kind before "Show all". */
const FIRST = 4;

/** The one form that fills each kind of gap. */
function fixFor(gap: Gap, context: string): TreeEdit {
  switch (gap.kind) {
    case 'headParents':
      return { mode: 'add', familyId: gap.householdId, relation: 'father', prefill: { gender: 'male' }, context };
    case 'maher':
      return { mode: 'maher', familyId: gap.householdId, memberId: gap.person.id };
    default:
      return { mode: 'edit', familyId: gap.householdId, memberId: gap.person.id };
  }
}

/**
 * "What's missing": in the families the viewer may edit, who has no birth
 * year, no photo, no parents in the tree, or whose child isn't said. Each with
 * a button to the form that fills it in.
 */
export function TreeGaps({ gaps, onEdit }: { gaps: Gap[]; onEdit: (edit: TreeEdit) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const displayName = useDisplayName();
  const [all, setAll] = useState<Set<GapKind>>(new Set());
  if (gaps.length === 0) return null;
  const kinds = GAP_ORDER.filter((k) => gaps.some((g) => g.kind === k));

  return (
    <details className="group rounded-md border border-line bg-surface shadow-card print:hidden">
      <summary className="flex min-h-touch cursor-pointer items-center gap-3 px-4 py-2">
        <Icon icon={ClipboardCheck} weight="duotone" className="text-primary" />
        <span className="flex-1 font-semibold text-fg">{t('tree.gaps.title')}</span>
        <Badge tone="warning">{formatNumber(gaps.length, language)}</Badge>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-3">
        <p className="text-sm text-fg-muted">{t('tree.gaps.hint')}</p>
        {kinds.map((kind) => {
          const these = gaps.filter((g) => g.kind === kind);
          const shown = all.has(kind) ? these : these.slice(0, FIRST);
          return (
            <section key={kind} aria-labelledby={`gap-${kind}`} className="flex flex-col gap-1">
              <h3 id={`gap-${kind}`} className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t(`tree.gaps.${kind}`)} · {formatNumber(these.length, language)}
              </h3>
              <ul className="divide-y divide-line">
                {shown.map((g) => {
                  const name = displayName(g.person);
                  return (
                    <li key={`${kind}-${g.person.id}`} className="flex items-center gap-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{name}</span>
                      <Button variant="secondary" size="sm" onClick={() => onEdit(fixFor(g, t('tree.add.aria.father', { name })))}>
                        {t(`tree.gaps.fix.${kind}`)}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {these.length > FIRST && !all.has(kind) && (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((s) => new Set([...s, kind]))}>
                  {t('tree.gaps.more', { count: formatNumber(these.length - FIRST, language) })}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}
