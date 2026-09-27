import { Link } from 'react-router';
import { Avatar, Badge, Modal, buttonVariants } from '@/components/ui';
import { placeLabel } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useDisplayName } from './life';
import { usePersonLine } from './TreeChart';
import type { ChartPerson } from './tree-layout';

/** One person from the tree: who they are to whom, and the way to their family. */
export function TreePersonModal({
  person,
  people,
  onFocus,
  onClose,
}: {
  person: ChartPerson | null;
  people: ChartPerson[];
  onFocus: (p: ChartPerson) => void;
  onClose: () => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const displayName = useDisplayName();
  const line = usePersonLine();
  if (!person) return <Modal open={false} onClose={onClose} title="" />;

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
    <Modal open onClose={onClose} title={displayName(person)} description={line(person)}>
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
          {person.movedTo && (
            <div>
              <dt className="text-xs font-semibold text-fg-muted">{t('tree.movedTo')}</dt>
              <dd className="text-fg">{t('family.title', { name: person.movedTo.headName })}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
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
