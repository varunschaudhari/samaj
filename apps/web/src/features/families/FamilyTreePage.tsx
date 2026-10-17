import { type FamilyTree, type TreeHousehold, gotraName } from '@samaj/shared';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, Chip, EmptyState, ErrorState, Icon, IconButton, Skeleton, buttonVariants, toast } from '@/components/ui';
import { ArrowLeft, ImageIcon, Network, Printer, Rows, SearchX, Share, UserPlus, X } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { type MessageKey, formatNumber, isMessageKey, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDisplayName } from './life';
import { useMe } from '@/features/auth/api';
import { AddFromTree, type TreeEdit } from './AddFromTree';
import { useFamily } from './api';
import { useFamilyTree } from './tree-api';
import { kinshipFrom, kinshipPath } from './kinship';
import { type TreeShape, TREE_SHAPES, filterTree, shapePeople } from './tree-shapes';
import { findGaps } from './tree-gaps';
import { TreeGaps } from './TreeGaps';
import { drawTreeImage } from './treeImage';
import { FULL_CARD, layoutTree } from './tree-layout';
import { shareOrDownload } from '@/features/invitations/cardImage';
import { type Kin, TreeChart, useGenerationLabel, usePersonLine } from './TreeChart';
import { AddRelatives, TreePersonModal } from './TreePersonModal';
import { TreeSearch } from './TreeSearch';
import { type ChartPerson, findPeople } from './tree-layout';

/** A household joined through one of these people (as the head sees them) is their family: "Son's family". */
const WHOSE: Partial<Record<MessageKey, MessageKey>> = {
  'kin.son': 'links.kind.son',
  'kin.daughter': 'links.kind.daughter',
  'kin.brother': 'links.kind.brother',
  'kin.sister': 'links.kind.sister',
  'kin.grandson': 'tree.household.grandson',
  'kin.granddaughter': 'tree.household.granddaughter',
};

/**
 * What a household is to the family the tree is drawn for: "Son's family"
 * or "Daughter's family" when someone in it is the head's son or daughter
 * (a son who heads it, a daughter who married into it), else by generation.
 */
