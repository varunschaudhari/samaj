import { type GotraId, can, gotraName, isGotraId } from '@samaj/shared';
import { Globe, Info, MapPin, SearchX, Users, X } from '@/components/ui/icons';
import { type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { type ActiveFilter, Button, Chip, ChipRow, EmptyState, ErrorState, Icon, ListToolbar, LoadMore, Select, Skeleton } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { VerificationNotice } from '@/features/families/VerificationNotice';
import { branchName, useBranches } from '@/features/branches/api';
import { BranchSelect } from '@/features/branches/BranchSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatTotal, useLanguageStore, useT } from '@/i18n';
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
  summary: ReactNode;
}

function Filters({ filters, update, onClear, summary }: FiltersProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const branches = useBranches();
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebouncedValue(search.trim());

  // Only the debounced text should trigger this; `update` is recreated every render.
  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced });
  }, [debounced]);

  const branch = branches.data?.find((b) => b.id === filters.branchId);
  const active: ActiveFilter[] = [
    ...(branch ? [{ key: 'branch', label: `${t('directory.filterBranch')}: ${branchName(branch, language)}`, onRemove: () => update({ branchId: '' }) }] : []),
    ...(filters.gotra
      ? [{ key: 'gotra', label: `${t('directory.filterGotra')}: ${gotraName(filters.gotra as GotraId, language)}`, onRemove: () => update({ gotra: '' }) }]
      : []),
  ];

  return (
    <ListToolbar
      search={{ value: search, onChange: setSearch, label: t('directory.searchLabel'), placeholder: t('directory.searchPlaceholder') }}
      active={active}
      onClearAll={onClear}
      quick={<ScopeChips branchId={filters.branchId} onPick={(branchId) => update({ branchId })} />}
      summary={summary}
      filters={
        <>
          <BranchSelect
            label={t('directory.filterBranch')}
            allLabel={t('directory.allBranches')}
            value={filters.branchId}
            onChange={(branchId) => update({ branchId })}
          />
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
        </>
      }
    />
  );
}

function Directory() {
  const t = useT();
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
        <LoadMore {...members} label={t('directory.loadMore')} endLabel={t('directory.endOfList')} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={t('directory.title')} description={t('directory.subtitle')} />
      <Filters
        key={filtersKey}
        {...filterParams}
        onClear={clearFilters}
        summary={total === undefined ? <Skeleton className="h-4 w-24" /> : t('directory.count', { count: formatTotal(total, language) })}
      />
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
