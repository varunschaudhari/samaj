import { DIETS, type Diet, MARITAL_STATUSES, type MaritalStatus, SEARCH_SORTS, type SearchSort, gotraName } from '@samaj/shared';
import { Clock, HeartHandshake, Info, SearchX, X } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { type ActiveFilter, Button, Chip, ChipRow, EmptyState, ErrorState, Icon, ListToolbar, LoadMore, Select, Skeleton, buttonVariants } from '@/components/ui';
import { BranchSelect, useBranchLabel } from '@/features/branches/BranchSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatTotal, useLanguageStore, useT } from '@/i18n';
import { type SearchFilters, formatHeight, useMyMatrimony, useProfile, useProfileSearch } from './api';
import { ProfileCardSkeleton, ProfileCardView } from './ProfileCardView';

const AGES = Array.from({ length: 43 }, (_, i) => 18 + i);
const HEIGHTS = Array.from({ length: 13 }, (_, i) => 145 + i * 5);

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | '' => ((values as readonly string[]).includes(value ?? '') ? (value as T) : '');

/** Search on behalf of one of the family's live profiles; filters live in the URL. */
export function SearchPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const mine = useMyMatrimony();
  const [params, setParams] = useSearchParams();
  const live = (mine.data?.profiles ?? []).filter((p) => p.status === 'active');

  const forProfile = live.some((p) => p.id === params.get('for')) ? (params.get('for') ?? '') : (live[0]?.id ?? '');
  const own = live.find((p) => p.id === forProfile);
  const [education, setEducation] = useState(params.get('edu') ?? '');
  const debouncedEducation = useDebouncedValue(education.trim());

  const filters: SearchFilters = {
    forProfile,
    sort: oneOf<SearchSort>(SEARCH_SORTS, params.get('sort')) || 'match',
    ageMin: params.get('ageMin') ?? '',
    ageMax: params.get('ageMax') ?? '',
    heightMin: params.get('height') ?? '',
    maritalStatus: oneOf<MaritalStatus>(MARITAL_STATUSES, params.get('marital')),
    diet: oneOf<Diet>(DIETS, params.get('diet')),
    branchId: params.get('branch') ?? '',
    education: debouncedEducation,
  };
  // Whether this profile's family said what they're looking for; without it, best matches has nothing to rank by.
  const ownDetail = useProfile(forProfile || undefined);
  const prefs = ownDetail.data?.preferences;
  const hasPrefs = Boolean(
    prefs && (prefs.ageMin !== null || prefs.ageMax !== null || prefs.heightMinCm !== null || prefs.maritalStatuses.length || prefs.diets.length || prefs.branches.length),
  );
  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  useEffect(() => set('edu', debouncedEducation), [debouncedEducation]);

  const results = useProfileSearch(filters);
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const total = results.data?.pages[0]?.total;
  const filtered = Boolean(filters.ageMin || filters.ageMax || filters.heightMin || filters.maritalStatus || filters.diet || filters.branchId || filters.education);
  const clear = () => {
    setEducation('');
    const keep: Record<string, string> = {};
    if (forProfile) keep.for = forProfile;
    if (params.get('sort')) keep.sort = params.get('sort') ?? '';
    setParams(keep, { replace: true });
  };
  const branchLabel = useBranchLabel(filters.branchId);
  const ageLabel =
    filters.ageMin && filters.ageMax
      ? t('matrimony.search.ageRange', { min: filters.ageMin, max: filters.ageMax })
      : filters.ageMin
        ? t('matrimony.search.fromAge', { age: filters.ageMin })
        : filters.ageMax
          ? t('matrimony.search.toAge', { age: filters.ageMax })
          : null;
  const active: ActiveFilter[] = [
    ...(ageLabel
      ? [
          {
            key: 'age',
            label: `${t('matrimony.search.age')}: ${ageLabel}`,
            onRemove: () =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('ageMin');
                  next.delete('ageMax');
                  return next;
                },
                { replace: true },
              ),
          },
        ]
      : []),
    ...(filters.heightMin ? [{ key: 'height', label: `${t('matrimony.search.heightMin')}: ${formatHeight(Number(filters.heightMin))}`, onRemove: () => set('height', '') }] : []),
    ...(filters.maritalStatus ? [{ key: 'marital', label: t(`matrimony.marital.${filters.maritalStatus}`), onRemove: () => set('marital', '') }] : []),
    ...(filters.diet ? [{ key: 'diet', label: t(`matrimony.diet.${filters.diet}`), onRemove: () => set('diet', '') }] : []),
    ...(branchLabel ? [{ key: 'branch', label: `${t('directory.filterBranch')}: ${branchLabel}`, onRemove: () => set('branch', '') }] : []),
  ];

  if (mine.isPending) return <Skeleton className="h-40 w-full rounded-md" />;
  if (mine.isError) return <ErrorState title={t('matrimony.error.title')} error={mine.error} onRetry={() => mine.refetch()} />;

  if (!own) {
    const waiting = (mine.data.profiles ?? []).some((p) => p.status === 'pending');
    return (
      <EmptyState
        icon={waiting ? Clock : HeartHandshake}
        title={waiting ? t('matrimony.search.waitingTitle') : t('matrimony.search.noProfileTitle')}
        body={waiting ? t('matrimony.search.waitingBody') : t('matrimony.search.noProfileBody')}
        action={
          <Link to="/matrimony/profiles" className={buttonVariants({ variant: waiting ? 'secondary' : 'primary' })}>
            {t('matrimony.tab.profiles')}
          </Link>
        }
      />
    );
  }

  let body;
  if (results.isPending) {
    body = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2, 3].map((i) => (
          <ProfileCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (results.isError && items.length === 0) {
    body = <ErrorState title={t('matrimony.search.error')} error={results.error} onRetry={() => results.refetch()} retrying={results.isFetching} />;
  } else if (items.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchX}
        title={t('matrimony.search.noResultsTitle')}
        body={t('matrimony.search.noResultsBody')}
        action={
          <Button variant="secondary" leadingIcon={X} onClick={clear}>
            {t('directory.clearFilters')}
          </Button>
        }
      />
    ) : (
      <EmptyState icon={HeartHandshake} title={t('matrimony.search.emptyTitle')} body={t('matrimony.search.emptyBody')} />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy={results.isPlaceholderData || undefined}>
          {items.map((p) => (
            <ProfileCardView key={p.id} profile={p} href={`/matrimony/profiles/${p.id}?from=${forProfile}`} />
          ))}
        </ul>
        <LoadMore {...results} label={t('matrimony.search.more')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {live.length > 1 ? (
        <Select label={t('matrimony.search.for')} value={forProfile} onChange={(e) => set('for', e.target.value)}>
          {live.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      ) : (
        <p className="text-sm text-fg-muted">{t('matrimony.search.forOne', { name: own.name })}</p>
      )}
      {own.gotra && <p className="text-sm text-fg-muted">{t('matrimony.search.gotraRule', { gotra: gotraName(own.gotra, language) ?? '' })}</p>}

      <ChipRow label={t('matrimony.search.sort')}>
        {SEARCH_SORTS.map((sort) => (
          <Chip key={sort} selected={filters.sort === sort} onClick={() => set('sort', sort === 'match' ? '' : sort)}>
            {t(`matrimony.search.sort.${sort}`)}
          </Chip>
        ))}
      </ChipRow>
      {filters.sort === 'match' && ownDetail.isSuccess && !hasPrefs && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
          <Icon icon={Info} size="sm" />
          {t('matrimony.search.noPrefs')}
          <Link to={`/matrimony/profiles/${forProfile}`} className="font-semibold text-primary underline-offset-4 hover:underline">
            {t('matrimony.search.setPrefs')}
          </Link>
        </p>
      )}

      <ListToolbar
        search={{ value: education, onChange: setEducation, label: t('matrimony.search.education'), placeholder: t('matrimony.search.educationPlaceholder') }}
        active={active}
        onClearAll={clear}
        summary={total === undefined ? <Skeleton className="h-4 w-24" /> : t('matrimony.search.count', { count: formatTotal(total, language) })}
        filters={
          <>
            <Select
              label={t('matrimony.search.ageMin')}
              hideLabel
              value={filters.ageMin}
              onChange={(e) => set('ageMin', e.target.value)}
              fieldClassName="md:w-32"
            >
              <option value="">{t('matrimony.search.ageMin')}</option>
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {t('matrimony.search.fromAge', { age: a })}
                </option>
              ))}
            </Select>
            <Select
              label={t('matrimony.search.ageMax')}
              hideLabel
              value={filters.ageMax}
              onChange={(e) => set('ageMax', e.target.value)}
              fieldClassName="md:w-32"
            >
              <option value="">{t('matrimony.search.ageMax')}</option>
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {t('matrimony.search.toAge', { age: a })}
                </option>
              ))}
            </Select>
            <Select label={t('matrimony.search.heightMin')} hideLabel value={filters.heightMin} onChange={(e) => set('height', e.target.value)} fieldClassName="md:w-36">
              <option value="">{t('matrimony.height')}</option>
              {HEIGHTS.map((cm) => (
                <option key={cm} value={cm}>
                  {formatHeight(cm)}
                </option>
              ))}
            </Select>
            <Select label={t('matrimony.maritalStatus')} hideLabel value={filters.maritalStatus} onChange={(e) => set('marital', e.target.value)} fieldClassName="md:w-44">
              <option value="">{t('matrimony.maritalStatus')}</option>
              {MARITAL_STATUSES.map((m) => (
                <option key={m} value={m}>
                  {t(`matrimony.marital.${m}`)}
                </option>
              ))}
            </Select>
            <Select label={t('matrimony.diet')} hideLabel value={filters.diet} onChange={(e) => set('diet', e.target.value)} fieldClassName="md:w-36">
              <option value="">{t('matrimony.diet')}</option>
              {DIETS.map((d) => (
                <option key={d} value={d}>
                  {t(`matrimony.diet.${d}`)}
                </option>
              ))}
            </Select>
            <BranchSelect
              label={t('directory.filterBranch')}
              allLabel={t('directory.allBranches')}
              value={filters.branchId}
              onChange={(v) => set('branch', v)}
            />
          </>
        }
      />
      {body}
    </div>
  );
}
