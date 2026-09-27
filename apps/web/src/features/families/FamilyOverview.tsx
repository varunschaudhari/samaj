import { type FamilyDetail, type FamilyMember, gotraName } from '@samaj/shared';
import { Link } from 'react-router';
import { Avatar, Button, Card, Icon, buttonVariants } from '@/components/ui';
import { type AppIcon, Camera, ChevronRight, CircleCheck, MapPin, Network, Pencil, Smartphone, UserPlus, Users } from '@/components/ui/icons';
import { branchName, placeLabel } from '@/features/branches/api';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { FamilyStatusBadge } from './FamilyStatusBadge';

const ageOf = (m: FamilyMember) => (m.birthYear ? new Date().getFullYear() - m.birthYear : null);

/** The family at a glance: who, where, how many, and the main things to do. */
export function FamilySummary({ family, onAdd, onEditDetails }: { family: FamilyDetail; onAdd: () => void; onEditDetails: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const head = family.members.find((m) => m.isHead);
  const accounts = family.members.filter((m) => m.hasAccount).length;
  const waiting = family.members.filter((m) => m.approval === 'pending').length;
  const { canEdit } = family.permissions;
  const n = (v: number) => formatNumber(v, language);

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <Avatar name={family.headName} src={head?.photoUrl} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold break-words text-fg md:text-3xl">{t('family.title', { name: family.headName })}</h1>
            <FamilyStatusBadge status={family.status} />
          </div>
          <p className="flex items-center gap-1 text-sm text-fg-muted">
            <Icon icon={MapPin} size="sm" />
            {placeLabel(family.place, family.branch, language)}
            {family.place !== family.branch.name && <span> · {branchName(family.branch, language)}</span>}
          </p>
          <p className="text-sm text-fg-muted">
            {t('family.gotra')}: <span className="font-semibold text-fg">{gotraName(family.gotra, language) ?? t('family.gotraNone')}</span>
          </p>
          {family.address !== undefined && (
            <p className="text-sm text-fg-muted">
              {t('family.address')}: <span className="text-fg">{family.address ?? '–'}</span>
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-md bg-surface-muted p-3 text-center">
        <div className="flex flex-col-reverse">
          <dt className="text-xs text-fg-muted">{t('family.stat.people')}</dt>
          <dd className="font-display text-2xl font-semibold text-fg tabular-nums">{n(family.members.length)}</dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="text-xs text-fg-muted">{t('family.stat.signIns')}</dt>
          <dd className="font-display text-2xl font-semibold text-fg tabular-nums">{n(accounts)}</dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="text-xs text-fg-muted">{t('family.stat.waiting')}</dt>
          <dd className={cn('font-display text-2xl font-semibold tabular-nums', waiting > 0 ? 'text-warning' : 'text-fg')}>{n(waiting)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button leadingIcon={UserPlus} onClick={onAdd}>
            {t('family.addMember')}
          </Button>
        )}
        <Link to={`/families/${family.id}/tree`} className={buttonVariants({ variant: 'secondary' })}>
          <Icon icon={Network} />
          {t('tree.open')}
        </Link>
        {canEdit && (
          <Button variant="ghost" leadingIcon={Pencil} onClick={onEditDetails}>
            {t('family.editDetails')}
          </Button>
        )}
      </div>
    </Card>
  );
}

interface Step {
  key: string;
  icon: AppIcon;
  label: string;
  done: boolean;
  onFix: () => void;
}

/**
 * What would make this family's record complete, each with a one-tap fix.
 * Only the family and its committee see it, and only while something is left.
 */
export function FamilyChecklist({
  family,
  onAdd,
  onEditDetails,
  onEditMember,
  onInvite,
}: {
  family: FamilyDetail;
  onAdd: () => void;
  onEditDetails: () => void;
  onEditMember: (m: FamilyMember) => void;
  onInvite: (m: FamilyMember) => void;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  if (!family.permissions.canEdit) return null;

  const noBirthYear = family.members.filter((m) => !m.birthYear);
  const noPhoto = family.members.filter((m) => !m.photoUrl);
  // Adults already listed with a number, who could sign in themselves.
  const couldSignIn = family.members.filter((m) => m.canInvite && m.phone && (ageOf(m) ?? 0) >= 18);
  const first = <T,>(list: T[]) => list[0] as T;

  const steps: Step[] = [
    { key: 'people', icon: Users, label: t('family.check.people'), done: family.members.length > 1, onFix: onAdd },
    { key: 'gotra', icon: Pencil, label: t('family.check.gotra'), done: family.gotra !== null, onFix: onEditDetails },
    ...(family.address !== undefined ? [{ key: 'address', icon: MapPin, label: t('family.check.address'), done: Boolean(family.address), onFix: onEditDetails }] : []),
    {
      key: 'birthYears',
      icon: Pencil,
      label: t('family.check.birthYears', { count: formatNumber(noBirthYear.length, language) }),
      done: noBirthYear.length === 0,
      onFix: () => onEditMember(first(noBirthYear)),
    },
    {
      key: 'photos',
      icon: Camera,
      label: t('family.check.photos', { count: formatNumber(noPhoto.length, language) }),
      done: noPhoto.length === 0,
      onFix: () => onEditMember(first(noPhoto)),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const open = steps.filter((s) => !s.done);
  if (open.length === 0 && couldSignIn.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fg">{t('family.check.title')}</h2>
        <span className="text-sm text-fg-muted tabular-nums">{t('family.check.pct', { pct: formatNumber(pct, language) })}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('family.check.title')}>
        <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <ul className="-mx-2 flex flex-col">
        {open.map((s) => (
          <li key={s.key}>
            <button type="button" onClick={s.onFix} className="flex min-h-touch w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-muted">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zari-soft text-zari-fg">
                <Icon icon={s.icon} size="sm" />
              </span>
              <span className="flex-1 text-sm font-semibold text-fg">{s.label}</span>
              <Icon icon={ChevronRight} className="text-fg-muted" />
            </button>
          </li>
        ))}
        {couldSignIn.length > 0 && (
          <li>
            <button type="button" onClick={() => onInvite(first(couldSignIn))} className="flex min-h-touch w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-muted">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon icon={Smartphone} size="sm" />
              </span>
              <span className="flex-1 text-sm font-semibold text-fg">{t('family.check.signIn', { count: formatNumber(couldSignIn.length, language) })}</span>
              <Icon icon={ChevronRight} className="text-fg-muted" />
            </button>
          </li>
        )}
      </ul>
      {done === steps.length && (
        <p className="flex items-center gap-2 text-sm text-success">
          <Icon icon={CircleCheck} size="sm" />
          {t('family.check.complete')}
        </p>
      )}
    </Card>
  );
}
