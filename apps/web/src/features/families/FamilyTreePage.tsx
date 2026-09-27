import type { FamilyTree, TreeHousehold } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Card, Chip, EmptyState, ErrorState, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { ArrowLeft, Network, Rows, SearchX } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { type MessageKey, isMessageKey, useLanguageStore, useT } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDisplayName } from './life';
import { TreeChart, useGenerationLabel, usePersonLine } from './TreeChart';
import { TreePersonModal } from './TreePersonModal';
import { TreeSearch } from './TreeSearch';
import { type ChartPerson, findPeople } from './tree-layout';

function useFamilyTree(familyId: string) {
  return useQuery({
    queryKey: ['family', familyId, 'tree'],
    queryFn: async ({ signal }) => (await api.get<{ tree: FamilyTree }>(`/families/${familyId}/tree`, undefined, signal)).tree,
    enabled: Boolean(familyId),
  });
}

/** What a household is to the family the tree is drawn for. */
function useHouseholdLabel() {
  const t = useT();
  return (h: TreeHousehold) => {
    if (h.via === null) return t('tree.thisFamily');
    if (h.generation === 0) return t('links.kind.siblings');
    const key = `tree.household.${h.generation}`;
    return isMessageKey(key) ? t(key as MessageKey) : t('links.kind.relatives');
  };
}

type View = 'chart' | 'list';
const VIEW_KEY = 'samaj.treeView';
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'chart';
  } catch {
    return 'chart';
  }
};

function PersonChip({ person, focused, matched, onOpen }: { person: ChartPerson; focused: boolean; matched: boolean; onOpen: (p: ChartPerson) => void }) {
  const displayName = useDisplayName();
  const line = usePersonLine();
  return (
    <li className="min-w-0">
      <button
        type="button"
        data-person={person.id}
        onClick={() => onOpen(person)}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-left transition-colors duration-150 hover:border-line-strong',
          person.deceased ? 'bg-surface-muted' : 'bg-surface',
          person.movedTo ? 'border-dashed border-line-strong' : 'border-line',
          matched && 'ring-2 ring-zari',
          focused && 'ring-4 ring-focus',
        )}
      >
        <Avatar name={person.name} src={person.photoUrl} size="sm" className={cn(person.deceased && 'grayscale')} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className={cn('truncate text-sm text-fg', person.isHead && 'font-semibold')}>{displayName(person)}</span>
          <span className="truncate text-xs text-fg-muted">{line(person)}</span>
        </span>
      </button>
    </li>
  );
}

/** One household's people in one generation. */
function HouseholdGroup({ household, people, children }: { household: TreeHousehold; people: ChartPerson[]; children: (p: ChartPerson) => ReactNode }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const label = useHouseholdLabel();
  const root = household.via === null;
  return (
    <div className={cn('flex w-72 max-w-full shrink-0 flex-col gap-2 rounded-md border bg-surface p-3 shadow-card md:w-auto md:min-w-64', root ? 'border-primary' : 'border-line')}>
      <div className="flex flex-col gap-0.5">
        <Badge tone={root ? 'primary' : 'neutral'} className="self-start">
          {label(household)}
        </Badge>
        <Link to={`/families/${household.family.id}`} className="font-semibold break-words text-fg hover:underline">
          {t('family.title', { name: household.family.headName })}
        </Link>
        <span className="text-xs text-fg-muted">{placeLabel(household.family.place, household.family.branch, language)}</span>
      </div>
      <ul className="flex flex-wrap gap-1.5">{people.map(children)}</ul>
    </div>
  );
}

