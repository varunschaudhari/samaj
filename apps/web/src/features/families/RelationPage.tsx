import type { FamilyTree, MemberPage, TreePerson } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Button, Card, EmptyState, Icon, Input, Skeleton, buttonVariants } from '@/components/ui';
import { ArrowRight, Network, Search } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { type MessageKey, useT } from '@/i18n';
import { api } from '@/lib/api';
import { findInTree, kinshipFrom, kinshipPath } from './kinship';
import { useDisplayName } from './life';
import { useFamilyTree } from './tree-api';

interface Chosen {
  id: string;
  familyId: string;
  name: string;
}

/** Someone from the directory, by name. */
function PersonPicker({ label, value, onPick }: { label: string; value: Chosen | null; onPick: (p: Chosen) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  // Searching: while nobody is chosen, or after "Change".
  const [editing, setEditing] = useState(false);
  const typed = query.trim();
  const found = useQuery({
    queryKey: ['members', 'relation', typed],
    queryFn: async ({ signal }) => (await api.get<MemberPage>('/members', { q: typed, limit: 8 }, signal)).items,
    enabled: (editing || !value) && typed.length >= 2,
    staleTime: 30_000,
  });

  if (value && !editing) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
        <Avatar name={value.name} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold text-fg-muted">{label}</span>
          <span className="truncate font-semibold text-fg">{value.name}</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          {t('finder.change')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Input label={label} placeholder={t('finder.search')} leadingIcon={Search} autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      {typed.length >= 2 && found.data && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
          {found.data.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">{t('tree.noMatch')}</li>
          ) : (
            found.data.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ id: m.id, familyId: m.familyId, name: m.name });
                    setQuery('');
                    setEditing(false);
                  }}
                  className="flex min-h-touch w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-muted"
                >
                  <Avatar name={m.name} src={m.photoUrl} size="sm" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-fg">{m.name}</span>
                    <span className="truncate text-xs text-fg-muted">{t('family.title', { name: m.familyHead ?? m.name })}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

const flatten = (tree: FamilyTree | undefined) => tree?.households.flatMap((h) => h.members) ?? [];

/** The step that reaches someone, named for them: "Father", "Son", "Wife" (or "Grandfather" across a generation nobody listed). */
function stepLabel(step: 'U' | 'D' | 'P', to: TreePerson, from: TreePerson): MessageKey {
  const female = to.gender === 'female';
  const skips = Math.abs(from.generation - to.generation) > 1;
  if (step === 'U') return skips ? (female ? 'kin.grandmother' : 'kin.grandfather') : female ? 'kin.mother' : 'kin.father';
  if (step === 'D') return skips ? (female ? 'kin.granddaughter' : 'kin.grandson') : female ? 'kin.daughter' : 'kin.son';
  return female ? 'kin.wife' : 'kin.husband';
}

/**
 * How two people are related: worked out from the family tree of either
 * one's family (whichever joins them both), named as their family would say
 * it, with everyone in between.
 */
export function RelationPage() {
  const t = useT();
  const displayName = useDisplayName();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const mine: Chosen | null = me.data?.memberId ? { id: me.data.memberId, familyId: me.data.familyId, name: me.data.name } : null;
  const a: Chosen | null = params.get('a') ? { id: params.get('a') ?? '', familyId: params.get('af') ?? '', name: params.get('an') ?? '' } : mine;
  const b: Chosen | null = params.get('b') ? { id: params.get('b') ?? '', familyId: params.get('bf') ?? '', name: params.get('bn') ?? '' } : null;
  const choose = (which: 'a' | 'b', p: Chosen) => {
    const next = new URLSearchParams(params);
    next.set(which, p.id);
    next.set(`${which}f`, p.familyId);
    next.set(`${which}n`, p.name);
    setParams(next, { replace: true });
  };

  // Either family's tree may join the two; the first's is tried first.
  const treeA = useFamilyTree(a?.familyId ?? '', Boolean(a && b));
  const treeB = useFamilyTree(b?.familyId ?? '', Boolean(a && b && b.familyId !== a.familyId));
  const inTree = (tree: FamilyTree | undefined) => {
    const people = flatten(tree);
    const from = a ? findInTree(people, a.id) : undefined;
    const to = b ? findInTree(people, b.id) : undefined;
    const path = from && to ? kinshipPath(from.id, to.id, people) : null;
    return from && to && path ? { tree, people, from, to, path, kin: kinshipFrom(from.id, people).get(to.id) } : null;
  };
  const found = inTree(treeA.data) ?? inTree(treeB.data);
  const loading = Boolean(a && b) && (treeA.isPending || (b?.familyId !== a?.familyId && treeB.isPending));
  const aIsMe = a?.id === me.data?.memberId;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader title={t('finder.title')} description={t('finder.description')} />
      <Card className="flex flex-col gap-3">
        <PersonPicker label={t('finder.from')} value={a} onPick={(p) => choose('a', p)} />
        <PersonPicker label={t('finder.to')} value={b} onPick={(p) => choose('b', p)} />
      </Card>

      {!b ? (
        <p className="text-sm text-fg-muted">{t('finder.pickTo')}</p>
      ) : loading ? (
        <Skeleton className="h-40 w-full rounded-md" />
      ) : !found ? (
        <EmptyState icon={Network} title={t('finder.none.title')} body={t('finder.none.body')} />
      ) : found.path.length === 0 ? (
        <Card>
          <p className="font-semibold text-fg">{t('finder.same')}</p>
        </Card>
      ) : (
        <Card as="section" aria-live="polite" className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={found.to.name} src={found.to.photoUrl} size="xl" />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm text-fg-muted">{displayName(found.to)}</span>
              <span className="font-display text-2xl font-semibold text-fg">{found.kin ? t(found.kin) : t('kin.relative')}</span>
              <span className="text-sm text-fg-muted">{aIsMe ? t('finder.toYou') : t('finder.toPerson', { name: displayName(found.from) })}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t('finder.path')}</h2>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <li className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-fg">{displayName(found.from)}</li>
              {found.path.map((hop, i) => (
                <li key={hop.to.id} className="flex items-center gap-2">
                  <Icon icon={ArrowRight} size="sm" className="text-fg-muted" />
                  <span className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-fg">
                    <span className="text-fg-muted">{t(stepLabel(hop.step, hop.to, i === 0 ? found.from : (found.path[i - 1]?.to ?? found.from)))}:</span> <span className="font-semibold">{displayName(hop.to)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {found.tree && (
            <Link to={`/families/${found.tree.rootId}/tree?focus=${found.to.id}`} className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} self-start`}>
              <Icon icon={Network} />
              {t('finder.showInTree')}
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
