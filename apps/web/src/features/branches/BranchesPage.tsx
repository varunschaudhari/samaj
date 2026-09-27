import type { BranchSummary } from '@samaj/shared';
import { Network, Pencil, Plus, SearchX, Trash2, UsersRound } from '@/components/ui/icons';
import { useState } from 'react';
import { type ActiveFilter, Badge, Button, Card, EmptyState, ErrorState, IconButton, ListToolbar, Modal, Select, Skeleton, toast } from '@/components/ui';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { branchName } from './api';
import { useBranchSummaries, useDeleteBranch } from './admin-api';
import { BranchCommitteeModal } from './BranchCommitteeModal';
import { type BranchFormTarget, BranchFormModal } from './BranchFormModal';

interface RowProps {
  branch: BranchSummary;
  onRename: () => void;
  onRemove: () => void;
  onCommittee: () => void;
  heading?: boolean;
}

/** One branch: its name in both languages, how many families it has, and actions. */
function BranchRow({ branch, onRename, onRemove, onCommittee, heading }: RowProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const primary = branchName(branch, language);
  const secondary = language === 'mr' ? branch.name : branch.nameMr;
  // Only empty branches can be removed; hide the action rather than offer one that fails.
  const removable = branch.familyCount === 0 && branch.childCount === 0;
  const Name = heading ? 'h2' : 'p';

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Name className={heading ? 'font-display text-xl font-semibold text-fg' : 'font-semibold text-fg'}>{primary}</Name>
          {!heading && <Badge>{t(`branchKind.${branch.kind}`)}</Badge>}
        </div>
        <p className="text-sm text-fg-muted">
          <span lang={language === 'mr' ? 'en' : 'mr'}>{secondary}</span> ·{' '}
          <span className="tabular-nums">{t('branches.families', { count: branch.familyCount })}</span>
        </p>
        <p className="text-sm text-fg-muted">
          {branch.committee.length > 0
            ? t('branchCommittee.summary', { names: branch.committee.map((c) => c.name).join(', ') })
            : t('branchCommittee.summaryNone')}
        </p>
      </div>
      <div className="flex shrink-0">
        <IconButton icon={UsersRound} label={t('branchCommittee.manage', { branch: primary })} onClick={onCommittee} />
        <IconButton icon={Pencil} label={t('branches.edit', { name: primary })} onClick={onRename} />
        {removable && <IconButton icon={Trash2} label={t('branches.remove', { name: primary })} onClick={onRemove} />}
      </div>
    </div>
  );
}

function BranchesSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

const BRANCH_SHOWS = ['all', 'noCommittee', 'noFamilies'] as const;
type BranchShow = (typeof BRANCH_SHOWS)[number];