/** Generations top to bottom; in each, the households that have people in it. */
function TreeList({ tree, people, focusId, matches, onOpen }: { tree: FamilyTree; people: ChartPerson[]; focusId: string | null; matches: Set<string>; onOpen: (p: ChartPerson) => void }) {
  const generationLabel = useGenerationLabel();
  const t = useT();
  const generations = [...new Set(people.map((p) => p.generation))].sort((a, b) => a - b);
  // The root family first in each generation, then by generation of the household.
  const ordered = [...tree.households].sort((a, b) => Number(b.via === null) - Number(a.via === null) || a.generation - b.generation);

  useEffect(() => {
    if (focusId) document.querySelector(`[data-person="${focusId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId]);

  return (
    <ol className="flex flex-col" aria-label={t('tree.title')}>
      {generations.map((g, i) => (
        <li key={g} className="flex flex-col items-center">
          {i > 0 && <span className="h-6 w-px bg-line-strong" aria-hidden="true" />}
          <h2 className={cn('rounded-full px-4 py-1 text-sm font-semibold', g === 0 ? 'bg-primary text-on-primary' : 'bg-surface-muted text-fg')}>{generationLabel(g)}</h2>
          <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
          <div className="-mx-4 flex w-[calc(100%+2rem)] gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:w-full md:flex-wrap md:justify-center md:overflow-visible md:px-0">
            {ordered.map((h) => {
              const here = people.filter((p) => p.household.id === h.family.id && p.generation === g);
              return here.length > 0 ? (
                <HouseholdGroup key={h.family.id} household={h} people={here}>
                  {(p) => <PersonChip key={p.id} person={p} focused={p.id === focusId} matched={matches.has(p.id)} onOpen={onOpen} />}
                </HouseholdGroup>
              ) : null;
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TreeSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex w-full flex-col items-center gap-3">
          <Skeleton className="h-7 w-32 rounded-full" />
          <Skeleton className="h-28 w-full max-w-md rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function FamilyTreePage() {
  const { familyId = '' } = useParams();
  const t = useT();
  const householdLabel = useHouseholdLabel();
  const tree = useFamilyTree(familyId);
  const [params, setParams] = useSearchParams();
  const focusId = params.get('focus');
  const [view, setView] = useState<View>(savedView);
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<ChartPerson | null>(null);

  const people = useMemo<ChartPerson[]>(
    () => tree.data?.households.flatMap((h) => h.members.map((m) => ({ ...m, household: h.family, rootHousehold: h.via === null, x: 0, y: 0 }))) ?? [],
    [tree.data],
  );
  const found = useMemo(() => findPeople(people, query), [people, query]);
  const matches = useMemo(() => new Set(found.map((p) => p.id)), [found]);

  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Remembering the choice is only a convenience.
    }
  };
  const focus = (p: ChartPerson) => {
    setOpened(null);
    setParams({ focus: p.id }, { replace: true });
  };

  const back = (
    <Link to={`/families/${familyId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      <Icon icon={ArrowLeft} />
      {t('tree.back')}
    </Link>
  );

  let body;
  if (tree.isPending) {
    body = <TreeSkeleton />;
  } else if (tree.isError) {
    body =
      tree.error instanceof ApiError && tree.error.status === 404 ? (
        <EmptyState icon={SearchX} title={t('family.notFound.title')} body={t('family.notFound.body')} />
      ) : (
        <ErrorState title={t('tree.error')} error={tree.error} onRetry={() => tree.refetch()} retrying={tree.isFetching} />
      );
  } else {
    const { households, side, truncated } = tree.data;
    const alone = households.length === 1 && side.length === 0;
    body = (
      <div className="flex flex-col gap-5">
        {alone && (
          <Card variant="muted" className="flex items-start gap-3">
            <Icon icon={Network} weight="duotone" className="mt-0.5 text-primary" />
            <p className="text-sm text-fg">{t('tree.grow')}</p>
          </Card>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TreeSearch query={query} onQuery={setQuery} matches={found} onPick={focus} />
          <div className="flex gap-2" role="group" aria-label={t('tree.viewLabel')}>
            <Chip selected={view === 'chart'} icon={Network} onClick={() => choose('chart')}>
              {t('tree.view.chart')}
            </Chip>
            <Chip selected={view === 'list'} icon={Rows} onClick={() => choose('list')}>
              {t('tree.view.list')}
            </Chip>
          </div>
        </div>
        {view === 'chart' ? (
          <TreeChart tree={tree.data} focusId={focusId} matches={matches} onOpen={setOpened} />
        ) : (
          <TreeList tree={tree.data} people={people} focusId={focusId} matches={matches} onOpen={setOpened} />
        )}
        {truncated && <p className="text-center text-sm text-fg-muted">{t('tree.truncated')}</p>}
        {side.length > 0 && (
          <section aria-labelledby="tree-side" className="flex flex-col gap-2">
            <h2 id="tree-side" className="font-display text-lg font-semibold text-fg">
              {t('tree.side')}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card">
              {side.map((s) => (
                <li key={s.family.id}>
                  <Link to={`/families/${s.family.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted">
                    <Avatar name={s.family.headName} size="md" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-semibold tracking-wide text-primary uppercase">{t(`links.kind.${s.kind}`)}</span>
                      <span className="font-semibold text-fg">{t('family.title', { name: s.family.headName })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* Same content for screen readers, as a plain list by household. */}
        <div className="sr-only">
          {households.map((h) => (
            <p key={h.family.id}>
              {householdLabel(h)}: {t('family.title', { name: h.family.headName })}. {h.members.map((m) => `${m.name}, ${t(`relation.${m.relation}`)}`).join('; ')}.
            </p>
          ))}
        </div>
      </div>
    );
  }

  const root = tree.data?.households.find((h) => h.via === null);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div>{back}</div>
      <PageHeader title={t('tree.title')} description={root ? t('family.title', { name: root.family.headName }) : <Skeleton className="h-4 w-40" />} />
      {body}
      <TreePersonModal person={opened} people={people} onFocus={focus} onClose={() => setOpened(null)} />
    </div>
  );
}
