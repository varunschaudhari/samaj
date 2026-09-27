import type { TreeHousehold } from '@samaj/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Badge, Button, Chip, Modal, buttonVariants, toast } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useSamePerson } from './api';
import { useDisplayName } from './life';
import { type Kin, usePersonLine, useRelationLabel } from './TreeChart';
import type { ChartPerson } from './tree-layout';

/** One person from the tree: who they are to whom, and the way to their family. */
export function TreePersonModal({
  person,
  people,
  households,
  kin,
  ego,
  onFocus,
  onFromHere,
  onClose,
}: {
  person: ChartPerson | null;
  people: ChartPerson[];
  households: TreeHousehold[];
  kin: Kin;
  /** Whose point of view relations are shown from, if anyone's. */
  ego: ChartPerson | null;
  onFocus: (p: ChartPerson) => void;
  /** Show everyone's relation to this person. */
  onFromHere: (p: ChartPerson) => void;
  onClose: () => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const displayName = useDisplayName();
  const line = usePersonLine();
  const relation = useRelationLabel();
  const errorMessage = useErrorMessage();
  const same = useSamePerson();
  const [twin, setTwin] = useState<string | null>(null);
  if (!person) return <Modal open={false} onClose={onClose} title="" />;

  // Either person's family may say whether two entries are one person.
  const edits = (familyId: string) => households.some((h) => h.family.id === familyId && h.canEdit);
  const twins = people.filter(
    (p) => p.household.id !== person.household.id && p.gender === person.gender && p.generation === person.generation && (edits(person.household.id) || edits(p.household.id)),
  );
  const say = (b: string, isSame: boolean) =>
    same.mutate(
      { a: person.id, b, same: isSame },
      {
        onSuccess: () => {
          toast.success(t(isSame ? 'tree.sameSaved' : 'tree.notSameSaved'));
          setTwin(null);
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  const parent = people.find((p) => p.id === person.parentId);
  const partners = people.filter((p) => p.id === person.partnerId || p.partnerId === person.id);
  // Someone who married in has their partner's children.
  const children = people.filter((p) => p.parentId !== null && (p.parentId === person.id || p.parentId === person.partnerId));
  const others = (list: ChartPerson[]) =>
    list.map((p) => (
      <li key={p.id}>
        <button type="button" onClick={() => onFocus(p)} className="font-semibold text-primary hover:underline">
          {displayName(p)}
        </button>
      </li>
    ));

  return (
    <Modal open onClose={onClose} title={displayName(person)} description={line(person, kin)}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} src={person.photoUrl} size="xl" className={cn(person.deceased && 'grayscale')} />
          <div className="flex flex-wrap gap-1.5">
            {person.isHead && <Badge tone="primary">{t('family.headBadge')}</Badge>}
            {person.deceased && <Badge>{t('member.deceasedBadge')}</Badge>}
            {person.adopted && <Badge>{t('member.adopted')}</Badge>}
          </div>
        </div>
        <dl className="flex flex-col gap-3 text-sm">
          {kin && ego && ego.id !== person.id && kin.map.has(person.id) && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{kin.viewerIsEgo ? t('tree.toYou') : t('tree.toPerson', { name: displayName(ego) })}</dt>
              <dd className="font-semibold text-fg">{relation(person, kin)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-semibold text-fg-muted">{t('tree.asListed')}</dt>
            <dd className="text-fg">{person.isHead ? t('family.headBadge') : t(`relation.${person.relation}`)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-muted">{t('tree.household')}</dt>
            <dd className="text-fg">
              {t('family.title', { name: person.household.headName })} · {placeLabel(person.household.place, person.household.branch, language)}
            </dd>
          </div>
          {parent && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{t('tree.parents')}</dt>
              <dd>
                <ul>{others([parent])}</ul>
              </dd>
            </div>
          )}
          {partners.length > 0 && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{t('tree.partner')}</dt>
              <dd>
                <ul>{others(partners)}</ul>
              </dd>
            </div>
          )}
          {children.length > 0 && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{t('tree.children')}</dt>
              <dd>
                <ul className="flex flex-wrap gap-x-3 gap-y-1">{others(children)}</ul>
              </dd>
            </div>
          )}
          {person.alsoListed && person.alsoListed.length > 0 && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{t('tree.alsoListed')}</dt>
              <dd>
                <ul className="flex flex-col gap-1">
                  {person.alsoListed.map((a) => (
                    <li key={a.memberId} className="flex flex-wrap items-center gap-x-3">
                      <span className="text-fg">{t('family.title', { name: a.headName })}</span>
                      {(edits(person.household.id) || edits(a.familyId)) && (
                        <Button variant="ghost" size="sm" loading={same.isPending} onClick={() => say(a.memberId, false)}>
                          {t('tree.notSame')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {person.movedTo && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{t('tree.movedTo')}</dt>
              <dd className="text-fg">{t('family.title', { name: person.movedTo.headName })}</dd>
            </div>
          )}
        </dl>
        {twins.length > 0 && (
          <details className="rounded-md border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-fg">{t('tree.sameAs')}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-fg-muted">{t('tree.sameAsHint')}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('tree.samePick')}>
                {twins.map((p) => (
                  <Chip key={p.id} selected={twin === p.id} onClick={() => setTwin(p.id)} className="px-3">
                    {p.name} · {t('family.title', { name: p.household.headName })}
                  </Chip>
                ))}
              </div>
              <Button size="sm" className="self-start" disabled={!twin} loading={same.isPending} onClick={() => twin && say(twin, true)}>
                {t('tree.sameSave')}
              </Button>
            </div>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          {!(kin?.viewerIsEgo && ego?.id === person.id) && (
            <Link
              to={`/relation?${new URLSearchParams({ b: person.id, bf: person.household.id, bn: person.name }).toString()}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              {t('finder.toMe', { name: displayName(person) })}
            </Link>
          )}
          {ego?.id !== person.id && (
            <Button variant="secondary" size="sm" onClick={() => onFromHere(person)}>
              {t('tree.fromHere', { name: displayName(person) })}
            </Button>
          )}
          <Link to={`/families/${person.household.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {t('tree.openFamily')}
          </Link>
          {!person.rootHousehold && (
            <Link to={`/families/${person.household.id}/tree?focus=${person.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {t('tree.openTree')}
            </Link>
          )}
          {person.movedTo?.canView && (
            <Link to={`/families/${person.movedTo.id}/tree`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {t('tree.openNewFamily')}
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}
