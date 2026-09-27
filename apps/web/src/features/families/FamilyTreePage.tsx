import type { FamilyTree, TreeHousehold, TreePerson } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Card, EmptyState, ErrorState, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { ArrowLeft, Network, SearchX } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { type MessageKey, isMessageKey, useLanguageStore, useT } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { lifeYears, useDisplayName } from './life';

function useFamilyTree(familyId: string) {
  return useQuery({
    queryKey: ['family', familyId, 'tree'],
    queryFn: async ({ signal }) => (await api.get<{ tree: FamilyTree }>(`/families/${familyId}/tree`, undefined, signal)).tree,
    enabled: Boolean(familyId),
  });
}

/** "Grandparents", "Children"… relative to the head of the family the tree is drawn for. */
function useGenerationLabel() {
  const t = useT();
  return (generation: number) => {
    const key = `tree.gen.${generation}`;
    if (isMessageKey(key)) return t(key as MessageKey);
    return generation < 0 ? t('tree.genUp', { count: -generation }) : t('tree.genDown', { count: generation });
  };
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

function PersonChip({ person }: { person: TreePerson }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const displayName = useDisplayName();
  const years = lifeYears(person, language, (year) => t('member.diedIn', { year }));
  const body = (
    <>
      <Avatar name={person.name} src={person.photoUrl} size="sm" className={cn(person.deceased && 'grayscale')} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn('truncate text-sm text-fg', person.isHead && 'font-semibold')}>{displayName(person)}</span>
        <span className="truncate text-xs text-fg-muted">
          {t(`relation.${person.relation}`)}
          {years && ` · ${years}`}
          {person.movedTo && ` · ${t('tree.married')}`}
        </span>
      </span>
    </>
  );
  if (!person.movedTo) {
    return <li className={cn('flex min-w-0 items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1', person.deceased ? 'bg-surface-muted' : 'bg-surface')}>{body}</li>;
  }
  // Married out: still their parents' child, one tap from the family they're in now.
  const now = t('tree.nowIn', { name: t('family.title', { name: person.movedTo.headName }) });
  return (
    <li className="min-w-0">
      {person.movedTo.canView ? (
        <Link to={`/families/${person.movedTo.id}/tree`} title={now} aria-label={`${person.name}, ${now}`} className="flex min-w-0 items-center gap-2 rounded-full border border-dashed border-line bg-surface py-1 pr-3 pl-1 hover:border-primary">
          {body}
        </Link>
      ) : (
        <span title={now} className="flex min-w-0 items-center gap-2 rounded-full border border-dashed border-line bg-surface py-1 pr-3 pl-1">
          {body}
        </span>
      )}
    </li>
  );
}

/** One household's people in one generation. */
function HouseholdGroup({ household, people }: { household: TreeHousehold; people: TreePerson[] }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const label = useHouseholdLabel();
  const root = household.via === null;
  const name = t('family.title', { name: household.family.headName });
  return (
    <div className={cn('flex w-72 max-w-full shrink-0 flex-col gap-2 rounded-md border bg-surface p-3 shadow-card md:w-auto md:min-w-64', root ? 'border-primary' : 'border-line')}>
      <div className="flex flex-col gap-0.5">
        <Badge tone={root ? 'primary' : 'neutral'} className="self-start">
          {label(household)}
        </Badge>
        <Link to={`/families/${household.family.id}`} className="font-semibold break-words text-fg hover:underline">
          {name}
        </Link>
        <span className="text-xs text-fg-muted">{placeLabel(household.family.place, household.family.branch, language)}</span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <PersonChip key={p.id} person={p} />
        ))}
      </ul>
    </div>
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

/** Generations top to bottom; in each, the households that have people in it. */
export function FamilyTreePage() {
  const { familyId = '' } = useParams();
  const t = useT();
  const generationLabel = useGenerationLabel();
  const householdLabel = useHouseholdLabel();
  const tree = useFamilyTree(familyId);

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
    const generations = [...new Set(households.flatMap((h) => h.members.map((m) => m.generation)))].sort((a, b) => a - b);
    // The root family first in each generation, then by generation of the household.
    const ordered = [...households].sort((a, b) => Number(b.via === null) - Number(a.via === null) || a.generation - b.generation);
    const alone = households.length === 1 && side.length === 0;

    body = (
      <div className="flex flex-col gap-6">
        {alone && (
          <Card variant="muted" className="flex items-start gap-3">
            <Icon icon={Network} weight="duotone" className="mt-0.5 text-primary" />
            <p className="text-sm text-fg">{t('tree.grow')}</p>
          </Card>
        )}
        <ol className="flex flex-col" aria-label={t('tree.title')}>
          {generations.map((g, i) => (
            <li key={g} className="flex flex-col items-center">
              {/* The trunk between generations. */}
              {i > 0 && <span className="h-6 w-px bg-line-strong" aria-hidden="true" />}
              <h2 className={cn('rounded-full px-4 py-1 text-sm font-semibold', g === 0 ? 'bg-primary text-on-primary' : 'bg-surface-muted text-fg')}>
                {generationLabel(g)}
              </h2>
              <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
              <div className="-mx-4 flex w-[calc(100%+2rem)] gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:w-full md:flex-wrap md:justify-center md:overflow-visible md:px-0">
                {ordered.map((h) => {
                  const people = h.members.filter((m) => m.generation === g);
                  return people.length > 0 ? <HouseholdGroup key={h.family.id} household={h} people={people} /> : null;
                })}
              </div>
            </li>
          ))}
        </ol>
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
          {ordered.map((h) => (
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
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>{back}</div>
      <PageHeader title={t('tree.title')} description={root ? t('family.title', { name: root.family.headName }) : <Skeleton className="h-4 w-40" />} />
      {body}
    </div>
  );
}
