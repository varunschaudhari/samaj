import type { FamilyDetail } from '@samaj/shared';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { formatDate, useLanguageStore, useT } from '@/i18n';

/**
 * People who moved from this family to another, usually a daughter after her
 * marriage: still part of the family's story, with a way to their new home.
 */
export function MovedOutList({ family }: { family: FamilyDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  if (family.movedOut.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t('family.movedOut.title')}</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {family.movedOut.map((p) => {
          const home = t('family.title', { name: p.family.headName });
          return (
            <li key={p.memberId} className="flex min-w-0 items-center gap-3 rounded-md border border-dashed border-line bg-surface p-3">
              <Avatar name={p.name} size="md" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-fg">
                  {p.name}
                  {p.relation && <span className="font-normal text-fg-muted"> · {t(`relation.${p.relation}`)}</span>}
                </span>
                <span className="text-sm text-fg-muted">
                  {t('family.movedOut.to')}{' '}
                  {p.family.canView ? (
                    <Link to={`/families/${p.family.id}`} className="font-semibold text-primary hover:underline">
                      {home}
                    </Link>
                  ) : (
                    <span className="font-semibold text-fg">{home}</span>
                  )}
                  , {placeLabel(p.family.place, p.family.branch, language)}
                </span>
                <span className="text-xs text-fg-muted">{formatDate(p.at, language)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
