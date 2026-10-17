import { can } from '@samaj/shared';
import { CalendarDays, ChevronRight, MapPin, Plus, UsersRound } from '@/components/ui/icons';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { branchName } from '@/features/branches/api';
import { formatNumber, useLanguageStore, useT } from '@/i18n';
import { formatMelavaDate, useMelavas } from './api';
import { MelavaFormModal } from './MelavaFormModal';

/** Upcoming vadhu-var parichay melavas. Families register from here; committees organise them. */
export function MelavasPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const melavas = useMelavas();
  const [creating, setCreating] = useState(false);
  const canOrganise = me.data ? can(me.data.role, 'member:write') : false;

  let body;
  if (melavas.isPending) {
    body = (
      <ul className="flex flex-col gap-3" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-md" />
        ))}
      </ul>
    );
  } else if (melavas.isError) {
    body = <ErrorState title={t('melava.error')} error={melavas.error} onRetry={() => melavas.refetch()} retrying={melavas.isFetching} />;
  } else if (melavas.data.length === 0) {
    body = <EmptyState icon={UsersRound} title={t('melava.emptyTitle')} body={canOrganise ? t('melava.emptyOrganiser') : t('melava.emptyBody')} />;
  } else {
    body = (
      <ul className="flex flex-col gap-3">
        {melavas.data.map((m) => (
          <li key={m.id} className="group relative flex items-center gap-4 rounded-md border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised">
            <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary-soft text-primary">
              <span className="text-xl leading-none font-semibold tabular-nums">{formatNumber(Number(m.date.slice(8, 10)), language)}</span>
              <span className="text-xs font-medium uppercase">
                {new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m.date}T00:00:00Z`))}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="font-display text-lg leading-snug font-semibold text-fg">
                <Link to={`/matrimony/melavas/${m.id}`} className="after:absolute after:inset-0 after:rounded-md">
                  {m.name}
                </Link>
              </h2>
              <p className="flex items-center gap-1.5 text-sm text-fg-muted">
                <Icon icon={CalendarDays} size="sm" />
                {formatMelavaDate(m.date, language)}
              </p>
              <p className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
                <Icon icon={MapPin} size="sm" className="shrink-0" />
                <span className="truncate">{m.venue ?? branchName(m.branch, language)}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone={m.registrationOpen ? 'success' : 'neutral'}>{m.registrationOpen ? t('melava.open') : t('melava.closed')}</Badge>
                <Badge>{t('melava.feeLine', { fee: formatNumber(m.fee, language) })}</Badge>
                {m.permissions.canManage && <Badge tone="primary">{t('melava.counts', { brides: formatNumber(m.counts.bride, language), grooms: formatNumber(m.counts.groom, language) })}</Badge>}
              </div>
            </div>
            <Icon icon={ChevronRight} className="shrink-0 text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-fg-muted">{t('melava.intro')}</p>
        {canOrganise && (
          <Button variant="secondary" leadingIcon={Plus} onClick={() => setCreating(true)}>
            {t('melava.create')}
          </Button>
        )}
      </div>
      {body}
      <MelavaFormModal open={creating} melava={null} onClose={() => setCreating(false)} />
    </div>
  );
}