function useHouseholdLabel(headKin: Map<string, MessageKey>) {
  const t = useT();
  return (h: TreeHousehold) => {
    if (h.via === null) return t('tree.thisFamily');
    if (h.via === 'person') return t('tree.household.person', { name: h.through?.name ?? '' });
    const head = h.members.find((m) => m.isHead);
    const joiner = [...(head ? [head] : []), ...h.members].map((m) => WHOSE[headKin.get(m.id) ?? ('' as MessageKey)]).find(Boolean);
    if (joiner) return t(joiner);
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

function PersonChip({ person, kin, focused, matched, onOpen }: { person: ChartPerson; kin: Kin; focused: boolean; matched: boolean; onOpen: (p: ChartPerson) => void }) {
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
          <span className="truncate text-xs text-fg-muted">{line(person, kin)}</span>
        </span>
      </button>
    </li>
  );
}

/** One household's people in one generation. */
function HouseholdGroup({ household, label, people, children }: { household: TreeHousehold; label: string; people: ChartPerson[]; children: (p: ChartPerson) => ReactNode }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const root = household.via === null;
  return (
    <div className={cn('flex w-72 max-w-full shrink-0 flex-col gap-2 rounded-md border bg-surface p-3 shadow-card md:w-auto md:min-w-64', root ? 'border-primary' : 'border-line')}>
      <div className="flex flex-col gap-0.5">
        <Badge tone={root ? 'primary' : 'neutral'} className="self-start">
          {label}
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
function TreeList({
  tree,
  people,
  kin,
  focusId,
  matches,
  labelOf,
  onOpen,
}: {
  tree: FamilyTree;
  labelOf: (h: TreeHousehold) => string;
  people: ChartPerson[];
  kin: Kin;
  focusId: string | null;
  matches: Set<string>;
  onOpen: (p: ChartPerson) => void;
}) {
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
                <HouseholdGroup key={h.family.id} household={h} label={labelOf(h)} people={here}>
                  {(p) => <PersonChip key={p.id} person={p} kin={kin} focused={p.id === focusId} matched={matches.has(p.id)} onOpen={onOpen} />}
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
  const tree = useFamilyTree(familyId);
  const [params, setParams] = useSearchParams();
  const focusId = params.get('focus');
  const [view, setView] = useState<View>(savedView);
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<ChartPerson | null>(null);
  // Adding someone, or saying whose child someone is, with the family page's own forms.
  const [treeEdit, setTreeEdit] = useState<TreeEdit | null>(null);
  const me = useMe();
  // Whose point of view relations are shown from: the viewer, someone picked, or as each family lists them.
  const [from, setFrom] = useState<string | 'me' | 'listed'>('me');
  // The whole tree, or one person's ancestors or descendants, or the वंशावळ.
  const [shape, setShape] = useState<TreeShape>('all');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  // Lit up from the person card or the relation finder: the people between two.
  const pathFrom = params.get('path');
  const language = useLanguageStore((s) => s.language);
  const family = useFamily(familyId);

  const people = useMemo<ChartPerson[]>(
    () => tree.data?.households.flatMap((h) => h.members.map((m) => ({ ...m, household: h.family, rootHousehold: h.via === null, x: 0, y: 0 }))) ?? [],
    [tree.data],
  );
  const found = useMemo(() => findPeople(people, query), [people, query]);
  const myId = people.some((p) => p.id === me.data?.memberId) ? (me.data?.memberId ?? null) : null;
  const egoId = from === 'listed' ? null : from === 'me' ? myId : from;
  const ego = people.find((p) => p.id === egoId);
  const rootHead = people.find((p) => p.rootHousehold && p.isHead);
  const rootEditable = Boolean(tree.data?.households.some((h) => h.via === null && h.canEdit));
  const kin = useMemo<Kin>(() => (egoId ? { map: kinshipFrom(egoId, people), viewerIsEgo: egoId === myId } : null), [egoId, people, myId]);
  // Everyone's relation to the family's head, to name each household by who joins it.
  const headKin = useMemo(() => (rootHead ? kinshipFrom(rootHead.id, people) : new Map<string, MessageKey>()), [rootHead, people]);
  const householdLabel = useHouseholdLabel(headKin);
  const displayName = useDisplayName();

  // A path shows on the whole tree, so nobody on it is hidden.
  const path = useMemo(() => {
    if (!pathFrom || !focusId) return null;
    const steps = kinshipPath(pathFrom, focusId, people);
    return steps ? new Set([pathFrom, ...steps.map((s) => s.to.id)]) : null;
  }, [pathFrom, focusId, people]);
  const activeShape: TreeShape = path ? 'all' : shape;
  const subject = people.find((p) => p.id === (subjectId ?? myId ?? rootHead?.id));
  const shown = useMemo(() => {
    if (!tree.data || activeShape === 'all') return { tree: tree.data, people };
    const keep = shapePeople(people, activeShape, subject?.id ?? null, rootHead?.id ?? null);
    return { tree: filterTree(tree.data, keep), people: people.filter((p) => keep.has(p.id)) };
  }, [tree.data, people, activeShape, subject?.id, rootHead?.id]);
  // The वंशावळ counts generations from the earliest ancestor: पिढी 1, 2, 3.
  const firstGeneration = Math.min(...shown.people.map((p) => p.generation));
  const pidhi = activeShape === 'vanshavali' ? (g: number) => t('tree.pidhi', { n: formatNumber(g - firstGeneration + 1, language) }) : undefined;
  const surname = rootHead?.name.trim().split(/\s+/).at(-1) ?? '';
  const gotra = gotraName(family.data?.gotra, language);
  // What's missing in the families the viewer may edit, each with its fix.
  const gaps = useMemo(() => findGaps(tree.data?.households.map((h) => ({ familyId: h.family.id, canEdit: h.canEdit, members: h.members })) ?? []), [tree.data]);

  // The tree as it is shown, as a picture for WhatsApp.
  const personLine = usePersonLine();
  const defaultRowLabel = useGenerationLabel();
  const [drawing, setDrawing] = useState(false);
  const sharePicture = async () => {
    if (!shown.tree) return;
    setDrawing(true);
    try {
      const layout = layoutTree(shown.tree, new Set(), FULL_CARD);
      const rootFamily = tree.data?.households.find((h) => h.via === null)?.family;
      const familyLine = rootFamily ? `${t('family.title', { name: rootFamily.headName })} · ${rootFamily.place}` : '';
      const pathA = path && pathFrom ? people.find((p) => p.id === pathFrom) : undefined;
      const pathB = path && focusId ? people.find((p) => p.id === focusId) : undefined;
      const title =
        pathA && pathB
          ? t('tree.path.showing', { a: displayName(pathA), b: displayName(pathB) })
          : activeShape === 'vanshavali'
          ? t('tree.vanshavali.title', { surname })
          : activeShape === 'ancestors' && subject
            ? t('tree.picture.ancestors', { name: displayName(subject) })
            : activeShape === 'descendants' && subject
              ? t('tree.picture.descendants', { name: displayName(subject) })
              : t('tree.title');
      const subtitle = activeShape === 'vanshavali' ? [gotra ? t('tree.vanshavali.gotra', { gotra }) : null, familyLine].filter(Boolean).join(' · ') : familyLine;
      const blob = await drawTreeImage(layout, {
        title,
        subtitle,
        footer: t('tree.picture.footer', { date: new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { dateStyle: 'medium' }).format(new Date()) }),
        names: new Map(shown.people.map((p) => [p.id, displayName(p)])),
        lines: new Map(shown.people.map((p) => [p.id, personLine(p, kin)])),
        rowLabel: pidhi ?? defaultRowLabel,
        path,
      });
      const how = await shareOrDownload(blob, `${title}.png`.replace(/[\\/:*?"<>|]/g, ''), title);
      if (how === 'downloaded') toast.success(t('tree.picture.saved'));
    } catch {
      toast.error(t('tree.picture.failed'));
    } finally {
      setDrawing(false);
    }
  };

  const showShape = (s: TreeShape, p?: ChartPerson) => {
    setShape(s);
    if (p) setSubjectId(p.id);
    setOpened(null);
    if (pathFrom) setParams(focusId ? { focus: focusId } : {}, { replace: true });
  };

  const share = async () => {
    const url = `${window.location.origin}/families/${familyId}/tree`;
    const title = t('tree.shareTitle', { name: tree.data?.households.find((h) => h.via === null)?.family.headName ?? '' });
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closed without sharing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('tree.linkCopied'));
    } catch {
      toast.info(url);
    }
  };
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
      ) : tree.error instanceof ApiError && tree.error.status === 403 ? (
        <EmptyState icon={Network} title={t('tree.private.title')} body={t('tree.private.body')} />
      ) : (
        <ErrorState title={t('tree.error')} error={tree.error} onRetry={() => tree.refetch()} retrying={tree.isFetching} />
      );
  } else {
    const { households, side, truncated } = tree.data;
    const alone = households.length === 1 && side.length === 0;
    body = (
      <div className="flex flex-col gap-5">
        {alone && (
          <Card variant="muted" className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Icon icon={Network} weight="duotone" className="mt-0.5 text-primary" />
              <p className="text-sm text-fg">{t('tree.grow')}</p>
            </div>
            {/* Start growing it right here: the head's parents, wife, children. */}
            {rootHead && households[0]?.canEdit && <AddRelatives person={rootHead} people={people} onEdit={setTreeEdit} />}
          </Card>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
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
        <div className="flex items-center gap-2 print:hidden">
          {/* One line on a phone: the choices scroll sideways, the actions shrink to icons. */}
          <div className="-ms-4 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto ps-4 sm:ms-0 sm:flex-wrap sm:overflow-visible sm:ps-0" role="group" aria-label={t('tree.relFrom')}>
            <span className="shrink-0 text-sm font-semibold text-fg-muted">{t('tree.relFrom')}</span>
            <Chip selected={egoId === null} onClick={() => setFrom('listed')} className="shrink-0 px-3">
              {t('tree.relListed')}
            </Chip>
            {myId && (
              <Chip selected={egoId === myId} onClick={() => setFrom('me')} className="shrink-0 px-3">
                {t('tree.relMe')}
              </Chip>
            )}
            {ego && egoId !== myId && (
              <Chip selected onClick={() => setFrom(myId ? 'me' : 'listed')} icon={X} className="shrink-0 px-3">
                {t('tree.relPerson', { name: displayName(ego) })}
              </Chip>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link to="/relation" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden lg:inline-flex')}>
              {t('finder.open')}
            </Link>
            {rootEditable && (
              <Button variant="secondary" size="sm" leadingIcon={UserPlus} aria-label={t('tree.add.someone')} onClick={() => setTreeEdit({ mode: 'add', familyId })}>
                <span className="hidden sm:inline">{t('tree.add.someone')}</span>
              </Button>
            )}
            <IconButton icon={ImageIcon} label={t('tree.picture.share')} onClick={() => void sharePicture()} disabled={drawing} />
            <IconButton icon={Printer} label={t('tree.print')} onClick={() => window.print()} />
            <IconButton icon={Share} label={t('tree.share')} onClick={() => void share()} />
          </div>
        </div>
        <div className="-ms-4 flex items-center gap-2 overflow-x-auto ps-4 sm:ms-0 sm:flex-wrap sm:overflow-visible sm:ps-0 print:hidden" role="group" aria-label={t('tree.shape.label')}>
          <span className="shrink-0 text-sm font-semibold text-fg-muted">{t('tree.shape.label')}</span>
          {TREE_SHAPES.map((s) => (
            <Chip key={s} selected={activeShape === s} onClick={() => showShape(s)} className="shrink-0 px-3">
              {t(`tree.shape.${s}`)}
            </Chip>
          ))}
          {(activeShape === 'ancestors' || activeShape === 'descendants') && subject && (
            <span className="shrink-0 text-sm text-fg-muted">{t('tree.shape.of', { name: displayName(subject) })}</span>
          )}
        </div>
        {(activeShape === 'ancestors' || activeShape === 'descendants') && <p className="-mt-3 text-xs text-fg-muted print:hidden">{t('tree.shape.pickHint')}</p>}
        {activeShape === 'vanshavali' && (
          <Card className="flex flex-col items-center gap-1 border-zari bg-zari-soft/40 text-center">
            <span className="font-display text-2xl font-semibold text-fg">{t('tree.vanshavali.title', { surname })}</span>
            <span className="text-sm text-fg-muted">
              {gotra ? t('tree.vanshavali.gotra', { gotra }) : t('tree.vanshavali.noGotra')} · {t('tree.vanshavali.count', { count: formatNumber(shown.people.length, language) })}
            </span>
            <span className="text-xs text-fg-muted print:hidden">{t('tree.vanshavali.hint')}</span>
          </Card>
        )}
        {path && pathFrom && focusId && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary bg-primary-soft px-4 py-2 text-sm print:hidden">
            <span className="font-semibold text-fg">
              {t('tree.path.showing', {
                a: displayName(people.find((p) => p.id === pathFrom) ?? { name: '', deceased: false }),
                b: displayName(people.find((p) => p.id === focusId) ?? { name: '', deceased: false }),
              })}
            </span>
            <Button variant="ghost" size="sm" leadingIcon={X} onClick={() => setParams({ focus: focusId }, { replace: true })}>
              {t('tree.path.clear')}
            </Button>
          </div>
        )}
        <TreeGaps gaps={gaps} onEdit={setTreeEdit} />
        {view === 'chart' ? (
          <TreeChart
            tree={shown.tree ?? tree.data}
            kin={kin}
            focusId={focusId}
            homeId={myId}
            path={path}
            generationLabel={pidhi}
            matches={matches}
            onOpen={setOpened}
            onWhoseChild={(s) => setTreeEdit({ mode: 'edit', familyId: s.householdId, memberId: s.id })}
          />
        ) : (
          <TreeList tree={shown.tree ?? tree.data} labelOf={householdLabel} people={shown.people} kin={kin} focusId={focusId} matches={matches} onOpen={setOpened} />
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
      <div className="print:hidden">{back}</div>
      <PageHeader title={t('tree.title')} description={root ? t('family.title', { name: root.family.headName }) : <Skeleton className="h-4 w-40" />} />
      {body}
      <TreePersonModal
        person={opened}
        people={people}
        households={tree.data?.households ?? []}
        kin={kin}
        ego={ego ?? null}
        onFocus={focus}
        onFromHere={(p) => {
          setFrom(p.id === myId ? 'me' : p.id);
          setOpened(null);
        }}
        onEdit={(e) => {
          setOpened(null);
          setTreeEdit(e);
        }}
        onShape={showShape}
        onPath={(p) => {
          if (!ego) return;
          setOpened(null);
          setParams({ focus: p.id, path: ego.id }, { replace: true });
        }}
        onClose={() => setOpened(null)}
      />
      <AddFromTree edit={treeEdit} onClose={() => setTreeEdit(null)} />
    </div>
  );
}
