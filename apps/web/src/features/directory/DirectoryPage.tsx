import { can, isGotraId } from '@samaj/shared';
import { Globe, Info, MapPin, RotateCw, Search, SearchX, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Chip, ChipRow, EmptyState, ErrorState, Icon, Input, Select, Skeleton } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { VerificationNotice } from '@/features/families/VerificationNotice';
import { branchName, groupBranches, useBranches } from '@/features/branches/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatTotal, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { gotraOptions } from '@/features/families/gotra-options';
import { type DirectoryFilters, useMembers } from './api';
import { MemberCard, MemberCardSkeleton } from './MemberCard';

const SKELETON_COUNT = 8;
const LIST = 'divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card';

/** Filters live in the URL, so back, reload and shared links keep them. */
function useFilterParams() {
  const [params, setParams] = useSearchParams();
  const filters: DirectoryFilters = {
    q: params.get('q') ?? '',
    branchId: params.get('branch') ?? '',
    // An old link may carry a gotra that is no longer on the list; ignore it rather than fail.
    gotra: isGotraId(params.get('gotra') ?? '') ? (params.get('gotra') ?? '') : '',
  };
  const update = (patch: Partial<DirectoryFilters>) => {
    const next = { ...filters, ...patch };
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        for (const [key, value] of [['q', next.q], ['branch', next.branchId], ['gotra', next.gotra]] as const) {
          if (value) out.set(key, value);
          else out.delete(key);
        }
        return out;
      },
      { replace: true },
    );
  };
  return { filters, update };
}

/**
 * Shortcuts to the people most likely to be looked for: your own town and
 * district. With lakhs of members, "everyone" is rarely the useful list.
 */
