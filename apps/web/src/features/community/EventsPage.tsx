import { can } from '@samaj/shared';
import { CalendarDays, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, EmptyState, ErrorState } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useT } from '@/i18n';
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
  } else if (events.data.length === 0) {
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
        {events.data.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t('events.when')} className="inline-flex rounded-full border border-line-strong p-0.5">
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
      {body}
      <EventFormModal target={creating ? 'new' : null} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/community/events/${id}`)} />
    </div>
  );
}