export function BranchesPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const summaries = useBranchSummaries();
  const remove = useDeleteBranch();
  const [formTarget, setFormTarget] = useState<BranchFormTarget | null>(null);
  const [removing, setRemoving] = useState<BranchSummary | null>(null);
  const [committeeFor, setCommitteeFor] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [show, setShow] = useState<BranchShow>('all');

  const all = summaries.data ?? [];
  const allDistricts = all.filter((b) => b.parentId === null);
  const allPlacesIn = (id: string) =>
    all.filter((b) => b.parentId === id).sort((a, b) => branchName(a, language).localeCompare(branchName(b, language), language));

  // Every branch is already loaded (a few hundred at most), so search and filters run here.
  const q = search.trim().toLocaleLowerCase();
  const filtering = Boolean(q) || show !== 'all';
  const keep = (b: BranchSummary) =>
    (!q || b.name.toLocaleLowerCase().includes(q) || b.nameMr.includes(search.trim())) &&
    (show === 'all' || (show === 'noCommittee' && b.committee.length === 0) || (show === 'noFamilies' && b.familyCount === 0));
  const placesIn = (id: string) => (filtering ? allPlacesIn(id).filter(keep) : allPlacesIn(id));
  const districts = filtering ? allDistricts.filter((d) => keep(d) || placesIn(d.id).length > 0) : allDistricts;
  const shown = districts.length + districts.reduce((n, d) => n + placesIn(d.id).length, 0);
  const clearAll = () => {
    setSearch('');
    setShow('all');
  };
  const active: ActiveFilter[] = show === 'all' ? [] : [{ key: 'show', label: t(`branches.show.${show}`), onRemove: () => setShow('all') }];

  const addDistrict = (
    <Button leadingIcon={Plus} onClick={() => setFormTarget({ mode: 'addDistrict' })}>
      {t('branches.addDistrict')}
    </Button>
  );

  let body;
  if (summaries.isPending) {
    body = <BranchesSkeleton />;
  } else if (summaries.isError) {
    body = <ErrorState title={t('branches.error.title')} error={summaries.error} onRetry={() => summaries.refetch()} retrying={summaries.isFetching} />;
  } else if (allDistricts.length === 0) {
    body = <EmptyState icon={Network} title={t('branches.empty.title')} body={t('branches.empty.body')} action={addDistrict} />;
  } else if (districts.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title={t('branches.noMatch.title')}
        body={t('branches.noMatch.body')}
        action={
          <Button variant="secondary" onClick={clearAll}>
            {t('directory.clearFilters')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <ul className="flex flex-col gap-4">
        {districts.map((district) => {
          const places = placesIn(district.id);
          return (
            <Card as="li" key={district.id} className="flex flex-col gap-1">
              <BranchRow
                branch={district}
                heading
                onRename={() => setFormTarget({ mode: 'rename', branch: district })}
                onRemove={() => setRemoving(district)}
                onCommittee={() => setCommitteeFor(district.id)}
              />
              <div className="border-t border-line">
                {places.length === 0 ? (
                  <p className="py-3 text-sm text-fg-muted">{t('branches.noPlaces')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {places.map((place) => (
                      <li key={place.id} className="pl-3">
                        <BranchRow
                          branch={place}
                          onRename={() => setFormTarget({ mode: 'rename', branch: place })}
                          onRemove={() => setRemoving(place)}
                          onCommittee={() => setCommitteeFor(place.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button variant="ghost" size="sm" leadingIcon={Plus} className="self-start" onClick={() => setFormTarget({ mode: 'addPlace', district })}>
                {t('branches.addPlace')}
              </Button>
            </Card>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {allDistricts.length > 0 && <div className="flex justify-end">{addDistrict}</div>}
      <ListToolbar
        search={{ value: search, onChange: setSearch, label: t('branches.search'), placeholder: t('branches.searchPlaceholder') }}
        active={active}
        onClearAll={clearAll}
        summary={
          !summaries.data ? (
            <Skeleton className="h-4 w-40" />
          ) : filtering ? (
            t('branches.showing', { count: shown })
          ) : (
            t('branches.subtitle', { districts: allDistricts.length, places: all.length - allDistricts.length })
          )
        }
        filters={
          <Select label={t('branches.show.label')} hideLabel value={show} onChange={(e) => setShow(e.target.value as BranchShow)} fieldClassName="md:w-56">
            {BRANCH_SHOWS.map((s) => (
              <option key={s} value={s}>
                {t(`branches.show.${s}`)}
              </option>
            ))}
          </Select>
        }
      />
      {body}

      <BranchFormModal target={formTarget} onClose={() => setFormTarget(null)} />
      {/* Looked up from the live list, so the modal shows changes as soon as they save. */}
      <BranchCommitteeModal branch={all.find((b) => b.id === committeeFor) ?? null} onClose={() => setCommitteeFor(null)} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? t('branches.removeTitle', { name: branchName(removing, language) }) : ''}
        description={t('branches.removeBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              leadingIcon={Trash2}
              loading={remove.isPending}
              onClick={() => {
                if (!removing) return;
                const name = branchName(removing, language);
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    toast.success(t('branches.removed', { name }));
                    setRemoving(null);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                });
              }}
            >
              {t('family.removeConfirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
