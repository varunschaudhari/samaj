import { type KeyboardEvent, useId, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Input } from '@/components/ui';
import { Search } from '@/components/ui/icons';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { useDisplayName } from './life';
import type { ChartPerson } from './tree-layout';

const SHOWN = 8;

/**
 * Find someone in the tree by name. Everyone who matches is marked in the
 * chart as you type; picking one centres the chart on them.
 */
export function TreeSearch({
  query,
  onQuery,
  matches,
  onPick,
}: {
  query: string;
  onQuery: (q: string) => void;
  matches: ChartPerson[];
  onPick: (p: ChartPerson) => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const displayName = useDisplayName();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = matches.slice(0, SHOWN);

  const pick = (p: ChartPerson | undefined) => {
    if (!p) return;
    onPick(p);
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        label={t('tree.search')}
        hideLabel
        placeholder={t('tree.search')}
        leadingIcon={Search}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && query.trim() !== ''}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].id}` : undefined}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && query.trim() !== '' && (
        <div id={listId} role="listbox" aria-label={t('tree.search')} className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-overlay">
          {shown.length === 0 ? (
            <div className="flex flex-col gap-1 px-3 py-2 text-sm">
              <p className="text-fg-muted">{t('tree.noMatch')}</p>
              <Link to={`/directory?q=${encodeURIComponent(query.trim())}`} onMouseDown={(e) => e.preventDefault()} className="font-semibold text-primary hover:underline">
                {t('tree.searchDirectory')}
              </Link>
            </div>
          ) : (
            shown.map((p, i) => (
              <button
                key={p.id}
                id={`${listId}-${p.id}`}
                type="button"
                role="option"
                aria-selected={i === active}
                // Before the input's blur closes the list.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={`flex min-h-touch w-full items-center gap-3 px-3 py-1.5 text-left ${i === active ? 'bg-surface-muted' : 'hover:bg-surface-muted'}`}
              >
                <Avatar name={p.name} src={p.photoUrl} size="sm" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold text-fg">{displayName(p)}</span>
                  <span className="truncate text-xs text-fg-muted">
                    {t(`relation.${p.relation}`)} · {t('family.title', { name: p.household.headName })}
                    {p.maidenName && ` · ${t('member.maidenNameShort', { name: p.maidenName })}`}
                  </span>
                </span>
              </button>
            ))
          )}
          {matches.length > SHOWN && <p className="px-3 py-2 text-xs text-fg-muted">{t('tree.moreMatches', { count: formatNumber(matches.length - SHOWN, language) })}</p>}
        </div>
      )}
    </div>
  );
}
