import { gotraName } from '@samaj/shared';
import { Clock, HeartHandshake, SearchX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, EmptyState, ErrorState, Input, Select, Skeleton, buttonVariants } from '@/components/ui';
import { branchName, groupBranches, useBranches } from '@/features/branches/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLanguageStore, useT } from '@/i18n';
import { type SearchFilters, useMyMatrimony, useProfileSearch } from './api';
import { ProfileCardSkeleton, ProfileCardView } from './ProfileCardView';

const AGES = Array.from({ length: 43 }, (_, i) => 18 + i);

/** Search on behalf of one of the family's live profiles; filters live in the URL. */
export function SearchPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const mine = useMyMatrimony();
  const branches = useBranches();
  const [params, setParams] = useSearchParams();
  const live = (mine.data?.profiles ?? []).filter((p) => p.status === 'active');

  const forProfile = live.some((p) => p.id === params.get('for')) ? (params.get('for') ?? '') : (live[0]?.id ?? '');
  const own = live.find((p) => p.id === forProfile);
  const [education, setEducation] = useState(params.get('edu') ?? '');
  const debouncedEducation = useDebouncedValue(education.trim());

  const filters: SearchFilters = {
    forProfile,
    ageMin: params.get('ageMin') ?? '',
    ageMax: params.get('ageMax') ?? '',
    branchId: params.get('branch') ?? '',
    education: debouncedEducation,
  };
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
  const filtered = Boolean(filters.ageMin || filters.ageMax || filters.branchId || filters.education);
  const clear = () => {
    setEducation('');
    setParams(forProfile ? { for: forProfile } : {}, { replace: true });
  };

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
      <ul className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label={t('common.loading')}>
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
        <ul className="grid gap-3 md:grid-cols-2" aria-busy={results.isPlaceholderData || undefined}>
          {items.map((p) => (
            <ProfileCardView key={p.id} profile={p} href={`/matrimony/profiles/${p.id}?from=${forProfile}`} />
          ))}
        </ul>
        {results.hasNextPage && (
          <Button variant="secondary" className="self-center" loading={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>
            {t('matrimony.search.more')}
          </Button>
        )}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select label={t('matrimony.search.ageMin')} value={filters.ageMin} onChange={(e) => set('ageMin', e.target.value)}>
          <option value="">{t('matrimony.search.any')}</option>
          {AGES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select label={t('matrimony.search.ageMax')} value={filters.ageMax} onChange={(e) => set('ageMax', e.target.value)}>
          <option value="">{t('matrimony.search.any')}</option>
          {AGES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select label={t('directory.filterBranch')} value={filters.branchId} onChange={(e) => set('branch', e.target.value)} fieldClassName="col-span-2 md:col-span-1">
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
        <Input
          label={t('member.education')}
          placeholder="B.E., M.Com…"
          value={education}
          onChange={(e) => setEducation(e.target.value)}
          fieldClassName="col-span-2 md:col-span-1"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted tabular-nums">{total === undefined ? '' : t('matrimony.search.count', { count: total })}</p>
        {filtered && (
          <Button variant="ghost" size="sm" leadingIcon={X} onClick={clear}>
            {t('directory.clearFilters')}
          </Button>
        )}
      </div>
      {body}
    </div>
  );
}
