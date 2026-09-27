import { type ReactNode, useState } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Input } from './Input';
import { Modal } from './Modal';
import { Search, SlidersHorizontal, X } from './icons';

export interface ActiveFilter {
  key: string;
  /** What the chip says, e.g. "Branch: Amalner". */
  label: string;
  onRemove: () => void;
}

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}

interface ListToolbarProps {
  /** Lists the server can't search (the review queue) leave this out; their filters then sit inline. */
  search?: SearchProps;
  /** Filter fields (Select and the like). Inline from md up; in a sheet on phones. */
  filters?: ReactNode;
  /** Applied filters, shown as removable chips under the search. */
  active?: ActiveFilter[];
  onClearAll?: () => void;
  /** Shortcut chips, such as "My town". */
  quick?: ReactNode;
  /** The result count, left of the sort control. */
  summary?: ReactNode;
  /** A compact sort control. */
  sort?: ReactNode;
  className?: string;
}

/**
 * The same search and filter bar on every list, so people learn it once:
 * search with a clear button, filters (inline on wide screens, a bottom
 * sheet on phones), applied filters as chips you can remove one by one,
 * then the count and sort.
 */
export function ListToolbar({ search, filters, active = [], onClearAll, quick, summary, sort, className }: ListToolbarProps) {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = active.length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {!search && filters && <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-start">{filters}</div>}
      {search && (
        <div className="flex items-start gap-2">
          <Input
            label={search.label}
            hideLabel
            type="search"
            enterKeyHint="search"
            placeholder={search.placeholder}
            leadingIcon={Search}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            fieldClassName="min-w-0 flex-1"
            className="[&::-webkit-search-cancel-button]:hidden"
            trailing={search.value ? <IconButton icon={X} label={t('list.clearSearch')} onClick={() => search.onChange('')} /> : undefined}
          />
          {filters && (
            <>
              {/* Phones: one button that opens the filters, with how many are on. */}
              <Button
                variant="secondary"
                onClick={() => setSheetOpen(true)}
                className="relative shrink-0 md:hidden"
                aria-label={t('list.filtersCount', { count })}
              >
                <Icon icon={SlidersHorizontal} />
                <span aria-hidden="true">{t('list.filters')}</span>
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-5 text-on-primary tabular-nums"
                  >
                    {count}
                  </span>
                )}
              </Button>
              <div className="hidden shrink-0 items-start gap-2 md:flex">{filters}</div>
            </>
          )}
        </div>
      )}

      {quick}

      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('list.activeFilters')} role="group">
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={f.onRemove}
              aria-label={t('list.removeFilter', { filter: f.label })}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-full border border-primary/40 bg-primary-soft py-1 pr-2 pl-3 text-sm font-semibold text-primary transition-colors duration-150 hover:border-primary"
            >
              {f.label}
              <Icon icon={X} size="sm" />
            </button>
          ))}
          {onClearAll && count > 1 && (
            <button
              type="button"
              onClick={onClearAll}
              className="min-h-touch px-2 text-sm font-semibold text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              {t('list.clearAll')}
            </button>
          )}
        </div>
      )}

      {(summary || sort) && (
        <div className="flex min-h-touch flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
          <div className="text-sm text-fg-muted tabular-nums">{summary}</div>
          {sort}
        </div>
      )}

      {search && filters && (
        <Modal
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t('list.filters')}
          footer={
            <>
              {onClearAll && count > 0 && (
                <Button variant="ghost" onClick={onClearAll}>
                  {t('list.clearAll')}
                </Button>
              )}
              <Button onClick={() => setSheetOpen(false)}>{t('list.showResults')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">{filters}</div>
        </Modal>
      )}
    </div>
  );
}

/** A small labelled select for sorting, at the end of the summary row. */
export function SortSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-touch rounded-sm border border-line-strong bg-surface px-2 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-focus"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
