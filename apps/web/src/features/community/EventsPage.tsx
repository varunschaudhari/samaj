import { can } from '@samaj/shared';
import { CalendarDays, Plus, SearchX } from '@/components/ui/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type ActiveFilter, Button, EmptyState, ErrorState, ListToolbar, Select, Skeleton } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { branchName } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { EventCard, EventCardSkeleton } from './EventCard';
import { EventFormModal } from './EventFormModal';
import { useEvents } from './events-api';

export function EventsPage() {
  const t = useT();
  const me = useMe();
  const navigate = useNavigate();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const events = useEvents(when);
  const [creating, setCreating] = useState(false);
  const canCreate = me.data ? can(me.data.role, 'notice:publish') : false;
  const language = useLanguageStore((s) => s.language);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');

  // A branch sees at most a hundred events at a time, so search and the branch filter run here.
  const all = events.data ?? [];
  const branchOptions = [...new Map(all.map((e) => [e.branch.id, e.branch])).values()].sort((a, b) =>
    branchName(a, language).localeCompare(branchName(b, language), language),
  );
  const q = search.trim().toLocaleLowerCase();
  const shown = all.filter(
    (e) =>
      (!branchId || e.branch.id === branchId) &&
      (!q || [e.title, e.venue, e.branch.name, e.branch.nameMr].some((field) => field.toLocaleLowerCase().includes(q))),
  );
  const branch = branchOptions.find((b) => b.id === branchId);
  const active: ActiveFilter[] = branch
    ? [{ key: 'branch', label: `${t('directory.filterBranch')}: ${branchName(branch, language)}`, onRemove: () => setBranchId('') }]
    : [];
  const clearAll = () => {
    setSearch('');
    setBranchId('');
  };

  let body;
  if (events.isPending) {
    body = (
      <ul className="flex flex-col gap-3" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((i) => (
          <EventCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (events.isError) {
    body = <ErrorState title={t('events.error')} error={events.error} onRetry={() => events.refetch()} retrying={events.isFetching} />;
  } else if (all.length > 0 && shown.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title={t('events.noMatch.title')}
        body={t('events.noMatch.body')}
        action={
          <Button variant="secondary" onClick={clearAll}>
            {t('directory.clearFilters')}
          </Button>
        }
      />
    );
  } else if (all.length === 0) {
    body =
      when === 'upcoming' ? (
        <EmptyState
          icon={CalendarDays}
          title={t('events.emptyTitle')}
          body={canCreate ? t('events.emptyBodyCommittee') : t('events.emptyBody')}
          action={canCreate ? <Button leadingIcon={Plus} onClick={() => setCreating(true)}>{t('events.new')}</Button> : undefined}
        />
      ) : (
        <EmptyState icon={CalendarDays} title={t('events.noPastTitle')} body={t('events.noPastBody')} />
      );
  } else {
    body = (
      <ul className="flex flex-col gap-3" aria-busy={events.isPlaceholderData || undefined}>
        {shown.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t('events.when')} className="inline-flex rounded-full border border-line-strong bg-surface p-0.5">
          {(['upcoming', 'past'] as const).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={when === w}
              onClick={() => setWhen(w)}
              className={cn(
                'min-h-10 min-w-24 rounded-full px-4 text-sm font-semibold transition-colors duration-150',
                when === w ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg',
              )}
            >
              {t(`events.${w}`)}
            </button>
          ))}
        </div>
        {canCreate && (
          <Button leadingIcon={Plus} onClick={() => setCreating(true)}>
            {t('events.new')}
          </Button>
        )}
      </div>
      <ListToolbar
        search={{ value: search, onChange: setSearch, label: t('events.search'), placeholder: t('events.searchPlaceholder') }}
        active={active}
        onClearAll={clearAll}
        summary={events.data ? t('events.showing', { count: shown.length }) : <Skeleton className="h-4 w-24" />}
        filters={
          <Select label={t('directory.filterBranch')} hideLabel value={branchId} onChange={(e) => setBranchId(e.target.value)} fieldClassName="md:w-48">
            <option value="">{t('directory.allBranches')}</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {branchName(b, language)}
              </option>
            ))}
          </Select>
        }
      />
      {body}
      <EventFormModal target={creating ? 'new' : null} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/community/events/${id}`)} />
    </div>
  );
}