function ScopeChips({ branchId, onPick }: { branchId: string; onPick: (branchId: string) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const branches = useBranches();
  const home = branches.data?.find((b) => b.id === me.data?.branchId);
  const district = home?.parentId ? branches.data?.find((b) => b.id === home.parentId) : undefined;
  if (!home) return null;
  const scopes = [
    { id: '', label: t('directory.scope.all') },
    { id: home.id, label: branchName(home, language) },
    ...(district ? [{ id: district.id, label: branchName(district, language) }] : []),
  ];
  return (
    <ChipRow label={t('directory.scope.label')}>
      {scopes.map((s) => (
        <Chip key={s.id || 'all'} selected={branchId === s.id} onClick={() => onPick(s.id)} icon={s.id ? MapPin : Globe}>
          {s.label}
        </Chip>
      ))}
    </ChipRow>
  );
}

interface FiltersProps extends ReturnType<typeof useFilterParams> {
  onClear: () => void;
}

function Filters({ filters, update, onClear }: FiltersProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const branches = useBranches();
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebouncedValue(search.trim());

  // Only the debounced text should trigger this; `update` is recreated every render.
  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced });
  }, [debounced]);

  const hasFilters = Boolean(filters.q || filters.branchId || filters.gotra);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <Input
        label={t('directory.searchLabel')}
        hideLabel
        type="search"
        enterKeyHint="search"
        placeholder={t('directory.searchPlaceholder')}
        leadingIcon={Search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fieldClassName="md:flex-1"
      />
      <div className="grid grid-cols-2 gap-3 md:flex md:w-auto">
        {branches.isPending ? (
          <Skeleton className="h-touch rounded-sm md:w-48" />
        ) : (
          <Select
            label={t('directory.filterBranch')}
            hideLabel
            value={filters.branchId}
            onChange={(e) => update({ branchId: e.target.value })}
            disabled={branches.isError}
            fieldClassName="md:w-48"
          >
            <option value="">{t('directory.allBranches')}</option>
            {groupBranches(branches.data ?? [], language).map(({ district, children }) => (
              <optgroup key={district.id} label={branchName(district, language)}>
                <option value={district.id}>
                  {branchName(district, language)} ({t('branchKind.district')})
                </option>
                {children.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchName(b, language)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
        <Select
          label={t('directory.filterGotra')}
          hideLabel
          value={filters.gotra}
          onChange={(e) => update({ gotra: e.target.value })}
          fieldClassName="md:w-40"
        >
          <option value="">{t('directory.allGotras')}</option>
          {gotraOptions(language).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </div>
      {hasFilters && (
        <Button variant="ghost" leadingIcon={X} onClick={onClear} className="self-start md:self-auto">
          {t('directory.clearFilters')}
        </Button>
      )}
    </div>
  );
}

function Directory() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const filterParams = useFilterParams();
  const { filters, update } = filterParams;
  const members = useMembers(filters);

  const hasFilters = Boolean(filters.q || filters.branchId || filters.gotra);
  const items = members.data?.pages.flatMap((p) => p.items) ?? [];
  const total = members.data?.pages[0]?.total;
  const language = useLanguageStore((s) => s.language);
  const canSeeContacts = me.data ? can(me.data.role, 'member:read-contact') : false;
  // Remounting Filters on clear also resets its local search text.
  const [filtersKey, setFiltersKey] = useState(0);
  const clearFilters = () => {
    update({ q: '', branchId: '', gotra: '' });
    setFiltersKey((k) => k + 1);
  };

  let body;
  if (members.isPending) {
    // 1. Loading: skeletons in the same grid the cards will fill.
    body = (
      <ul className={LIST} aria-busy="true" aria-label={t('common.loading')}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <MemberCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (members.isError && items.length === 0) {
    // 2. Error with retry.
    body = (
      <ErrorState title={t('directory.error.title')} error={members.error} onRetry={() => members.refetch()} retrying={members.isFetching} />
    );
  } else if (items.length === 0) {
    // 3. Empty: different advice for "nothing matches" and "nothing yet".
    body = hasFilters ? (
      <EmptyState
        icon={SearchX}
        title={t('directory.noResults.title')}
        body={t('directory.noResults.body')}
        action={
          <Button variant="secondary" leadingIcon={X} onClick={clearFilters}>
            {t('directory.clearFilters')}
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Users} title={t('directory.empty.title')} body={t('directory.empty.body')} />
    );
  } else {
    // 4. Loaded.
    body = (
      <div className="flex flex-col gap-4">
        <ul className={LIST} aria-busy={members.isPlaceholderData || undefined}>
          {items.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
          {members.isFetchingNextPage && Array.from({ length: 2 }, (_, i) => <MemberCardSkeleton key={`next-${i}`} />)}
        </ul>
        {members.isFetchNextPageError && (
          <div role="alert" className="flex flex-wrap items-center justify-center gap-3 text-sm text-danger">
            {errorMessage(members.error)}
            <Button variant="secondary" size="sm" leadingIcon={RotateCw} onClick={() => members.fetchNextPage()}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {members.hasNextPage ? (
          <Button variant="secondary" className="self-center" onClick={() => members.fetchNextPage()} loading={members.isFetchingNextPage}>
            {t('directory.loadMore')}
          </Button>
        ) : (
          <p className="text-center text-sm text-fg-muted">{t('directory.endOfList')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={t('directory.title')}
        description={total === undefined ? <Skeleton className="h-4 w-24" /> : <span className="tabular-nums">{t('directory.count', { count: formatTotal(total, language) })}</span>}
      />
      <Filters key={filtersKey} {...filterParams} onClear={clearFilters} />
      <ScopeChips branchId={filters.branchId} onPick={(branchId) => update({ branchId })} />
      {!canSeeContacts && me.data && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Icon icon={Info} size="sm" />
          {t('directory.contactHidden')}
        </p>
      )}
      {body}
    </div>
  );
}

/** Members of unverified families see where they stand instead of the directory. */
export function DirectoryPage() {
  const me = useMe();
  const user = me.data;
  if (user && user.role === 'member' && user.familyStatus !== 'verified') {
    return (
      <div className="mx-auto max-w-lg pt-4">
        <VerificationNotice user={user} />
      </div>
    );
  }
  return <Directory />;
}
